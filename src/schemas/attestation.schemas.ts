import { z } from 'zod';

export const AttestationReceiptSchema = z.object({
  containerId: z.string(),
  image: z.string(),
  stdoutHash: z.string(),
  exitCode: z.number(),
  timestamp: z.string(),
});

export const AttestationVerifySchema = z.object({
  receipt: z.any().describe("The full receipt object from sandbox_exec"),
  signature: z.string().describe("The signature companion to the receipt"),
});

export type AttestationReceipt = z.infer<typeof AttestationReceiptSchema>;