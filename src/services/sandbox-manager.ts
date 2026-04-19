import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { SandboxCreateOptions } from '../schemas/sandbox.schemas.js';
import { DockerClient } from './docker-client.js';
import { SessionStore } from './session-store.js';
import { DatabaseService } from './database-service.js';
import { PolicyService } from './policy-service.js';
import { randomUUID } from 'crypto';

/**
 * SandboxManager handles high-level container lifecycle 
 * orchestrating the SessionStore and the hardened DockerClient.
 */
export class SandboxManager {
  private dockerClient: DockerClient;
  private sessionStore: SessionStore;
  private policyService: PolicyService;

  constructor(dbService: DatabaseService, policyService: PolicyService) {
    this.dockerClient = new DockerClient();
    this.sessionStore = new SessionStore(dbService);
    this.policyService = policyService;
  }

  public async create(options: SandboxCreateOptions, clientId?: string): Promise<string> {
    const ttlSeconds = options.ttlSeconds || 120;
    
    // Policy Enforcement
    const validation = this.policyService.validateSandboxCreation(clientId || 'DEFAULT', options.image, ttlSeconds);
    if (!validation.valid) {
      throw new Error(`Policy Violation: ${validation.error}. Suggestion: ${validation.suggestion}`);
    }

    const sessionId = randomUUID();
    const containerId = await this.dockerClient.createSandbox(options.image, options.env);
    
    this.sessionStore.registerSession(sessionId, containerId, ttlSeconds, clientId, options.image);
    return sessionId;
  }

  public async run(options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    const session = this.sessionStore.getSession(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found or expired.`);
    }

    const effectiveImage = session.image || options.image;
    if (!effectiveImage) {
      throw new Error(
        "Session image is unknown (older DB row). Create a new sandbox session to set the runtime image."
      );
    }

    if (session.image && options.image && options.image !== session.image) {
      throw new Error(
        `Session image is locked to '${session.image}'. Requested '${options.image}'. Create a new sandbox session to change runtime.`
      );
    }

    return this.dockerClient.execInSandbox(session.containerId, {
      ...options,
      image: effectiveImage,
    });
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
