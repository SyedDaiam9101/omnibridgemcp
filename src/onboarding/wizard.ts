import * as p from "@clack/prompts";
import color from "picocolors";
import open from "open";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { detectPrerequisites, configureClaudeDesktop, getClaudeDesktopConfigPath } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runOnboarding() {
  console.clear();
  
  // Premium Header
  console.log(color.cyan(`
   ██████╗ ███╗   ███╗███╗   ██╗██╗██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗
  ██╔═══██╗████╗ ████║████╗  ██║██║██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
  ██║   ██║██╔████╔██║██╔██╗ ██║██║██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗  
  ██║   ██║██║╚██╔╝██║██║╚██╗██║██║██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝  
  ╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗
   ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝
  `));
  
  p.intro(`${color.bgCyan(color.black(" OMNIBRIDGE "))} ${color.dim("Enterprise MCP Setup Wizard")}`);

  // 1. Initial Checks Group
  const group = await p.group(
    {
      prerequisites: async () => {
        const s = p.spinner();
        s.start("Scanning environment for prerequisites...");
        const env = await detectPrerequisites();
        await new Promise(resolve => setTimeout(resolve, 800));
        s.stop("Environment scan complete.");

        const missing: string[] = [];
        if (!env.node) missing.push("Node.js");
        if (!env.docker) missing.push("Docker");

        if (missing.length > 0) {
          p.log.warn(`${color.yellow("Heads up!")} Some tools are missing: ${missing.join(", ")}`);
        }

        return env;
      },
      installMissing: async ({ results }) => {
        const env = results.prerequisites;
        if (env && !env.docker) {
          const action = await p.select({
            message: "Docker is required for sandboxing. How would you like to proceed?",
            options: [
              { value: "download", label: "Open Docker Desktop download page", hint: "Recommended" },
              { value: "ignore", label: "I'll handle it myself", hint: "Proceeding might cause failures" }
            ]
          });

          if (action === "download") {
            await open("https://www.docker.com/products/docker-desktop/");
            p.log.info("Opened Docker page. Please install it and restart this wizard.");
            return "abort";
          }
        }
        return "continue";
      },
      target: async ({ results }) => {
        if (results.installMissing === "abort") return;

        const pre = results.prerequisites;
        return p.select({
          message: "Where should we deploy the OmniBridge MCP server?",
          options: [
            { value: "desktop", label: "Claude for Desktop", hint: pre && pre.claudeDesktop ? "Detected" : "Not found" },
            { value: "code", label: "Claude Code CLI", hint: pre && pre.claudeCode ? "Detected" : "Not found" },
            { value: "both", label: "Both Environments", hint: "Universal integration" },
            { value: "skip", label: "Manual setup only", hint: "Just show me the config" }
          ]
        });
      }
    },
    {
      onCancel: () => {
        p.cancel("Onboarding cancelled.");
        process.exit(0);
      }
    }
  );

  if (group.installMissing === "abort") {
    p.outro(color.dim("Setup paused for dependency installation."));
    return;
  }

  // 2. Configuration Logic
  const s = p.spinner();
  s.start("Generating secure configuration...");

  const rootDir = path.join(__dirname, "..", "..");
  const envPath = path.join(rootDir, ".env");
  let secret = process.env.ATTESTATION_SECRET;

  if (!fs.existsSync(envPath) && !secret) {
    secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    fs.writeFileSync(envPath, `ATTESTATION_SECRET=${secret}\nCONTAINER_MEMORY_LIMIT=512m\nCONTAINER_CPU_LIMIT=1.0\n`);
    p.log.step("Generated secure .env file.");
  }

  const serverPath = path.resolve(rootDir, "dist", "index.js");
  const mcpEnv = {
    ATTESTATION_SECRET: secret || "generated-secret",
  };

  if (group.target === "desktop" || group.target === "both") {
    const success = await configureClaudeDesktop(serverPath, mcpEnv);
    if (!success) p.log.error("Failed to update Claude Desktop config.");
  }

  s.stop("Configuration ready.");

  // 3. Final Summary Note
  const configPath = getClaudeDesktopConfigPath();
  
  p.note(
    ` ${color.bold("Package")}: @15syedd/omnibridge@1.2.0\n` +
    ` ${color.bold("Binary")}: ${color.dim(serverPath)}\n` +
    ` ${color.bold("Config")}: ${color.dim(configPath || "Manual")}\n\n` +
    ` ${color.green("→")} To start manually: ${color.cyan("omnibridge start")}\n` +
    ` ${color.green("→")} In Claude: Toggle the "OmniBridge" tool on.`,
    "Deployment Summary"
  );

  p.outro(`${color.cyan("OmniBridge")} is locked and loaded! 🚀`);
}
