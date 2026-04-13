import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSandboxTools } from "./tools/sandbox.js";
import { registerAttestationTools } from "./tools/attestation.js";
import { registerWebhookTools } from "./tools/webhook.js";
import { registerChainTools } from "./tools/chain.js";
import { SandboxManager } from "./services/sandbox-manager.js";
import { AttestationService } from "./services/attestation-service.js";
import { WebhookService } from "./services/webhook-service.js";
import { ChainService } from "./services/chain-service.js";
import { ComplianceService } from "./services/compliance-service.js";

/**
 * OmniBridge Server Factory
 * 10x Move: We centralize initialization to ensure consistency across
 * different transport modes (stdio vs HTTP).
 *
 * Phase 3: Now wires pre-initialized services to avoid multiple background workers.
 */
export async function createOmniBridgeServer(
  sandboxManager: SandboxManager,
  attestationService: AttestationService,
  webhookService: WebhookService,
  chainService: ChainService,
  complianceService: ComplianceService,
  clientId?: string
) {
  const server = new McpServer({
    name: "OmniBridge",
    version: "1.2.0",
  });

  // Register tools
  registerSandboxTools(server, sandboxManager, webhookService, chainService, clientId);
  registerAttestationTools(server, attestationService);
  registerWebhookTools(server, webhookService);
  registerChainTools(server, chainService, complianceService);

  return server;
}