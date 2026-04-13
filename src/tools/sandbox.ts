import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DockerExecutionOptionsSchema } from '../schemas/docker-schema.js';
import { SandboxCreateSchema, SandboxDestroySchema, SandboxWriteFileSchema, SandboxSessionSchema } from '../schemas/sandbox.schemas.js';
import { SandboxManager } from '../services/sandbox-manager.js';
import { WebhookService } from '../services/webhook-service.js';
import { ChainService } from '../services/chain-service.js';

/**
 * Registers the sandbox tools with the MCP Server instance.
 * This is the 2026 'Plug-and-Play' standard for AI Agents.
 *
 * Phase 2: Now accepts WebhookService and ChainService for automatic
 * receipt dispatch and cryptographic chaining after every execution.
 */
export function registerSandboxTools(
  server: McpServer,
  sandboxManager: SandboxManager,
  webhookService: WebhookService,
  chainService: ChainService,
  clientId?: string
) {

  /**
   * sandbox_create: Provisions a new ephemeral environment.
   */
  server.tool(
    "sandbox_create",
    "Creates a new isolated sandbox session and returns a sessionId.",
    SandboxCreateSchema.shape,
    async (args) => {
      try {
        const sessionId = await sandboxManager.create(args, clientId);
        return {
          content: [{ type: "text", text: JSON.stringify({ sessionId }, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Provisioning Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * sandbox_write_file: Seeds the environment with code/data.
   */
  server.tool(
    "sandbox_write_file",
    "Writes a file into the sandbox workspace.",
    SandboxWriteFileSchema.shape,
    async (args) => {
      try {
        await sandboxManager.writeFile(args.sessionId, args.path, args.content);
        return {
          content: [{ type: "text", text: `File written to ${args.path}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Write Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * sandbox_exec: Runs code in an existing session.
   *
   * Phase 2 Enhancement: After execution, automatically:
   * 1. Appends the receipt to the session's cryptographic chain.
   * 2. Dispatches the receipt to all subscribed webhooks.
   */
  server.tool(
    "sandbox_exec",
    "Executes code in an existing sandbox session and returns a signed attestation receipt.",
    DockerExecutionOptionsSchema.shape,
    async (args) => {
      try {
        const result = await sandboxManager.run(args);

        // Phase 2: Auto-append to the receipt chain
        if (result.attestation) {
          try {
            chainService.append(
              args.sessionId,
              result.attestation.receipt,
              result.attestation.signature
            );
          } catch (chainError: any) {
            console.error(`[sandbox_exec] Chain append failed: ${chainError.message}`);
          }
        }

        // Phase 2: Auto-dispatch to all subscribed webhooks
        webhookService.dispatch(args.sessionId, result);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.exitCode !== 0,
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Execution Error: ${error.message}. Suggestion: Verify the sessionId is active and the command is valid.` }],
          isError: true,
        };
      }
    }
  );

  /**
   * sandbox_diff: Audit filesystem changes.
   */
  server.tool(
    "sandbox_diff",
    "Returns all filesystem changes made during the sandbox session.",
    SandboxSessionSchema.shape,
    async (args) => {
      try {
        const changes = await sandboxManager.getChanges(args.sessionId);
        return {
          content: [{ type: "text", text: JSON.stringify(changes, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Diff Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * sandbox_destroy: Immediate cleanup.
   * Phase 2: Also clears webhooks and chain data for the session.
   */
  server.tool(
    "sandbox_destroy",
    "Destroys a sandbox session and cleans up all associated resources.",
    SandboxDestroySchema.shape,
    async (args) => {
      try {
        await sandboxManager.destroy(args.sessionId);

        // Phase 2: Clean up pipeline state
        webhookService.clearSession(args.sessionId);
        chainService.clearSession(args.sessionId);

        return {
          content: [{ type: "text", text: `Session ${args.sessionId} destroyed. Webhooks and chain data cleared.` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Cleanup Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
