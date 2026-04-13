import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { SandboxCreateOptions } from '../schemas/sandbox.schemas.js';
import { DockerClient } from './docker-client.js';
import { SessionStore } from './session-store.js';
import { DatabaseService } from './database-service.js';
import { randomUUID } from 'crypto';

/**
 * 10x Refinement: SandboxManager handles high-level container lifecycle 
 * orchestrating the SessionStore and the hardened DockerClient.
 */
export class SandboxManager {
  private dockerClient: DockerClient;
  private sessionStore: SessionStore;

  constructor(dbService: DatabaseService) {
    this.dockerClient = new DockerClient();
    this.sessionStore = new SessionStore(dbService);
  }

  public async create(options: SandboxCreateOptions): Promise<string> {
    const sessionId = randomUUID();
    const containerId = await this.dockerClient.createSandbox(options.image, options.env);
    
    const ttlSeconds = options.ttlSeconds || 120;
    this.sessionStore.registerSession(sessionId, containerId, ttlSeconds);
    return sessionId;
  }

  public async run(options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    const session = this.sessionStore.getSession(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found or expired.`);
    }

    return this.dockerClient.execInSandbox(session.containerId, options);
  }

  public async writeFile(sessionId: string, path: string, content: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or expired.`);
    }

    await this.dockerClient.writeFile(session.containerId, path, content);
  }

  public async getChanges(sessionId: string) {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or expired.`);
    }

    return this.dockerClient.getChanges(session.containerId);
  }

  public async destroy(sessionId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (session) {
      await this.sessionStore.prune(sessionId, session.containerId);
    }
  }
}