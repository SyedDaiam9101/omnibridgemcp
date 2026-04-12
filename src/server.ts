import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSandboxTools } from "./tools/sandbox.js";
import { registerAttestationTools } from "./tools/attestation.js";
import { registerWebhookTools } from "./tools/webhook.js";
import { registerChainTools } from "./tools/chain.js";
import { SandboxManager } from "./services/sandbox-manager.js";
import { AttestationService } from "./services/attestation-service.js";
import { WebhookService } from "./services/webhook-service.js";
import { ChainService } from "./services/chain-service.js";

/**
 * OmniBridge Server Factory
 * 10x Move: We centralize initialization to ensure consistency across
 * different transport modes (stdio vs HTTP).
 *
 * Phase 2: Now wires WebhookService and ChainService into the pipeline.
 */
export async function createOmniBridgeServer() {
  const server = new McpServer({
    name: "OmniBridge",
    version: "1.0.0",
  });

  // Core services
  const sandboxManager = new SandboxManager();
  const attestationService = new AttestationService();

  // Phase 2: Pipeline services
  const webhookService = new WebhookService();
  const chainService = new ChainService(attestationService);

  // Register tools
  registerSandboxTools(server, sandboxManager, webhookService, chainService);
  registerAttestationTools(server, attestationService);
  registerWebhookTools(server, webhookService);
  registerChainTools(server, chainService);

  return server;
}