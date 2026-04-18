# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

brokenigloo is the agentic layer for Sui — a curated skill system that augments AI coding assistants (Claude Code, Codex, Cursor) with Sui-specific domain knowledge. The core product is **structured markdown files ("skills")** installed to `~/.claude/skills/` that guide AI behavior through 4 phases: Learn → Idea → Build → Launch.

This is NOT a framework or SDK. Skills are documents that guide AI, not code that runs.

## Build & Development

```bash
pnpm install          # Install dependencies
pnpm build            # Compile TypeScript (tsc)
pnpm dev              # Run CLI in dev mode (tsx)

# Package skills for distribution
bash scripts/package-skills.sh    # Creates skills.tar.gz

# Test the setup script locally
bash public/setup.sh              # Installs skills to ~/.claude/skills/
```

## Project Structure

- `cli/` — TypeScript CLI (`brokenigloo` command). Entry: `cli/index.ts`. All brand strings in `cli/branding.ts`.
- `cli/data/` — JSON catalogs: `clonable-repos.json` (starter repos), `sui-skills.json` (skill registry), `sui-mcps.json` (MCP servers)
- `skills/` — The core product. 31 journey skills organized by phase:
  - `skills/idea/` — Discovery & planning (7 skills)
  - `skills/build/` — Implementation (18 skills)
  - `skills/launch/` — Go to market (6 skills)
  - `skills/data/` — Shared knowledge base (Sui docs, protocol catalog, guides)
  - `skills/SKILL_ROUTER.md` — Routing table for cross-skill navigation
- `convex/` — Backend for telemetry + feedback (Convex deployment)
- `scripts/` — `package-skills.sh` builds `skills.tar.gz`
- `public/` — `setup.sh` served for curl-installable setup

## Skill Format

Each skill is a `SKILL.md` with:
1. YAML frontmatter (`name`, `description` with trigger phrases)
2. Bash telemetry preamble/postamble
3. Structured workflow (Overview → Steps → Non-Negotiables → Handoff)
4. `references/` directory with supporting knowledge files

## Key Conventions

- **ESM-only**: `"type": "module"` in package.json. All imports use `.js` extensions.
- **Strict TypeScript**: No `any`, no implicit types.
- **Brand source of truth**: `cli/branding.ts` — all product names, URLs, paths defined there.
- **Skills are markdown, not code**: The value is in structured prompts that guide AI behavior.
- **Context files**: Phase handoff via `.brokenigloo/` in user projects (idea-context.md, build-context.md, learnings.md). Context is always optional — never gate on missing files.
- **Integrate First, Build Second**: Skills should check if existing Sui protocols solve the user's need before suggesting custom Move code.

## Sui Ecosystem Quick Reference

| Need | Protocol | Package |
|------|----------|---------|
| DEX/Swap | 7K Aggregator | `@7kprotocol/sdk-ts` |
| AMM/LP | Cetus | `@cetusprotocol/cetus-sui-clmm-sdk` |
| Lending | Suilend / Scallop / NAVI | `@suilend/sdk` |
| Order book | DeepBook V3 | `@mysten/deepbook-v3` |
| Wallet connect | dApp Kit | `@mysten/dapp-kit` |
| Auth (no wallet) | Enoki + zkLogin | `@mysten/enoki` |
| RPC + Gas | Shinami | `@shinami/clients` |
| Core SDK | Sui TS SDK | `@mysten/sui` |
