# Sui Protocols and SDKs — Comprehensive Catalog

> **Integrate First, Build Second.** Before writing a custom Move module, check if the user's idea can be built by composing existing protocols via PTBs. Most DeFi and consumer apps are integrations, not novel on-chain programs.

## Protocol Health Verification

Before recommending any protocol, verify it is active:

| Check | How | Healthy If |
|-------|-----|------------|
| TVL | DefiLlama `https://api.llama.fi/protocol/{slug}` | > $1M TVL, not declining > 50% |
| SDK freshness | npm `https://registry.npmjs.org/{pkg}` | Published within last 6 months |
| GitHub activity | Last commit date on main branch | Active within last 3 months |
| Docs | Visit docs URL | Not 404, not stale |

---

## DEX / Swap

### 7K Aggregator (Meta-Aggregator)
- **What**: Meta-aggregator routing across ALL Sui DEXs for best prices
- **SDK**: `@7kprotocol/sdk-ts`
- **When to use**: Default for any swap/trade integration — routes through Cetus, FlowX, Bluefin
- **Docs**: https://docs.7k.ag/
- **Website**: https://7k.ag/

### Cetus Protocol (CLMM DEX + Aggregator)
- **What**: #1 concentrated liquidity DEX on Sui + built-in aggregator
- **SDK**: `@cetusprotocol/cetus-sui-clmm-sdk`, `@cetusprotocol/aggregator-sdk`
- **When to use**: AMM/LP integrations, concentrated liquidity positions, swap routing
- **Docs**: https://cetus-1.gitbook.io/cetus-developer-docs
- **GitHub**: https://github.com/CetusProtocol

### DeepBook V3 (On-Chain CLOB)
- **What**: Native on-chain Central Limit Order Book, built by Mysten Labs
- **SDK**: `@mysten/deepbook-v3`
- **When to use**: Order book trading, limit orders, market making, flash loans
- **Docs**: https://docs.deepbook.tech/
- **GitHub**: https://github.com/MystenLabs/deepbookv3

### Turbos Finance (CLMM DEX)
- **What**: Concentrated liquidity DEX
- **When to use**: LP positions, alternative to Cetus pools
- **Website**: https://turbos.finance/

### FlowX Finance (DEX + Aggregator)
- **What**: DEX with built-in aggregation
- **Website**: https://flowx.finance/

### Aftermath Finance (DEX + Router + LST)
- **What**: Multi-product DeFi: AMM, DEX router, liquid staking (afSUI)
- **SDK**: `aftermath-ts-sdk`
- **When to use**: LST integrations, DEX routing alongside staking
- **Website**: https://aftermath.finance/

---

## Lending / Borrowing

### Suilend
- **What**: Lending protocol (by the Solend team, migrated from Solana)
- **SDK**: `@suilend/sdk`
- **When to use**: Lending/borrowing integrations, familiar to Solana devs
- **Website**: https://suilend.fi/
- **Also**: `@suilend/springsui-sdk` for SpringSui liquid staking (sSUI)

### Scallop
- **What**: First Sui Foundation grant recipient. Production lending protocol.
- **SDK**: `@scallop-io/sui-scallop-sdk`
- **When to use**: Lending/borrowing with the most battle-tested Sui lending protocol
- **GitHub**: https://github.com/scallop-io/sui-scallop-sdk
- **Website**: https://scallop.io/

### NAVI Protocol
- **What**: One-stop DeFi liquidity protocol (lending + more)
- **SDK**: `@naviprotocol/lending`
- **Aggregator**: `navi-aggregator-sdk`
- **When to use**: Lending with aggregation features
- **GitHub**: https://github.com/naviprotocol/navi-sdk
- **Website**: https://naviprotocol.io/

---

## Liquid Staking (LSTs)

### Aftermath Finance — afSUI
- **SDK**: `aftermath-ts-sdk`
- **Notes**: Won 1st place in Sui LST hackathon

### Haedal Protocol — haSUI
- **What**: Leading LST by TVL. HAEDAL token listed on Binance, Bybit, Gate.
- **Website**: https://haedal.xyz/

### Volo — voloSUI
- **What**: Third major LST provider on Sui

### SpringSui (by Suilend) — sSUI
- **SDK**: `@suilend/springsui-sdk`

