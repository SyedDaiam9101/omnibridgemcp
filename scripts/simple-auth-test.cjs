const jose = require('jose');
const crypto = require('crypto');

async function test() {
  // Generate local RSA keys for mocking JWT issuer
  const keys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'jwk' },
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
  });

  const jwkPublic = keys.publicKey;
  const jwkPrivate = await jose.importJWK(keys.privateKey, 'RS256');

  console.log('Public JWK:', JSON.stringify(jwkPublic, null, 2));

  // Export to the environment
  process.env.MOCK_JWK_PUB = JSON.stringify(jwkPublic);
  process.env.OAUTH_ISSUER = 'urn:omnibridge:test';
  process.env.OAUTH_AUDIENCE = 'urn:omnibridge:api';

  // Test the AuthService directly
  const { AuthService } = require('../dist/services/auth-service.js');
  const authService = new AuthService();

  // Generate a JWT
  const token = await new jose.SignJWT({ client_id: 'tenant1' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('urn:omnibridge:test')
    .setAudience('urn:omnibridge:api')
    .setSubject('tenant1-uuid')
    .setExpirationTime('2h')
    .sign(jwkPrivate);

  console.log('Generated token:', token);

  try {
    const identity = await authService.verifyToken(token);
    console.log('Successfully verified token:', identity);
  } catch (error) {
    console.error('Failed to verify token:', error.message);
  }
}

test().catch(console.error);