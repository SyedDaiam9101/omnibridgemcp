import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxManager } from '../../src/services/sandbox-manager.js';

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

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SandboxManager();
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
});
