// Interactive journey TUI — Idea → Build → Launch skill selection
import { bold, dim, cyan, green, yellow, suiGradient } from "./colors.js";
import { printCompactBanner } from "./banner.js";
import { launchSkill, hasAgentCLI } from "./agent-cli.js";

interface Phase {
  name: string;
  color: (s: string) => string;
  skills: { id: string; trigger: string; description: string }[];
}

const PHASES: Phase[] = [
  {
    name: "💡 Idea — Discovery & Planning",
    color: yellow,
    skills: [
      { id: "sui-beginner", trigger: "teach me Sui", description: "Learn Sui fundamentals" },
      { id: "find-next-crypto-idea", trigger: "help me find a crypto idea", description: "Discover what to build" },
      { id: "validate-idea", trigger: "validate my idea", description: "Stress-test with demand signals" },
      { id: "competitive-landscape", trigger: "map my competitors", description: "Competitive analysis" },
      { id: "defillama-research", trigger: "research DeFi on Sui", description: "DeFi market data" },
      { id: "sui-overflow-copilot", trigger: "hackathon research", description: "Hackathon strategy" },
    ],
  },
  {
    name: "🔨 Build — Implementation",
    color: cyan,
    skills: [
      { id: "scaffold-project", trigger: "scaffold a Sui project", description: "Set up workspace" },
      { id: "build-with-claude", trigger: "build my MVP", description: "Guided implementation" },
      { id: "build-defi-protocol", trigger: "build a DeFi protocol", description: "AMM, lending, vaults" },
      { id: "launch-token", trigger: "launch a token on Sui", description: "Coin creation + DEX listing" },
      { id: "build-data-pipeline", trigger: "build a data pipeline", description: "Events + indexers" },
      { id: "debug-move", trigger: "debug my Move code", description: "Error diagnosis" },
      { id: "review-and-iterate", trigger: "review my code", description: "Security + quality review" },
      { id: "integrate-cetus", trigger: "integrate Cetus", description: "Concentrated liquidity AMM" },
      { id: "integrate-deepbook", trigger: "integrate DeepBook", description: "On-chain order book" },
      { id: "integrate-suilend", trigger: "integrate Suilend", description: "Lending protocol" },
      { id: "integrate-walrus", trigger: "integrate Walrus", description: "Decentralized storage" },
      { id: "integrate-enoki", trigger: "add zkLogin with Enoki", description: "No-wallet onboarding" },
    ],
  },
  {
    name: "🚀 Launch — Go to Market",
    color: green,
    skills: [
      { id: "deploy-to-mainnet", trigger: "deploy to mainnet", description: "Production deployment" },
      { id: "create-pitch-deck", trigger: "create a pitch deck", description: "Investor presentation" },
      { id: "submit-to-hackathon", trigger: "submit to hackathon", description: "Submission prep" },
      { id: "apply-grant", trigger: "apply for a Sui grant", description: "Grant application" },
      { id: "marketing-video", trigger: "create a marketing video", description: "Video production" },
    ],
  },
];

export async function interactiveJourney(agentMode: boolean = false): Promise<void> {
  if (agentMode) {
    // Machine-readable: output all skills
    const allSkills = PHASES.flatMap((p) =>
      p.skills.map((s) => ({ phase: p.name, ...s }))
    );
    console.log(JSON.stringify(allSkills, null, 2));
    return;
  }

  if (!process.stdout.isTTY) {
    // Non-interactive: list skills
    for (const phase of PHASES) {
      console.log(`\n${bold(phase.name)}`);
      for (const skill of phase.skills) {
        console.log(`  ${skill.id.padEnd(25)} ${dim(skill.description)}`);
      }
    }
    return;
  }

  printCompactBanner();
  console.log(bold("  Choose a skill to launch:\n"));

  // Flatten all skills for selection
  const allItems: { phase: string; skill: Phase["skills"][0] }[] = [];
  for (const phase of PHASES) {
    for (const skill of phase.skills) {
      allItems.push({ phase: phase.name, skill });
    }
  }

  let selected = 0;

  // Simple selection UI
  const renderMenu = () => {
    process.stdout.write("\x1b[2J\x1b[H"); // Clear screen
    printCompactBanner();
    console.log(bold("  Select a skill to launch:\n"));

    let currentPhase = "";
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (item.phase !== currentPhase) {
        currentPhase = item.phase;
        console.log(`\n  ${bold(currentPhase)}`);
      }
      const prefix = i === selected ? suiGradient(" ▸ ") : "   ";
      const name = i === selected ? bold(item.skill.id) : item.skill.id;
      console.log(`${prefix}${name.padEnd(28)}${dim(item.skill.description)}`);
    }

    console.log(`\n  ${dim("↑/↓ Navigate  ↵ Select  q Quit")}`);
  };

  renderMenu();

  // Raw mode for keyboard input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise<void>((resolve) => {
    process.stdin.on("data", (key: string) => {
      if (key === "q" || key === "\x1b" || key === "\x03") {
        // q, ESC, or Ctrl+C
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log("");
        resolve();
        return;
      }

      if (key === "\x1b[A") {
        // Up arrow
        selected = Math.max(0, selected - 1);
        renderMenu();
      } else if (key === "\x1b[B") {
        // Down arrow
        selected = Math.min(allItems.length - 1, selected + 1);
        renderMenu();
      } else if (key === "\r" || key === "\n") {
        // Enter
        process.stdin.setRawMode(false);
        process.stdin.pause();

        const chosen = allItems[selected];
        console.log(`\n  Launching: ${bold(chosen.skill.id)}\n`);

        if (hasAgentCLI()) {
          launchSkill(chosen.skill.trigger);
        } else {
          console.log(yellow("  No AI agent CLI found."));
          console.log(`  Install Claude Code: ${bold("npm i -g @anthropic-ai/claude-code")}`);
          console.log(`\n  Then run: ${bold(`claude "${chosen.skill.trigger}"`)}`);
        }

        resolve();
      }
    });
  });
}
