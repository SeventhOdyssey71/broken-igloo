// Workspace setup — generate project config files for AI assistants
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { bold, green, dim } from "./colors.js";
import { PRODUCT_NAME, CONTEXT_DIR_NAME, GITHUB_URL } from "./branding.js";

interface WorkspaceConfig {
  projectName: string;
  framework: string;
  wallet: string;
  rpc: string;
  movePackage: boolean;
  integrations: string[];
}

export function generateWorkspaceFiles(cwd: string, config: WorkspaceConfig): void {
  // Generate CLAUDE.md
  const claudeMd = generateClaudeMd(config);
  writeFileSync(join(cwd, "CLAUDE.md"), claudeMd);

  // Generate AGENTS.md (for OpenAI Codex — Codex reads AGENTS.md, NOT codex-instructions.md)
  const agentsMd = generateAgentsMd(config);
  writeFileSync(join(cwd, "AGENTS.md"), agentsMd);

  // Generate .codex/config.toml (for Codex MCP server config)
  const codexDir = join(cwd, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(join(codexDir, "config.toml"), generateCodexConfig(config));

  // Generate .cursorrules (for Cursor)
  const cursorRules = generateCursorRules(config);
  writeFileSync(join(cwd, ".cursorrules"), cursorRules);

  // Generate .env.example
  const envExample = generateEnvExample(config);
  writeFileSync(join(cwd, ".env.example"), envExample);

  // Create context directory
  const contextDir = join(cwd, CONTEXT_DIR_NAME);
  mkdirSync(contextDir, { recursive: true });
}

function generateClaudeMd(config: WorkspaceConfig): string {
  return `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ${config.projectName}

Built on Sui with brokenigloo.

## Commands

\`\`\`bash
${config.movePackage ? `# Move
sui move build          # Compile Move modules
sui move test           # Run Move tests
sui client publish      # Deploy (add --gas-budget 500000000)
` : ""}${config.framework !== "move-only" ? `# Frontend
pnpm dev               # Start dev server
pnpm build             # Production build
pnpm lint              # Lint check
` : ""}
\`\`\`

## Stack

- ${config.movePackage ? "**Move**: Custom on-chain modules" : "**No custom Move**: Integration-only via PTBs"}
- **Framework**: ${config.framework}
- **Wallet**: ${config.wallet}
- **RPC**: ${config.rpc}
${config.integrations.length > 0 ? `- **Integrations**: ${config.integrations.join(", ")}` : ""}

## Sui Resources

- Say "navigate skills" to browse all brokenigloo skills
- Say "debug move" when you hit a Move error
- Say "review and iterate" before deploying
- Reference \`skills/data/sui-knowledge/\` for Sui documentation
`;
}

function generateAgentsMd(config: WorkspaceConfig): string {
  return `# AGENTS.md

Instructions for OpenAI Codex and other AI agent CLIs working in this repository.

## ${config.projectName} — Sui Project

Built on the Sui blockchain using brokenigloo.

## Commands
${config.movePackage ? `- \`sui move build\` — compile Move modules
- \`sui move test\` — run Move tests
- \`sui client publish --gas-budget 500000000\` — deploy to current network` : ""}
${config.framework !== "move-only" ? `- \`pnpm dev\` — start dev server
- \`pnpm build\` — production build` : ""}

## Stack
- Chain: Sui (Move language, object model, PTBs)
- Framework: ${config.framework}
- Wallet: ${config.wallet}
- RPC: ${config.rpc}
${config.integrations.length > 0 ? `- Integrations: ${config.integrations.join(", ")}` : ""}

## Sui Conventions
- Use \`@mysten/sui\` for all Sui SDK operations (ESM-only)
- Build transactions with \`Transaction\` from \`@mysten/sui/transactions\`
- SUI has 9 decimals (1 SUI = 1,000,000,000 MIST)
- Objects are the fundamental data unit — no account model
- Use PTBs to compose multiple operations atomically (up to 1,024 ops per tx)
${config.movePackage ? `- First field of any \`key\` struct must be \`id: UID\`
- Use \`Balance<T>\` inside shared objects, not \`Coin<T>\`
- Use capability pattern for access control` : ""}

## Available Skills
Type \`$navigate-skills\` to browse all installed brokenigloo skills, or ask naturally:
- "teach me Sui" — fundamentals tutorial
- "scaffold a Sui project" — set up workspace
- "build a neobank on Sui" — full neobank guide
- "integrate Cetus" — DEX integration
- "debug move" — error diagnosis
- "deploy to mainnet" — production deployment
`;
}

function generateCodexConfig(config: WorkspaceConfig): string {
  let toml = `# Codex MCP server configuration for ${config.projectName}\n`;

  // Add Sui MCP if available
  toml += `
[mcp_servers.sui-mcp]
command = "npx"
args = ["-y", "sui-mcp"]
`;

  return toml;
}

function generateCursorRules(config: WorkspaceConfig): string {
  return `# Cursor Rules — ${config.projectName}

This is a Sui blockchain project. Follow these conventions:

## Sui-Specific
- Use \`@mysten/sui\` SDK (ESM-only, requires "type": "module")
- Build transactions with \`Transaction\` class
- SUI has 9 decimals (1 SUI = 1,000,000,000 MIST)
- Objects are unique on-chain entities with UIDs
- Use PTBs for multi-step operations (up to 1,024 commands per tx)
- Prefer owned objects over shared objects for performance

## Move Code
${config.movePackage ? `- First field of any \`key\` struct must be \`id: UID\`
- Use \`Balance<T>\` inside shared objects, not \`Coin<T>\`
- Use capability pattern for access control
- Never use \`public\` for internal functions — use \`public(package)\`
- Always emit events for state changes` : "- No custom Move code — use PTBs to compose existing protocols"}

## Stack: ${config.framework} + ${config.wallet} + ${config.rpc}
`;
}

function generateEnvExample(config: WorkspaceConfig): string {
  let env = `# ${config.projectName} — Environment Variables
# Copy to .env.local and fill in values

# Network: devnet | testnet | mainnet
SUI_NETWORK=devnet
`;

  if (config.rpc === "shinami") {
    env += `\n# Shinami (https://app.shinami.com)\nSHINAMI_ACCESS_KEY=\n`;
  }

  if (config.wallet === "enoki") {
    env += `\n# Enoki (https://portal.enoki.mystenlabs.com)\nNEXT_PUBLIC_ENOKI_API_KEY=\nENOKI_SECRET_KEY=\nNEXT_PUBLIC_GOOGLE_CLIENT_ID=\n`;
  }

  if (config.movePackage) {
    env += `\n# Package IDs (set after deployment)\nNEXT_PUBLIC_PACKAGE_ID=\n`;
  }

  return env;
}
