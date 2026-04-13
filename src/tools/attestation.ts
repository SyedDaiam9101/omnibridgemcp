import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AttestationVerifySchema } from '../schemas/attestation.schemas.js';
import { AttestationService } from '../services/attestation-service.js';

/**
 * Registers attestation verification tools.
 * 10x Move: This provides the audit trail required for Enterprise AI deployments.
 */
export function registerAttestationTools(server: McpServer, attestationService: AttestationService) {
  
  server.tool(
    "attestation_verify",
    "Verifies that a signed execution receipt is authentic and untampered.",
    AttestationVerifySchema.shape,
    async (args) => {
      try {
        // Robustness: Accept receipt as object OR JSON string, and accept either:
        // - { receipt, signature }
        // - { attestation: { receipt, signature } }
        // - full sandbox_exec result that contains attestation
        let receipt: any = args.receipt;
        let signature: any = args.signature;

        if (typeof receipt === 'string') {
          try {
            receipt = JSON.parse(receipt);
          } catch {
            // leave as-is (string receipt)
          }
        }

        if (receipt?.attestation?.receipt && receipt?.attestation?.signature) {
          // Full sandbox_exec result
          if (!signature) signature = receipt.attestation.signature;
          receipt = receipt.attestation.receipt;
        } else if (receipt?.receipt && receipt?.signature) {
          // Attestation object
          if (!signature) signature = receipt.signature;
          receipt = receipt.receipt;
        } else if (receipt?.receipt && typeof signature === 'undefined') {
          // Sometimes users pass only receipt wrapper but omit signature field name
          signature = receipt.signature;
          receipt = receipt.receipt;
        }

        const isValid = attestationService.verifyReceipt(receipt, signature);
        
        return {
          content: [
            { 
              type: "text", 
              text: JSON.stringify({ 
                valid: isValid,
                message: isValid ? "Receipt is authentic." : "Receipt signature mismatch or invalid key."
              }, null, 2) 
            }
          ],
          isError: !isValid
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Verification Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}
