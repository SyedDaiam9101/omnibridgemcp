import { createHmac } from 'crypto';
import { AttestationService } from './attestation-service.js';
import { DatabaseService } from './database-service.js';
import type { ChainNode } from '../schemas/chain.schemas.js';

/**
 * ChainService — Cryptographic Receipt Chaining (DAG)
 *
 * Links execution receipts into a verifiable directed acyclic graph.
 * Persistent version (Phase 3) maps straight to the SQLite `chain_nodes` table.
 */
export class ChainService {
  private attestationService: AttestationService;
  private dbService: DatabaseService;

  constructor(attestationService: AttestationService, dbService: DatabaseService) {
    this.attestationService = attestationService;
    this.dbService = dbService;
  }

  public append(sessionId: string, receipt: unknown, signature: string): ChainNode {
    // Get current chain to find the true sequence length and parent hash
    const chain = this.getChain(sessionId);
    const parentHash = chain.length > 0 ? chain[chain.length - 1].nodeHash : null;

    // Compute the node hash: HMAC of (receipt + signature + parentHash)
    const nodePayload = {
      receipt,
      signature,
      parentHash,
    };
    const nodeHash = this.attestationService.signReceipt(nodePayload);
    const sequence = chain.length;
    const createdAt = new Date().toISOString();

    const node: ChainNode = {
      index: sequence,
      receipt,
      signature,
      parentHash,
      nodeHash,
      timestamp: createdAt,
    };

    this.dbService.db.prepare(`
      INSERT INTO chain_nodes (session_id, sequence, receipt_json, signature, parent_hash, node_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      sequence,
      JSON.stringify(receipt),
      signature,
      parentHash,
      nodeHash,
      createdAt
    );

    console.error(
      `[ChainService] Appended node #${sequence} to session ${sessionId} (hash: ${nodeHash.substring(0, 12)}...)`
    );

    return node;
  }

  public verify(sessionId: string): { valid: boolean; length: number; brokenAt?: number } {
    const chain = this.getChain(sessionId);

    if (!chain || chain.length === 0) {
      return { valid: true, length: 0 };
    }

    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      const expectedParentHash = i > 0 ? chain[i - 1].nodeHash : null;

      if (node.parentHash !== expectedParentHash) {
        return { valid: false, length: chain.length, brokenAt: i };
      }

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

  public getChain(sessionId: string): ChainNode[] {
    const rows = this.dbService.db.prepare(`
      SELECT * FROM chain_nodes WHERE session_id = ? ORDER BY sequence ASC
    `).all(sessionId) as any[];

    return rows.map(r => ({
      index: r.sequence,
      receipt: JSON.parse(r.receipt_json),
      signature: r.signature,
      parentHash: r.parent_hash,
      nodeHash: r.node_hash,
      timestamp: r.created_at
    }));
  }

  public clearSession(sessionId: string): void {
    // With foreign keys `ON DELETE CASCADE` on `sessions` table,
    // this data will automatically clean up when the session is destroyed.
    // We provide this in case it's called manually.
    this.dbService.db.prepare('DELETE FROM chain_nodes WHERE session_id = ?').run(sessionId);
  }
}
