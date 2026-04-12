import { createHmac } from 'crypto';
import { AttestationService } from './attestation-service.js';
import type { ChainNode } from '../schemas/chain.schemas.js';

/**
 * ChainService — Cryptographic Receipt Chaining (DAG)
 *
 * Links execution receipts into a verifiable directed acyclic graph.
 * Each node's hash depends on the previous node, creating a tamper-evident
 * chain that an enterprise auditor can verify end-to-end.
 *
 * Architecture: In-memory Map<sessionId, ChainNode[]>.
 * Uses AttestationService as the single source of truth for all crypto.
 */
export class ChainService {
  private chains: Map<string, ChainNode[]> = new Map();
  private attestationService: AttestationService;

  constructor(attestationService: AttestationService) {
    this.attestationService = attestationService;
  }

  /**
   * Append a signed receipt to the session's chain.
   * The nodeHash is derived from: receipt + signature + parentHash.
   */
  public append(sessionId: string, receipt: unknown, signature: string): ChainNode {
    const chain = this.chains.get(sessionId) || [];
    const parentHash = chain.length > 0 ? chain[chain.length - 1].nodeHash : null;

    // Compute the node hash: HMAC of (receipt + signature + parentHash)
    const nodePayload = {
      receipt,
      signature,
      parentHash,
    };
    const nodeHash = this.attestationService.signReceipt(nodePayload);

    const node: ChainNode = {
      index: chain.length,
      receipt,
      signature,
      parentHash,
      nodeHash,
      timestamp: new Date().toISOString(),
    };

    chain.push(node);
    this.chains.set(sessionId, chain);

    console.error(
      `[ChainService] Appended node #${node.index} to session ${sessionId} (hash: ${nodeHash.substring(0, 12)}...)`
    );

    return node;
  }

  /**
   * Verify the entire chain for a session.
   * Walks from root to tip, recomputing each nodeHash and comparing.
   */
  public verify(sessionId: string): { valid: boolean; length: number; brokenAt?: number } {
    const chain = this.chains.get(sessionId);

    if (!chain || chain.length === 0) {
      return { valid: true, length: 0 };
    }

    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      const expectedParentHash = i > 0 ? chain[i - 1].nodeHash : null;

      // Verify parent linkage
      if (node.parentHash !== expectedParentHash) {
        return { valid: false, length: chain.length, brokenAt: i };
      }

      // Recompute the node hash
      const nodePayload = {
        receipt: node.receipt,
        signature: node.signature,
        parentHash: node.parentHash,
      };
      const recomputedHash = this.attestationService.signReceipt(nodePayload);

      if (recomputedHash !== node.nodeHash) {
        return { valid: false, length: chain.length, brokenAt: i };
      }
    }

    return { valid: true, length: chain.length };
  }

  /**
   * Retrieve the full chain for inspection.
   */
  public getChain(sessionId: string): ChainNode[] {
    return this.chains.get(sessionId) || [];
  }

  /**
   * Cleanup: Remove the chain for a destroyed session.
   */
  public clearSession(sessionId: string): void {
    this.chains.delete(sessionId);
  }
}
