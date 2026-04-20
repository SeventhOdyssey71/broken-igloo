#!/usr/bin/env node

// Postinstall: auto-install skills to AI assistant directories after npm install
import { existsSync, mkdirSync, cpSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || "";
if (!HOME) process.exit(0);

const SKILL_TARGETS = [
  join(HOME, ".claude", "skills"),
  join(HOME, ".codex", "skills"),
  join(HOME, ".agents", "skills"),
];

// Find skills directory relative to this script
const skillsRoot = join(__dirname, "..", "skills");
if (!existsSync(skillsRoot) || !existsSync(join(skillsRoot, "SKILL_ROUTER.md"))) {
  // Skills not bundled (dev install) — skip silently
  process.exit(0);
}

let totalInstalled = 0;

for (const target of SKILL_TARGETS) {
  try {
    mkdirSync(target, { recursive: true });

    // Copy SKILL_ROUTER.md
    const routerSrc = join(skillsRoot, "SKILL_ROUTER.md");
    if (existsSync(routerSrc)) cpSync(routerSrc, join(target, "SKILL_ROUTER.md"));

    // Copy shared data
    const dataSrc = join(skillsRoot, "data");
    if (existsSync(dataSrc)) cpSync(dataSrc, join(target, "data"), { recursive: true });

    // Copy each skill from each phase
    for (const phase of ["idea", "build", "launch"]) {
      const phaseDir = join(skillsRoot, phase);
      if (!existsSync(phaseDir)) continue;

      for (const entry of readdirSync(phaseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!existsSync(join(phaseDir, entry.name, "SKILL.md"))) continue;

        const dest = join(target, entry.name);
        mkdirSync(dest, { recursive: true });
        cpSync(join(phaseDir, entry.name), dest, { recursive: true });
        totalInstalled++;
      }
    }
  } catch {
    // Permission errors on some systems — skip silently
  }
}

if (totalInstalled > 0) {
  const skillCount = Math.floor(totalInstalled / SKILL_TARGETS.length);
  console.log(`\n  brokenigloo: ${skillCount} skills installed to Claude Code, Codex, and Agents directories.\n`);
  console.log(`  Get started: Open your AI assistant and say "teach me Sui"\n`);
}