> Sui Foundation injected 25M SUI into Aftermath, Haedal, and Volo to bootstrap the LST ecosystem.

---

## Launchpad / Token Creation

### Turbos.Fun
- **What**: Pump.fun-style token launchpad on Sui
- **Mechanics**: 0.1 SUI launch cost, 6000 SUI bonding cap, auto-deploy to Turbos DEX
- **Website**: https://turbos.fun/

### Moonbags.io
- **What**: No-code token creation platform. Supports bonding curve + LP-based launches.
- **Website**: https://moonbags.io/

### DIY via Coin Standard
- Use `coin::create_currency` in a Move module (see `03-move-language.md`)
- Full control over supply, metadata, and distribution logic

---

## Infrastructure / RPC

### Shinami
- **What**: Most comprehensive Sui infrastructure platform
- **SDK**: `@shinami/clients`
- **Services**: RPC (Node Service), Gas Station (sponsored txns), Invisible Wallets, zkLogin Wallet API
- **When to use**: Production apps needing reliable RPC + gas sponsorship + embedded wallets
- **Docs**: https://docs.shinami.com/

### Sui Official RPC
- **Endpoints**: `https://fullnode.mainnet.sui.io:443`, `https://fullnode.testnet.sui.io:443`, `https://fullnode.devnet.sui.io:443`
- **When to use**: Development, testing, low-traffic apps
- **Rate limits**: Apply, not suitable for production

### BlockVision
- **What**: RPC nodes, gRPC, indexing APIs, validator service. Builds SuiVision explorer.
- **Website**: https://blockvision.org/

### QuickNode
- **What**: Multi-chain RPC provider including Sui
- **Website**: https://quicknode.com/

---

## Auth / Embedded Wallets

### zkLogin (Protocol Native)
- **SDK**: `@mysten/sui/zklogin`
- **What**: Protocol-level OAuth-to-wallet. Supports Google, Facebook, Twitch, Apple.
- **When to use**: Always consider for consumer apps — no wallet extension needed
- **Docs**: https://docs.sui.io/concepts/cryptography/zklogin

### Enoki (by Mysten Labs)
- **SDK**: `@mysten/enoki`
- **What**: Managed service wrapping zkLogin + sponsored transactions. Monthly subscription.
- **When to use**: Fastest path to "no wallet, no gas" onboarding
- **Docs**: https://docs.enoki.mystenlabs.com/

### Shinami Invisible Wallets
- **SDK**: `@shinami/clients`
- **What**: Backend wallets that fully abstract chain from users
- **When to use**: When you need server-side wallet management + gas sponsorship

---

## Wallets (Browser/Mobile)

### Slush (Official, by Mysten Labs)
- **What**: Flagship Sui wallet (formerly Sui Wallet + Stashed, rebranded 2025)
- **Platforms**: Chrome extension, iOS, Android
- **Features**: zkLogin, Ledger, staking, DeFi, NFT gallery

### Suiet
- **What**: Open-source browser extension. FaceID/TouchID, zkLogin support.
- **Website**: https://suiet.app/

### Martian
- **What**: Multi-chain wallet (Sui + Aptos + Ethereum)

### dApp Wallet Integration
- **SDK**: `@mysten/dapp-kit` (current), splitting into `@mysten/dapp-kit-core` + `@mysten/dapp-kit-react`
- **What**: React hooks/components for wallet connection, auto-detects all installed Sui wallets
- **Docs**: https://sdk.mystenlabs.com/dapp-kit

---

## NFTs / Digital Assets

### Sui Native Object Model
- Every object IS an NFT by default (unique UID)
- No separate "NFT standard" needed
- Metadata stored fully on-chain as object fields

### Kiosk Standard
- **SDK**: `@mysten/kiosk`
- **What**: On-chain marketplace primitive with enforced transfer policies (royalties, restrictions)
- **Docs**: https://docs.sui.io/standards/kiosk

### Display Standard
- **What**: `sui::display` — defines how objects render in wallets/explorers
- **Docs**: https://docs.sui.io/standards/display

---

## Storage

### Walrus (by Mysten Labs)
- **What**: Decentralized storage protocol built on Sui
- **When to use**: Store large files (images, videos, websites) with on-chain references
- **GitHub**: https://github.com/MystenLabs/walrus-sites
- **Features**: Walrus Sites for hosting static websites on decentralized storage

