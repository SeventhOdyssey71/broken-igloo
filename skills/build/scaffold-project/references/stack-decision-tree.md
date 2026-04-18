# Stack Decision Tree for Sui Projects

> Use this decision tree when scaffolding a new Sui project. Walk through each decision in order. The output is a concrete stack recommendation the scaffold skill can execute.

---

## Decision 1: Project Scope

**Question: Does this project need custom Move (on-chain) code?**

```
What are you building?
│
├─ Novel on-chain logic (new DeFi primitive, game, custom token mechanics, state machine)
│  └─ YES — Move code required
│     ├─ Also needs a frontend? → Full-stack (Decision 1A)
│     └─ SDK/CLI only?         → Move-only (Decision 1B)
│
├─ Composing existing protocols (swap aggregator, lending dashboard, portfolio tracker)
│  └─ NO — Integration app, frontend-only
│     └─ Go to Decision 2
│
├─ Consumer app (social, gaming UX, mainstream users)
│  └─ MAYBE — depends on whether existing protocols cover it
│     ├─ Existing protocols cover logic → Frontend-only + PTBs
│     └─ Need custom logic → Full-stack
│
└─ Data dashboard / analytics tool
   └─ NO — Frontend-only, API-driven
      └─ Go to Decision 2
```

### Decision 1A vs 1B Summary

| Scope | Description | Scaffold Path |
|-------|-------------|---------------|
| **Full-stack** | Move modules + React/Next.js frontend + wallet integration | Path A |
| **Move-only** | Move modules + TypeScript SDK, no UI | Path B |
| **Frontend-only** | No custom Move, compose existing protocols via SDKs/PTBs | Path C |

---

## Decision 2: Starter Template

**Question: Which scaffold template fits best?**

```
Project scope decided. Which starter?
│
├─ Full-stack dApp
│  ├─ Want official Mysten tooling, minimal opinions?
│  │  └─ @mysten/create-dapp
│  │     • npx @mysten/create-dapp@latest
│  │     • Includes: Move template, dApp Kit, React (Vite)
│  │     • Best for: learning, prototypes, hackathons
│  │     • Caveat: Vite-only, no Next.js option
│  │
│  ├─ Want production-ready with monorepo, testing, CI?
│  │  └─ sui-dapp-starter (suiware)
│  │     • git clone https://github.com/suiware/sui-dapp-starter
│  │     • Includes: Move, Vite + React, dApp Kit, pnpm monorepo
│  │     • Best for: serious projects, teams, production apps
│  │     • Caveat: More opinionated, heavier setup
│  │
│  ├─ Want Next.js (SSR, API routes, SEO)?
│  │  └─ Nextjs-Sui-Dapp-Template (hoh-zone)
│  │     • git clone https://github.com/hoh-zone/Nextjs-Sui-Dapp-Template
│  │     • Includes: Move, Next.js, dApp Kit, Tailwind
│  │     • Best for: production apps needing SSR or SEO
│  │     • Caveat: Community-maintained, verify freshness
│  │
│  └─ Want full control?
│     └─ Custom setup
│        • sui move new <name> + create-next-app + manual wiring
│        • Best for: experienced devs with specific requirements
│        • Caveat: More work, must wire everything yourself
│
├─ Move-only
│  └─ sui move new <project_name>
│     • Creates Move.toml + sources/ directory
│     • Add @mysten/sui for TypeScript integration tests/SDK
│
└─ Frontend-only
   ├─ Next.js (default recommendation)
   │  └─ npx create-next-app@latest --typescript --tailwind --app
   │     + pnpm add @mysten/sui @mysten/dapp-kit @tanstack/react-query
   │
   └─ Vite + React (lighter, no SSR needed)
      └─ npm create vite@latest -- --template react-ts
         + pnpm add @mysten/sui @mysten/dapp-kit @tanstack/react-query
```

### Template Comparison Table

| Template | Framework | Move? | Monorepo? | SSR? | Best For |
|----------|-----------|-------|-----------|------|----------|
| `@mysten/create-dapp` | Vite + React | Yes | No | No | Hackathons, learning |
| `sui-dapp-starter` | Vite + React | Yes | Yes (pnpm) | No | Production full-stack |
| `Nextjs-Sui-Dapp-Template` | Next.js | Yes | No | Yes | SEO, API routes, SSR |
| Custom Next.js | Next.js | Optional | Your choice | Yes | Maximum control |
| Custom Vite | Vite + React | Optional | Your choice | No | Lightweight SPAs |
| `sui move new` | None | Yes | No | N/A | Protocols, CLI tools |

---

## Decision 3: Frontend Framework

**Question: Which frontend framework?**

