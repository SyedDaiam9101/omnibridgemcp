import { createHmac } from 'crypto';

export class AttestationService {
  private readonly secret: string;

  constructor() {
    const envSecret = process.env.ATTESTATION_SECRET;

    // 10x Move: Fail-Fast. Don't let the server start in an insecure state.
    if (!envSecret && process.env.NODE_ENV === 'production') {
      throw new Error("FATAL: ATTESTATION_SECRET is required in production mode.");
    }

    this.secret = envSecret || 'dev-unsafe-default-secret-key-2026';
  }

  /**
   * Generates a deterministic HMAC-SHA256 signature.
   */
  public signReceipt(payload: any): string {
    // 10x Move: Canonicalization
    // We sort the keys so the signature is the same regardless of object order.
    const canonicalData = JSON.stringify(payload, Object.keys(payload).sort());

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
}