# AGENTS.md

Instructions for OpenAI Codex and other AI agent CLIs working in this repository.

## What This Is

brokenigloo — the agentic layer for Sui. A curated skill system that augments AI coding assistants with Sui-specific domain knowledge.

## Key Files

- `cli/branding.ts` — Single source of truth for all brand strings
- `skills/SKILL_ROUTER.md` — Routing table for all 31 skills
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — Comprehensive Sui protocol catalog
- `skills/data/specs/phase-handoff.md` — How context flows between phases

## Commands

```bash
pnpm build            # Compile TypeScript
pnpm dev              # Run CLI in dev mode
bash scripts/package-skills.sh  # Package skills for distribution
```

## Conventions

- ESM-only TypeScript (NodeNext module resolution)
- Skills are markdown files, not executable code
- Brand constants centralized in `cli/branding.ts`
- Phase context flows via `.brokenigloo/` directory in user projects
- Context is always optional — never block on missing files
