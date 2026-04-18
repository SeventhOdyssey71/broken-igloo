# Sui Application Architecture Patterns

> Reference for common Sui application architectures. Each pattern includes directory structure, key files, data flow, and guidance on when to use it.

---

## Pattern 1: Full-Stack dApp

**Move backend + React frontend + dApp Kit wallet integration**

This is the standard architecture for projects that need custom on-chain logic and a user-facing interface.

### When to Use
- Novel DeFi protocol (custom AMM, new lending mechanism, game logic)
- On-chain state machine with a user interface
- Any app where you control both the smart contract and the frontend
- NFT collection with custom minting/trading logic

### Directory Structure
```
my-dapp/
├── move/                          # On-chain code
│   ├── Move.toml                  # Move package manifest
│   ├── sources/
│   │   ├── my_module.move         # Core business logic
│   │   └── admin.move             # Admin/governance functions
│   └── tests/
│       └── my_module_tests.move   # Move unit tests
├── src/                           # Frontend (React)
│   ├── app/                       # Next.js App Router (or src/ for Vite)
│   │   ├── layout.tsx             # Root layout with providers
│   │   ├── page.tsx               # Home page
│   │   └── dashboard/
│   │       └── page.tsx           # Dashboard page
│   ├── components/
│   │   ├── providers.tsx          # SuiClientProvider, WalletProvider, QueryClientProvider
│   │   ├── WalletConnect.tsx      # Wallet connection UI
│   │   └── TransactionButton.tsx  # Sign & execute transaction
│   ├── hooks/
│   │   ├── useMyModule.ts         # Custom hook for Move module interactions
│   │   └── useContractQuery.ts    # Hook for reading on-chain state
│   ├── lib/
│   │   ├── constants.ts           # Package IDs, object IDs, network config
│   │   ├── transactions.ts        # PTB builders for each Move function
│   │   └── types.ts               # TypeScript types matching Move structs
│   └── styles/
│       └── globals.css            # Tailwind base styles
├── scripts/
│   ├── deploy.ts                  # Publish Move package to network
│   └── seed.ts                    # Seed initial on-chain state
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── CLAUDE.md                      # AI instructions for this project
└── .brokenigloo/
    ├── idea-context.md
    └── build-context.md
```

### Key Files Explained

**`move/sources/my_module.move`** -- Core on-chain logic. All state lives here as Sui objects.

**`src/lib/transactions.ts`** -- PTB (Programmable Transaction Block) builders. Each function constructs a transaction that calls a Move function:
```typescript
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID } from './constants';

export function buildCreatePoolTx(params: { tokenA: string; tokenB: string }) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::create_pool`,
    arguments: [tx.pure.string(params.tokenA), tx.pure.string(params.tokenB)],
  });
  return tx;
}
```

**`src/components/providers.tsx`** -- Wraps the app with required context providers:
```typescript
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getFullnodeUrl } from '@mysten/sui/client';

