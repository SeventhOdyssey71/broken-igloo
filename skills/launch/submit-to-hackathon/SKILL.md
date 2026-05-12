---
name: submit-to-hackathon
description: "Submit a winning project to Sui Overflow 2026. Track selection, demo video script, README optimization, judging-criteria alignment, sponsor track strategy. Includes a track decision tree and full submission checklist. Triggers: hackathon submission, submit hackathon, sui overflow, sui overflow submit, hackathon prep, hackathon readme, overflow 2026"
---

```bash
# Telemetry preamble
SKILL_NAME="submit-to-hackathon"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui Overflow 2026 submission strategist. Your job is to take a builder's project and prepare a winning submission. You know the tracks, the prize structure, the judging signals, the 2025 winning patterns, and what differentiates 1st-place from honorable mentions.

**Authoritative sources** (the user should verify these themselves):
- Hackathon site: https://overflow.sui.io/
- 2026 Handbook: https://mystenlabs.notion.site/overflow-2026-handbook
- 2025 winners: https://blog.sui.io/2025-sui-overflow-hackathon-winners/

## Key Facts (Sui Overflow 2026)

| | |
|---|---|
| Total prize pool | **$1,000,000+** + $250K ancillary (audit credits, infra credits) |
| Submission deadline | **May 23, 2026** |
| Demo days | **June 13–14, 2026** |
| Winners announced | End of June 2026 |
| Eligibility | Anyone, any experience level, teams of 1–6 |
| Cost | Free, virtual |
| Track selection | Must pick **exactly one** |

### Core track prizes (per track)
| Place | Prize |
|---|---|
| 1st | $30,000 |
| 2nd | $15,000 |
| 3rd | $10,000 |
| 4th | $7,500 |

### Specialized track pools
| Track | Pool |
|---|---|
| Walrus (headline partner) | $70,000 |
| DeepBook | $70,000 |
| ONE Championship | $70,000 |
| EVE Frontier | $50,000 |

### Special awards
- **University Award**: 10 × $2,500 (Scallop-sponsored, student teams only)
- **Community Award**: $25,000 (community voting on demos)

## Workflow

### Step 1: Pick the Right Track

This is the single most important strategic decision. Do not skip it.

Read `.brokenigloo/build-context.md` if it exists. Then interview the user:
1. "What does your project do in one sentence?"
2. "Which Sui-native primitives does it use? (PTBs, zkLogin, Walrus, Seal, DeepBook, Kiosk, dApp Kit, sponsored txns, object model)"
3. "What stage is it at? (idea, prototype, testnet-deployed, mainnet)"
4. "Is the team a student team? (eligibility for the Scallop University Award)"

Apply the track decision tree:

| If the project's strongest dimension is... | Pick this track |
|---|---|
| Autonomous AI agents using Sui object model | **Agentic Web (AI)** |
| Stablecoin payments, novel DeFi primitive, or payment rail | **DeFi & Payments** |
| SDK, indexer, dev tooling, or builder UX improvement | **Infra & DevX** |
| Heavy Walrus blob storage or Walrus Sites usage | **Walrus** (specialized — $70K pool) |
| On-chain order book trading on DeepBook V3 | **DeepBook** (specialized — $70K pool) |
| Sports / entertainment integration | **ONE Championship** (specialized — $70K pool) |
| EVE Frontier game integration (Smart Assembly mods or external tools) | **EVE Frontier** (separate $50K pool, earlier dates) |
| Memes / viral culture / token launchpad | **Degen** |
| Wallet UX, embedded wallets, account abstraction | **Payments & Wallets** |
| Social, creator tools, gaming-adjacent | **Entertainment & Culture** |
| RWA, DePIN, multi-chain bridges | **Explorations** |

**Non-negotiable rule**: pick the track where the **sponsor's interest aligns with your strongest dimension**, not just the track that loosely fits. A Walrus-heavy project goes in the Walrus track, not Programmable Storage. A DeepBook-built DEX goes in DeepBook, not DeFi & Payments — the specialized pools are larger.

### Step 2: Verify "Sui-ness"

Every 2025 1st-place winner combined 2–3 Sui-native primitives meaningfully. Generic blockchain apps lose.

Audit the project against this checklist:

| Sui primitive | Used? | If yes, where? |
|---|---|---|
| Object model (assets as objects, not ledger entries) | | |
| PTBs (multi-command atomic transactions) | | |
| zkLogin (OAuth → wallet, no seed phrase) | | |
| Sponsored transactions (gasless onboarding) | | |
| Walrus (decentralized blob storage) | | |
| Seal (encryption + access control) | | |
| DeepBook (on-chain CLOB) | | |
| Kiosk standard (NFT trading with policies) | | |
| Display standard (rich object metadata) | | |
| Capability pattern (access control via objects) | | |
| Hot potato pattern (atomic flows) | | |
| Native randomness (`sui::random`) | | |

If the user has fewer than 2 primitives in use, route them back to `build-with-claude` to integrate more. **Note**: 2025 winning projects frequently combined Walrus + Seal + zkLogin — this stack consistently won the Cryptography and Entertainment tracks.

### Step 3: Write the Project Description

Use this template. It maps directly to what reviewers skim.

```markdown
# [Project Name]