```
Need a frontend?
│
├─ YES
│  ├─ Need SSR, SEO, or API routes?
│  │  └─ Next.js (App Router, TypeScript, Tailwind)
│  │     • Default for: consumer apps, marketing sites, apps with backend logic
│  │     • Command: npx create-next-app@latest --typescript --tailwind --app
│  │
│  ├─ SPA is fine, want fast dev server?
│  │  └─ Vite + React
│  │     • Default for: dashboards, admin panels, DeFi interfaces
│  │     • Command: npm create vite@latest -- --template react-ts
│  │
│  ├─ Mobile app?
│  │  └─ React Native + Expo
│  │     • Use @mysten/dapp-kit for wallet integration
│  │     • Consider Enoki/zkLogin for mobile-first auth
│  │     • Command: npx create-expo-app@latest --template blank-typescript
│  │
│  └─ Static site / docs?
│     └─ Vite or Astro (lightweight)
│
└─ NO
   └─ Move-only or CLI/script project
      • TypeScript SDK scripts via @mysten/sui
      • Test with sui move test
```

### Framework Decision Matrix

| Factor | Next.js | Vite + React | React Native |
|--------|---------|--------------|--------------|
| SSR/SEO | Yes | No | N/A |
| API routes | Built-in | Need separate server | Need separate server |
| Dev speed | Fast (but heavier) | Fastest | Moderate |
| Bundle size | Larger | Smaller | N/A (native) |
| Deployment | Vercel, self-host | Any static host | App stores |
| Best for | Consumer apps, SEO | DeFi dashboards | Mobile wallets |

---

## Decision 4: Wallet Integration

**Question: How will users authenticate and sign transactions?**

```
Who is the target user?
│
├─ Crypto-native (has wallet extensions, knows gas)
│  └─ @mysten/dapp-kit
│     • Standard wallet adapter, auto-detects Slush/Suiet/Martian
│     • pnpm add @mysten/dapp-kit @mysten/sui @tanstack/react-query
│     • Provides: ConnectButton, useCurrentAccount, useSignAndExecuteTransaction
│
├─ Mainstream consumer (no wallet, no crypto knowledge)
│  ├─ Want managed service (fastest to ship)?
│  │  └─ Enoki + zkLogin
│  │     • pnpm add @mysten/enoki
│  │     • Includes: Google/Apple/Facebook sign-in, sponsored transactions
│  │     • User gets a Sui address from their OAuth identity
│  │     • Monthly subscription, managed by Mysten Labs
│  │
│  └─ Want server-side wallet management?
│     └─ Shinami Invisible Wallets
│        • pnpm add @shinami/clients
│        • Backend creates/manages wallets for users
│        • Combine with Shinami Gas Station for gas sponsorship
│        • Best for: apps where users never see blockchain
│
├─ Both crypto-native AND mainstream?
│  └─ dApp Kit + Enoki (dual mode)
│     • Show ConnectButton for wallet users
│     • Show "Sign in with Google" for non-wallet users
│     • pnpm add @mysten/dapp-kit @mysten/enoki
│
└─ No user-facing wallet needed (backend/CLI/agent)
   └─ @mysten/sui keypairs directly
      • import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
      • For scripts, agents, backend services
```

### Wallet Integration Comparison

| Solution | User Experience | Gas Handling | Setup Complexity | Cost |
|----------|----------------|--------------|------------------|------|
| **dApp Kit** | Wallet popup | User pays gas | Low | Free |
| **Enoki + zkLogin** | OAuth sign-in | Sponsored (free for user) | Medium | Subscription |
| **Shinami Invisible** | Fully invisible | Sponsored (free for user) | Medium-High | Per-request |
| **dApp Kit + Enoki** | Choice of both | Mixed | Higher | Subscription |
| **Raw keypairs** | CLI/backend only | Script pays | Lowest | Free |

---

## Decision 5: RPC Provider

**Question: What RPC endpoint should the app use?**

```
What stage is the project?
│
├─ Development / prototyping
│  └─ Sui Public RPC (free, rate-limited)
│     • Mainnet: https://fullnode.mainnet.sui.io:443
│     • Testnet: https://fullnode.testnet.sui.io:443
│     • Devnet:  https://fullnode.devnet.sui.io:443
│     • Caveat: Rate limited, not for production traffic
│
├─ Production — need reliability + gas sponsorship
│  └─ Shinami (recommended default for production)
│     • pnpm add @shinami/clients
│     • Includes: Node Service (RPC) + Gas Station + Invisible Wallets
│     • Free tier available, scales with usage
│     • Best for: apps using Enoki or needing sponsored transactions
│
├─ Production — need high throughput + indexing
│  └─ BlockVision
│     • RPC nodes + gRPC + indexing APIs
│     • Builds SuiVision explorer
│     • Best for: data-heavy apps, analytics dashboards
│
├─ Production — multi-chain shop (already using QuickNode)
│  └─ QuickNode
│     • Sui support alongside other chains
│     • Best for: teams already on QuickNode for EVM/Solana
│
└─ Self-hosted (advanced)
   └─ Run your own Sui fullnode
      • Best for: validators, infrastructure providers
      • Not recommended for app developers
```

