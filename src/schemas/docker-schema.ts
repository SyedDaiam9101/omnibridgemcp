import { z } from 'zod';

/**
 * 10x REFINEMENT: 
 * We restrict images to an allowlist to prevent supply-chain attacks.
 */
export const DockerExecutionOptionsSchema = z.object({
  image: z.enum(['node:20-slim', 'python:3.12-slim', 'rust:1.78-slim', 'alpine:latest'])
    .default('node:20-slim')
    .describe("The hardened runtime environment for execution"),

  command: z.array(z.string())
    .min(1)
    .describe("The command and arguments to run"),

  env: z.record(z.string(), z.string())
    .optional()
    .describe("Environment variables (Secrets should be passed here, not in the command string)"),

  timeoutMs: z.number()
    .min(1000)
    .max(60000)
    .default(30000)
    .describe("Hard timeout to prevent hanging processes"),

  // ADDED: Working directory enforcement
  workDir: z.string()
    .default('/workspace')
    .describe("The isolated directory where execution occurs")
});

export type DockerExecutionOptions = z.infer<typeof DockerExecutionOptionsSchema>;

/**
 * 10x REFINEMENT:
 * We structure the result so the 'receipt' is clearly separated from the logs.
 */
export const DockerExecutionResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),

  // The 'Attestation' block: Crucial for our 2026 Enterprise target
  attestation: z.object({
    receipt: z.string(),
    timestamp: z.string(),
    imageDigest: z.string().describe("The immutable SHA of the image used")
  }),

  suggestions: z.string()
    .optional()
    .describe("Agent-facing guidance if the exit code is non-zero")
});

export type DockerExecutionResult = z.infer<typeof DockerExecutionResultSchema>;