---

## Naming

### SuiNS
- **What**: Sui Name Service — human-readable addresses (e.g., alice.sui)
- **When to use**: User-facing address display, profile systems

---

## Analytics / Data

### SuiVision
- **What**: Primary Sui explorer. DeFi dashboard, NFT analytics.
- **Built by**: BlockVision + Mysten Labs
- **URL**: https://suivision.xyz/

### Suiscan
- **What**: Fast transaction explorer and smart contract analysis
- **URL**: https://suiscan.xyz/

### Birdeye (Multi-chain)
- **What**: Already supports Sui. Real-time token data, charts, wallet tracking.
- **URL**: https://birdeye.so/ (select Sui chain)

### DEX Screener
- **What**: Multi-chain DEX analytics. Supports Sui pairs.
- **URL**: https://dexscreener.com/

---

## AI Agent Tooling

### PelagosAI Sui Agent Kit
- **SDK**: `@pelagosai/sui-agent-kit`
- **What**: Autonomous agent framework. LangChain, LangGraph, Vercel AI integration.
- **Integrates**: NAVI, Cetus, Suilend, SpringSui
- **GitHub**: https://github.com/pelagosaionsui/sui-agent-kit

### Sui AI Agent Kit (Caterpillar Dev)
- **What**: MCP server + TypeScript framework for AI DeFi agents
- **Integrates**: Suilend, STEAMM, SpringSui
- **GitHub**: https://github.com/caterpillardev/Sui-AI-Agent-Kit

### GOAT SDK (Chain-Agnostic)
- **SDK**: `@goat-sdk/wallet-sui`, `@goat-sdk/core`
- **What**: 200+ tools for agentic finance. Works with LangChain, Eliza, etc.
- **GitHub**: https://github.com/goat-sdk/goat

### Talus Network — Nexus SDK
- **What**: Agentic workflow engine for building AI agent pipelines
- **GitHub**: https://github.com/Talus-Network/nexus-sdk

---

## Core SDK Reference

### Sui TypeScript SDK
- **Package**: `@mysten/sui`
- **Sub-modules**:
  - `@mysten/sui/client` — RPC client (JSON-RPC, GraphQL)
  - `@mysten/sui/transactions` — Build PTBs
  - `@mysten/sui/bcs` — Binary Canonical Serialization
  - `@mysten/sui/keypairs/ed25519` — Ed25519 keypairs
  - `@mysten/sui/keypairs/secp256k1` — Secp256k1 keypairs
  - `@mysten/sui/keypairs/secp256r1` — Secp256r1 keypairs (passkey-compatible)
  - `@mysten/sui/zklogin` — zkLogin utilities
  - `@mysten/sui/verify` — Transaction/signature verification
- **Install**: `npm i @mysten/sui` (ESM-only, requires `"type": "module"`)
- **Docs**: https://sdk.mystenlabs.com/

### Sui CLI
- **Install**: `cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui`
- **Or via Homebrew**: `brew install sui`
- **Key commands**: `sui move new`, `sui move build`, `sui move test`, `sui client publish`

---

## Quick Integration Decision Tree

```
User's idea involves...
├── Swapping tokens? → 7K Aggregator (@7kprotocol/sdk-ts)
├── Providing liquidity? → Cetus CLMM (@cetusprotocol/cetus-sui-clmm-sdk)
├── Limit orders / order book? → DeepBook V3 (@mysten/deepbook-v3)
├── Lending / borrowing? → Suilend (@suilend/sdk) or Scallop (@scallop-io/sui-scallop-sdk)
├── Liquid staking? → Aftermath (afSUI) or Haedal (haSUI)
├── Token launch? → coin::create_currency (Move) + Turbos.Fun
├── Wallet connection? → @mysten/dapp-kit
├── No-wallet onboarding? → Enoki (@mysten/enoki) + zkLogin
├── Gas sponsorship? → Shinami Gas Station (@shinami/clients)
├── NFT marketplace? → Kiosk standard (@mysten/kiosk)
├── Decentralized storage? → Walrus
├── AI agent? → PelagosAI (@pelagosai/sui-agent-kit)
└── Custom protocol? → Write a Move module
```
