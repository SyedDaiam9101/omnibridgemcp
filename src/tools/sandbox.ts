import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DockerExecutionOptionsSchema } from '../schemas/docker-schema.js';
import { SandboxManager } from '../services/sandbox-manager.js';

/**
 * Registers the sandbox tools with the MCP Server instance.
 * This is the 2026 'Plug-and-Play' standard for AI Agents.
 */
export function registerSandboxTools(server: McpServer, sandboxManager: SandboxManager) {

  server.tool(
    "sandbox_exec",
    "Executes code in a hardened gVisor container and returns a signed attestation receipt.",
    DockerExecutionOptionsSchema.shape, // Automatically gives the AI the schema rules
    async (args) => {
      try {
        // Delegate all heavy lifting to the SandboxManager
        // This keeps the tool definition clean and testable
        const result = await sandboxManager.run(args);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          // Tell the AI if the code execution failed (non-zero exit code)
          isError: result.exitCode !== 0,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `OmniBridge Execution Error: ${error.message}`
            }
          ],
          isError: true,
        };
      }
    }
  );
}