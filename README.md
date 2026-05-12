# brokenigloo

**Ship on Sui — Idea to Launch.**

The agentic layer for Sui. 77 AI-guided skills that turn Claude Code, OpenAI Codex, and Cursor into a Sui expert.

[![npm version](https://img.shields.io/npm/v/brokenigloo)](https://www.npmjs.com/package/brokenigloo)

## Install

```bash
npm i -g brokenigloo
```

That's it. The postinstall script copies 77 skills to `~/.claude/skills/`, `~/.codex/skills/`, and `~/.agents/skills/` automatically. Open Claude Code or Codex and start building.

Prefer running ad-hoc? `npx brokenigloo doctor` works without installing.

## Verify

```bash
brokenigloo doctor    # Check your environment
brokenigloo skills    # Browse installed skills
```

## Use

Open your AI coding assistant and say one of:

| Say this | What happens |
|---|---|
| `teach me Sui` | Sui fundamentals tutor (object model, Move, PTBs, zkLogin) |
| `find a crypto idea` | 520+ curated ideas, scored on 5 dimensions |
| `scaffold a Sui project` | Stack decisions + dependency install |
| `build a neobank on Sui` | Full neobank: zkLogin + USDC + DEX + lending |
| `integrate Cetus for swaps` | Complete Cetus AMM integration guide |
| `integrate DeepBook` | On-chain order book setup |
| `build an NFT collection` | Move NFT module + Kiosk + royalties |
| `launch a token on Sui` | `coin::create_currency` + DEX listing |
| `debug move` | Move error diagnosis |
| `deploy to mainnet` | Pre-flight checklist + `sui client publish` |
| `submit to Sui Overflow` | Hackathon submission strategy |

In Claude Code, every skill is also a slash command — type `/build-` or `/integrate-` to see them.

## What's Inside

| | Count |
|---|---|
| Skills | **77** |
| Curated startup ideas | **520+** |
| Sui starter repos | **110** |
| MCP servers cataloged | **39** |
| Knowledge docs | **8** (~20K lines) |
| Deep protocol integrations | **12** |

### Phases

```
Idea (7)   →   Build (64)   →   Launch (6)
```

**Idea** — `sui-beginner`, `find-next-crypto-idea`, `validate-idea`, `competitive-landscape`, `defillama-research`, `sui-overflow-copilot`, `learn`

**Build** — Includes 12 deep protocol integrations: `integrate-cetus`, `integrate-deepbook`, `integrate-suilend`, `integrate-scallop`, `integrate-7k`, `integrate-navi`, `integrate-aftermath`, `integrate-walrus`, `integrate-enoki`, `integrate-shinami`, `integrate-seal`, `integrate-suins`, `integrate-dapp-kit`, `integrate-pyth`. Plus app skills: `build-neobank`, `build-nft-collection`, `build-game`, `build-dao`, `build-rwa`, `build-zklogin-app`, `build-walrus-site`, `build-staking`, `build-marketplace`, and more.

**Launch** — `deploy-to-mainnet`, `submit-to-hackathon`, `create-pitch-deck`, `apply-grant`, `marketing-video`, `video-craft`

## Sui Ecosystem Coverage

| Protocol | What | Package |
|----------|------|---------|
| 7K Aggregator | DEX meta-aggregator | `@7kprotocol/sdk-ts` |
| Cetus | Concentrated liquidity AMM | `@cetusprotocol/cetus-sui-clmm-sdk` |
| DeepBook V3 | On-chain order book | `@mysten/deepbook-v3` |
| Suilend | Lending (by Solend team) | `@suilend/sdk` |
| Scallop | Lending | `@scallop-io/sui-scallop-sdk` |
| NAVI | Lending + aggregation | `@naviprotocol/lending` |
| Aftermath | DEX + LST (afSUI) | `aftermath-ts-sdk` |
| Shinami | RPC + Gas Station + Wallets | `@shinami/clients` |
| Enoki | zkLogin + sponsored txns | `@mysten/enoki` |
| dApp Kit | Wallet connection (React) | `@mysten/dapp-kit` |
| Walrus | Decentralized storage | `@mysten/walrus` |
| Seal | Secrets management | `@mysten/seal` |
| Kiosk | NFT marketplace standard | `@mysten/kiosk` |
| SuiNS | Name service | `@mysten/suins` |
| Pyth | Price oracles | `@pythnetwork/pyth-sui-js` |

## Built for Sui Overflow 2026

The `submit-to-hackathon` and `sui-overflow-copilot` skills are tuned for **[Sui Overflow 2026](https://overflow.sui.io/)** — $1M+ prize pool, submissions due May 23, 2026, demo days June 13–14. Covers all tracks: Agentic Web, DeFi & Payments, Infra & DevX, plus specialized tracks for Walrus, DeepBook, ONE Championship, and EVE Frontier.

## CLI Commands

```bash
brokenigloo ship          # Interactive journey TUI
brokenigloo init          # Re-install skills
brokenigloo search <q>    # Search repos, skills, MCPs
brokenigloo repos         # Browse 110 Sui repos
brokenigloo skills        # Browse 77 skills
brokenigloo doctor        # Environment health check
brokenigloo --help        # All commands
```

Every command accepts `--agent` for machine-readable JSON output.

## Development

```bash
git clone https://github.com/SeventhOdyssey71/broken-igloo.git
cd broken-igloo
pnpm install
pnpm build
pnpm dev
```

## License

MIT
