import { describe, it, expect } from 'vitest';
import { PolicyService } from '../../src/services/policy-service.js';

describe('PolicyService', () => {
  it('should use DEFAULT policy for unknown clients', () => {
    const policyService = new PolicyService();
    const result = policyService.validateSandboxCreation('unknown-tenant', 'node:20-slim', 120);
    expect(result.valid).toBe(true);
  });

  it('should reject unauthorized images in DEFAULT policy', () => {
    const policyService = new PolicyService();
    // Default only allows node:20-slim and python:3.12-slim
    const result = policyService.validateSandboxCreation('unknown-tenant', 'ubuntu:latest', 120);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unauthorized image');
  });

  it('should respect admin policy which allows ALL images', () => {
    const policyService = new PolicyService();
    const result = policyService.validateSandboxCreation('admin', 'ubuntu:latest', 120);
    expect(result.valid).toBe(true);
  });

  it('should reject TTL requests that exceed the limit', () => {
    const policyService = new PolicyService();
    const result = policyService.validateSandboxCreation('DEFAULT', 'node:20-slim', 99999);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum allowed TTL');
  });
});
