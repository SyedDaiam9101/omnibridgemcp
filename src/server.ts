import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSandboxTools } from "./tools/sandbox.js";
import { registerAttestationTools } from "./tools/attestation.js";
import { SandboxManager } from "./services/sandbox-manager.js";
import { AttestationService } from "./services/attestation-service.js";

/**
 * OmniBridge Server Factory
 * 10x Move: We centralize initialization to ensure consistency across 
 * different transport modes (stdio vs HTTP).
 */
export async function createOmniBridgeServer() {
  const server = new McpServer({
    name: "OmniBridge",
    version: "1.0.0",
  });

  const sandboxManager = new SandboxManager();
  const attestationService = new AttestationService();

  // Register tools
  registerSandboxTools(server, sandboxManager);
  registerAttestationTools(server, attestationService);

  return server;
}