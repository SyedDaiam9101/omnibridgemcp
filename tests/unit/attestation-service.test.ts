import { describe, it, expect } from 'vitest';
import { AttestationService } from '../../src/services/attestation-service.js';

describe('AttestationService', () => {
  const service = new AttestationService();

  it('should generate a deterministic signature', () => {
    const payload = { foo: 'bar', baz: 123 };
    const sig1 = service.signReceipt(payload);
    const sig2 = service.signReceipt({ baz: 123, foo: 'bar' }); // Reordered keys

    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // SHA-256 hex
  });

  it('should verify a valid signature', () => {
    const payload = { test: true };
    const sig = service.signReceipt(payload);
    
    expect(service.verifyReceipt(payload, sig)).toBe(true);
  });

  it('should fail verification for tampered payload', () => {
    const payload = { test: true };
    const sig = service.signReceipt(payload);
    
    expect(service.verifyReceipt({ test: false }, sig)).toBe(false);
  });

  it('should fail verification for invalid signature length', () => {
    expect(service.verifyReceipt({}, 'too-short')).toBe(false);
  });
});
