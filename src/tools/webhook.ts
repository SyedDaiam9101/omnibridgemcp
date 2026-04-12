import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  WebhookSubscribeSchema,
  WebhookUnsubscribeSchema,
  WebhookListSchema,
} from "../schemas/webhook.schemas.js";
import { WebhookService } from "../services/webhook-service.js";

/**
 * Registers webhook management tools with the MCP Server.
 * Agents use these to wire up real-time receipt delivery to external systems.
 */
export function registerWebhookTools(
  server: McpServer,
  webhookService: WebhookService
) {
  /**
   * webhook_subscribe: Register a URL to receive signed receipts.
   */
  server.tool(
    "webhook_subscribe",
    "Subscribe an external URL to receive signed execution receipts for a session.",
    WebhookSubscribeSchema.shape,
    async (args) => {
      try {
        webhookService.subscribe(args.sessionId, args.url, args.secret);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "subscribed",
                  sessionId: args.sessionId,
                  url: args.url,
                  signed: !!args.secret,
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
              text: `Webhook Error: ${error.message}. Suggestion: Check that the URL is valid and not already subscribed.`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * webhook_unsubscribe: Remove a webhook listener.
   */
  server.tool(
    "webhook_unsubscribe",
    "Remove an existing webhook subscription from a session.",
    WebhookUnsubscribeSchema.shape,
    async (args) => {
      try {
        const removed = webhookService.unsubscribe(args.sessionId, args.url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: removed ? "unsubscribed" : "not_found",
                  sessionId: args.sessionId,
                  url: args.url,
                },
                null,
                2
              ),
            },
          ],
          isError: !removed,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Webhook Error: ${error.message}. Suggestion: Verify the sessionId and URL are correct.`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * webhook_list: List all active webhook URLs for a session.
   */
  server.tool(
    "webhook_list",
    "List all webhook URLs subscribed to a session.",
    WebhookListSchema.shape,
    async (args) => {
      try {
        const urls = webhookService.listSubscriptions(args.sessionId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  count: urls.length,
                  webhooks: urls,
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
              text: `Webhook Error: ${error.message}. Suggestion: Ensure the sessionId is valid.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
