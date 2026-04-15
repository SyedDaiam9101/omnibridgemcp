#!/usr/bin/env node

import fs from "fs";
import path from "path";
import Docker from "dockerode";

const [, , command] = process.argv;

function printHelp(): void {
  console.log(`OmniBridge CLI

Usage:
  omnibridge onboard   Check prerequisites and start OmniBridge MCP server
  omnibridge start     Start OmniBridge MCP server
  omnibridge --help    Show this help
`);
}

async function checkPrerequisites(): Promise<boolean> {
  console.log("[OmniBridge] Checking prerequisites...");
  
  // 1. Check for .env
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("[OmniBridge] Warning: .env file not found in current directory.");
    console.log("             You may need to create one with ATTESTATION_SECRET.");
  } else {
    console.log("[OmniBridge] \u2705 .env file found");
  }

  // 2. Check Docker
  const docker = new Docker();
  try {
    await docker.ping();
    console.log("[OmniBridge] \u2705 Docker is running");
  } catch (error) {
    console.error("[OmniBridge] \u274c Docker is not accessible. Please ensure Docker is running.");
    return false;
  }

  return true;
}

async function startServer(): Promise<void> {
  // Importing the main entry boots the server and keeps process alive.
  await import("./index.js");
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "onboard") {
    const ok = await checkPrerequisites();
    if (ok) {
      console.log("[OmniBridge] All systems go! Starting server...\n");
      await startServer();
    } else {
      console.error("[OmniBridge] Onboarding failed. Please fix the issues above.");
      process.exit(1);
    }
    return;
  }

  if (command === "start") {
    await startServer();
    return;
  }

  console.error(`[OmniBridge] Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[OmniBridge] CLI failed:", error);
  process.exit(1);
});
