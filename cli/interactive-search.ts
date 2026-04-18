// Interactive search TUI — search across repos, skills, and MCPs
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { bold, dim, cyan, green, yellow, suiGradient } from "./colors.js";
import { printCompactBanner } from "./banner.js";
import { searchRepos, loadRepos, type Repo } from "./repos.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MCP {
  id: string;
  name: string;
  repo: string;
  category: string;
  description: string;
  install: string;
}

interface Skill {
  id: string;
  name: string;
  phase: string;
  description: string;
  triggers: string[];
}

function loadMCPs(): MCP[] {
  return JSON.parse(readFileSync(join(__dirname, "data", "sui-mcps.json"), "utf-8"));
}

function loadSkills(): Skill[] {
  return JSON.parse(readFileSync(join(__dirname, "data", "sui-skills.json"), "utf-8"));
}

function searchMCPs(query: string): MCP[] {
  const q = query.toLowerCase();
  return loadMCPs().filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
  );
}

function searchSkillsCatalog(query: string): Skill[] {
  const q = query.toLowerCase();
  return loadSkills().filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.triggers.some((t) => t.toLowerCase().includes(q))
  );
}

export async function interactiveSearch(query: string, agentMode: boolean = false): Promise<void> {
  if (!query) {
    if (agentMode) {
      console.log(JSON.stringify({ error: "No search query provided" }));
      return;
    }
    printCompactBanner();
    console.log(`  ${bold("Usage:")} brokenigloo search <query>`);
    console.log(`  ${dim("Example: brokenigloo search defi")}`);
    console.log(`  ${dim("Example: brokenigloo search lending")}`);
    console.log(`  ${dim("Example: brokenigloo search wallet")}`);
    console.log("");
    return;
  }

  const repos = searchRepos(query);
  const mcps = searchMCPs(query);
  const skills = searchSkillsCatalog(query);

  if (agentMode) {
    console.log(JSON.stringify({ query, repos, mcps, skills }, null, 2));
    return;
  }

  printCompactBanner();
  console.log(bold(`  Search results for "${query}":\n`));

  // Skills
  if (skills.length > 0) {
    console.log(cyan(`  Skills (${skills.length}):`));
    for (const s of skills.slice(0, 10)) {
      console.log(`    ${bold(s.id.padEnd(30))} ${dim(s.description.slice(0, 60))}`);
    }
    console.log("");
  }

  // Repos
  if (repos.length > 0) {
    console.log(green(`  Repos (${repos.length}):`));
    for (const r of repos.slice(0, 10)) {
      console.log(`    ${bold(r.name.padEnd(30))} ${dim(r.description.slice(0, 60))}`);
      console.log(`    ${dim(`github.com/${r.repo}`)}`);
    }
    console.log("");
  }

  // MCPs
  if (mcps.length > 0) {
    console.log(yellow(`  MCPs (${mcps.length}):`));
    for (const m of mcps.slice(0, 10)) {
      console.log(`    ${bold(m.name.padEnd(30))} ${dim(m.description.slice(0, 60))}`);
      console.log(`    ${dim(`Install: ${m.install}`)}`);
    }
    console.log("");
  }

  if (repos.length === 0 && mcps.length === 0 && skills.length === 0) {
    console.log(dim(`  No results found for "${query}".`));
    console.log("");
  }

  const total = repos.length + mcps.length + skills.length;
  console.log(dim(`  ${total} results across ${skills.length} skills, ${repos.length} repos, ${mcps.length} MCPs`));
  console.log("");
}

export async function interactiveRepos(query?: string): Promise<void> {
  const repos = query ? searchRepos(query) : loadRepos();

  printCompactBanner();
  if (query) {
    console.log(bold(`  Repos matching "${query}" (${repos.length}):\n`));
  } else {
    console.log(bold(`  All Sui Starter Repos (${repos.length}):\n`));
  }

  const byCategory = new Map<string, Repo[]>();
  for (const r of repos) {
    const cat = r.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  for (const [category, catRepos] of byCategory) {
    console.log(cyan(`  ${category.toUpperCase()} (${catRepos.length}):`));
    for (const r of catRepos) {
      console.log(`    ${bold(r.name.padEnd(28))} ⭐${String(r.stars).padEnd(6)} ${dim(r.description.slice(0, 50))}`);
      console.log(`    ${dim(`git clone https://github.com/${r.repo}.git`)}`);
    }
    console.log("");
  }
}
