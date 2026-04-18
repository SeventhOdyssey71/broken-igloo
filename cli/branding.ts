// Single source of truth for all brokenigloo brand strings.
// Every CLI output, skill preamble, and config path references these constants.

export const PRODUCT_NAME = "brokenigloo";
export const BINARY_NAME = "brokenigloo";
export const ALT_BINARY_NAME = "sui-new";
export const NPM_PACKAGE = "brokenigloo";
export const PRODUCT_TAGLINE = "Ship on Sui — Idea to Launch";
export const PRODUCT_DESCRIPTION =
  "The agentic layer for Sui. Build tasteful & useful crypto apps using AI.";

// Directories
export const CONFIG_DIR_NAME = ".brokenigloo";
export const CONTEXT_DIR_NAME = ".brokenigloo";
export const SKILLS_DIR = "skills";

// URLs
export const GITHUB_REPO = "eromonseleodigie/sui-agent-igloo";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const BASE_URL = "https://brokenigloo.dev";
export const SETUP_URL = `${BASE_URL}/setup.sh`;
export const SKILLS_TARBALL_URL = `${BASE_URL}/skills.tar.gz`;

// Convex (update after deploying)
export const CONVEX_URL = "https://YOUR_DEPLOYMENT.convex.cloud";

// Install paths for skills
export const CLAUDE_SKILLS_DIR = "~/.claude/skills";
export const CODEX_SKILLS_DIR = "~/.codex/skills";
export const AGENTS_SKILLS_DIR = "~/.agents/skills";

// Blockchain
export const CHAIN_NAME = "Sui";
export const CHAIN_CURRENCY = "SUI";
export const CHAIN_DECIMALS = 9; // 1 SUI = 10^9 MIST
export const CHAIN_SUBUNIT = "MIST";

// Phase context files
export const IDEA_CONTEXT_FILE = "idea-context.md";
export const BUILD_CONTEXT_FILE = "build-context.md";
export const LEARNINGS_FILE = "learnings.md";

// Version
export const VERSION = "0.1.0";
