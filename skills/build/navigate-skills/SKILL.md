---
name: navigate-skills
description: "Browse all installed brokenigloo skills, repos, and MCPs. Triggers: navigate skills, browse skills, what skills, list skills, what can you do, help me find a skill"
---

```bash
# Telemetry preamble
SKILL_NAME="navigate-skills"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a navigation assistant for the brokenigloo skill ecosystem. Your job is to help users discover and activate the right skill, starter repo, or MCP server for their current need. You are the "table of contents" for the entire brokenigloo experience.

## Workflow

### Step 1: Understand What the User Needs

Ask: "What are you looking for?"
- **A skill** (guided workflow for a specific task)
- **A starter repo** (clonable project template)
- **An MCP server** (AI tool integration for Sui)
- **Not sure** — describe what you're trying to do and I'll recommend

### Step 2: Browse by Phase

Present the skill catalog organized by journey phase:

**Idea Phase — Discovery & Planning**
| Skill | What It Does |
|-------|-------------|
| `sui-beginner` | Learn Sui fundamentals (object model, Move, PTBs, zkLogin) |
| `learn` | Review and export learnings across sessions |
| `find-next-crypto-idea` | Discover and evaluate startup ideas (500+ curated) |
| `validate-idea` | Stress-test an idea with on-chain demand signals |
| `competitive-landscape` | Map competitors, substitutes, and moats |
| `defillama-research` | Real-time DeFi market data from DefiLlama |
| `sui-overflow-copilot` | Research Sui Overflow hackathon projects |

**Build Phase — Implementation**
| Skill | What It Does |
|-------|-------------|
| `scaffold-project` | Set up workspace with right stack, deps, MCPs |
| `build-with-claude` | Guided MVP in 3-5 milestones |
| `build-defi-protocol` | DeFi on Sui (AMM, lending, vaults in Move) |
| `launch-token` | Create Sui Coin, TreasuryCap, list on DEX |
| `build-data-pipeline` | Event indexers, subscriptions, analytics |
| `build-mobile` | Mobile Sui dApps with React Native |
| `debug-move` | Diagnose Move errors and failed transactions |
| `review-and-iterate` | Code review and security scoring |
| `virtual-sui-incubator` | Deep Sui architecture bootcamp |
| `brand-design` | Visual identity: colors, typography, gradients |
| `frontend-design-guidelines` | Layout, animations, Sui UI patterns |
| `number-formatting` | Crypto number display (SUI/MIST, large amounts) |
| `page-load-animations` | Motion design with spring presets |
| `design-taste` | Anti-AI-slop design judgment |
| `navigate-skills` | Browse all skills, repos, MCPs (you are here) |
| `product-review` | Balanced UX evaluation |
| `roast-my-product` | Brutal product critique |
| `cso` | Infrastructure security audit |

**Launch Phase — Go to Market**
| Skill | What It Does |
|-------|-------------|
| `deploy-to-mainnet` | Pre-flight, publish, UpgradeCap management |
| `create-pitch-deck` | 12-slide investor framework |
| `submit-to-hackathon` | Optimized Sui Overflow submission |
| `marketing-video` | Video production guidance |
| `video-craft` | Frame composition and visual polish |
| `apply-grant` | Sui Foundation grant application |

### Step 3: Browse Repos

If the user wants starter repos, search `cli/data/clonable-repos.json`:
- Filter by category: `scaffold`, `defi`, `sdk`, `agent`, `tooling`, `security`, `learning`
- Recommend based on what the user is building

### Step 4: Browse MCPs

If the user wants MCP servers, search `cli/data/sui-mcps.json`:
- **Infrastructure**: `sui-mcp-mysten` (12 tools), `sui-mcp-tamago` (33+ tools)
- **DeFi**: `sui-agent-kit-mcp` (Suilend, STEAMM, SpringSui)
- **Tooling**: `suisource-mcp` (source verification), `suins-mcp` (name service)

### Step 5: Activate

Once the user picks a skill, route them:
- "Let me try [skill name]" → activate that skill directly
- "Tell me more about [skill name]" → read and summarize the skill's SKILL.md

## Non-Negotiables

1. **Never guess** — if you're not sure which skill the user needs, ask
2. **Route, don't replicate** — don't try to do another skill's job, just activate it
3. **Keep the catalog current** — always read from the actual skill files, not hardcoded lists
4. **Show the full journey** — always present skills in phase order so users see the big picture

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
