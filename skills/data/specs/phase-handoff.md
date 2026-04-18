# Phase Handoff Specification

## Overview

Context flows between brokenigloo phases via markdown files in `.brokenigloo/` within the user's project directory. These files are **optional** — every skill proceeds immediately if files are missing, asking the user directly instead.

## Rules

1. **Context is optional, not gates**: Never block on a missing file. Ask the user.
2. **Deep merge**: Skills append to list fields and overwrite scalar fields. Never clobber other skills' data.
3. **Any skill can bootstrap**: Whichever skill runs first creates the context file.
4. **Relative dates → absolute dates**: Always convert "next week" to "2026-04-25" etc.

## Files

### `.brokenigloo/idea-context.md`

Written by: `find-next-crypto-idea`, `validate-idea`, `competitive-landscape`
Read by: `scaffold-project`, all build skills

```markdown
# Idea Context

## Idea
| Field | Value |
|-------|-------|
| Name | [project name] |
| One-liner | [one sentence description] |
| Category | [defi / consumer / infra / gaming / social / agent] |
| Target user | [who is the primary user] |

## Validation
| Signal | Result |
|--------|--------|
| On-chain demand | [yes/no + evidence] |
| Competitor gap | [description] |
| MVP feasibility | [1-2 weeks / 3-4 weeks / 5+ weeks] |
| Go/No-Go | [GO / NO-GO / PIVOT] |

## Competitive Landscape
| Competitor | Chain | Differentiator |
|-----------|-------|---------------|
| [name] | [chain] | [what they do differently] |

## Scores
| Dimension | Score (1-5) |
|-----------|-------------|
| Founder fit | [n] |
| MVP speed | [n] |
| Distribution clarity | [n] |
| Market pull | [n] |
| Revenue path | [n] |
```

### `.brokenigloo/build-context.md`

Written by: `scaffold-project`, `build-with-claude`, `build-defi-protocol`, `review-and-iterate`
Read by: `deploy-to-mainnet`, all launch skills

```markdown
# Build Context

## Stack
| Field | Value |
|-------|-------|
| Template | [next-dapp-kit / move-only / sui-dapp-starter / agent-kit / custom] |
| Framework | [Next.js / Vite / Node.js / Move-only] |
| Wallet integration | [dapp-kit / zklogin-enoki / shinami-invisible / none] |
| RPC provider | [public / shinami / blockvision / quicknode] |
| Package ID (devnet) | [0x...] |
| Package ID (testnet) | [0x...] |
| Package ID (mainnet) | [0x...] |

## DeFi (if applicable)
| Field | Value |
|-------|-------|
| Type | [amm / lending / vault / launchpad / orderbook / custom] |
| Integrations | [cetus, suilend, deepbook, 7k, ...] |
| Oracle | [pyth / supra / switchboard / none] |
| PTB complexity | [low / medium / high] |

## Milestones
| # | Description | Status |
|---|------------|--------|
| 1 | [description] | [done / in-progress / todo] |
| 2 | [description] | [status] |
| 3 | [description] | [status] |

## Review Scores
| Dimension | Score (1-5) |
|-----------|-------------|
| Code quality | [n] |
| Security | [n] |
| Test coverage | [n] |
| UX polish | [n] |
```

### `.brokenigloo/learnings.md`

Written by: `learn` skill, any skill that discovers non-obvious knowledge
Read by: All skills

```markdown
# Learnings

## [Date] — [Topic]
[What was learned and why it matters]

## [Date] — [Topic]
[What was learned and why it matters]
```

## Merge Rules

When multiple skills write to the same file:
- **Table rows**: Append new rows, update existing rows by matching the first column
- **Scalar fields**: Last writer wins
- **List fields**: Append, deduplicate
- **Never delete**: Skills only add or update, never remove another skill's data
