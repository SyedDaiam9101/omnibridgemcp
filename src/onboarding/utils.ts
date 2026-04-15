import { execa } from "execa";
import fs from "fs";
import path from "path";
import os from "os";

export interface EnvStatus {
  docker: boolean;
  claudeDesktop: boolean;
  claudeCode: boolean;
  node: boolean;
}

export async function detectPrerequisites(): Promise<EnvStatus> {
  const status: EnvStatus = {
    docker: false,
    claudeDesktop: false,
    claudeCode: false,
    node: false,
  };

  // 1. Check Node
  try {
    await execa("node", ["--version"]);
    status.node = true;
  } catch {}

  // 2. Check Docker
  try {
    await execa("docker", ["--version"]);
    status.docker = true;
  } catch {}

  // 3. Check Claude Desktop Config
  const desktopConfigPath = getClaudeDesktopConfigPath();
  if (fs.existsSync(desktopConfigPath)) {
    status.claudeDesktop = true;
  }

  // 4. Check Claude Code CLI
  try {
    await execa("claude", ["--version"]);
    status.claudeCode = true;
  } catch {}

  return status;
}

export function getClaudeDesktopConfigPath(): string {
  if (process.platform === "win32") {
    const standardPath = path.join(os.homedir(), "AppData", "Roaming", "Claude", "claude_desktop_config.json");
    // Microsoft Store version uses a sandboxed path
    const msStorePath = path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Packages",
      "Claude_pzs8sxrjxfjjc",
      "LocalCache",
      "Roaming",
      "Claude",
      "claude_desktop_config.json"
    );

    if (fs.existsSync(msStorePath)) {
      return msStorePath;
    }
    return standardPath;
  } else if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  return "";
}

export function getClaudeCodeConfigPath(): string {
  // Claude Code CLI usually stores config in ~/.claude/config.json
  return path.join(os.homedir(), ".claude", "config.json");
}

export async function configureClaudeDesktop(serverPath: string, env: Record<string, string>): Promise<boolean> {
  const configPath = getClaudeDesktopConfigPath();
  if (!configPath) return false;

  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: any = {};
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(content);
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers.omnibridge = {
      command: "node",
      args: [serverPath],
      env: {
        ...env,
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to configure Claude Desktop:", error);
    return false;
  }
}
