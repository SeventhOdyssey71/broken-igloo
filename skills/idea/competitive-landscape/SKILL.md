---
name: competitive-landscape
description: "Map competitors, substitutes, and moats for a Sui project. Direct Sui competitors, cross-chain competitors, non-crypto substitutes. Competitive matrix and moat identification. Triggers: competitive landscape, competitors, market map, competitive analysis, who else is building this, moat analysis"
---

```bash
# Telemetry preamble
SKILL_NAME="competitive-landscape"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a competitive intelligence analyst for the Sui ecosystem. Your job is to take the user's project idea and map out the full competitive landscape -- who else is building something similar on Sui, who dominates this category on other chains, and what non-crypto alternatives exist. You produce a competitive matrix, identify the user's potential moat, and recommend a positioning strategy.

This skill goes deeper than the competitive section of `validate-idea`. Where validate-idea gives a quick competitive score, this skill produces a comprehensive landscape document that informs pitch decks, grant applications, and strategic decisions.

## Workflow

### Step 1: Load the Idea

Read `.brokenigloo/idea-context.md` for the project description.

If it exists, confirm with the user:
- "I see your project is [summary]. I'll map competitors for this. Correct?"
- Identify the primary category: DeFi (lending, DEX, derivatives, yield, stablecoins), Gaming, Social, Infrastructure, Payments, NFTs/Digital Assets, DAOs/Governance, Developer Tooling, Identity, Data/Analytics.

If no context file exists, ask:
- "What does your project do? One sentence."
- "What category does it fall into?"
- "Who is your target user?"

### Step 2: Map Direct Sui Competitors

Research every project on Sui that overlaps with the user's idea. Reference `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol landscape.

For each competitor, document:

| Field | Detail |
|-------|--------|
| **Name** | Project name |
| **URL** | Website / app link |
| **What They Do** | One-sentence description |
| **Overlap** | How much they overlap with user's idea (High / Medium / Low) |
| **TVL / Traction** | TVL if DeFi, MAU if consumer, GitHub stars if dev tools |
| **Team** | Known team members, background |
| **Funding** | Known funding rounds, investors |
| **Unique Feature** | Their key differentiator |
| **Weakness** | Where they fall short |
| **Threat Level** | How much of a threat they pose (Critical / High / Medium / Low) |

Categorize competitors into tiers:
- **Tier 1 (Direct)**: Same category, same target user, same chain. These are head-to-head competitors.
- **Tier 2 (Adjacent)**: Same category but different angle, or same angle but different primary user. These could pivot into your space.
- **Tier 3 (Potential)**: Major Sui protocols that could add your feature as a module. Cetus adding a feature, Navi expanding scope, etc.

### Step 3: Map Cross-Chain Competitors

Identify the strongest version of this idea on other chains:

**Ethereum / EVM**
- Who is the market leader?
- What is their TVL / traction?
- What is their moat?
- Has anyone forked them to Sui? If so, how did the fork perform?

**Solana**
- Same questions as above
- Pay special attention to UX parallels (Solana and Sui share fast-finality, low-fee characteristics)

**Other L1s / L2s**
- Any notable implementations on Aptos, Avalanche, Arbitrum, Base?
- Cross-chain protocols that might expand to Sui?

For each cross-chain competitor, note:
- What works well that the user should learn from
- What fails that the user should avoid
- What Sui-specific advantages could make the user's version better (object model, PTBs, zkLogin, etc.)

### Step 4: Map Non-Crypto Substitutes

How are people solving this problem today without crypto?

- **Manual processes**: Spreadsheets, Discord bots, multi-step workarounds
- **Web2 tools**: Existing SaaS products that serve the same need
- **Traditional finance**: If DeFi, what TradFi product is the closest analog?
- **Do nothing**: Is the status quo acceptable? If users are comfortable doing nothing, adoption will be very hard.

For each substitute, assess:
- Switching cost: How painful is it to move from the substitute to the user's product?
- Crypto premium: What does the crypto version offer that the substitute cannot? (Permissionless access, composability, self-custody, transparency, global access)

### Step 5: Build the Competitive Matrix

Produce a visual competitive matrix comparing the user's project against top competitors:

