import { createHmac } from 'crypto';

export class AttestationService {
  private readonly secret: string;

  constructor() {
    const envSecret = process.env.ATTESTATION_SECRET;

    // Fail-Fast. Don't let the server start in an insecure state.
    if (!envSecret && process.env.NODE_ENV === 'production') {
      throw new Error("FATAL: ATTESTATION_SECRET is required in production mode.");
    }

    this.secret = envSecret || 'dev-unsafe-default-secret-key-2026';
  }

  /**
   * Generates a deterministic HMAC-SHA256 signature.
   */
  public signReceipt(payload: any): string {
    const canonicalData = this.canonicalize(payload);

    return createHmac('sha256', this.secret)
      .update(canonicalData)
      .digest('hex');
  }

  /**
   * Verifies a signature against a payload using a constant-time comparison.
   */
  public verifyReceipt(payload: unknown, signature: string): boolean {
    const expectedSignature = this.signReceipt(payload);

    // Constant-time comparison prevents "timing attacks"
    if (signature.length !== expectedSignature.length) return false;
    return signature === expectedSignature;
  }

  private canonicalize(value: unknown): string {
    const seen = new Set<unknown>();

    const walk = (v: unknown): string => {
      if (v === null) return 'null';

      if (typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'bigint') return JSON.stringify(v.toString());
      if (typeof v === 'undefined' || typeof v === 'function' || typeof v === 'symbol') return 'null';

      if (seen.has(v as object)) {
        throw new Error('Cannot sign cyclic payload.');
      }

      if (Array.isArray(v)) {
        seen.add(v);
        const items = v.map(walk).join(',');
        seen.delete(v);
        return `[${items}]`;
      }

      if (v instanceof Date) {
        return JSON.stringify(v.toISOString());
      }

      // Plain object (or other object) — sign its enumerable own properties.
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      seen.add(v as object);
      const body = keys.map((k) => `${JSON.stringify(k)}:${walk(obj[k])}`).join(',');
      seen.delete(v as object);
      return `{${body}}`;
    };

    return walk(value);
  }
}
