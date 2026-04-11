import Docker from 'dockerode';

export interface Session {
  id: string;
  containerId: string;
  createdAt: number;
  lastAccessedAt: number;
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private docker: Docker;
  private readonly MAX_TTL_MS = 5 * 60 * 1000;
  private readonly REAPER_INTERVAL_MS = 30 * 1000; // 30s is safer for 2026 agents
  private reaperTimer?: NodeJS.Timeout;

  constructor() {
    this.docker = new Docker();
    // 10x Move: Cleanup ghosts from previous crashes before starting
    this.cleanupGhostContainers();
    this.startReaper();
  }

  /**
   * 10x Feature: Find any containers labeled 'omnibridge' that shouldn't be there.
   */
  private async cleanupGhostContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      for (const containerInfo of containers) {
        // We look for containers we previously tagged
        if (containerInfo.Names.some(n => n.includes('omnibridge-sandbox'))) {
          console.log(`[Startup] Cleaning up ghost container: ${containerInfo.Id}`);
          const c = this.docker.getContainer(containerInfo.Id);
          await c.remove({ force: true }).catch(() => { });
        }
      }
    } catch (e) {
      console.error("Failed to run ghost cleanup:", e);
    }
  }

  public registerSession(id: string, containerId: string): void {
    const now = Date.now();
    this.sessions.set(id, {
      id,
      containerId,
      createdAt: now,
      lastAccessedAt: now,
    });
  }

  public getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session;
  }

  private startReaper(): void {
    this.reaperTimer = setInterval(async () => {
      const now = Date.now();
      const prunePromises = [];

      for (const [id, session] of this.sessions.entries()) {
        if (now - session.lastAccessedAt > this.MAX_TTL_MS) {
          prunePromises.push(this.prune(id, session.containerId));
        }
      }

      await Promise.allSettled(prunePromises);
    }, this.REAPER_INTERVAL_MS);

    this.reaperTimer.unref();
  }

  /**
   * Isolated prune logic to prevent loop blocking
   */
  private async prune(sessionId: string, containerId: string) {
    console.warn(`[Reaper] Pruning ${sessionId}`);
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true });
    } catch (err) { }
    finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 10x Move: Nuke everything when the server shuts down
   */
  public async shutdown(): Promise<void> {
    console.log("[Shutdown] Cleaning up all active sessions...");
    if (this.reaperTimer) clearInterval(this.reaperTimer);

    const all = Array.from(this.sessions.values()).map(s =>
      this.docker.getContainer(s.containerId).remove({ force: true }).catch(() => { })
    );

    await Promise.all(all);
    this.sessions.clear();
  }
}