import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { AuthService } from '../../src/services/auth-service.js';
import * as jose from 'jose';
import crypto from 'crypto';

describe('AuthService', () => {
  let publicKey: crypto.JsonWebKey;
  let privateKey: any;

  beforeAll(async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

    publicKey = keys.publicKey;
    privateKey = await jose.importJWK(keys.privateKey as any, 'RS256');
    
    // Setup environment
    process.env.MOCK_JWK_PUB = JSON.stringify(publicKey);
    process.env.OAUTH_ISSUER = 'urn:omnibridge:test';
    process.env.OAUTH_AUDIENCE = 'urn:omnibridge:api';
  });

  it('should verify a valid token and extract sub and clientId', async () => {
    const authService = new AuthService();

    const token = await new jose.SignJWT({ client_id: 'tenant_alpha' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('urn:omnibridge:test')
      .setAudience('urn:omnibridge:api')
      .setSubject('user_123')
      .setExpirationTime('2h')
      .sign(privateKey);

    const identity = await authService.verifyToken(token);
    expect(identity.sub).toBe('user_123');
    expect(identity.clientId).toBe('tenant_alpha');
  });

  it('should throw an error for expired token', async () => {
    const authService = new AuthService();

    const token = await new jose.SignJWT({ client_id: 'tenant_alpha' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('urn:omnibridge:test')
      .setAudience('urn:omnibridge:api')
      .setSubject('user_123')
      .setExpirationTime('-1h') // expired
      .sign(privateKey);

    await expect(authService.verifyToken(token)).rejects.toThrow(/Unauthorized/);
  });
});
