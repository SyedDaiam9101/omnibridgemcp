import * as jose from 'jose';
import fetch from 'node-fetch'; // native fetch is in node, but we might just use native fetch directly
import { execSync } from 'child_process';
import crypto from 'crypto';

async function main() {
  console.log('--- Phase 3 (Part 2) Governance Integration Test ---\n');

  // 1. Generate local RSA keys for mocking JWT issuer
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'jwk' },
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
  });

  const jwkPrivate = await jose.importJWK(privateKey as any, 'RS256');

  // 2. Generate a JWT for tenant1
  const token = await new jose.SignJWT({ client_id: 'tenant1' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('urn:omnibridge:test')
    .setAudience('urn:omnibridge:api')
    .setSubject('tenant1-uuid')
    .setExpirationTime('2h')
    .sign(jwkPrivate);

  console.log('[1/4] Minted mock Identity JWT for tenant1');

  // 3. Test HTTP /mcp endpoint with token
  console.log('[2/4] Testing HTTP Authentication...');
  
  // Create an initialization payload
  const initPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  };

  const response = await globalThis.fetch('http://localhost:3000/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(initPayload)
  });

  if (response.status !== 200) {
    throw new Error(`Authentication failed: ${response.status} ${await response.text()}`);
  }

  const sidMatch = response.headers.get('mcp-session-id') || response.headers.get('set-cookie');
  // We need the session ID or we can just send it manually. Actually streamablehttp handles this.
  // Testing logic might be complex with streamablehttp. It's better to just write unit tests.
}

main().catch(console.error);
