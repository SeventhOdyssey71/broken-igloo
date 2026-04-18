# brokenigloo Skill Router

> If you're reading this, you're an AI assistant with brokenigloo skills installed. Use this routing table to find the right skill for the user's request. If the wrong skill activated, redirect here.

## How Routing Works

1. The user's prompt matches trigger phrases in a skill's `description` frontmatter
2. If the match is wrong, check this table and redirect to the correct skill
3. If no skill matches, help the user directly using the knowledge base in `skills/data/`

## Skill Map

### Phase: Idea (Discovery & Planning)

| Skill | Triggers | What It Does |
|-------|----------|-------------|
| `sui-beginner` | "learn sui", "teach me", "new to sui", "getting started" | Adaptive Sui fundamentals: object model, Move, PTBs, zkLogin |
| `learn` | "review learnings", "what did I learn" | Search/export learnings across sessions |
| `find-next-crypto-idea` | "find idea", "what should I build", "crypto idea" | 500+ curated ideas, scoring, shortlist report |
| `validate-idea` | "validate idea", "stress test", "is this good" | On-chain demand signals, go/no-go decision |
| `competitive-landscape` | "competitors", "market map", "competitive" | Map competitors, substitutes, moats |
| `defillama-research` | "defillama", "tvl", "defi research" | Real-time DeFi data filtered for Sui |
| `sui-overflow-copilot` | "sui overflow", "hackathon research" | Search Sui Overflow hackathon projects, gap analysis |

### Phase: Build (Implementation)

| Skill | Triggers | What It Does |
|-------|----------|-------------|
| `scaffold-project` | "scaffold", "setup project", "start building" | Stack decisions, starter repos, MCP/skill install |
| `build-with-claude` | "build mvp", "start coding", "implement" | Guided MVP in 3-5 milestones |
| `build-defi-protocol` | "build defi", "amm", "lending", "vault" | DeFi with Move modules, shared objects, PTBs |
| `launch-token` | "launch token", "create coin", "mint" | Sui Coin standard, TreasuryCap, distribution |
| `build-data-pipeline` | "indexer", "events", "data pipeline" | Event subscriptions, indexers, analytics |
| `build-mobile` | "mobile app", "react native" | Mobile Sui dApps with dApp Kit |
| `debug-move` | "debug", "error", "failed transaction" | Move errors, object ownership, gas issues |
| `review-and-iterate` | "code review", "security review", "audit" | Quality, security, production readiness |
| `virtual-sui-incubator` | "incubator", "bootcamp", "deep dive" | Sui architecture deep dive |
| `brand-design` | "brand", "colors", "typography" | Visual design system |
| `frontend-design-guidelines` | "frontend design", "ui guidelines" | Layout, animations, Sui UI patterns |
| `number-formatting` | "number formatting", "decimals", "mist" | Crypto number display |
| `page-load-animations` | "animations", "loading", "motion" | Motion design presets |
| `design-taste` | "design taste", "looks bad", "ai slop" | Anti-slop design judgment |
| `navigate-skills` | "what skills", "browse skills" | Browse all installed skills/repos/MCPs |
| `product-review` | "product review", "ux review" | Balanced UX evaluation |
| `roast-my-product` | "roast", "critique", "tear it apart" | Brutal product critique |
| `cso` | "security audit", "owasp", "infrastructure" | Infrastructure security audit |

### Phase: Launch (Go to Market)

| Skill | Triggers | What It Does |
|-------|----------|-------------|
| `deploy-to-mainnet` | "deploy", "mainnet", "publish", "go live" | Pre-flight, sui client publish, UpgradeCap |
| `create-pitch-deck` | "pitch deck", "investor", "fundraise" | 12-slide framework |
| `submit-to-hackathon` | "hackathon submission", "sui overflow submit" | Optimized submission + demo script |
| `marketing-video` | "marketing video", "promo video" | Code-driven video via Remotion |
| `video-craft` | "video craft", "video polish" | Frame composition |
| `apply-grant` | "grant", "sui foundation grant" | Grant application guidance |

## Cross-Skill Navigation

If a user needs to switch phases mid-conversation:
- "I want to go back to ideation" → route to `find-next-crypto-idea` or `validate-idea`
- "Let's start building" → route to `scaffold-project` (if no project) or `build-with-claude` (if project exists)
- "I'm ready to deploy" → route to `deploy-to-mainnet`
- "Help me with my pitch" → route to `create-pitch-deck`

## Context Files

Skills read/write context in `.brokenigloo/`:
- `.brokenigloo/idea-context.md` — Idea phase output
- `.brokenigloo/build-context.md` — Build phase output
- `.brokenigloo/learnings.md` — Cross-session learnings

**Context is always optional.** Never block on missing files — ask the user directly.
