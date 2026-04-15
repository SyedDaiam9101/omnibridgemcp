#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { runOnboarding } from "./onboarding/wizard.js";

const [, , command] = process.argv;

function printHelp(): void {
  console.log(`OmniBridge CLI

Usage:
  omnibridge onboard   Launch the interactive onboarding wizard
  omnibridge start     Start OmniBridge MCP server
  omnibridge --help    Show this help
`);
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
    await runOnboarding();
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
