// Detect and manage AI agent CLI tools (Claude Code, OpenAI Codex)
import { execSync } from "child_process";

interface AgentCLI {
  name: string;
  command: string;
  path: string;
}

let cachedCLI: AgentCLI | null = null;

function which(cmd: string): string | null {
  try {
    return execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function detectAgentCLI(): AgentCLI | null {
  if (cachedCLI !== null) return cachedCLI;

  // Check for Claude Code first (preferred for brokenigloo)
  const claudePath = which("claude");
  if (claudePath) {
    cachedCLI = { name: "Claude Code", command: "claude", path: claudePath };
    return cachedCLI;
  }

  // Check for OpenAI Codex
  const codexPath = which("codex");
  if (codexPath) {
    cachedCLI = { name: "OpenAI Codex", command: "codex", path: codexPath };
    return cachedCLI;
  }

  return null;
}

export function getAgentCLIName(): string {
  const cli = detectAgentCLI();
  return cli?.name ?? "No AI agent CLI";
}

export function hasAgentCLI(): boolean {
  return detectAgentCLI() !== null;
}

export function launchSkill(skillPrompt: string): void {
  const cli = detectAgentCLI();
  if (!cli) {
    console.error("No AI agent CLI found. Install Claude Code or OpenAI Codex.");
    process.exit(1);
  }

  const { execSync: exec } = require("child_process");
  try {
    exec(`${cli.command} "${skillPrompt}"`, {
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch {
    // User exited the agent CLI — not an error
  }
}
