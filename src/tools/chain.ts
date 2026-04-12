import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ChainAppendSchema,
  ChainVerifySchema,
  ChainGetSchema,
} from "../schemas/chain.schemas.js";
import { ChainService } from "../services/chain-service.js";

/**
 * Registers receipt chaining (DAG) tools with the MCP Server.
 * Agents and auditors use these to verify tamper-evident execution sequences.
 */
export function registerChainTools(
  server: McpServer,
  chainService: ChainService
) {
  /**
   * chain_append: Manually append a signed receipt to the chain.
   * Note: sandbox_exec auto-appends by default. Use this for manual overrides.
   */
  server.tool(
    "chain_append",
    "Append a signed execution receipt to the session's cryptographic chain.",
    ChainAppendSchema.shape,
    async (args) => {
      try {
        const node = chainService.append(
          args.sessionId,
          args.receipt,
          args.signature
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "appended",
                  index: node.index,
                  nodeHash: node.nodeHash,
                  parentHash: node.parentHash,
                  timestamp: node.timestamp,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Chain Error: ${error.message}. Suggestion: Ensure the receipt and signature are valid outputs from sandbox_exec.`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * chain_verify: Verify the integrity of the full execution chain.
   */
  server.tool(
    "chain_verify",
    "Verify the cryptographic integrity of the entire execution chain for a session.",
    ChainVerifySchema.shape,
    async (args) => {
      try {
        const result = chainService.verify(args.sessionId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  message: result.valid
                    ? `Chain integrity verified. ${result.length} node(s) intact.`
                    : `Chain BROKEN at node #${result.brokenAt}. Possible tampering detected.`,
                },
                null,
                2
              ),
            },
          ],
          isError: !result.valid,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Chain Error: ${error.message}. Suggestion: Verify the sessionId is correct.`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * chain_get: Retrieve the full chain for inspection.
   */
  server.tool(
    "chain_get",
    "Retrieve the full cryptographic execution chain for a session.",
    ChainGetSchema.shape,
    async (args) => {
      try {
        const chain = chainService.getChain(args.sessionId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  length: chain.length,
                  nodes: chain,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Chain Error: ${error.message}. Suggestion: Ensure the sessionId is valid.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
