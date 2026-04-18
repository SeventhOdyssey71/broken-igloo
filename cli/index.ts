#!/usr/bin/env node

// brokenigloo CLI — Ship on Sui, Idea to Launch
// Main command dispatcher

import { PRODUCT_NAME, BINARY_NAME, VERSION } from "./branding.js";
import { printWelcome, printCompactBanner } from "./banner.js";
import { bold, dim, cyan, yellow, red, green } from "./colors.js";

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const isAgent = args.includes("--agent");

// Version flag
if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

// Help flag
if (args.includes("--help") || args.includes("-h")) {
  printCompactBanner();
  console.log(`  ${bold("Usage:")} ${BINARY_NAME} <command> [options]`);
  console.log("");
  console.log(`  ${bold("Commands:")}`);
  console.log(`    ${cyan("ship")}          Launch the interactive journey (Idea → Build → Launch)`);
  console.log(`    ${cyan("init")}          Install skills to your AI assistant`);
  console.log(`    ${cyan("search")}        Search repos, skills, and MCPs`);
  console.log(`    ${cyan("repos")}         Browse clonable Sui starter repos`);
  console.log(`    ${cyan("skills")}        Browse installed skills`);
  console.log(`    ${cyan("doctor")}        Check your development environment`);
  console.log(`    ${cyan("feedback")}      Send feedback to the team`);
  console.log(`    ${cyan("uninstall")}     Remove installed skills`);
  console.log(`    ${cyan("completion")}    Generate shell completions`);
  console.log("");
  console.log(`  ${bold("Options:")}`);
  console.log(`    ${dim("--agent")}        Machine-readable output (for AI agents)`);
  console.log(`    ${dim("--version")}      Show version`);
  console.log(`    ${dim("--help")}         Show this help`);
  console.log("");
  process.exit(0);
}

async function main(): Promise<void> {
  switch (command) {
    case "ship": {
      const { interactiveJourney } = await import("./interactive-journey.js");
      await interactiveJourney(isAgent);
      break;
    }

    case "init": {
      const { runInit } = await import("./init.js");
      await runInit(isAgent);
      break;
    }

    case "search": {
      const query = args.slice(1).filter((a) => a !== "--agent").join(" ");
      const { interactiveSearch } = await import("./interactive-search.js");
      await interactiveSearch(query, isAgent);
      break;
    }

    case "repos": {
      const query = args.slice(1).filter((a) => a !== "--agent").join(" ");
      if (isAgent) {
        const { searchRepos, loadRepos } = await import("./repos.js");
        const results = query ? searchRepos(query) : loadRepos();
        console.log(JSON.stringify(results, null, 2));
      } else {
        const { interactiveRepos } = await import("./interactive-search.js");
        await interactiveRepos(query);
      }
      break;
    }

    case "skills": {
      const { interactiveSkills } = await import("./interactive-skills.js");
      await interactiveSkills(isAgent);
      break;
    }

    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      await runDoctor(isAgent);
      break;
    }

    case "feedback": {
      const message = args.slice(1).filter((a) => a !== "--agent").join(" ");
      const { submitFeedback } = await import("./feedback.js");
      await submitFeedback(message, isAgent);
      break;
    }

    case "uninstall": {
      const { runUninstall } = await import("./uninstall.js");
      await runUninstall(isAgent);
      break;
    }

    case "completion": {
      const shell = args[1] || "bash";
      const { generateCompletion } = await import("./completion.js");
      generateCompletion(shell);
      break;
    }

    case undefined:
      // No command — show welcome
      printWelcome();
      break;

    default:
      printCompactBanner();
      console.log(red(`  Unknown command: ${command}`));
      console.log(`  Run ${bold(`${BINARY_NAME} --help`)} for usage.`);
      console.log("");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(red(`Error: ${err.message}`));
  process.exit(1);
});
