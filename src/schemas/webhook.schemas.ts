import { z } from 'zod';

// ── Webhook Subscribe ───────────────────────────────────────
export const WebhookSubscribeSchema = z.object({
  sessionId: z.string().describe("The active session to attach the webhook to"),
  url: z.string().url().describe("The HTTPS endpoint that will receive signed receipts"),
  secret: z.string()
    .optional()
    .describe("Optional shared secret for HMAC verification on the receiver side"),
});

// ── Webhook Unsubscribe ─────────────────────────────────────
export const WebhookUnsubscribeSchema = z.object({
  sessionId: z.string().describe("The session to remove the webhook from"),
  url: z.string().url().describe("The webhook URL to unsubscribe"),
});

// ── Webhook List ────────────────────────────────────────────
export const WebhookListSchema = z.object({
  sessionId: z.string().describe("The session to list webhooks for"),
});

// ── Types ───────────────────────────────────────────────────
export type WebhookSubscribeOptions = z.infer<typeof WebhookSubscribeSchema>;
export type WebhookUnsubscribeOptions = z.infer<typeof WebhookUnsubscribeSchema>;
export type WebhookListOptions = z.infer<typeof WebhookListSchema>;
