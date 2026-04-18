// Install brokenigloo skills to AI agent CLIs
import { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { bold, green, dim, yellow, cyan } from "./colors.js";
import { CLAUDE_SKILLS_DIR, CODEX_SKILLS_DIR, AGENTS_SKILLS_DIR, VERSION, PRODUCT_NAME } from "./branding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || "~";

function resolveHome(p: string): string {
  return p.replace("~", HOME);
}

function findSkillsSource(): string {
  // Look for skills relative to the CLI
  const candidates = [
    join(__dirname, "..", "skills"),
    join(__dirname, "..", "..", "skills"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && existsSync(join(c, "SKILL_ROUTER.md"))) return c;
  }
  throw new Error("Skills directory not found. Ensure skills/ exists relative to the CLI.");
}

function getSkillDirs(skillsRoot: string): string[] {
  const dirs: string[] = [];
  for (const phase of ["idea", "build", "launch"]) {
    const phaseDir = join(skillsRoot, phase);
    if (!existsSync(phaseDir)) continue;
    const entries = readdirSync(phaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && existsSync(join(phaseDir, entry.name, "SKILL.md"))) {
        dirs.push(join(phaseDir, entry.name));
      }
    }
  }
  return dirs;
}

function installSkillsTo(targetBase: string, skillsRoot: string, skillDirs: string[]): number {
  const target = resolveHome(targetBase);
  mkdirSync(target, { recursive: true });

  // Copy SKILL_ROUTER.md
  const routerSrc = join(skillsRoot, "SKILL_ROUTER.md");
  if (existsSync(routerSrc)) {
    cpSync(routerSrc, join(target, "SKILL_ROUTER.md"));
  }

  // Copy shared data
  const dataSrc = join(skillsRoot, "data");
  if (existsSync(dataSrc)) {
    cpSync(dataSrc, join(target, "data"), { recursive: true });
  }

  // Copy each skill
  let installed = 0;
  for (const skillDir of skillDirs) {
    const skillName = skillDir.split("/").pop()!;
    const dest = join(target, skillName);
    mkdirSync(dest, { recursive: true });
    cpSync(skillDir, dest, { recursive: true });
    installed++;
  }

  return installed;
}

export async function runInit(agentMode: boolean = false): Promise<void> {
  if (!agentMode) {
    console.log("");
    console.log(bold("  Installing brokenigloo skills..."));
    console.log("");
  }

  const skillsRoot = findSkillsSource();
  const skillDirs = getSkillDirs(skillsRoot);

  if (skillDirs.length === 0) {
    console.error("No skills found in skills directory.");
    process.exit(1);
  }

  const targets = [CLAUDE_SKILLS_DIR, CODEX_SKILLS_DIR, AGENTS_SKILLS_DIR];
  const results: Record<string, number> = {};

  for (const target of targets) {
    const count = installSkillsTo(target, skillsRoot, skillDirs);
    results[target] = count;
    if (!agentMode) {
      console.log(green(`  ✓ ${count} skills installed to ${target}`));
    }
  }

  // Generate project CLAUDE.md if in a project directory
  const cwd = process.cwd();
  const projectClaudeMd = join(cwd, "CLAUDE.md");
  if (!existsSync(projectClaudeMd) && cwd !== HOME) {
    const content = generateProjectClaudeMd();
    writeFileSync(projectClaudeMd, content);
    if (!agentMode) {
      console.log(green(`  ✓ Generated CLAUDE.md in ${cwd}`));
    }
  }

  if (agentMode) {
    console.log(JSON.stringify({ installed: results, skills_count: skillDirs.length }));
  } else {
    console.log("");
    console.log(dim(`  ${skillDirs.length} skills ready across ${targets.length} agent CLIs`));
    console.log("");
    console.log(cyan("  Next steps:"));
    console.log(`    Open ${bold("Claude Code")} and say: ${bold('"teach me Sui"')}`);
    console.log(`    Or try: ${bold('"help me scaffold a Sui project"')}`);
    console.log("");
  }
}

function generateProjectClaudeMd(): string {
  return `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sui Project — Built with brokenigloo

This project is built on the Sui blockchain using the Move programming language.

## Commands

\`\`\`bash
# Move development
sui move build          # Compile Move modules
sui move test           # Run Move tests
sui client publish      # Deploy to network (add --gas-budget)

# Frontend (if applicable)
pnpm dev               # Start dev server
pnpm build             # Production build
\`\`\`

## Sui Resources

- Start any prompt with a brokenigloo skill trigger phrase
- Say "navigate skills" to browse all available skills
- Say "debug move" when you hit an error
- Say "review and iterate" before deploying
`;
}
