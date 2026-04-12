import { z } from 'zod';

// ── Chain Append ────────────────────────────────────────────
export const ChainAppendSchema = z.object({
  sessionId: z.string().describe("The session whose chain to append to"),
  receipt: z.any().describe("The execution receipt object from sandbox_exec"),
  signature: z.string().describe("The HMAC signature of the receipt"),
});

// ── Chain Verify ────────────────────────────────────────────
export const ChainVerifySchema = z.object({
  sessionId: z.string().describe("The session whose chain to verify"),
});

// ── Chain Get ───────────────────────────────────────────────
export const ChainGetSchema = z.object({
  sessionId: z.string().describe("The session whose chain to retrieve"),
});

// ── Types ───────────────────────────────────────────────────
export interface ChainNode {
  index: number;
  receipt: unknown;
  signature: string;
  parentHash: string | null;
  nodeHash: string;
  timestamp: string;
}

export type ChainAppendOptions = z.infer<typeof ChainAppendSchema>;
export type ChainVerifyOptions = z.infer<typeof ChainVerifySchema>;
export type ChainGetOptions = z.infer<typeof ChainGetSchema>;
