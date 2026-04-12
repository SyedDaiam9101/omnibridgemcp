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
        // Robustness Move: Extract receipt/signature whether passed as siblings 
        // or as part of a nested 'attestation' object.
        let receipt = args.receipt;
        let signature = args.signature;

        // If 'receipt' itself contains a signature, it's likely the whole attestation object
        if (receipt && receipt.receipt && receipt.signature) {
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