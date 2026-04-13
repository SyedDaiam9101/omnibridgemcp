import * as jose from 'jose';

export class AuthService {
  private remoteJwks?: ReturnType<typeof jose.createRemoteJWKSet>;

  public async verifyToken(token: string): Promise<{ sub: string, clientId: string }> {
    let payload;
    try {
      if (process.env.MOCK_JWK_PUB) {
        const jwk = JSON.parse(process.env.MOCK_JWK_PUB);
        const publicKey = await jose.importJWK(jwk, 'RS256');
        const result = await jose.jwtVerify(token, publicKey, {
          issuer: process.env.OAUTH_ISSUER,
          audience: process.env.OAUTH_AUDIENCE,
        });
        payload = result.payload;
      } else if (process.env.OAUTH_JWKS_URL) {
        if (!this.remoteJwks) {
          this.remoteJwks = jose.createRemoteJWKSet(new URL(process.env.OAUTH_JWKS_URL));
        }
        const result = await jose.jwtVerify(token, this.remoteJwks, {
           issuer: process.env.OAUTH_ISSUER,
           audience: process.env.OAUTH_AUDIENCE,
        });
        payload = result.payload;
      } else {
        throw new Error("Identity verification is strictly enforced, but no JWKS configuration is present.");
      }

      const sub = payload.sub;
      if (!sub) {
        throw new Error("Token missing 'sub' claim.");
      }

      return {
        sub: sub,
        clientId: (payload.azp || payload.client_id || sub) as string
      };
    } catch (error: any) {
      throw new Error(`Unauthorized: Invalid Token - ${error.message}`);
    }
  }
}