const queryClient = new QueryClient();
const networks = {
  mainnet: { url: getFullnodeUrl('mainnet') },
  testnet: { url: getFullnodeUrl('testnet') },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

### Data Flow
```
User action (click button)
  → React component calls hook
    → Hook calls PTB builder from lib/transactions.ts
      → dApp Kit signs transaction via wallet
        → Transaction sent to Sui network
          → Move module executes on-chain
            → Objects created/modified
              → React query refetches on-chain state
                → UI updates
```

### Build & Deploy Commands
```bash
# Move
sui move build                    # Compile Move modules
sui move test                     # Run Move tests
sui client publish --gas-budget 100000000  # Deploy to network

# Frontend
pnpm dev                          # Start dev server
pnpm build                        # Production build
```

---

## Pattern 2: Move-Only Protocol

**Move modules + TypeScript SDK for integration testing and scripting**

For teams building on-chain protocols that other developers will integrate with. No user-facing frontend -- consumers interact via their own apps or CLI.

### When to Use
- Building a DeFi primitive (AMM, oracle, vault) for others to compose
- On-chain game engine or framework
- Infrastructure protocol (bridge, messaging layer)
- Library modules meant to be imported by other Move packages

### Directory Structure
```
my-protocol/
├── move/
│   ├── Move.toml                  # Package manifest with dependencies
│   ├── sources/
│   │   ├── core.move              # Core protocol logic
│   │   ├── math.move              # Math utilities
│   │   ├── events.move            # Event definitions
│   │   └── admin.move             # Governance/admin
│   └── tests/
│       ├── core_tests.move        # Unit tests
│       └── integration_tests.move # Multi-module integration tests
├── sdk/                           # TypeScript SDK for integrators
│   ├── src/
│   │   ├── index.ts               # Public API exports
│   │   ├── client.ts              # Protocol client class
│   │   ├── transactions.ts        # PTB builders for each entry function
│   │   ├── queries.ts             # Read on-chain state
│   │   └── types.ts               # TypeScript types
│   ├── tests/
│   │   └── client.test.ts         # SDK integration tests (against testnet)
│   ├── package.json               # SDK package config (for npm publish)
│   └── tsconfig.json
├── scripts/
│   ├── deploy.ts                  # Deploy to testnet/mainnet
│   ├── upgrade.ts                 # Package upgrade script
│   └── verify.ts                  # Post-deploy verification
├── docs/
│   └── integration-guide.md       # How other devs integrate with your protocol
├── CLAUDE.md
└── .brokenigloo/
    ├── idea-context.md
    └── build-context.md
```

### Key Files Explained

**`move/Move.toml`** -- Defines dependencies on Sui framework and any other Move packages:
```toml
[package]
name = "my_protocol"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet" }

[addresses]
my_protocol = "0x0"
```

**`sdk/src/client.ts`** -- TypeScript wrapper that other developers import:
```typescript
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export class MyProtocolClient {
  constructor(
    private suiClient: SuiClient,
    private packageId: string,
  ) {}

  async deposit(coinObjectId: string, amount: bigint): Promise<Transaction> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::core::deposit`,
      arguments: [tx.object(coinObjectId), tx.pure.u64(amount)],
    });
    return tx;
  }

  async getPoolState(poolId: string) {
    return this.suiClient.getObject({
      id: poolId,
      options: { showContent: true },
    });
  }
}
```

### Data Flow
```
Integrator's app or script
  → Imports your TypeScript SDK
    → SDK builds PTB targeting your Move package
      → Integrator signs with their wallet/keypair
        → Transaction executes your Move modules
          → Events emitted for indexing
            → SDK queries updated on-chain state
```

### Build & Deploy Commands
```bash
# Move
sui move build
sui move test
sui move test --coverage             # Test with coverage report
sui client publish --gas-budget 100000000

# SDK
cd sdk && pnpm test                  # Run SDK integration tests
cd sdk && pnpm build                 # Build SDK for publishing
npm publish                          # Publish SDK to npm
```

---

## Pattern 3: Integration App (No Custom Move)

**Compose existing protocols via PTBs with a frontend**

The most common pattern for DeFi dashboards, portfolio trackers, swap interfaces, and aggregators. No custom Move code -- everything is done by calling existing deployed contracts.

### When to Use
- Swap aggregator frontend (using 7K, Cetus)
- Lending dashboard (using Scallop, Suilend)
- Portfolio tracker / DeFi dashboard
- Yield optimizer that composes multiple protocols
- Any app where existing protocols cover all on-chain logic

### Directory Structure
```
my-integration-app/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── swap/
│   │   │   └── page.tsx           # Swap interface
│   │   ├── portfolio/
│   │   │   └── page.tsx           # Portfolio view
│   │   └── api/                   # API routes (caching, proxying)
│   │       ├── prices/
│   │       │   └── route.ts       # Cache token prices from Birdeye
│   │       └── pools/
│   │           └── route.ts       # Cache pool data
│   ├── components/
│   │   ├── providers.tsx          # Wallet + query providers
│   │   ├── SwapForm.tsx           # Token swap UI
│   │   ├── PortfolioTable.tsx     # Holdings display
│   │   └── TokenSelector.tsx      # Token picker modal
│   ├── hooks/
│   │   ├── useSwap.ts             # 7K swap hook
│   │   ├── useLending.ts          # Scallop/Suilend hook
│   │   └── useTokenPrices.ts      # Price fetching hook
│   ├── lib/
│   │   ├── protocols/
│   │   │   ├── seven-k.ts        # 7K SDK wrapper
│   │   │   ├── cetus.ts          # Cetus SDK wrapper
│   │   │   ├── scallop.ts        # Scallop SDK wrapper
│   │   │   └── suilend.ts        # Suilend SDK wrapper
│   │   ├── constants.ts           # Known token types, pool IDs
│   │   └── utils.ts               # Formatting, math helpers
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── CLAUDE.md
└── .brokenigloo/
    ├── idea-context.md
    └── build-context.md
```

### Key Files Explained

**`src/lib/protocols/seven-k.ts`** -- Wraps the 7K SDK for use in hooks:
```typescript
import { SevenKSDK } from '@7kprotocol/sdk-ts';
import { SuiClient } from '@mysten/sui/client';

