// Interactive skills browser
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { bold, dim, cyan, green, yellow, suiGradient } from "./colors.js";
import { printCompactBanner } from "./banner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Skill {
  id: string;
  name: string;
  phase: string;
  description: string;
  triggers: string[];
}

function loadSkills(): Skill[] {
  return JSON.parse(readFileSync(join(__dirname, "data", "sui-skills.json"), "utf-8"));
}

export async function interactiveSkills(agentMode: boolean = false): Promise<void> {
  const skills = loadSkills();

  if (agentMode) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  printCompactBanner();
  console.log(bold(`  Installed Skills (${skills.length}):\n`));

  const phases = ["idea", "build", "launch"];
  const phaseColors: Record<string, (s: string) => string> = {
    idea: yellow,
    build: cyan,
    launch: green,
  };
  const phaseEmojis: Record<string, string> = {
    idea: "💡",
    build: "🔨",
    launch: "🚀",
  };

  for (const phase of phases) {
    const phaseSkills = skills.filter((s) => s.phase === phase);
    const color = phaseColors[phase] || dim;
    const emoji = phaseEmojis[phase] || "";

    console.log(color(`  ${emoji} ${phase.toUpperCase()} (${phaseSkills.length} skills):`));
    console.log("");

    for (const skill of phaseSkills) {
      console.log(`    ${bold(skill.id.padEnd(30))} ${dim(skill.description.slice(0, 55))}`);
      if (skill.triggers.length > 0) {
        console.log(`    ${dim(`Say: "${skill.triggers[0]}"`)}`);
      }
    }
    console.log("");
  }

  console.log(dim(`  To use a skill, open Claude Code and say one of the trigger phrases above.`));
  console.log("");
}
