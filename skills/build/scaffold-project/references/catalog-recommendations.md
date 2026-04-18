# Catalog Recommendations: Project Types to Starters, SDKs, and MCPs

> This file maps specific project types to the exact repos, packages, and tools to install. Use it after the stack decision tree has determined the project scope.

---

## DeFi Aggregator / Swap Interface

Build a frontend that finds best swap rates across Sui DEXs.

| Component | Recommendation |
|-----------|---------------|
| **Primary SDK** | `@7kprotocol/sdk-ts` |
| **Secondary SDK** | `@cetusprotocol/cetus-sui-clmm-sdk` (for direct LP data) |
| **Install** | `pnpm add @7kprotocol/sdk-ts @cetusprotocol/cetus-sui-clmm-sdk @mysten/sui` |
| **When to use** | Any app that needs token-to-token swaps with best pricing |
| **Starter** | Frontend-only (Next.js or Vite) + dApp Kit |
| **MCP** | `sui-mcp-tamago` (33+ tools including DeFi) |

**Caveats:**
- 7K is the meta-aggregator -- it routes through Cetus, FlowX, Turbos, and others. Always prefer 7K for swap routing over calling individual DEXs directly.
- Use Cetus SDK only when you need direct pool management, LP position creation, or concentrated liquidity features that 7K does not expose.
- Both SDKs are ESM-only. Ensure your project has `"type": "module"` in `package.json`.

**Key integration pattern:**
```typescript
import { SevenKSDK } from '@7kprotocol/sdk-ts';

// Get best swap route
const quote = await sdk.getQuote({
  tokenIn: '0x2::sui::SUI',
  tokenOut: USDC_TYPE,
  amountIn: '1000000000', // 1 SUI in MIST
});

// Build transaction from quote
const tx = await sdk.buildSwapTransaction(quote, senderAddress);
```

---

## Lending Protocol Frontend

Build a UI for depositing, borrowing, and managing lending positions.

| Component | Recommendation |
|-----------|---------------|
| **Primary SDK (option A)** | `@scallop-io/sui-scallop-sdk` |
| **Primary SDK (option B)** | `@suilend/sdk` |
| **Fallback** | `@naviprotocol/lending` |
| **Install (Scallop)** | `pnpm add @scallop-io/sui-scallop-sdk @mysten/sui` |
| **Install (Suilend)** | `pnpm add @suilend/sdk @mysten/sui` |
| **When to use** | Apps that need supply/borrow/repay/withdraw actions |
| **Starter** | Frontend-only (Next.js) + dApp Kit |
| **MCP** | `sui-agent-kit-mcp` (has Suilend tools) or `sui-mcp-tamago` (has Scallop tools) |

**Choosing between Scallop and Suilend:**

| Factor | Scallop | Suilend |
|--------|---------|---------|
| Maturity on Sui | First grant recipient, longest track record | Newer, ported from Solana (Solend) |
| SDK quality | Well-documented, comprehensive | Good, includes SpringSui LST |
| MCP integration | Via `sui-mcp-tamago` | Via `sui-agent-kit-mcp` |
| Extra features | Flash loans, referral system | SpringSui (sSUI) liquid staking |
| Best for | Battle-tested lending | Solana devs migrating, LST combo |

**Caveats:**
- Scallop SDK has its own client wrapper. Initialize it with your SUI client for consistency.
- Suilend SDK pairs well with `@suilend/springsui-sdk` if you also need liquid staking.
- NAVI (`@naviprotocol/lending`) is a third option with built-in aggregation, but smaller community.

---

## Token Launchpad

Build a platform for fair-launch token creation with bonding curves.

