# brokenigloo

**Ship on Sui — Idea to Launch.**

The agentic layer for Sui. Build tasteful & useful crypto apps using AI in a few hours.

## Install

```bash
curl -fsSL https://brokenigloo.dev/setup.sh | bash
```

Uses built-in skills, MCPs, and CLIs with **Claude Code**, **OpenAI Codex**, and **Cursor**.

## What It Does

brokenigloo installs 31 AI-guided skills into your coding assistant, organized across 4 phases:

### Idea — Discovery & Planning
- **Find Next Crypto Idea** — 500+ curated ideas from YC, Alliance, a16z, and Sui ecosystem
- **Validate Idea** — On-chain demand signals, competitive analysis, go/no-go decision
- **Sui Beginner** — Adaptive Sui fundamentals (object model, Move, PTBs, zkLogin)

### Build — Implementation
- **Scaffold Project** — Stack decisions, starter repos, dependency installation
- **Build with Claude** — Guided MVP in 3-5 milestones
- **Build DeFi Protocol** — AMMs, lending, vaults with Move modules
- **Debug Move** — Diagnose Move errors, object ownership issues, failed transactions
- **Review & Iterate** — Security review, code quality scoring

### Launch — Go to Market
- **Deploy to Mainnet** — Pre-flight checklist, `sui client publish`, UpgradeCap management
- **Create Pitch Deck** — 12-slide investor framework
- **Apply for Grant** — Sui Foundation grant guidance

### Plus: Design, Security, Marketing skills and more.

## How It Works

Skills are structured markdown files installed to `~/.claude/skills/`. When you open Claude Code and say something like:

- *"teach me Sui"* → triggers the `sui-beginner` skill
- *"help me find a crypto idea"* → triggers `find-next-crypto-idea`
- *"scaffold a Sui project"* → triggers `scaffold-project`
- *"deploy to mainnet"* → triggers `deploy-to-mainnet`

Each skill interviews you, reads context from previous phases, executes a structured workflow, and hands off to the next skill.

## Sui Ecosystem Integrations

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
| Kiosk | NFT marketplace standard | `@mysten/kiosk` |

## Development

```bash
pnpm install
pnpm build
pnpm dev
```

## License

MIT
