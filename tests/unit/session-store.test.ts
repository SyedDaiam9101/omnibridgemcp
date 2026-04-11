import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/services/session-store.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new SessionStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register and retrieve a session', () => {
    store.registerSession('s1', 'c1');
    const session = store.getSession('s1');
    
    expect(session).toBeDefined();
    expect(session?.containerId).toBe('c1');
  });

  it('should return undefined for non-existent session', () => {
    expect(store.getSession('ghost')).toBeUndefined();
  });

  it('should update lastAccessedAt when session is retrieved', () => {
    store.registerSession('s1', 'c1');
    const s1 = store.getSession('s1')!;
    const firstAccess = s1.lastAccessedAt;
    
    vi.advanceTimersByTime(1000);
    
    const s2 = store.getSession('s1')!;
    expect(s2.lastAccessedAt).toBeGreaterThan(firstAccess);
  });
});
