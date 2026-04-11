import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOmniBridgeServer } from "./server.js";

/**
 * OmniBridge Entrypoint
 * This is the first code that runs. It determines the transport
 * and connects the server logic to the outside world.
 */
async function main() {
  const server = await createOmniBridgeServer();

  // TRANSPORT DETECTION:
  // In 2026, we switch between stdio for local IDEs and HTTP for cloud agents.
  const transportMode = process.env.MCP_TRANSPORT || 'stdio';

  if (transportMode === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[OmniBridge] Started via stdio");
  } else {
    // Phase 1.5: Implement Streamable HTTP transport
    console.error(`[OmniBridge] Transport mode '${transportMode}' not yet fully implemented.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[OmniBridge] Fatal error during startup:", error);
  process.exit(1);
});