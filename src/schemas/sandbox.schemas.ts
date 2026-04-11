import { z } from 'zod';

export const SandboxCreateSchema = z.object({
  image: z.enum(['node:20-slim', 'python:3.12-slim', 'rust:1.78-slim', 'alpine:latest'])
    .default('node:20-slim'),
  env: z.record(z.string(), z.string()).optional(),
  ttlSeconds: z.number().min(30).max(600).default(120),
});

export const SandboxDestroySchema = z.object({
  sessionId: z.string().describe("The active session to destroy"),
});

export const SandboxSessionSchema = z.object({
  sessionId: z.string().describe("The active session to use"),
});

export const SandboxWriteFileSchema = z.object({
  sessionId: z.string().describe("The active session ID"),
  path: z.string().describe("Absolute path inside the container (e.g., /workspace/app.js)"),
  content: z.string().describe("Content of the file to write"),
});

export type SandboxCreateOptions = z.infer<typeof SandboxCreateSchema>;
export type SandboxWriteFileOptions = z.infer<typeof SandboxWriteFileSchema>;