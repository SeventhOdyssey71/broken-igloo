// Environment health checks for Sui development
import { execSync } from "child_process";
import { bold, green, red, yellow, dim, cyan } from "./colors.js";
import { detectAgentCLI } from "./agent-cli.js";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { CLAUDE_SKILLS_DIR, CONFIG_DIR_NAME } from "./branding.js";

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function checkNode(): Check {
  const version = tryExec("node --version");
  if (!version) return { name: "Node.js", status: "fail", detail: "Not found. Install from https://nodejs.org/" };
  const major = parseInt(version.replace("v", "").split(".")[0]);
  if (major < 20) return { name: "Node.js", status: "warn", detail: `${version} (v20+ recommended)` };
  return { name: "Node.js", status: "pass", detail: version };
}

function checkSuiCLI(): Check {
  const version = tryExec("sui --version");
  if (!version) return { name: "Sui CLI", status: "fail", detail: "Not found. Install: brew install sui" };
  return { name: "Sui CLI", status: "pass", detail: version };
}

function checkSuiEnv(): Check {
  const env = tryExec("sui client active-env 2>/dev/null");
  if (!env) return { name: "Sui Environment", status: "warn", detail: "Not configured. Run: sui client" };
  return { name: "Sui Environment", status: "pass", detail: env };
}

function checkSuiAddress(): Check {
  const addr = tryExec("sui client active-address 2>/dev/null");
  if (!addr) return { name: "Sui Address", status: "warn", detail: "No active address. Run: sui keytool generate ed25519" };
  return { name: "Sui Address", status: "pass", detail: `${addr.slice(0, 10)}...${addr.slice(-6)}` };
}

function checkAgentCLI(): Check {
  const cli = detectAgentCLI();
  if (!cli) return { name: "AI Agent CLI", status: "warn", detail: "Not found. Install: npm i -g @anthropic-ai/claude-code" };
  return { name: "AI Agent CLI", status: "pass", detail: `${cli.name} at ${cli.path}` };
}

function checkSkillsInstalled(): Check {
  const skillsDir = CLAUDE_SKILLS_DIR.replace("~", process.env.HOME || "~");
  if (!existsSync(skillsDir)) return { name: "Skills Installed", status: "fail", detail: "No skills found. Run: brokenigloo init" };

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter(
      (e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))
    );
    if (skillDirs.length === 0) return { name: "Skills Installed", status: "fail", detail: "No skills found. Run: brokenigloo init" };
    return { name: "Skills Installed", status: "pass", detail: `${skillDirs.length} skills` };
  } catch {
    return { name: "Skills Installed", status: "warn", detail: "Could not read skills directory" };
  }
}

function checkGit(): Check {
  const version = tryExec("git --version");
  if (!version) return { name: "Git", status: "warn", detail: "Not found" };
  return { name: "Git", status: "pass", detail: version.replace("git version ", "") };
}

function checkPnpm(): Check {
  const version = tryExec("pnpm --version");
  if (!version) {
    const npmVersion = tryExec("npm --version");
    if (npmVersion) return { name: "Package Manager", status: "pass", detail: `npm ${npmVersion}` };
    return { name: "Package Manager", status: "warn", detail: "pnpm/npm not found" };
  }
  return { name: "Package Manager", status: "pass", detail: `pnpm ${version}` };
}

export async function runDoctor(agentMode: boolean = false): Promise<void> {
  const checks: Check[] = [
    checkNode(),
    checkSuiCLI(),
    checkSuiEnv(),
    checkSuiAddress(),
    checkAgentCLI(),
    checkSkillsInstalled(),
    checkGit(),
    checkPnpm(),
  ];

  if (agentMode) {
    // Machine-readable output
    console.log(JSON.stringify({ checks }, null, 2));
    return;
  }

  console.log("");
  console.log(bold("  Environment Health Check"));
  console.log(dim("  ─────────────────────────────────────────"));
  console.log("");

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    const icon =
      check.status === "pass" ? green("✓") :
      check.status === "warn" ? yellow("⚠") :
      red("✗");
    const detail =
      check.status === "pass" ? dim(check.detail) :
      check.status === "warn" ? yellow(check.detail) :
      red(check.detail);

    console.log(`  ${icon}  ${check.name.padEnd(20)} ${detail}`);

    if (check.status === "pass") passCount++;
    else if (check.status === "warn") warnCount++;
    else failCount++;
  }

  console.log("");
  console.log(dim("  ─────────────────────────────────────────"));

  if (failCount === 0 && warnCount === 0) {
    console.log(green("  All checks passed! You're ready to build on Sui."));
  } else if (failCount === 0) {
    console.log(yellow(`  ${passCount} passed, ${warnCount} warnings. Mostly ready.`));
  } else {
    console.log(red(`  ${failCount} failed, ${warnCount} warnings. Fix the issues above.`));
  }
  console.log("");
}
