/**
 * Show HN / README Demo (HTTP mode)
 *
 * Runs an end-to-end OmniBridge demo:
 * - Starts the server (HTTP transport) with a locally generated mock JWKS (no external IdP needed)
 * - Initializes an MCP session with a signed JWT
 * - Demonstrates tenant policy rejection, sandbox create/exec, env injection
 * - Verifies attestation signature
 * - Verifies chain integrity
 * - Exports OCSF audit events
 * - Cleans up the sandbox and stops the server
 *
 * Prereqs:
 * - Docker Desktop running
 * - `npm run build` completed (uses dist/)
 */

const crypto = require("crypto");
const jose = require("jose");
const path = require("path");
const { pathToFileURL } = require("url");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickPort() {
  const base = 3100;
  return base + Math.floor(Math.random() * 2000);
}

async function waitForHttpReady(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Server not ready after ${timeoutMs}ms: ${url}`);
}

function parseSseJson(text) {
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data: "));
  if (dataLines.length === 0) {
    throw new Error(`No SSE data found. Raw response:\n${text}`);
  }
  const last = dataLines[dataLines.length - 1].slice("data: ".length);
  return JSON.parse(last);
}

async function mcpPost(mcpUrl, headers, body) {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return {
    sessionIdHeader: res.headers.get("mcp-session-id"),
    json: parseSseJson(text),
    raw: text,
  };
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("This demo requires Node.js 20+ (global fetch).");
  }

  const port = pickPort();
  const baseUrl = `http://localhost:${port}`;
  const mcpUrl = `${baseUrl}/mcp`;

  console.log(`\n=== OmniBridge Demo (${baseUrl}) ===\n`);

  // 1) Generate local RSA keys for a mock issuer, then mint a JWT for tenant1
  const keys = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "jwk" },
  });

  const jwkPublic = keys.publicKey;
  const jwkPrivate = await jose.importJWK(keys.privateKey, "RS256");

  const issuer = "urn:omnibridge:demo";
  const audience = "urn:omnibridge:api";

  const jwt = await new jose.SignJWT({ client_id: "tenant1" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("tenant1-demo-user")
    .setExpirationTime("2h")
    .sign(jwkPrivate);

  // 2) Start server (HTTP transport) in-process (no child process spawning)
  console.log("[1/7] Starting server (HTTP transport)...");
  const env = {
    ...process.env,
    MCP_TRANSPORT: "http",
    PORT: String(port),
    // demo-safe defaults (avoid requiring gVisor for a quick demo)
    DOCKER_RUNTIME: process.env.DOCKER_RUNTIME || "runc",
    // OAuth/JWT (mocked via env JWK)
    MOCK_JWK_PUB: JSON.stringify(jwkPublic),
    OAUTH_ISSUER: issuer,
    OAUTH_AUDIENCE: audience,
    // Governance: lock tenant1 to python only
    TENANT_POLICIES: JSON.stringify({
      DEFAULT: { allowedImages: ["node:20-slim", "python:3.12-slim"], maxTtl: 300 },
      tenant1: { allowedImages: ["python:3.12-slim"], maxTtl: 300 },
    }),
  };

  // Windows/Docker Desktop convenience: allow overriding the socket path
  if (process.platform === "win32" && !env.DOCKER_SOCKET_PATH) {
    env.DOCKER_SOCKET_PATH = "//./pipe/dockerDesktopLinuxEngine";
  }

  // Apply env for the imported server module
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  // Importing `dist/index.js` starts the server (it runs `main()` at module load).
  const distEntry = pathToFileURL(path.resolve(process.cwd(), "dist/index.js")).toString();
  await import(distEntry);

  await waitForHttpReady(`${baseUrl}/`);
  console.log("      Server ready.");

  try {
    const baseHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${jwt}`,
    };

    // 3) Initialize session
    console.log("\n[2/7] MCP initialize...");
    const init = await mcpPost(mcpUrl, baseHeaders, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "demo", version: "1.0.0" },
      },
    });

    const mcpSessionId = init.sessionIdHeader;
    if (!mcpSessionId) throw new Error("Missing mcp-session-id header on initialize.");
    console.log(`      mcp-session-id: ${mcpSessionId}`);

    const sessionHeaders = { ...baseHeaders, "mcp-session-id": mcpSessionId };

    // 4) Show governance block (unauthorized image for tenant1)
    console.log("\n[3/7] Governance check (intentional policy rejection)...");
    const blocked = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "sandbox_create", arguments: { image: "node:20-slim", ttlSeconds: 60 } },
    });
    const blockedText = blocked.json?.result?.content?.[0]?.text || "";
    console.log(`      ${blockedText.trim()}`);

    // If policy didn't block for some reason, immediately destroy the created sandbox to avoid leaking resources.
    try {
      if (blocked.json?.result?.isError === false) {
        const maybe = JSON.parse(blockedText);
        if (maybe?.sessionId) {
          await mcpPost(mcpUrl, sessionHeaders, {
            jsonrpc: "2.0",
            id: 200,
            method: "tools/call",
            params: { name: "sandbox_destroy", arguments: { sessionId: maybe.sessionId } },
          });
        }
      }
    } catch {}

    // 5) Create sandbox (allowed python)
    console.log("\n[4/7] sandbox_create (python:3.12-slim)...");
    const created = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "sandbox_create", arguments: { image: "python:3.12-slim", ttlSeconds: 120 } },
    });
    const createdText = created.json?.result?.content?.[0]?.text;
    const sandboxSessionId = JSON.parse(createdText).sessionId;
    console.log(`      sessionId: ${sandboxSessionId}`);

    // 6) Execute + env injection + receipt
    console.log("\n[5/7] sandbox_exec (env injection + receipt)...");
    const execRes = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "sandbox_exec",
        arguments: {
          sessionId: sandboxSessionId,
          image: "python:3.12-slim",
          workDir: "/workspace",
          env: { TEST_KEY: "omnibridge_works" },
          command: ["python3", "-c", "import os; print(os.environ.get('TEST_KEY','missing'))"],
        },
      },
    });
    const execText = execRes.json?.result?.content?.[0]?.text;
    const execObj = JSON.parse(execText);
    console.log(`      stdout: ${execObj.stdout.trim()}`);
    if (!String(execObj.stdout).includes("omnibridge_works")) {
      throw new Error("Env injection failed (expected omnibridge_works in stdout).");
    }

    // 7) Attestation verify
    console.log("\n[6/7] attestation_verify...");
    const verifyRes = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "attestation_verify",
        arguments: { receipt: execObj.attestation.receipt, signature: execObj.attestation.signature },
      },
    });
    const verifyText = verifyRes.json?.result?.content?.[0]?.text;
    const verifyObj = JSON.parse(verifyText);
    console.log(`      valid: ${verifyObj.valid}`);
    if (!verifyObj.valid) throw new Error("Attestation verify failed.");

    // 8) Chain verify + OCSF export
    console.log("\n[7/7] chain_verify + audit_export_ocsf...");
    const chainRes = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "chain_verify", arguments: { sessionId: sandboxSessionId } },
    });
    console.log(`      chain_verify: ${chainRes.json.result.content[0].text.trim()}`);

    const ocsfRes = await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "audit_export_ocsf", arguments: { sessionId: sandboxSessionId } },
    });
    const ocsfEvents = JSON.parse(ocsfRes.json.result.content[0].text);
    console.log(`      OCSF events: ${Array.isArray(ocsfEvents) ? ocsfEvents.length : "?"}`);

    // Cleanup
    console.log("\n[Cleaning up] Destroying sandbox...");
    await mcpPost(mcpUrl, sessionHeaders, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "sandbox_destroy", arguments: { sessionId: sandboxSessionId } },
    });

    console.log("\n Demo complete. If you like this, star the repo.\n");
    process.exit(0);
  } catch (e) {
    // Rethrow to be handled by the outer catch
    throw e;
  }
}

main().catch((err) => {
  console.error("\n Demo failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
