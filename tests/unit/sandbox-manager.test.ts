import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SandboxManager } from '../../src/services/sandbox-manager.js';
import { DatabaseService } from '../../src/services/database-service.js';
import { PolicyService } from '../../src/services/policy-service.js';

vi.mock('../../src/services/docker-client.js', () => {
  return {
    DockerClient: class {
      createSandbox = vi.fn().mockResolvedValue('container-123');
      execInSandbox = vi.fn();
      stopSandbox = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let dbService: DatabaseService;
  let policyService: PolicyService;

  beforeEach(() => {
    vi.clearAllMocks();
    dbService = new DatabaseService(':memory:');
    policyService = new PolicyService();
    manager = new SandboxManager(dbService, policyService);
  });

  afterEach(() => {
    dbService.close();
  });

  it('should create a session and return sessionId', async () => {
    const sessionId = await manager.create({ image: 'node:20-slim' as any, ttlSeconds: 60 });
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
  });

  it('should throw if session not found during run', async () => {
    await expect(manager.run({ 
      sessionId: 'invalid', 
      command: ['ls'], 
      image: 'node:20-slim' 
    } as any)).rejects.toThrow(/not found/);
  });

  it('should reject sandbox_exec image mismatch for an existing session', async () => {
    const sessionId = await manager.create({ image: 'python:3.12-slim' as any, ttlSeconds: 60 });

    await expect(manager.run({
      sessionId,
      image: 'node:20-slim',
      command: ['echo', 'hi'],
      workDir: '/tmp',
    } as any)).rejects.toThrow(/image is locked/i);
  });
});
