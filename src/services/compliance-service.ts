import { DatabaseService } from './database-service.js';

export class ComplianceService {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Transforms the cryptographic OmniBridge execution chain into 
   * the vendor-neutral Open Cybersecurity Schema Framework (OCSF).
   */
  public exportOcsf(sessionId: string): any[] {
    const nodes = this.dbService.db.prepare('SELECT * FROM chain_nodes WHERE session_id = ? ORDER BY sequence ASC').all(sessionId) as any[];

    if (!nodes || nodes.length === 0) {
      return [];
    }

    return nodes.map((node: any) => {
      let receipt;
      try {
        receipt = typeof node.receipt_json === 'string' ? JSON.parse(node.receipt_json) : node.receipt_json;
      } catch {
        receipt = {};
      }

      // 10x Standard: OCSF Application Activity schema representation
      return {
        class_name: "Application Activity",
        class_uid: 3001,
        category_name: "Application Activity",
        category_uid: 3,
        activity_id: 1,
        activity_name: "Execute",
        time: new Date(node.created_at).getTime(),
        message: `Execution in Sandbox Container: ${node.session_id}`,
        app: {
          name: "OmniBridge execution engine",
          version: "1.2.0"
        },
        api: {
          operation: "sandbox_exec",
          service: {
             namespace: "SandboxManager",
             name: "run"
          }
        },
        enrichments: [
          {
            name: "Cryptographic Attestation Node",
            data: {
              node_hash: node.node_hash,
              parent_hash: node.parent_hash,
              signature: node.signature,
            }
          }
        ],
        unmapped: {
          session_id: node.session_id,
          sequence: node.sequence,
          client_id: this.getClientId(node.session_id),
          exit_code: receipt.exitCode,
          stdout_hash: receipt.stdoutHash,
          target_image: receipt.image
        }
      };
    });
  }

  private getClientId(sessionId: string): string | null {
    const session = this.dbService.db.prepare('SELECT client_id FROM sessions WHERE id = ?').get(sessionId) as any;
    return session ? session.client_id : null;
  }
}