### RPC Provider Comparison

| Provider | Free Tier | Gas Station | Indexing | Best For |
|----------|-----------|-------------|---------|----------|
| **Sui Public** | Unlimited (rate-limited) | No | No | Development |
| **Shinami** | Yes | Yes | No | Production apps |
| **BlockVision** | Yes | No | Yes (gRPC) | Data-heavy apps |
| **QuickNode** | Trial | No | Add-on | Multi-chain teams |

---

## Decision 6: DeFi Protocol Integrations

**Question: Which DeFi protocols should be integrated?**

```
What DeFi functionality is needed?
│
├─ Token swaps (any-to-any)
│  └─ 7K Aggregator (meta-aggregator, routes across ALL Sui DEXs)
│     • pnpm add @7kprotocol/sdk-ts
│     • Always prefer this over single-DEX SDKs for swap routing
│
├─ Liquidity provision / AMM
│  └─ Cetus Protocol (CLMM, #1 DEX on Sui)
│     • pnpm add @cetusprotocol/cetus-sui-clmm-sdk
│     • Concentrated liquidity positions, pool management
│
├─ Order book trading / limit orders
│  └─ DeepBook V3 (native on-chain CLOB)
│     • pnpm add @mysten/deepbook-v3
│     • Market making, limit orders, flash loans
│
├─ Lending / borrowing
│  ├─ Battle-tested, first on Sui → Scallop
│  │  • pnpm add @scallop-io/sui-scallop-sdk
│  ├─ Solana team pedigree → Suilend
│  │  • pnpm add @suilend/sdk
│  └─ Aggregation features → NAVI
│     • pnpm add @naviprotocol/lending
│
├─ Liquid staking
│  ├─ afSUI → Aftermath (aftermath-ts-sdk)
│  ├─ haSUI → Haedal (highest TVL, Binance-listed)
│  └─ sSUI → SpringSui (@suilend/springsui-sdk)
│
├─ Token launch
│  └─ Turbos.Fun (pump.fun-style) or DIY via coin::create_currency
│
└─ Multiple DeFi features (aggregator, portfolio, yield)
   └─ Combine: 7K (swaps) + Scallop or Suilend (lending) + Aftermath (LST)
      • Compose via Programmable Transaction Blocks (PTBs)
      • Single atomic transaction can swap + lend + stake
```

---

## Decision 7: Consumer App Defaults

**If building a consumer-facing app (non-crypto users), apply these defaults:**

| Component | Default Choice | Why |
|-----------|---------------|-----|
| Auth | zkLogin via Enoki | OAuth sign-in, no wallet extension |
| Gas | Sponsored transactions (Enoki or Shinami Gas Station) | Users never see gas fees |
| Frontend | Next.js | SSR for SEO, API routes for backend logic |
| Wallet UI | None visible | Wallet is invisible, managed by Enoki |
| RPC | Shinami (prod) / Public (dev) | Reliability + gas sponsorship bundle |
| Onboarding | Google/Apple sign-in button | Familiar OAuth flow |

**Consumer app golden path:**
```bash
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app
pnpm add @mysten/sui @mysten/enoki @tanstack/react-query
# Configure Enoki with Google OAuth client ID
# Set up sponsored transaction flow
```

---

## Quick Reference: Complete Stack Combos

### DeFi Dashboard
```
Next.js + dApp Kit + 7K SDK + Cetus SDK + SuiVision APIs
RPC: Shinami (prod) | Public (dev)
```

### Lending Protocol Frontend
```
Next.js + dApp Kit + Scallop SDK (or Suilend SDK)
RPC: Shinami (prod)
```

### Consumer Social App
```
Next.js + Enoki + zkLogin + Shinami Gas Station
No wallet extension, sponsored txns
```

### Mobile Wallet / App
```
React Native + Expo + dApp Kit + Enoki (optional zkLogin)
RPC: Shinami (prod)
```

### AI Agent
```
TypeScript + @mysten/sui + @pelagosai/sui-agent-kit (or @goat-sdk/wallet-sui)
LangChain/Vercel AI for orchestration
RPC: Shinami (prod)
```

### Token Launchpad
```
Next.js + dApp Kit + custom Move (coin::create_currency)
Optional: Turbos.Fun for bonding curve mechanics
```

### NFT Marketplace
```
Next.js + dApp Kit + @mysten/kiosk + Walrus (media storage)
RPC: Shinami (prod)
```

### Move Protocol (no frontend)
```
sui move new + @mysten/sui (TypeScript SDK for tests/scripts)
Test: sui move test
Deploy: sui client publish
```
