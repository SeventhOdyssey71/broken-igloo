// Remove brokenigloo skills from AI agent CLIs
import { existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { bold, green, dim, yellow } from "./colors.js";
import { CLAUDE_SKILLS_DIR, CODEX_SKILLS_DIR, AGENTS_SKILLS_DIR, CONFIG_DIR_NAME } from "./branding.js";

const HOME = process.env.HOME || "~";

function resolveHome(p: string): string {
  return p.replace("~", HOME);
}

function removeSkillsFrom(targetBase: string): number {
  const target = resolveHome(targetBase);
  if (!existsSync(target)) return 0;

  let removed = 0;
  const entries = readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && existsSync(join(target, entry.name, "SKILL.md"))) {
      rmSync(join(target, entry.name), { recursive: true, force: true });
      removed++;
    }
  }

  // Remove shared files
  const sharedFiles = ["SKILL_ROUTER.md", "data"];
  for (const f of sharedFiles) {
    const p = join(target, f);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }

  return removed;
}

export async function runUninstall(agentMode: boolean = false): Promise<void> {
  if (!agentMode) {
    console.log("");
    console.log(bold("  Uninstalling brokenigloo skills..."));
    console.log("");
  }

  const targets = [CLAUDE_SKILLS_DIR, CODEX_SKILLS_DIR, AGENTS_SKILLS_DIR];
  let totalRemoved = 0;

  for (const target of targets) {
    const count = removeSkillsFrom(target);
    totalRemoved += count;
    if (!agentMode && count > 0) {
      console.log(green(`  ✓ Removed ${count} skills from ${target}`));
    }
  }

  // Remove config directory
  const configDir = join(HOME, CONFIG_DIR_NAME);
  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true, force: true });
    if (!agentMode) console.log(green(`  ✓ Removed ${configDir}`));
  }

  if (agentMode) {
    console.log(JSON.stringify({ removed: totalRemoved }));
  } else {
    console.log("");
    console.log(dim("  brokenigloo skills removed. Thanks for building on Sui!"));
    console.log("");
  }
}
