export interface PolicyLimits {
  allowedImages: string[] | 'ALL';
  maxTtl: number;
}

export class PolicyService {
  private policyMap: Map<string, PolicyLimits>;

  constructor() {
    this.policyMap = new Map();
    // Default fallback policy
    this.policyMap.set('DEFAULT', {
      allowedImages: ['node:20-slim', 'python:3.12-slim'],
      maxTtl: 300 // 5 minutes standard
    });

    // Admin scope (just for example if needed)
    this.policyMap.set('admin', {
      allowedImages: 'ALL',
      maxTtl: 86400 // 24 hours
    });

    // Load from ENV if present
    if (process.env.TENANT_POLICIES) {
      try {
        const policies = JSON.parse(process.env.TENANT_POLICIES);
        for (const [clientId, limits] of Object.entries(policies)) {
          this.policyMap.set(clientId, limits as PolicyLimits);
        }
      } catch (e) {
        console.error("[PolicyService] Failed to parse TENANT_POLICIES", e);
      }
    }
  }

  public getLimitsForClient(clientId: string): PolicyLimits {
    return this.policyMap.get(clientId) || this.policyMap.get('DEFAULT')!;
  }

  /**
   * Validates if a client is allowed to request a specific image and TTL.
   */
  public validateSandboxCreation(clientId: string, requestedImage: string, requestedTtl: number): { valid: boolean, error?: string, suggestion?: string } {
    const limits = this.getLimitsForClient(clientId);

    if (limits.allowedImages !== 'ALL' && !limits.allowedImages.includes(requestedImage)) {
      return {
        valid: false,
        error: `Unauthorized image: ${requestedImage}`,
        suggestion: `Your client profile only allows the following images: ${limits.allowedImages.join(', ')}`
      };
    }

    if (requestedTtl > limits.maxTtl) {
      return {
        valid: false,
        error: `Requested TTL (${requestedTtl}s) exceeds maximum allowed TTL (${limits.maxTtl}s)`,
        suggestion: `Please request a TTL of ${limits.maxTtl} seconds or less.`
      };
    }

    return { valid: true };
  }
}