const sdk = new SevenKSDK();

export async function getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string) {
  return sdk.getQuote({ tokenIn, tokenOut, amountIn });
}

export async function buildSwapTx(quote: any, sender: string) {
  return sdk.buildSwapTransaction(quote, sender);
}
```

**`src/hooks/useSwap.ts`** -- React hook combining SDK + wallet:
```typescript
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useMutation } from '@tanstack/react-query';
import { getSwapQuote, buildSwapTx } from '@/lib/protocols/seven-k';

export function useSwap() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return useMutation({
    mutationFn: async (params: { tokenIn: string; tokenOut: string; amount: string; sender: string }) => {
      const quote = await getSwapQuote(params.tokenIn, params.tokenOut, params.amount);
      const tx = await buildSwapTx(quote, params.sender);
      return signAndExecute({ transaction: tx });
    },
  });
}
```

### Data Flow
```
User action (e.g., swap tokens)
  → React hook calls protocol SDK wrapper
    → SDK builds PTB composing one or more protocol calls
      → dApp Kit signs via user's wallet
        → PTB executes atomically on Sui
          → Multiple protocol interactions in ONE transaction
            → React query refetches balances/positions
              → UI updates

PTB composition example (swap + deposit in one tx):
  moveCall: 7k::swap(SUI → USDC)
  moveCall: scallop::deposit(USDC → lending pool)
  // Both execute atomically -- if either fails, both revert
```

### Build & Deploy Commands
```bash
pnpm dev                          # Start dev server
pnpm build                        # Production build
pnpm lint                         # Lint check
# No Move commands -- no custom on-chain code
```

---

## Pattern 4: Consumer App

**zkLogin + Enoki + sponsored transactions + no wallet extension**

For mainstream consumer applications where users should never see blockchain UX (no wallet popups, no gas fees, no seed phrases).

### When to Use
- Social apps (decentralized social, reputation systems)
- Gaming with on-chain assets
- Loyalty / rewards programs
- Any app targeting non-crypto users
- Apps where "Sign in with Google" is the onboarding

### Directory Structure
```
my-consumer-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Landing page
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── page.tsx       # OAuth sign-in buttons
│   │   │   └── callback/
│   │   │       └── page.tsx       # OAuth callback handler
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Main app view (authenticated)
│   │   └── api/
│   │       ├── auth/
│   │       │   └── route.ts       # Server-side auth handling
│   │       └── sponsor/
│   │           └── route.ts       # Sponsored transaction endpoint
│   ├── components/
│   │   ├── providers.tsx          # EnokiClientProvider + QueryClientProvider
│   │   ├── AuthButton.tsx         # "Sign in with Google" button
│   │   ├── ActionButton.tsx       # App action (mint, claim, send)
│   │   └── ProfileCard.tsx        # User profile (no wallet address shown)
│   ├── hooks/
│   │   ├── useAuth.ts             # Enoki authentication hook
│   │   ├── useSession.ts          # Session management
│   │   └── useSponsoredTx.ts      # Sponsored transaction hook
│   ├── lib/
│   │   ├── enoki.ts               # Enoki client setup
│   │   ├── transactions.ts        # PTB builders (app actions)
│   │   └── constants.ts           # App config, network, package IDs
│   └── styles/
│       └── globals.css
├── move/                          # Optional: custom on-chain logic
│   ├── Move.toml
│   └── sources/
│       └── app_logic.move         # App-specific on-chain logic (if needed)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── .env.local                     # ENOKI_API_KEY, GOOGLE_CLIENT_ID (do NOT commit)
├── CLAUDE.md
└── .brokenigloo/
    ├── idea-context.md
    └── build-context.md
```

### Key Files Explained

**`src/lib/enoki.ts`** -- Enoki client initialization:
```typescript
import { EnokiClient } from '@mysten/enoki';

export const enokiClient = new EnokiClient({
  apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
});
```

**`src/hooks/useAuth.ts`** -- Authentication via zkLogin:
```typescript
import { useEnokiFlow } from '@mysten/enoki/react';

export function useAuth() {
  const enokiFlow = useEnokiFlow();

  const signIn = () => {
    // Redirects to Google OAuth, returns with zkLogin proof
    enokiFlow.createAuthorizationURL({
      provider: 'google',
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      redirectUrl: `${window.location.origin}/auth/callback`,
    });
  };

  return {
    signIn,
    address: enokiFlow.currentAddress,
    isAuthenticated: !!enokiFlow.currentAddress,
  };
}
```

**`src/hooks/useSponsoredTx.ts`** -- Execute transactions without user paying gas:
```typescript
import { useEnokiFlow } from '@mysten/enoki/react';
import { Transaction } from '@mysten/sui/transactions';

