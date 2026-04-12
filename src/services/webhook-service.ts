import { createHmac } from 'crypto';

/**
 * WebhookService — Fire-and-forget dispatch of signed execution receipts.
 *
 * Architecture: In-memory registry keyed by sessionId. Each session can have
 * multiple subscriber URLs. When dispatch() is called, all subscribers receive
 * a POST with the receipt payload and an X-OmniBridge-Signature header.
 */

interface WebhookSubscription {
  url: string;
  secret: string | null;
}

export class WebhookService {
  private subscriptions: Map<string, WebhookSubscription[]> = new Map();

  /**
   * Register a webhook listener for a session.
   */
  public subscribe(sessionId: string, url: string, secret?: string): void {
    const subs = this.subscriptions.get(sessionId) || [];

    // Prevent duplicate subscriptions to the same URL
    if (subs.some((s) => s.url === url)) {
      throw new Error(`Webhook already registered for URL: ${url}`);
    }

    subs.push({ url, secret: secret || null });
    this.subscriptions.set(sessionId, subs);
    console.error(`[WebhookService] Subscribed ${url} to session ${sessionId}`);
  }

  /**
   * Remove a webhook listener.
   */
  public unsubscribe(sessionId: string, url: string): boolean {
    const subs = this.subscriptions.get(sessionId);
    if (!subs) return false;

    const filtered = subs.filter((s) => s.url !== url);
    if (filtered.length === subs.length) return false;

    if (filtered.length === 0) {
      this.subscriptions.delete(sessionId);
    } else {
      this.subscriptions.set(sessionId, filtered);
    }

    console.error(`[WebhookService] Unsubscribed ${url} from session ${sessionId}`);
    return true;
  }

  /**
   * List all active webhook URLs for a session.
   */
  public listSubscriptions(sessionId: string): string[] {
    const subs = this.subscriptions.get(sessionId) || [];
    return subs.map((s) => s.url);
  }

  /**
   * Fire-and-forget: POST the signed receipt to all registered subscribers.
   * Failures are logged but never block the caller.
   */
  public async dispatch(sessionId: string, payload: unknown): Promise<void> {
    const subs = this.subscriptions.get(sessionId);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);

    const dispatches = subs.map(async (sub) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Sign the payload with the subscriber's shared secret
        if (sub.secret) {
          const signature = createHmac('sha256', sub.secret)
            .update(body)
            .digest('hex');
          headers['X-OmniBridge-Signature'] = signature;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        await fetch(sub.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        console.error(`[WebhookService] Dispatched to ${sub.url}`);
      } catch (error: any) {
        // Fire-and-forget: log but never throw
        console.error(
          `[WebhookService] Failed to dispatch to ${sub.url}: ${error.message}`
        );
      }
    });

    // Execute all dispatches concurrently, don't await collectively
    // (the caller should not be blocked)
    Promise.allSettled(dispatches);
  }

  /**
   * Cleanup: Remove all subscriptions for a session (called on destroy).
   */
  public clearSession(sessionId: string): void {
    this.subscriptions.delete(sessionId);
  }
}
