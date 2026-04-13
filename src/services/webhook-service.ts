import { createHmac } from 'crypto';
import { DatabaseService } from './database-service.js';

export class WebhookService {
  private dbService: DatabaseService;
  private workerTimer?: NodeJS.Timeout;
  private isProcessing = false;

  // Max backoff capped at 1 hour (3600000 ms)
  private readonly MAX_BACKOFF_MS = 3600000;
  private readonly MAX_ATTEMPTS = 10;
  // Dead limit 24h
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public subscribe(sessionId: string, url: string, secret?: string): void {
    const existing = this.dbService.db.prepare(`
      SELECT 1 FROM webhook_subscriptions WHERE session_id = ? AND url = ?
    `).get(sessionId, url);

    if (existing) {
      throw new Error(`Webhook already registered for URL: ${url}`);
    }

    this.dbService.db.prepare(`
      INSERT INTO webhook_subscriptions (session_id, url, secret) VALUES (?, ?, ?)
    `).run(sessionId, url, secret || null);

    console.log(`[WebhookService] Subscribed ${url} to session ${sessionId}`);
  }

  public unsubscribe(sessionId: string, url: string): boolean {
    const result = this.dbService.db.prepare(`
      DELETE FROM webhook_subscriptions WHERE session_id = ? AND url = ?
    `).run(sessionId, url);

    if (result.changes > 0) {
      console.log(`[WebhookService] Unsubscribed ${url} from session ${sessionId}`);
      return true;
    }
    return false;
  }

  public listSubscriptions(sessionId: string): string[] {
    const rows = this.dbService.db.prepare(`
      SELECT url FROM webhook_subscriptions WHERE session_id = ?
    `).all(sessionId) as { url: string }[];
    return rows.map(r => r.url);
  }

  public async dispatch(sessionId: string, payload: unknown): Promise<void> {
    const subs = this.dbService.db.prepare(`
      SELECT * FROM webhook_subscriptions WHERE session_id = ?
    `).all(sessionId) as any[];

    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const now = new Date().toISOString();

    const insertQueue = this.dbService.db.prepare(`
      INSERT INTO webhook_queue (session_id, url, payload, secret, attempts, next_retry, status, created_at)
      VALUES (?, ?, ?, ?, 0, ?, 'PENDING', ?)
    `);

    this.dbService.db.transaction(() => {
      for (const sub of subs) {
        insertQueue.run(sessionId, sub.url, body, sub.secret, now, now);
      }
    })();

    // Attempt immediately
    if (!this.isProcessing) {
      this.processQueue().catch(console.error);
    }
  }

  public clearSession(sessionId: string): void {
    // Rely on CASCADE DELETE but we can safely manual delete.
    // The instructions specified "Bulk-delete pending queue items if their parent session_id is destroyed"
    this.dbService.db.prepare('DELETE FROM webhook_queue WHERE session_id = ?').run(sessionId);
    this.dbService.db.prepare('DELETE FROM webhook_subscriptions WHERE session_id = ?').run(sessionId);
  }

  // --- Worker Lifecycle ---

  public start() {
    console.log("[WebhookWorker] Starting persistent retry queue...");
    // Initial process 
    this.processQueue().catch(console.error);
    // Recurring interval
    this.workerTimer = setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue().catch(console.error);
      }
    }, 5000);
  }

  public stop() {
    console.log("[WebhookWorker] Stopping gracefully...");
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
    }
    // We don't await ongoing dispatches explicitly since JS doesn't block the exit well,
    // but the DB records are safe regardless since they only change when POST succeeds/fails.
  }

  private async processQueue() {
    this.isProcessing = true;
    try {
      const now = new Date();
      const pendingJobs = this.dbService.db.prepare(`
        SELECT * FROM webhook_queue 
        WHERE status = 'PENDING' AND next_retry <= ?
        LIMIT 20
      `).all(now.toISOString()) as any[];

      const dispatches = pendingJobs.map(async (job) => {
        // Enforce deadlock/aging rules
        const createdMs = new Date(job.created_at).getTime();
        if (now.getTime() - createdMs > this.MAX_AGE_MS || job.attempts >= this.MAX_ATTEMPTS) {
          this.dbService.db.prepare(`UPDATE webhook_queue SET status = 'DEAD' WHERE id = ?`).run(job.id);
          console.warn(`[WebhookWorker] Job ${job.id} marked as DEAD (Exceeded max attempts or age).`);
          return;
        }

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          
          if (job.secret) {
            const signature = createHmac('sha256', job.secret).update(job.payload).digest('hex');
            headers['X-OmniBridge-Signature'] = signature;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          const res = await fetch(job.url, {
            method: 'POST',
            headers,
            body: job.payload,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (res.ok) {
            // Success
            this.dbService.db.prepare(`UPDATE webhook_queue SET status = 'DELIVERED', last_attempt = ? WHERE id = ?`).run(now.toISOString(), job.id);
            console.log(`[WebhookWorker] Successfully delivered job ${job.id} to ${job.url}`);
          } else {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (error: any) {
          // Failure => backoff logic
          const nextAttempts = job.attempts + 1;
          // Exponential backoff: 2^attempts * 2000 ms e.g. 2s, 4s, 8s -> cap at MAX_BACKOFF_MS
          const backoff = Math.min(Math.pow(2, job.attempts) * 2000, this.MAX_BACKOFF_MS);
          const nextRetry = new Date(now.getTime() + backoff).toISOString();

          this.dbService.db.prepare(`
            UPDATE webhook_queue 
            SET attempts = ?, last_attempt = ?, next_retry = ? 
            WHERE id = ?
          `).run(nextAttempts, now.toISOString(), nextRetry, job.id);
          
          console.error(`[WebhookWorker] Delivery failed for job ${job.id}. Retrying at ${nextRetry}. Error: ${error.message}`);
        }
      });

      await Promise.allSettled(dispatches);
    } catch (e) {
      console.error("[WebhookWorker] Error processing queue:", e);
    } finally {
      this.isProcessing = false;
    }
  }
}
