import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { createOmniBridgeServer } from "./server.js";

// Services
import { DatabaseService } from "./services/database-service.js";
import { SandboxManager } from "./services/sandbox-manager.js";
import { AttestationService } from "./services/attestation-service.js";
import { WebhookService } from "./services/webhook-service.js";
import { ChainService } from "./services/chain-service.js";

let dbService: DatabaseService;
let sandboxManager: SandboxManager;
let attestationService: AttestationService;
let webhookService: WebhookService;
let chainService: ChainService;

/**
 * OmniBridge Entrypoint — Phase 3: Persistence and Reliability
 *
 * Detects the transport mode at boot and connects the server factory
 * Initialize Database and Singletons before serving.
 */
async function main() {
  const transportMode = process.env.MCP_TRANSPORT || "stdio";

  dbService = new DatabaseService();
  sandboxManager = new SandboxManager(dbService);
  attestationService = new AttestationService();
  webhookService = new WebhookService(dbService);
  chainService = new ChainService(attestationService, dbService);

  webhookService.start();

  if (transportMode === "stdio") {
    await startStdioTransport();
  } else if (transportMode === "http") {
    await startHttpTransport();
  } else {
    console.error(
      `[OmniBridge] Unknown transport mode: '${transportMode}'. Use 'stdio' or 'http'.`
    );
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async () => {
    console.error("[OmniBridge] Shutting down services...");
    webhookService.stop();
    dbService.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─────────────────────────────────────────────────────────────
// STDIO TRANSPORT — for Claude Desktop, Cursor, local IDEs
// ─────────────────────────────────────────────────────────────
async function startStdioTransport() {
  const server = await createOmniBridgeServer(
    sandboxManager,
    attestationService,
    webhookService,
    chainService
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[OmniBridge] Started via stdio transport");
}

// ─────────────────────────────────────────────────────────────
// STREAMABLE HTTP TRANSPORT — for cloud agents, dashboards, CI
// ─────────────────────────────────────────────────────────────
async function startHttpTransport() {
  const port = parseInt(process.env.PORT || "3000", 10);

  // Session-to-transport map for stateful connections
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // createMcpExpressApp provides DNS rebinding protection out of the box
  const app = createMcpExpressApp();

  // ── ROOT / — Quick status check ──────────────────────────
  app.get("/", (req: Request, res: Response) => {
    res.json({
      project: "OmniBridge",
      status: "Execution Layer Online",
      version: "1.2.0",
      transport: "Streamable HTTP",
      mcp_endpoint: "/mcp",
      security: "HMAC-SHA256 Attestation Active",
    });
  });

  // ── AUTHENTICATION ────────────────────────────────────────
  const authToken = process.env.MCP_AUTH_TOKEN;
  if (authToken) {
    console.error("[OmniBridge] Bearer Token authentication enabled.");
    app.use("/mcp", (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${authToken}`) {
        console.error(`[OmniBridge] Blocked unauthorized request from ${req.ip}`);
        return res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized: Invalid or missing Bearer token." },
          id: null,
        });
      }
      next();
    });
  }

  // ── POST /mcp — Main request handler ──────────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      // CASE 1: Existing session — reuse transport
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      // CASE 2: New initialization request — spin up a fresh server + transport
      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            console.error(`[OmniBridge] HTTP session initialized: ${sid}`);
            transports[sid] = transport;
          },
        });

        // Cleanup on close
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.error(`[OmniBridge] HTTP session closed: ${sid}`);
            delete transports[sid];
          }
        };

        // Each session gets its own server instance but shares global services
        const server = await createOmniBridgeServer(
          sandboxManager,
          attestationService,
          webhookService,
          chainService
        );
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // CASE 3: Invalid request
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: No valid session ID provided. Call initialize first.",
        },
        id: null,
      });
    } catch (error: any) {
      console.error("[OmniBridge] Error handling POST /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // ── GET /mcp — SSE stream for server-initiated messages ───
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // ── DELETE /mcp — Explicit session termination ────────────
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    console.error(`[OmniBridge] Session termination requested: ${sessionId}`);
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("[OmniBridge] Error during session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  // ── Start listening ───────────────────────────────────────
  app.listen(port, () => {
    console.error(
      `[OmniBridge] Started via Streamable HTTP on port ${port} (POST /mcp)`
    );
  });
}

// ─────────────────────────────────────────────────────────────
main().catch((error) => {
  console.error("[OmniBridge] Fatal error during startup:", error);
  process.exit(1);
});