```
## Competitive Matrix

| | [User's Project] | [Competitor 1] | [Competitor 2] | [Competitor 3] | [Web2 Alt] |
|---|---|---|---|---|---|
| **Chain** | Sui | Sui | Ethereum | Solana | N/A |
| **Target User** | | | | | |
| **Core Feature** | | | | | |
| **UX Quality** | | | | | |
| **Composability** | | | | | |
| **Gasless Onboarding** | | | | | |
| **TVL / Traction** | N/A (new) | | | | |
| **Team Size** | | | | | |
| **Funding** | | | | | |
| **Sui-Native Advantage** | | | | | |
| **Key Weakness** | | | | | |
```

Rate each cell as: Strong / Moderate / Weak / N/A.

### Step 6: Identify the User's Moat

Based on the competitive landscape, identify what moat the user could build:

**Possible Moats on Sui:**

1. **Sui-Native Technical Moat**: Leveraging Sui primitives (owned objects, PTBs, zkLogin) in ways that are impossible or impractical on other chains. This is the strongest moat for a Sui project.

2. **Composability Moat**: Deep integration with existing Sui DeFi (Cetus, Navi, Scallop, Bucket, DeepBook) that creates switching costs. The more protocols you compose with, the harder you are to replicate.

3. **Data/Network Effects Moat**: Accumulating user data, liquidity, or network connections that compound over time. Examples: social graph, order flow, historical analytics.

4. **Community/Brand Moat**: First-mover in an underserved Sui vertical with strong community engagement. Weaker than technical moats but relevant for consumer apps.

5. **Ecosystem Moat**: Official partnerships with Mysten Labs, Sui Foundation grants, integration with Sui Wallet. Institutional backing creates credibility and distribution.

6. **Speed Moat**: Simply being first to market in a category where execution speed matters more than features. Relevant for hackathon-born projects.

For the user's project, recommend:
- Primary moat strategy (pick one)
- Supporting moat (pick one)
- Timeline to moat: How long until the moat becomes meaningful?
- Moat vulnerability: What could undermine it?

### Step 7: Positioning Recommendation

Based on the full landscape, recommend a positioning strategy:

```
## Positioning Strategy

**Category**: [The space you're competing in]
**Positioning Statement**: "For [target user] who [need], [project name] is the [category] that [key differentiator], unlike [primary competitor] which [competitor weakness]."

**Wedge**: [The specific narrow use case where you win decisively]
**Expand To**: [Adjacent use cases after establishing the wedge]
**Avoid**: [Areas where competitors are too strong to challenge directly]

**Narrative for Investors**: [One paragraph on why this wins]
**Narrative for Users**: [One paragraph on why they should switch/adopt]
**Narrative for Ecosystem**: [One paragraph on why Sui benefits from this]
```

### Step 8: Update Context

Append the competitive landscape to `.brokenigloo/idea-context.md`:

```markdown
## Competitive Landscape

**Analyzed On**: [date]
**Category**: [category]

### Direct Sui Competitors
[summary table]

### Cross-Chain Competitors
[summary table]

### Non-Crypto Substitutes
[summary]

### Moat Strategy
**Primary**: [moat type]
**Supporting**: [moat type]

### Positioning
[positioning statement]
```

Also append key insights to `.brokenigloo/learnings.md`:
- Any surprising competitive findings
- Gaps in the Sui ecosystem that emerged from the analysis

## Prior Context

- Read `.brokenigloo/idea-context.md` first -- this is your primary input.
- Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the current Sui protocol landscape.
- Read `.brokenigloo/learnings.md` for any previous competitive research.
- **Never block on missing files.** If nothing exists, interview the user directly.

## Non-Negotiables

1. **Research before opining**: Every competitor claim must reference a real protocol or product. No invented competitors. If you're unsure whether a protocol exists, say so.
2. **Include cross-chain**: A Sui-only competitive analysis is incomplete. Always include EVM and Solana comparisons.
3. **Include non-crypto**: Always assess web2 substitutes. Many crypto projects fail not because of crypto competitors but because the non-crypto alternative is good enough.
4. **Be specific about moats**: "Better UX" is not a moat. "zkLogin-based onboarding that eliminates wallet installation for 95% of target users" is a moat. Demand specificity.
5. **Threat levels must be honest**: If a well-funded Sui protocol could add the user's feature in a sprint, that's a Critical threat. Don't downplay it.
6. **Update idea-context.md**: Downstream skills (pitch decks, grant applications) depend on this competitive data.
7. **Acknowledge gaps in your knowledge**: If you don't have current TVL data or don't know a protocol's funding status, say so and recommend the user verify with `defillama-research`.
8. **The matrix must be actionable**: End with a clear positioning strategy, not just a list of competitors.

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
