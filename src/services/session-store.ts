import { createDockerInstance } from '../utils/docker-init.js';
import Docker from 'dockerode';
import { DatabaseService } from './database-service.js';

export interface Session {
  id: string;
  containerId: string;
  totalTtl: number;
  createdAt: number;
  lastAccessedAt: number;
}

export class SessionStore {
  private docker: Docker;
  private dbService: DatabaseService;
  private readonly REAPER_INTERVAL_MS = 30 * 1000;
  private reaperTimer?: NodeJS.Timeout;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
    this.docker = createDockerInstance();
    // 10x Move: We can't await in constructor, so we self-invoke the async init
    this.initialize();
  }

  private async initialize() {
    await this.reconcileState();
    this.startReaper();
  }

  /**
   * 10x Feature: Reconcile Docker containers with SQLite state.
   */
  private async reconcileState() {
    try {
      const dbSessions = this.dbService.db.prepare('SELECT * FROM sessions').all() as any[];
      const sessionMap = new Map(dbSessions.map(s => [s.container_id, s]));

      const containers = await this.docker.listContainers({ all: true });

      // Clean ghost containers in Docker that are NOT in DB anymore (or we never tracked properly)
      // And reconcile those that ARE in DB.
      for (const containerInfo of containers) {
        if (!containerInfo.Names.some(n => n.includes('omnibridge-sandbox'))) continue;

        const dbSession = sessionMap.get(containerInfo.Id);

        if (!dbSession) {
          // Ghost container not in DB
          console.log(`[Startup] Cleaning up untracked ghost container: ${containerInfo.Id}`);
          await this.docker.getContainer(containerInfo.Id).remove({ force: true }).catch(() => {});
          continue;
        }

        // It is in the DB. Let's calculate TTL based on docker creation time.
        // Docker container Created is an epoch in seconds.
        const uptimeSeconds = (Date.now() / 1000) - containerInfo.Created;
        const remainingTtlSeconds = dbSession.total_ttl - uptimeSeconds;

        if (remainingTtlSeconds < 10) {
          console.log(`[Startup] Purging session ${dbSession.id}. Remaining TTL (${remainingTtlSeconds}s) < 10s.`);
          await this.prune(dbSession.id, dbSession.container_id);
          continue;
        }

        // Let's do a health check
        try {
          // If container is not running, we should just prune it
          if (containerInfo.State !== 'running') {
            throw new Error("Container not running");
          }

          const container = this.docker.getContainer(containerInfo.Id);
          const exec = await container.exec({
            Cmd: ['echo', 'ok'],
            AttachStdout: true,
          });

          await exec.start({});
          // If it didn't throw, we consider it healthy. 
          console.log(`[Startup] Session ${dbSession.id} re-attached successfully. Remaining TTL: ${Math.floor(remainingTtlSeconds)}s`);
        } catch (e) {
          console.warn(`[Startup] Session ${dbSession.id} failed health check. Purging.`);
          await this.prune(dbSession.id, dbSession.container_id);
        }
      }

      // Also prune DB sessions where Docker container no longer exists
      const currentContainerIds = new Set(containers.map(c => c.Id));
      for (const dbSession of dbSessions) {
        if (!currentContainerIds.has(dbSession.container_id)) {
          console.log(`[Startup] Cleaning up orphaned DB session: ${dbSession.id}`);
          this.dbService.db.prepare('DELETE FROM sessions WHERE id = ?').run(dbSession.id);
        }
      }
    } catch (e) {
      console.error("[Startup] Failed to reconcile state:", e);
    }
  }

  public registerSession(id: string, containerId: string, ttlSeconds: number): void {
    const now = Date.now();
    this.dbService.db.prepare(`
      INSERT INTO sessions (id, container_id, total_ttl, created_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, containerId, ttlSeconds, new Date(now).toISOString(), now);
  }

  public getSession(id: string): Session | undefined {
    const row = this.dbService.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return undefined;

    // Update last accessed
    const now = Date.now();
    this.dbService.db.prepare('UPDATE sessions SET last_accessed_at = ? WHERE id = ?').run(now, id);

    return {
      id: row.id,
      containerId: row.container_id,
      totalTtl: row.total_ttl,
      createdAt: new Date(row.created_at).getTime(),
      lastAccessedAt: now
    };
  }

  private startReaper(): void {
    this.reaperTimer = setInterval(async () => {
      const now = Date.now();
      const prunePromises = [];

      try {
        const sessions = this.dbService.db.prepare('SELECT * FROM sessions').all() as any[];

        for (const row of sessions) {
          // total_ttl is in seconds, last_accessed_at is in ms.
          // Wait, originally TTL was just hardcoded via the constant max TTL ms.
          // For phase 3 we use the session's exact TTL from creation or last_accessed_at + TTL.
          // Usually expiration = lastAccess + TTL. Let's use total_ttl * 1000 for the allowed idle time.
          const allowedIdleMs = row.total_ttl * 1000;
          if (now - row.last_accessed_at > allowedIdleMs) {
            prunePromises.push(this.prune(row.id, row.container_id));
          }
        }

        await Promise.allSettled(prunePromises);
      } catch (e) {
        console.error('[Reaper] Error querying sessions:', e);
      }
    }, this.REAPER_INTERVAL_MS);

    this.reaperTimer.unref();
  }

  /**
   * Isolated prune logic to prevent loop blocking
   */
  public async prune(sessionId: string, containerId: string) {
    console.log(`[Reaper] Pruning ${sessionId}`);
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true });
    } catch (err) { 
      // Ignore if it's already removed
    } finally {
      this.dbService.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
  }

  public async shutdown(): Promise<void> {
    console.log("[Shutdown] Stopping session reaper...");
    if (this.reaperTimer) clearInterval(this.reaperTimer);
    // In Phase 3, we DO NOT remove containers on shutdown, so they can be re-attached on startup!
    // This is the entire point of persistence.
  }
}