export function useSponsoredTx() {
  const enokiFlow = useEnokiFlow();

  const execute = async (tx: Transaction) => {
    // Enoki sponsors the gas, user signs with zkLogin keypair
    const result = await enokiFlow.sponsorAndExecuteTransaction({
      transaction: tx,
      client: suiClient,
    });
    return result;
  };

  return { execute };
}
```

### Data Flow
```
User clicks "Sign in with Google"
  → OAuth redirect to Google
    → Google returns JWT to /auth/callback
      → Enoki generates zkLogin proof + Sui address
        → User is "logged in" with a Sui address (invisible to them)

User performs action (e.g., "Claim reward")
  → App builds PTB for the action
    → Enoki sponsors the transaction (gas is free for user)
      → zkLogin keypair signs the transaction
        → Transaction executes on Sui
          → App updates UI (user sees "Reward claimed!")
          → User never saw: wallet, gas, transaction hash
```

### Build & Deploy Commands
```bash
pnpm dev                          # Start dev server
pnpm build                        # Production build

# Move (if custom modules exist)
cd move && sui move build
cd move && sui move test
sui client publish --gas-budget 100000000
```

### Critical Configuration
- **Enoki API key**: Obtain from https://docs.enoki.mystenlabs.com/
- **Google OAuth Client ID**: Set up in Google Cloud Console
- **Redirect URI**: Must match exactly in both Google Console and Enoki dashboard
- **Never expose** `ENOKI_SECRET_KEY` on the client side -- use `.env.local` and server-side API routes

---

## Pattern 5: AI Agent App

**Agent framework + Sui SDK + DeFi protocol SDKs**

For building AI agents that autonomously or semi-autonomously interact with Sui DeFi protocols.

### When to Use
- DeFi automation (auto-rebalancing, yield farming)
- Trading bots with AI decision-making
- Chatbot with DeFi action capabilities ("swap 10 SUI to USDC")
- Portfolio management agents
- Research/analysis agents that also execute trades

### Directory Structure
```
my-sui-agent/
├── src/
│   ├── index.ts                   # Entry point
│   ├── agent/
│   │   ├── agent.ts               # Agent configuration and initialization
│   │   ├── tools.ts               # Tool definitions (swap, lend, stake, etc.)
│   │   ├── prompts.ts             # System prompts and persona
│   │   └── memory.ts              # Conversation/state memory
│   ├── protocols/
│   │   ├── swap.ts                # 7K / Cetus swap integration
│   │   ├── lending.ts             # Scallop / Suilend integration
│   │   ├── staking.ts             # LST integration (afSUI, sSUI)
│   │   └── deepbook.ts            # DeepBook order book integration
│   ├── wallet/
│   │   ├── keypair.ts             # Agent's keypair management
│   │   └── signer.ts              # Transaction signing logic
│   ├── lib/
│   │   ├── sui-client.ts          # SuiClient setup
│   │   ├── constants.ts           # Package IDs, token types, config
│   │   └── utils.ts               # Balance formatting, error handling
│   └── ui/                        # Optional: chat UI
│       ├── app/
│       │   └── page.tsx           # Chat interface
│       └── components/
│           ├── ChatWindow.tsx
│           └── ActionCard.tsx     # Displays agent actions to user
├── scripts/
│   ├── run-agent.ts               # Run agent in CLI mode
│   └── fund-agent.ts              # Send SUI to agent wallet
├── .env                           # AGENT_PRIVATE_KEY, RPC_URL, API keys (do NOT commit)
├── package.json
├── tsconfig.json
├── CLAUDE.md
└── .brokenigloo/
    ├── idea-context.md
    └── build-context.md
```

### Key Files Explained

**`src/agent/agent.ts`** -- Agent setup with LangChain or Vercel AI:
```typescript
// Using PelagosAI Sui Agent Kit
import { SuiAgentKit } from '@pelagosai/sui-agent-kit';
import { ChatOpenAI } from '@langchain/openai';

const agentKit = new SuiAgentKit({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  rpcUrl: process.env.SUI_RPC_URL!,
});

const llm = new ChatOpenAI({ model: 'gpt-4o' });