| Component | Recommendation |
|-----------|---------------|
| **Move reference** | Sui Pump pattern (`coin::create_currency` + bonding curve) |
| **Frontend** | Next.js + dApp Kit |
| **Install** | `pnpm add @mysten/sui @mysten/dapp-kit @tanstack/react-query` |
| **When to use** | Pump.fun-style token launch platforms |
| **Existing platform** | Turbos.Fun (https://turbos.fun/) -- 0.1 SUI launch cost |
| **MCP** | `sui-mcp-mysten` (for Move build/test/publish) |

**Move module approach:**
```move
module my_launchpad::token {
    use sui::coin;
    use sui::url;

    public struct MY_TOKEN has drop {}

    fun init(witness: MY_TOKEN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness, 9, b"TOKEN", b"My Token", b"Description",
            option::some(url::new_unsafe_from_bytes(b"https://...")), ctx
        );
        // Transfer treasury cap to creator or lock it
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(metadata);
    }
}
```

**Caveats:**
- If the user just wants to launch a token quickly, point them to Turbos.Fun or Moonbags.io instead of building a custom launchpad.
- Custom bonding curve logic requires Move expertise. The `coin::create_currency` one-time witness pattern enforces that each coin type is created exactly once.
- Consider Cetus or Turbos DEX for auto-listing after bonding curve fills.

---

## NFT Marketplace

Build a marketplace for minting, listing, and trading NFTs/digital assets.

| Component | Recommendation |
|-----------|---------------|
| **Primary SDK** | `@mysten/kiosk` |
| **Core SDK** | `@mysten/sui` |
| **Wallet** | `@mysten/dapp-kit` |
| **Storage** | Walrus (for media/images) |
| **Install** | `pnpm add @mysten/kiosk @mysten/sui @mysten/dapp-kit @tanstack/react-query` |
| **When to use** | Any NFT trading, royalty enforcement, or digital asset marketplace |
| **Starter** | Next.js + dApp Kit |
| **MCP** | `sui-mcp-mysten` (Move build/publish for custom NFT modules) |

**Key concepts:**
- On Sui, every object is inherently unique (has a UID) -- no separate NFT standard needed.
- The **Kiosk standard** provides: listing, purchasing, transfer policies (royalties), and access control.
- **Display standard** (`sui::display`) defines how objects render in wallets and explorers.
- Use **Walrus** for decentralized media storage with on-chain references.

**Caveats:**
- Kiosk enforces transfer policies at the protocol level. This means royalties are not optional -- design your transfer policy carefully.
- The Kiosk SDK is maintained by Mysten Labs and closely follows the on-chain standard.
- For simple NFT minting without marketplace features, you only need a Move module with `sui::display`. No Kiosk needed.

---

## Data Dashboard / Analytics Tool

Build a dashboard showing on-chain metrics, token data, portfolio tracking.

| Component | Recommendation |
|-----------|---------------|
| **On-chain data** | SuiVision APIs (https://suivision.xyz/) |
| **Token data** | Birdeye (https://birdeye.so/ -- select Sui chain) |
| **DEX data** | DEX Screener (https://dexscreener.com/) |
| **RPC queries** | `@mysten/sui` (SuiClient for direct queries) |
| **Indexing** | BlockVision gRPC APIs |
| **Install** | `pnpm add @mysten/sui @tanstack/react-query` |
| **When to use** | Portfolio trackers, whale watchers, protocol analytics |
| **Starter** | Next.js (API routes for caching/proxying) |
| **MCP** | `sui-mcp-tamago` (query tools) |

**Data source selection:**

| Data Need | Source | Access Method |
|-----------|--------|---------------|
| Transaction history | SuiVision / Suiscan | REST API |
| Token prices (real-time) | Birdeye | REST API (API key) |
| DEX pair analytics | DEX Screener | REST API |
| Object/account state | Sui RPC | `@mysten/sui` SuiClient |
| Historical indexed data | BlockVision | gRPC / REST API |
| DeFi TVL | DefiLlama | REST API (`https://api.llama.fi/protocol/{slug}`) |

**Caveats:**
- SuiVision and Birdeye may require API keys for production-level request volumes.
- For real-time data, use Sui RPC subscriptions (`suiClient.subscribeEvent` / `suiClient.subscribeTransaction`).
- Next.js API routes are ideal for proxying third-party APIs and caching responses.
- BlockVision is the best option for heavy indexing workloads (gRPC support).

---

## AI Agent

Build an autonomous or semi-autonomous AI agent that interacts with Sui DeFi.

| Component | Recommendation |
|-----------|---------------|
| **Primary SDK (option A)** | `@pelagosai/sui-agent-kit` |
| **Primary SDK (option B)** | `@goat-sdk/wallet-sui` + `@goat-sdk/core` |
| **Alternative** | Sui AI Agent Kit (caterpillardev) via MCP |
| **Orchestration** | LangChain.js, LangGraph, or Vercel AI SDK |
| **Install (Pelagos)** | `pnpm add @pelagosai/sui-agent-kit @mysten/sui` |
| **Install (GOAT)** | `pnpm add @goat-sdk/wallet-sui @goat-sdk/core @goat-sdk/adapter-langchain` |
| **When to use** | DeFi automation, portfolio rebalancing, AI trading, chatbot with DeFi actions |
| **MCP** | `sui-agent-kit-mcp` (Suilend, STEAMM, SpringSui tools) |

**Choosing between agent frameworks:**

| Factor | PelagosAI | GOAT SDK | Caterpillar Agent Kit |
|--------|-----------|----------|----------------------|
| Sui-native | Yes | Multi-chain (200+ tools) | Yes |
| DeFi integrations | NAVI, Cetus, Suilend, SpringSui | Varies by plugin | Suilend, STEAMM, SpringSui |
| LLM frameworks | LangChain, LangGraph, Vercel AI | LangChain, Eliza, more | MCP-based (works with Claude) |
| Best for | Sui-focused agents | Multi-chain agents | Claude Code integration |
| Setup complexity | Medium | Medium | Low (MCP install) |

**Caveats:**
- Agent frameworks are newer and evolving rapidly. Pin versions and check for breaking changes.
- For Claude Code / MCP-based agents, install `sui-agent-kit-mcp` directly -- no custom code needed for basic DeFi operations.
- PelagosAI has the deepest Sui-native integration. Prefer it for Sui-only agents.
- GOAT SDK is best when the agent needs to operate across multiple chains.
- Always use a dedicated keypair for agents -- never reuse a personal wallet.

---

## Consumer App (Mainstream Users)

Build an app where users do not know or care about blockchain.

| Component | Recommendation |
|-----------|---------------|
| **Auth** | `@mysten/enoki` (wraps zkLogin) |
| **Frontend** | Next.js (App Router) + Tailwind |
| **Gas** | Sponsored transactions via Enoki or Shinami Gas Station |
| **RPC** | Shinami Node Service (prod) / Public (dev) |
| **Install** | `pnpm add @mysten/sui @mysten/enoki @tanstack/react-query` |
| **When to use** | Social apps, gaming, loyalty programs, any non-crypto audience |
| **Starter** | `npx create-next-app@latest --typescript --tailwind --app` |
| **MCP** | `sui-mcp-mysten` (if custom Move needed) |

**Default consumer app stack:**
```bash
npx create-next-app@latest my-consumer-app --typescript --tailwind --app
cd my-consumer-app
pnpm add @mysten/sui @mysten/enoki @tanstack/react-query
```

**Key integration:**
```typescript
import { EnokiClient } from '@mysten/enoki';

const enokiClient = new EnokiClient({
  apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
});

// User signs in with Google → gets a Sui address
// Transactions are sponsored → user never sees gas
```

**Caveats:**
- Enoki requires a subscription from Mysten Labs. Set up at https://docs.enoki.mystenlabs.com/.
- You need OAuth client IDs (Google, Apple, etc.) configured in the Enoki dashboard.
- Sponsored transaction budgets should be monitored to avoid unexpected costs.
- For server-side wallet management (user never even has a keypair), use Shinami Invisible Wallets instead.

---

## Mobile App

Build a native mobile app that interacts with Sui.

| Component | Recommendation |
|-----------|---------------|
| **Framework** | React Native + Expo |
| **Wallet** | `@mysten/dapp-kit` (or Enoki for wallet-less) |
| **Core SDK** | `@mysten/sui` |
| **Install** | `npx create-expo-app@latest --template blank-typescript` then `pnpm add @mysten/sui @mysten/dapp-kit` |
| **When to use** | Mobile wallet, mobile DeFi, mobile-first consumer app |
| **Auth (consumer)** | Enoki + zkLogin (Google/Apple sign-in) |
| **MCP** | `sui-mcp-mysten` (if custom Move needed) |

**Caveats:**
- React Native with dApp Kit requires WalletConnect or deeplink-based wallet connection (no browser extensions on mobile).
- For the smoothest mobile UX, prefer Enoki + zkLogin over wallet extensions.
- Test on real devices early -- crypto libraries sometimes have issues with React Native's JavaScript engine.
- Expo managed workflow is recommended for faster iteration; eject only if you need native modules.

---

## MCP Server Recommendations by Project Type

| Project Type | Recommended MCP | Install Command | Why |
|-------------|-----------------|-----------------|-----|
| Any Sui project | `sui-mcp-mysten` | `npx -y @anthropic-ai/claude-code mcp add sui-mcp -- npx -y sui-mcp` | 12 core tools: wallet, balance, Move build/test/publish |
| DeFi (Scallop, Pyth, SuiNS) | `sui-mcp-tamago` | `npx -y @anthropic-ai/claude-code mcp add sui-mcp-tamago -- npx -y tamago-sui-mcp` | 33+ tools including Scallop lending, Pyth oracle, staking |
| AI Agent (Suilend, STEAMM) | `sui-agent-kit-mcp` | `npx -y @anthropic-ai/claude-code mcp add sui-agent-kit -- npx -y sui-agent-kit-mcp` | DeFi agent tools for Suilend, STEAMM, SpringSui |
| Source verification | `suisource-mcp` | `npx -y @anthropic-ai/claude-code mcp add suisource-mcp -- npx -y suisource-mcp` | Verify Move package source code |
| SuiNS domains | `suins-mcp` | `npx -y @anthropic-ai/claude-code mcp add suins-mcp -- npx -y suins-mcp` | Domain name resolution and registration |

**When to install multiple MCPs:**
- DeFi project with custom Move: `sui-mcp-mysten` + `sui-mcp-tamago`
- AI agent with custom Move: `sui-mcp-mysten` + `sui-agent-kit-mcp`
- Most projects only need one MCP. Do not over-install.
