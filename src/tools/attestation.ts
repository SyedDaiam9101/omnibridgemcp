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
        const isValid = attestationService.verifyReceipt(args.receipt, args.signature);
        
        return {
          content: [
            { 
              type: "text", 
              text: JSON.stringify({ 
                valid: isValid,
                message: isValid ? "Receipt is authentic." : "Receipt has been tampered with or used with an invalid key."
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