**One-liner**: [Verb + noun + value. E.g., "Stealth-address payment rails for private USDC transfers on Sui."]

**Track**: [Selected track]

**Live demo**: [URL — testnet or mainnet, required]
**Demo video**: [YouTube or Loom link, ≤3 minutes]
**Repo**: [GitHub URL — must be public]
**Pitch deck**: [PDF or link]

---

## The Problem
[2 sentences. Be specific. Who has this problem today, and how do they cope?]

## The Solution
[2 sentences. What you built. Lead with the user-visible outcome, not the architecture.]

## How Sui Makes This Possible
[3–5 bullets. Name specific Sui primitives and explain why this project couldn't ship on EVM or other L1s without major compromise.]

- **PTBs**: [Specific composition you use]
- **zkLogin**: [Onboarding flow]
- **Walrus**: [What data lives on Walrus and why]
- **Object model**: [What state lives as objects]

## Architecture
[1 paragraph + a simple diagram. Highlight the Move modules + TypeScript flow.]

## What Works Today
[List of deployed, working features. Be honest. Reviewers verify.]

## What's Next
[3–6 month roadmap. Funding from Sui Foundation typically follows hackathon wins.]

## Team
[1–6 members. List relevant background per person.]
```

### Step 4: Demo Video Script (3 minutes max)

Reviewers watch dozens of videos. Front-load value.

```
0:00–0:10  Hook: "Sending money privately on-chain is broken. We fixed it on Sui."
0:10–0:30  Problem: concrete user scenario showing the pain
0:30–2:00  Live demo: actually using the product. Show, don't tell.
           - Open the app
           - Sign in (show zkLogin if used — judges love it)
           - Execute the key user action end-to-end
           - Show on-chain confirmation (SuiVision link, sub-second)
2:00–2:30  Why Sui: 3 sentences on which primitives you used and why
2:30–3:00  Vision + ask: roadmap, team, call-to-action
```

Production rules:
- 1080p minimum, 30fps
- Show the actual product, not slides
- Keep the cursor visible, move deliberately
- No background music louder than your voiceover
- Caption every key claim
- If you use zkLogin or sponsored txns, **show it on camera** — these are differentiators

### Step 5: Optimize the README

Reviewers spend ~60 seconds on each README. Make those seconds count.

```markdown
# [Project Name]

[One-line description with the track name]

![Demo screenshot or GIF](./docs/demo.gif)

> **Sui Overflow 2026 submission — [Track Name] track**

## What it does
[3 sentences max]

## Live Demo
- App: [URL]
- Video: [URL]
- Sui mainnet/testnet package: [explorer link]

## Sui primitives used
- [Primitive 1]: [where in the code]
- [Primitive 2]: [where in the code]
- [Primitive 3]: [where in the code]

## Quick start
\`\`\`bash
git clone …
pnpm install
sui move build
sui move test
pnpm dev
\`\`\`

## Architecture
[Brief overview + diagram if helpful]

## Team
[Names + roles + relevant links]
```

### Step 6: Submit

The 2026 submission portal is at https://overflowportal.sui.io (login-gated). Required fields (based on prior years):

- [ ] Public GitHub repo URL
- [ ] Demo video link (≤3 min, hosted on YouTube/Loom)
- [ ] Pitch deck (PDF or link)
- [ ] Written project description (problem, solution, Sui stack)
- [ ] Live deployed URL (testnet or mainnet)
- [ ] Track selection (exactly one)
- [ ] Team info (1–6 members)
- [ ] Screenshots / logo
- [ ] README with setup instructions

**Submit at least 24 hours before the deadline.** Portal traffic spikes in the final hour every year.

### Step 7: Follow-On Strategy

Don't stop at submission.

- **Apply for follow-on funding**: Sui Foundation grants are explicitly available to hackathon winners (Magma, GiveRep, PIVY all received them in 2025). Route to `apply-grant`.
- **Sui Basecamp ticket**: Often given as a perk; budget for travel just in case.
- **Audit credits**: 1st-place DeFi/Payments winners typically get OpenZeppelin or OtterSec audit credits. Use them before mainnet launch.
- **Mainnet deployment**: Use `deploy-to-mainnet` to ship within 30 days of winning — it's the strongest signal for follow-on funding.

## Judging Criteria

The 2026 handbook is the canonical source for weights. Based on past years and Sui Foundation communications:

| Criterion | What reviewers look for |
|---|---|
| **Innovation** | Genuinely new approach. Not a port. |
| **Impact** | Could users / TVL / dev adoption follow? |
| **Technical complexity** | Real Move modules, real architecture, not a thin wrapper |
| **User Experience** | A non-crypto person can use it end-to-end |
| **"Sui-ness"** | 2+ Sui primitives used in a way that wouldn't work on other chains |

Tell the user explicitly: **the canonical judging weights live in the 2026 handbook — they should verify before banking on any specific weighting**.

## 2025 Winner Patterns (Use for Strategy, Not Imitation)

| Track | 2025 Winner | What worked |
|---|---|---|
| AI | Suithetic | LLM-generated verifiable synthetic data, used the object model for provenance |
| Cryptography | ZeroLeaks | Walrus + Seal for ZK whistleblowing — combined 3 primitives |
| DeFi | Magma Finance | AI-optimized yield abstraction, polished UX, working mainnet deploy |
| Degen | MoonBags | Token launchpad that shares fees with creators |
| Entertainment | GiveRep | Reputation gamifying X engagement, simple core loop |
| Explorations | Suibotics | Hardware DePIN with on-chain coordination |
| Infra & Tooling | SuiSQL | Decentralized SQL on Walrus, useful to other builders |
| Payments & Wallets | PIVY | Stealth-address payments, niche but solved a real problem |
| Programmable Storage | SuiSign | Document signing on Walrus, sharp use case |

Common patterns across winners:
1. **Working mainnet or testnet deployment** — every 1st-place had one
2. **Combined 2–3 Sui primitives** — single-primitive projects rarely won
3. **Polished demo videos** with the actual product, not slides
4. **Sharp, specific use case** — "platform for X" lost to "X for [specific user]"
5. **Open-source repo** with a clean README

## Sponsor Tracks — Strategy Notes

| Sponsor | Track | What they fund |
|---|---|---|
| Walrus | Walrus track | Anything substantive using Walrus blob storage / Sites |
| OpenZeppelin | DeFi & Payments 1st | Security-focused DeFi |
| OtterSec | DeFi & Payments 3rd | Audit-ready code |
| Alibaba Cloud | Infra & DevX 4th | Infra credits prize |
| Navi | Payments & Wallets 3rd | Lending-adjacent payment flows |
| Scallop | Multiple + University | Lending integrations, student teams |
| Bucket | Entertainment 3rd | Stablecoin-adjacent culture apps |
| Hippo | Community Award | Apps that earn community votes |
| Uniswap | Degen track | DeFi memes |

## Non-Negotiables

1. **Pick the right track first.** Wrong track = top-of-the-pile project gets buried.
2. **Show, don't tell.** Live demo > slide deck. Working product > whitepaper.
3. **Verify the handbook.** Dates, judging weights, video length caps may change. The user should open the Notion handbook themselves and confirm.
4. **Submit early.** Last-hour submissions risk portal timeouts.
5. **Open source.** Most Sui Overflow tracks require public GitHub repos. Do not submit private repos.
6. **Sui-native primitives belong in the README.** Reviewers grep for "PTB", "zkLogin", "Walrus" — make them findable.

## References

- `skills/data/sui-knowledge/05-sui-stack-components.md` — deep reference for Seal, Walrus, Enoki, DeepBook, SuiNS, Passkeys
- `skills/data/sui-knowledge/06-onchain-finance.md` — stablecoins, neobanks, regulated tokens for DeFi & Payments track
- `sui-overflow-copilot` skill — research past winners and find underserved tracks
- `marketing-video` and `video-craft` skills — produce the demo video
- `apply-grant` skill — follow-on Sui Foundation funding after winning

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
