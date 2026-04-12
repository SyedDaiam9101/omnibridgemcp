<p align="center">
  <img src="https://github.com/SyedDaiam9101/omnibridgemcp/actions/workflows/ci.yml/badge.svg" alt="Build Status">
  <img src="https://img.shields.io/github/license/SyedDaiam9101/omnibridgemcp?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/github/stars/SyedDaiam9101/omnibridgemcp?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/github/last-commit/SyedDaiam9101/omnibridgemcp?style=for-the-badge" alt="Last Commit">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/gVisor-Hardened-brightgreen?style=for-the-badge" alt="gVisor">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-Protocol-blue?style=for-the-badge" alt="MCP">
  <img src="https://img.shields.io/badge/Security-Isolated-red?style=for-the-badge" alt="Security">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" alt="PRs Welcome">
</p>

<p align="center">
  <strong>MCP-compatible sandboxed execution layer for AI agents with tamper-evident audit receipts</strong>
</p>

<p align="center">
  OmniBridge is a Model Context Protocol server that gives AI agents an isolated, gVisor-hardened environment to run and verify their code — and produces a signed receipt for every execution so you know exactly what ran, where, and what it produced.
</p>

---

## Quick Start

> **Prerequisites:** Docker Engine 24.0+, Node.js 20+, gVisor (`runsc`) on the host. For local dev without gVisor, use the dev override — see [Deployment Guide](#12-deployment-guide).

```bash
# 1. Clone and install
git clone https://github.com/SyedDaiam9101/omnibridgemcp.git
cd omnibridgemcp
npm install && npm run build

# 2. Configure
cp .env.example .env
# Set HMAC_SECRET to a random string of 32+ characters in .env

# 3. Add to Claude Desktop (stdio mode)
# In claude_desktop_config.json:
{
  "mcpServers": {
    "omnibridge": {
      "command": "node",
      "args": ["/path/to/omnibridgemcp/dist/index.js"],
      "env": { 
        "HMAC_SECRET": "your-secret-key-here",
        "CONTAINER_MEMORY_LIMIT": "512m",
        "CONTAINER_CPU_LIMIT": "1.0",
        "DOCKER_RUNTIME": "runc" 
      }
    }
  }
}

# 4. Or run as an HTTP server (cloud agents)
MCP_TRANSPORT=http PORT=3000 HMAC_SECRET=your-secret node dist/index.js
```

Once connected, your agent can call `sandbox_create` → `sandbox_exec` → `sandbox_destroy`. Every `sandbox_exec` returns a signed receipt alongside the output.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Pillars](#4-core-pillars)
5. [Tool Reference](#5-tool-reference)
6. [Configuration Reference](#6-configuration-reference)
7. [Environment Variables](#7-environment-variables)
8. [Transport Modes](#8-transport-modes)
9. [Security Model](#9-security-model)
10. [Attestation & Audit Trail](#10-attestation--audit-trail)
11. [Error Handling](#11-error-handling)
12. [Deployment Guide](#12-deployment-guide)
13. [Client Integration Examples](#13-client-integration-examples)
14. [Roadmap](#14-roadmap)
15. [Contributing](#15-contributing)
16. [License](#16-license)

---

## 1. Project Overview

### What is OmniBridge?

OmniBridge is a **Model Context Protocol (MCP) server** that functions as a sandboxed execution layer for AI agents. While most MCP servers focus on reading documentation or writing code, OmniBridge solves the harder problem: giving agents a safe, isolated environment where they can **actually run and verify their work** before it reaches production.

### The Problem It Solves

The bottleneck in AI-assisted development is no longer generating code — it is **trusting the output**. Agents can write a database migration, a deployment script, or a security patch, but there is no standard, verifiable way to prove that the code actually does what it claims before a human merges it. OmniBridge closes this gap.

### The Three Pillars

| Pillar               | What It Does                            | Why It Matters                                               |
| -------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Safety-First Sandbox | Ephemeral Docker + gVisor containers    | Agents run code without touching local or production systems |
| Universal Transport  | stdio and Streamable HTTP in one binary | Works in every client — terminal, IDE, cloud dashboard       |
| Tamper-Evident Audit | HMAC-SHA256 signed execution receipts   | Every run is independently verifiable after the fact         |

### Who Is This For?

OmniBridge is designed for engineering teams integrating AI agents into deployment pipelines, CI/CD workflows, and infrastructure automation — particularly teams where autonomous agent actions need to be reviewable and reproducible.

---

## 2. Project Structure

```
omnibridge-mcp-server/
│
├── docker/
│   ├── docker-compose.yml          # Orchestration with gVisor runtime
│   ├── docker-compose.dev.yml      # Development overrides (no gVisor required)
│   ├── runsc-config.toml           # gVisor (runsc) tuning parameters
│   └── images/
│       ├── node.Dockerfile         # Hardened Node.js sandbox image
│       ├── python.Dockerfile       # Hardened Python sandbox image
│       └── rust.Dockerfile         # Hardened Rust sandbox image
│
├── src/
│   ├── index.ts                    # Entrypoint — detects transport and boots server
│   ├── server.ts                   # McpServer factory — registers all tools
│   ├── constants.ts                # Shared limits, default values, env key names
│   ├── types.ts                    # TypeScript interfaces and type definitions
│   │
│   ├── tools/
│   │   ├── sandbox.ts              # All sandbox_* tool registrations
│   │   └── attestation.ts          # attestation_verify tool registration
│   │
│   ├── services/
│   │   ├── sandbox-manager.ts      # Container lifecycle (create, exec, destroy, TTL)
│   │   ├── attestation-service.ts  # HMAC receipt generation and verification
│   │   ├── docker-client.ts        # Typed wrapper around Docker Engine SDK
│   │   └── session-store.ts        # In-memory session → container ID mapping
│   │
│   ├── schemas/
│   │   ├── sandbox.schemas.ts      # Zod schemas for sandbox tool inputs
│   │   └── attestation.schemas.ts  # Zod schemas for receipt shape
│   │
│   └── utils/
│       ├── logger.ts               # Structured stderr-only logger
│       ├── errors.ts               # Custom error classes with actionable messages
│       └── hash.ts                 # SHA-256 hashing helpers
│
├── docs/
│   ├── architecture.md             # Deep-dive into system design decisions
│   ├── attestation.md              # How receipts are signed and verified
│   ├── security.md                 # Threat model and hardening rationale
│   ├── transport.md                # stdio vs Streamable HTTP decision guide
│   └── enterprise-setup.md        # SSO, audit pipeline, and compliance config
│
├── tests/
│   ├── unit/
│   │   ├── attestation-service.test.ts
│   │   ├── sandbox-manager.test.ts
│   │   └── session-store.test.ts
│   └── integration/
│       ├── sandbox-lifecycle.test.ts   # Full create → exec → destroy cycle
│       └── receipt-chain.test.ts       # Receipt generation and verification
│
├── scripts/
│   ├── install-gvisor.sh           # One-command gVisor setup for Ubuntu
│   ├── rotate-hmac-key.sh          # Safe HMAC key rotation with zero downtime
│   └── inspect-receipt.ts          # CLI tool to decode and verify a receipt JSON
│
├── .env.example                    # Template for all environment variables
├── package.json
├── tsconfig.json
├── README.md                       # This document
└── CHANGELOG.md                    # Version history and migration notes
```

### Folder Responsibilities at a Glance

**`src/tools/`** — Contains only MCP tool registrations. Each file registers tools with the `McpServer` instance. No business logic lives here; tools delegate immediately to services.

**`src/services/`** — All business logic. The sandbox manager, attestation service, and Docker client are completely independent of the MCP protocol — they could be called by a REST API equally well.

**`src/schemas/`** — Zod schemas are defined once and imported both by tools (for input validation) and by services (for output validation). Single source of truth for data shapes.

**`docker/`** — Everything Docker-related. The `docker-compose.yml` is the production deployment unit. Dev overrides live in a separate file so gVisor is not required on developer laptops.

**`docs/`** — Extended decision records. Each file covers one architectural concern in depth, targeted at engineers who need to audit, extend, or integrate OmniBridge.

---

## 3. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP CLIENT                              │
│          (Claude Desktop / Cursor / Cloud Agent)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
           ┌──────────▼──────────┐
           │   Transport Router  │
           │  stdio  │  HTTP     │  ← Same binary, detected at boot
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │    McpServer        │
           │  (Tool Registry)    │  ← sandbox_create, sandbox_exec,
           └──────────┬──────────┘     sandbox_diff, sandbox_destroy,
                      │                attestation_verify
           ┌──────────▼──────────┐
           │   Sandbox Manager   │
           │  + Session Store    │  ← session_id → container_id map
           │  + TTL Watchdog     │     auto-destroys on expiry
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────────────────┐
           │   Attestation Service           │
           │   (wraps every exec response)   │  ← HMAC signed receipt
           └──────────┬──────────────────────┘    attached to output
                      │
           ┌──────────▼──────────────────────┐
           │   Docker Client                 │
           │   gVisor runtime (runsc)        │  ← Kernel-isolated container
           │   Hardened image                │
           └─────────────────────────────────┘
```

### Key Design Decisions

**Stateless HTTP transport.** Each HTTP request instantiates a new `McpServer`. Session state (the map of session IDs to container IDs) lives in the `SessionStore` service, not inside the transport layer. This means OmniBridge can be deployed behind a load balancer with zero sticky-session configuration.

**Attestation is not optional.** The `sandbox_exec` tool always generates a receipt. There is no flag to disable it. This is intentional — it prevents agents from silently bypassing the audit trail by passing a parameter.

**gVisor, not just Docker.** Standard Docker containers share the host kernel. gVisor interposes every syscall through its own user-space kernel (`runsc`). This means even if a malicious payload executes inside the sandbox, it cannot reach the host kernel directly.

**TTL as a hard guarantee.** The TTL watchdog runs independently of the agent session. If the MCP client disconnects without calling `sandbox_destroy`, the container is still cleaned up when the TTL fires. Ghost containers cannot accumulate.

---

## 4. Core Pillars

### Pillar 1 — Safety-First Sandbox

Every code execution request creates a fresh, isolated container with a finite lifetime. The container starts clean (no state from previous runs), runs the agent's command, and is destroyed automatically.

**Container Security Profile:**

| Setting         | Value             | Rationale                                   |
| --------------- | ----------------- | ------------------------------------------- |
| Runtime         | `runsc` (gVisor)  | User-space kernel — syscall interposition   |
| Network         | `none` by default | Agents cannot exfiltrate data or phone home |
| Capabilities    | All dropped       | No privilege escalation path                |
| New privileges  | Disabled          | `no-new-privileges` seccomp flag            |
| Write layer     | `tmpfs`           | No disk persistence beyond TTL              |
| Root filesystem | Read-only         | `/etc`, `/usr`, `/lib` cannot be modified   |
| Max TTL         | 600 seconds       | Hard ceiling, not agent-configurable        |
| Default TTL     | 120 seconds       | Covers most unit test and lint workflows    |

**What "ephemeral" actually means:**

When the TTL fires (or `sandbox_destroy` is called), OmniBridge does the following in order: stops the container, removes the container, removes the `tmpfs` mount. The container ID is evicted from the session store. The next call to `sandbox_create` produces an entirely fresh environment with no state from the previous session.

### Pillar 2 — Universal Transport

OmniBridge ships as a **single binary** that detects its execution context at boot and selects the correct MCP transport automatically.

The tool logic — every Zod schema, every service call, every attestation receipt — is identical in both modes. Only the wire protocol differs.

**stdio mode** is the default. It is used when running OmniBridge as a subprocess from Claude Desktop, Cursor, or any other local MCP client. No network configuration is needed.

**Streamable HTTP mode** activates when the `MCP_TRANSPORT=http` environment variable is set. The server binds to a configurable port and handles each POST to `/mcp` as a stateless request. This mode is appropriate for cloud-hosted agents, browser-based IDEs, and enterprise dashboards.

### Pillar 3 — Tamper-Evident Audit Receipts

Every `sandbox_exec` response includes an **HMAC-SHA256 signed receipt** alongside the command output. The receipt records exactly what ran, where it ran, and what the output was. This is not hardware-backed attestation — it is a tamper-evident audit log: any modification to the receipt body after the fact invalidates the signature.

**Receipt Fields:**

| Field          | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| `session_id`   | The sandbox session this execution belongs to                    |
| `command_hash` | SHA-256 of the exact command string that was executed            |
| `image_digest` | The pinned SHA256 digest of the Docker image (not just its tag)  |
| `stdout_hash`  | SHA-256 of the complete stdout output                            |
| `stderr_hash`  | SHA-256 of the complete stderr output                            |
| `exit_code`    | The process exit code                                            |
| `started_at`   | ISO 8601 timestamp of execution start                            |
| `duration_ms`  | Wall-clock duration of the execution                             |
| `server_id`    | Identifier of the OmniBridge instance that produced this receipt |
| `signature`    | HMAC-SHA256 of all above fields in canonical JSON order          |

**What the receipt tells a reviewer:**

Did the agent actually run this code, or is it claiming to? Was the code run against a known, approved image? Did the output match what the agent reported? Each receipt is independently verifiable by anyone with the HMAC key — useful for post-incident review, CI gates, and team audit logs.

---

## 5. Tool Reference

OmniBridge exposes five tools to MCP clients.

### `sandbox_create`

Creates a new ephemeral sandbox container and returns a `session_id` for use in subsequent calls.

**Parameters:**

| Parameter     | Type   | Default          | Description                                                                                          |
| ------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `image`       | string | `"node:20-slim"` | The Docker image to use. Must be one of the allowed images defined in server config.                 |
| `env`         | object | `{}`             | Environment variables to inject into the container. Values are not logged.                           |
| `ttl_seconds` | number | `120`            | Lifetime of the container in seconds. Maximum is 600.                                                |
| `network`     | string | `"none"`         | Network mode. Options: `"none"` (default, recommended) or `"outbound"` (requires operator approval). |

**Returns:** A `session_id` string that must be passed to all subsequent tool calls for this sandbox session.

**Annotations:** `destructiveHint: false`, `readOnlyHint: false`, `idempotentHint: false`

---

### `sandbox_exec`

Executes a shell command inside an existing sandbox. Always returns both the command output and a signed receipt.

**Parameters:**

| Parameter     | Type   | Default        | Description                                                                |
| ------------- | ------ | -------------- | -------------------------------------------------------------------------- |
| `session_id`  | string | required       | The session ID from `sandbox_create`.                                      |
| `command`     | string | required       | The shell command to execute. Run as a non-root user inside the container. |
| `timeout_ms`  | number | `10000`        | Maximum execution time before the process is killed. Maximum is 60000.     |
| `working_dir` | string | `"/workspace"` | Working directory inside the container.                                    |

**Returns:** An object containing `stdout`, `stderr`, `exit_code`, and a nested `receipt` object (see Attestation section).

**Annotations:** `destructiveHint: false`, `readOnlyHint: false`, `idempotentHint: false`

---

### `sandbox_write_file`

Writes a file into the container's workspace. Used to set up test fixtures, configuration files, or source code before executing.

**Parameters:**

| Parameter    | Type   | Default  | Description                                                     |
| ------------ | ------ | -------- | --------------------------------------------------------------- |
| `session_id` | string | required | The session ID from `sandbox_create`.                           |
| `path`       | string | required | Absolute path inside the container. Must be under `/workspace`. |
| `content`    | string | required | UTF-8 text content to write.                                    |

**Returns:** Confirmation of the write with the resolved path.

**Annotations:** `destructiveHint: false`, `readOnlyHint: false`, `idempotentHint: true`

---

### `sandbox_diff`

Returns all filesystem changes made since the container started. This is the deployment verification hook — it lets an agent (or a CI system) inspect exactly what an execution modified.

**Parameters:**

| Parameter    | Type   | Default  | Description                           |
| ------------ | ------ | -------- | ------------------------------------- |
| `session_id` | string | required | The session ID from `sandbox_create`. |

**Returns:** A list of change records, each with a `kind` (`added`, `modified`, `deleted`) and an absolute `path`. Output files, generated artifacts, and side effects are all captured.

**Annotations:** `destructiveHint: false`, `readOnlyHint: true`, `idempotentHint: true`

---

### `sandbox_destroy`

Explicitly destroys a sandbox before its TTL expires. Should always be called when an agent finishes its work, as it frees resources immediately rather than waiting for the watchdog.

**Parameters:**

| Parameter    | Type   | Default  | Description                |
| ------------ | ------ | -------- | -------------------------- |
| `session_id` | string | required | The session ID to destroy. |

**Returns:** Confirmation with the destroyed `session_id` and actual lifetime in seconds.

**Annotations:** `destructiveHint: true`, `readOnlyHint: false`, `idempotentHint: true`

---

### `attestation_verify`

Verifies that a previously returned receipt is authentic and untampered. Designed for use by downstream CI systems or human reviewers.

**Parameters:**

| Parameter | Type   | Default  | Description                                         |
| --------- | ------ | -------- | --------------------------------------------------- |
| `receipt` | object | required | The full receipt object returned by `sandbox_exec`. |

**Returns:** A verification result with `valid: true/false`, and if invalid, the specific field that failed validation.

**Annotations:** `destructiveHint: false`, `readOnlyHint: true`, `idempotentHint: true`

---

## 6. Configuration Reference

OmniBridge is configured via environment variables and a `docker-compose.yml` file. There are no configuration files that need to be edited in `src/` — all tunables are externalized.

### Allowed Images

The set of Docker images agents may request is defined in the environment, not hardcoded. If an agent requests an image not on the allowed list, `sandbox_create` returns an actionable error listing the permitted options. This prevents agents from pulling arbitrary images from the internet.

### Resource Limits

Each container is created with explicit resource limits that operators can tune. The defaults are conservative and suitable for running unit tests and linting workflows. Teams running compilation-heavy workloads (Rust, for example) should raise the CPU and memory limits.

### HMAC Key Rotation

The HMAC signing key can be rotated without downtime using the included `scripts/rotate-hmac-key.sh` script. The rotation process updates the environment variable on the running server and invalidates all receipts signed with the previous key. Receipts are intended to be verified at the time of issuance, not weeks later, so key rotation is a routine operational event.

---

## 7. Environment Variables

| Variable                  | Required | Default                                        | Description                                                                                                     |
| ------------------------- | -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MCP_TRANSPORT`           | No       | `stdio`                                        | Set to `http` to enable Streamable HTTP mode.                                                                   |
| `PORT`                    | No       | `3000`                                         | HTTP port when running in HTTP transport mode.                                                                  |
| `HMAC_SECRET`             | Yes      | —                                              | HMAC-SHA256 signing key for audit receipts. Must be at least 32 characters. Never commit this value.            |
| `SERVER_ID`               | No       | hostname                                       | Identifier embedded in receipts to identify the OmniBridge instance.                                            |
| `ALLOWED_IMAGES`          | No       | `node:20-slim,python:3.12-slim,rust:1.78-slim` | Comma-separated list of Docker images agents may request.                                                       |
| `DEFAULT_TTL_SECONDS`     | No       | `120`                                          | Default container lifetime if the agent does not specify one.                                                   |
| `MAX_TTL_SECONDS`         | No       | `600`                                          | Hard ceiling on container lifetime. Agents cannot exceed this.                                                  |
| `DEFAULT_EXEC_TIMEOUT_MS` | No       | `10000`                                        | Default command timeout in milliseconds.                                                                        |
| `MAX_EXEC_TIMEOUT_MS`     | No       | `60000`                                        | Hard ceiling on command timeout.                                                                                |
| `CONTAINER_MEMORY_LIMIT`  | No       | `512m`                                         | Docker memory limit per sandbox container.                                                                      |
| `CONTAINER_CPU_LIMIT`     | No       | `1.0`                                          | Docker CPU quota per sandbox container (in cores).                                                              |
| `NETWORK_MODE`            | No       | `none`                                         | Default network mode for new containers. Set to `bridge` to allow outbound access by default (not recommended). |
| `LOG_LEVEL`               | No       | `info`                                         | Logging verbosity. Options: `debug`, `info`, `warn`, `error`. All logs go to stderr.                            |

---

## 8. Transport Modes

### Choosing a Transport

| Scenario                                      | Recommended Transport |
| --------------------------------------------- | --------------------- |
| Claude Desktop on a developer laptop          | `stdio`               |
| Cursor or VS Code extension                   | `stdio`               |
| Cloud-hosted AI agent (Fly.io, Railway, etc.) | `http`                |
| Browser-based enterprise dashboard            | `http`                |
| CI/CD pipeline with a remote agent            | `http`                |

### stdio Transport

No configuration needed. The MCP client launches OmniBridge as a subprocess and communicates over standard input/output streams.

For Claude Desktop, add the following to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omnibridge": {
      "command": "node",
      "args": ["/path/to/omnibridge/dist/index.js"],
      "env": {
        "HMAC_SECRET": "your-secret-key-here"
      }
    }
  }
}
```

**Important:** In stdio mode, OmniBridge never writes to stdout except for MCP protocol messages. All logs and diagnostics go to stderr.

### Streamable HTTP Transport

Set `MCP_TRANSPORT=http` and `PORT=3000` (or your preferred port). OmniBridge will listen on `POST /mcp`.

For remote deployments, place a TLS-terminating reverse proxy (nginx, Caddy, or a cloud load balancer) in front of OmniBridge. OmniBridge itself handles HTTP only, not HTTPS.

Each request creates a new `McpServer` instance. This stateless design means you can run multiple OmniBridge instances behind a load balancer without any shared session state in the transport layer. The `SessionStore` (which maps session IDs to container IDs) must be considered when scaling horizontally — see the Enterprise Setup guide in `docs/enterprise-setup.md`.

---

## 9. Security Model

### Threat Model Summary

OmniBridge is designed to protect against the following:

**Malicious code execution.** An agent (or a prompt injection attack against an agent) may attempt to run code that accesses the host filesystem, exfiltrates secrets, or installs a backdoor. gVisor's syscall interposition prevents the container from reaching the host kernel directly. The read-only root filesystem prevents modification of the base system.

**Resource exhaustion.** A runaway process inside a container could consume all host memory or CPU, causing denial-of-service for other sandbox sessions. Per-container resource limits enforced by Docker prevent this.

**Receipt forgery.** An attacker with access to the agent's output might attempt to tamper with a receipt to make malicious code appear to have passed tests. HMAC signing makes this detectable — any modification to the receipt body invalidates the signature.

**Container escape.** gVisor's user-space kernel is the primary defense. Unlike standard container runtimes, a vulnerability in the containerized application cannot directly exploit the host kernel through a syscall.

**Image supply chain attacks.** Agents are restricted to a fixed allowlist of images. Images should be pinned to digest (not just tag) in production environments to prevent tag-mutation attacks.

### What OmniBridge Does Not Protect Against

OmniBridge is a sandbox, not a firewall for your entire infrastructure. It does not protect against:

- Vulnerabilities in the gVisor runtime itself (though these are significantly rarer than container breakouts).
- Attacks that originate from outside the sandbox (e.g., an attacker who already has shell access to the host).
- Code that is safe to run but produces incorrect or misleading output that an agent then acts on.

---

## 10. Attestation & Audit Trail

### How Receipts Work

When `sandbox_exec` is called, the Attestation Service performs the following steps:

1. The command string is hashed (SHA-256) before execution begins.
2. The container image digest (the pinned SHA256, not the tag) is captured from the Docker API.
3. The command runs inside the container.
4. Stdout and stderr are captured and individually hashed.
5. A canonical receipt object is assembled in a deterministic field order.
6. The canonical JSON of the receipt is signed with HMAC-SHA256 using the operator's secret key.
7. The signature is appended to the receipt and returned alongside the command output.

### Verifying a Receipt

Receipts can be verified in two ways.

**Via the `attestation_verify` MCP tool.** Pass the receipt object back to the tool. OmniBridge recomputes the signature from the receipt fields and compares it to the stored signature. This is the recommended approach for agent-to-agent workflows.

**Offline verification.** Operators with the HMAC key can verify receipts independently using the `scripts/inspect-receipt.ts` CLI tool. This is appropriate for post-incident investigations and manual audits.

### Integrating with Audit Pipelines

Receipts are plain JSON and can be forwarded to any log aggregation system (Datadog, Splunk, ELK, CloudWatch). The recommended pattern is to have the agent forward every receipt to a dedicated audit log immediately after receiving it, before acting on the result. This ensures the audit trail is complete even if the agent crashes mid-workflow.

---

## 11. Error Handling

All tool errors follow the same structure: a human-readable `message` that describes what went wrong, a `code` that identifies the error category programmatically, and a `suggestion` that tells the agent what to do next.

### Error Codes

| Code                 | Description                                            | Common Causes                                                          |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `SESSION_NOT_FOUND`  | The `session_id` does not match any active sandbox.    | TTL expired before the next call; typo in session ID.                  |
| `IMAGE_NOT_ALLOWED`  | The requested image is not in the allowed list.        | Agent requested an image not configured by the operator.               |
| `TTL_EXCEEDED`       | The requested TTL is above the configured maximum.     | Agent requested a TTL longer than `MAX_TTL_SECONDS`.                   |
| `EXEC_TIMEOUT`       | The command did not complete within `timeout_ms`.      | Long-running process; raise `timeout_ms` or split the command.         |
| `CONTAINER_OOM`      | The container was killed due to memory exhaustion.     | Raise `CONTAINER_MEMORY_LIMIT` or reduce workload per session.         |
| `DOCKER_UNAVAILABLE` | Cannot connect to the Docker daemon.                   | Docker is not running; check the host daemon status.                   |
| `RECEIPT_INVALID`    | Signature verification failed in `attestation_verify`. | Receipt was tampered with, or the HMAC key was rotated since issuance. |
| `PATH_TRAVERSAL`     | `sandbox_write_file` path is outside `/workspace`.     | Agent attempted to write to a protected directory.                     |

---

## 12. Deployment Guide

### Prerequisites

- Docker Engine 24.0 or later
- gVisor (`runsc`) installed on the host (see `scripts/install-gvisor.sh`)
- Node.js 20 or later (for building OmniBridge itself)
- A securely generated HMAC secret (minimum 32 characters, ideally 64)

### Local Development Setup

gVisor is not required for local development. The `docker-compose.dev.yml` override uses the standard `runc` runtime. This is suitable for iterating on tool logic, but the security properties are weaker than production.

To bring up the development environment, copy `.env.example` to `.env`, fill in a local `HMAC_SECRET`, and start the services with the dev override. OmniBridge will start in stdio mode by default.

### Production Deployment

Production deployments should always use the `docker-compose.yml` (not the dev override), which enforces the `runsc` runtime for all sandbox containers. The OmniBridge process itself does not need to run inside gVisor — only the sandbox containers it spawns do.

For cloud deployments, the recommended topology is a single OmniBridge instance per agent cluster, with the Docker socket mounted into the OmniBridge container. Do not expose the Docker socket to any other container.

### Health Check

OmniBridge does not expose a dedicated health endpoint in HTTP mode. The standard approach is to send a `tools/list` MCP request and verify that the expected tools are returned. This tests both the transport and the tool registry in a single call.

---

## 13. Client Integration Examples

### Typical Agent Workflow

A well-behaved agent using OmniBridge follows this pattern for every coding task:

1. Call `sandbox_create` with the appropriate image and a generous TTL.
2. Call `sandbox_write_file` one or more times to place source files in `/workspace`.
3. Call `sandbox_exec` to run the build, lint, or test command.
4. Inspect the `exit_code` in the response. If it is non-zero, read `stderr` and either fix the issue or report the failure.
5. If verifying a deployment, call `sandbox_diff` to inspect what the execution changed.
6. Forward the `receipt` from step 3 to the team's audit log.
7. Call `sandbox_destroy` to release resources immediately.

### Example: Running a Python Test Suite

An agent that has generated a Python module would use OmniBridge like this:

- Create a sandbox with the `python:3.12-slim` image.
- Write the generated module file and the existing test file into `/workspace`.
- Execute `pip install -r requirements.txt --quiet && python -m pytest tests/ -v`.
- Check the `exit_code`. A zero exit code means all tests passed.
- Present the signed receipt to the user as proof that the tests ran in an isolated environment and genuinely passed.
- Destroy the sandbox.

### Example: Verifying a Database Migration Script

- Create a sandbox with the `postgres:16-alpine` image and `network: none`.
- Write the migration SQL file into `/workspace`.
- Execute `psql -U postgres -f /workspace/migration.sql` against a fresh in-container database.
- Call `sandbox_diff` to see exactly which files the migration created or modified.
- Return the receipt and diff to the engineer for approval before the migration is run in staging.

---

## 14. Roadmap

### v1.0 — Foundation

- Docker + gVisor sandbox lifecycle management
- Five core tools: `sandbox_create`, `sandbox_exec`, `sandbox_write_file`, `sandbox_diff`, `sandbox_destroy`
- HMAC-SHA256 audit receipts
- Protocol-agnostic transport (stdio and Streamable HTTP)
- TTL watchdog for automatic cleanup
- Per-container resource limits

### v1.1 — Pipeline Integration (current)

- A `receipt_chain` primitive that links multiple `sandbox_exec` receipts into a single verifiable execution graph, suitable for multi-step deployment workflows.
- A native GitHub Actions integration that posts the receipt chain as a workflow artifact.
- Webhook support so receipts are forwarded to an external audit endpoint at the moment of issuance.

### v1.2 — Enterprise Auth

- OAuth 2.1 token validation for the HTTP transport, allowing enterprise SSO systems to control which agents can create sandboxes.
- Scoped permissions: operators can restrict individual OAuth clients to specific images or TTL limits.
- Audit log export in OCSF (Open Cybersecurity Schema Framework) format for SIEM compatibility.

### v2.0 — Persistent Workspace Mode

- Optional named workspaces that persist between sessions, gated behind explicit operator configuration. Designed for long-running agent tasks like multi-day refactoring projects.
- Workspace snapshots: point-in-time exports of a workspace as a Docker image, stored in a private registry for reproducibility.

---

## 15. Contributing

OmniBridge welcomes contributions. Before opening a pull request, please review the following.

### Design Constraints

Any contribution must preserve the three invariants that define OmniBridge:

**Attestation cannot be disabled.** Do not add parameters that skip receipt generation. The audit trail must be unconditional.

**Sandbox boundaries cannot be weakened by agents.** Agents may choose from the allowed image list and request a TTL within the operator-configured range. They may not request elevated privileges, disable resource limits, or modify the seccomp profile.

**Tool logic and transport logic must remain separate.** Tools call services. Services have no knowledge of MCP. This separation must be maintained so that the tool layer can be tested independently of the transport.

### Submitting Changes

Open an issue before starting work on a significant change. This avoids the situation where a large pull request is submitted that conflicts with the project's design direction. For bug fixes, a pull request without a prior issue is fine.

All new tools must include a Zod schema, a complete tool description with input/output documentation, and integration tests covering both the success path and the most likely error conditions.

---

## 16. License

OmniBridge is released under the MIT License. See `LICENSE` for full terms.

The gVisor runtime (`runsc`) is a separate project released under the Apache 2.0 License. It is not bundled with OmniBridge — it must be installed separately on the host.