// Agent can now: swap tokens, check balances, supply to lending, etc.
```

**`src/agent/tools.ts`** -- Define tools the AI agent can call:
```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const swapTool = new DynamicStructuredTool({
  name: 'swap_tokens',
  description: 'Swap one token for another on Sui using best available rate',
  schema: z.object({
    tokenIn: z.string().describe('Input token type (e.g., 0x2::sui::SUI)'),
    tokenOut: z.string().describe('Output token type'),
    amount: z.string().describe('Amount to swap in base units'),
  }),
  func: async ({ tokenIn, tokenOut, amount }) => {
    // Call 7K aggregator for best route
    const result = await agentKit.swap(tokenIn, tokenOut, amount);
    return JSON.stringify(result);
  },
});
```

**`src/wallet/keypair.ts`** -- Agent wallet management:
```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export function getAgentKeypair(): Ed25519Keypair {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error('AGENT_PRIVATE_KEY not set');
  return Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
}

// IMPORTANT: Use a dedicated keypair for the agent
// NEVER use a personal wallet's private key
// Fund the agent wallet with only what it needs
```

### Data Flow
```
User message ("Swap 10 SUI for USDC")
  → LLM interprets intent
    → LLM selects tool: swap_tokens
      → Tool calls 7K SDK for best route
        → Agent's keypair signs the transaction
          → Transaction executes on Sui
            → Tool returns result to LLM
              → LLM formats response ("Swapped 10 SUI for 24.5 USDC")
                → Response displayed to user

Autonomous mode (no user input):
  Agent polls portfolio state
    → LLM evaluates rebalancing strategy
      → Executes trades if criteria met
        → Logs actions for audit trail
```

### MCP-Based Alternative (No Custom Code)

For Claude Code integration, install the MCP server directly:
```bash
npx -y @anthropic-ai/claude-code mcp add sui-agent-kit -- npx -y sui-agent-kit-mcp
```
This gives Claude tools for Suilend, STEAMM, and SpringSui without writing any agent code.

### Build & Run Commands
```bash
pnpm build                        # Compile TypeScript
pnpm start                        # Run agent
npx tsx src/index.ts               # Run in dev mode

# Or with specific scripts
npx tsx scripts/run-agent.ts       # CLI agent mode
npx tsx scripts/fund-agent.ts      # Fund agent wallet
```

### Security Considerations
- Store agent private keys in environment variables or a secrets manager. Never hardcode.
- Set transaction limits in the agent logic (max swap amount, max position size).
- Use a dedicated wallet funded only with operational amounts.
- Log all agent transactions for audit trail.
- Consider a "dry run" mode that simulates but does not execute trades.
- For production, add a human-in-the-loop approval step for large transactions.

---

## Pattern Comparison Matrix

| Factor | Full-Stack | Move-Only | Integration | Consumer | AI Agent |
|--------|-----------|-----------|-------------|----------|----------|
| Custom Move code | Yes | Yes | No | Optional | No (usually) |
| Frontend | React (Next/Vite) | No | React (Next/Vite) | Next.js | Optional (chat UI) |
| Wallet | dApp Kit | Keypair/CLI | dApp Kit | Enoki/zkLogin | Agent keypair |
| Target user | Crypto-native | Developers | Crypto-native | Mainstream | Developers/automated |
| Gas handling | User pays | Script pays | User pays | Sponsored | Agent pays |
| Complexity | High | Medium | Medium | Medium-High | Medium-High |
| Time to MVP | 2-4 weeks | 1-2 weeks | 1-2 weeks | 2-3 weeks | 1-2 weeks |
| Example | Custom DEX | Lending protocol | Swap aggregator UI | Social app | DeFi bot |

---

## Choosing the Right Pattern

```
What are you building?
│
├─ Need custom on-chain logic + user-facing UI?
│  └─ Pattern 1: Full-Stack dApp
│
├─ Building a protocol for other devs to integrate?
│  └─ Pattern 2: Move-Only Protocol
│
├─ Composing existing protocols with a frontend?
│  └─ Pattern 3: Integration App
│
├─ Targeting non-crypto mainstream users?
│  └─ Pattern 4: Consumer App
│
└─ Building an AI-powered DeFi agent?
   └─ Pattern 5: AI Agent App
```

### Hybrid Patterns

Some projects combine multiple patterns:

- **Consumer DeFi app** = Pattern 4 (consumer auth) + Pattern 3 (protocol integration)
  - zkLogin onboarding + composing existing DeFi protocols
- **Full-stack with agent** = Pattern 1 (custom Move) + Pattern 5 (AI agent)
  - Custom protocol + AI agent for automated management
- **Protocol with dashboard** = Pattern 2 (Move protocol) + Pattern 3 (integration frontend)
  - Custom on-chain logic + frontend that also integrates other protocols
