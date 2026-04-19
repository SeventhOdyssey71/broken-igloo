---
name: build-agent
description: "Build an AI agent that interacts with Sui DeFi. Covers LangChain and Vercel AI SDK integration, tool definitions for on-chain actions, wallet management, safety guardrails, and autonomous DeFi strategies. Triggers: ai agent, agent, langchain sui, vercel ai sui, defi agent, autonomous agent, ai wallet, agent tool"
---

```bash
# Telemetry preamble
SKILL_NAME="build-agent"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui AI agent architect. Your job is to guide the user through building AI agents that can autonomously interact with the Sui blockchain — querying balances, executing swaps, managing DeFi positions, and more. You integrate LLMs (via LangChain, Vercel AI SDK, or direct API calls) with Sui TypeScript SDK tools, wrapped in safety guardrails to prevent catastrophic mistakes.

**Agent architecture on Sui:**
- **LLM Core**: Processes natural language instructions and decides which tools to call
- **Tool Layer**: TypeScript functions that wrap Sui SDK operations (swap, stake, transfer, query)
- **Wallet Layer**: Manages keypairs and transaction signing with spending limits
- **Safety Layer**: Guardrails that validate actions before execution (amount limits, allowlists, confirmation)

## Workflow

### Step 1: Install Dependencies

```bash
# For Vercel AI SDK approach
npm i ai @ai-sdk/anthropic @mysten/sui zod

# For LangChain approach
npm i langchain @langchain/anthropic @langchain/core @mysten/sui zod
```

### Step 2: Define Sui Tools (Vercel AI SDK)

```typescript
import { tool } from "ai";
import { z } from "zod";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.AGENT_MNEMONIC!);
const agentAddress = keypair.getPublicKey().toSuiAddress();

// === Tool: Get Balance ===
const getBalanceTool = tool({
  description: "Get the SUI balance or any token balance for an address",
  parameters: z.object({
    address: z.string().optional().describe("Sui address (defaults to agent wallet)"),
    coinType: z.string().optional().describe("Coin type (defaults to SUI)"),
  }),
  execute: async ({ address, coinType }) => {
    const targetAddress = address || agentAddress;
    const targetCoinType = coinType || "0x2::sui::SUI";

    const balance = await client.getBalance({
      owner: targetAddress,
      coinType: targetCoinType,
    });

    const decimals = targetCoinType.includes("usdc") ? 6 : 9;
    const humanAmount = Number(balance.totalBalance) / 10 ** decimals;

    return {
      address: targetAddress,
      coinType: targetCoinType,
      rawBalance: balance.totalBalance,
      humanReadable: humanAmount.toFixed(decimals === 6 ? 2 : 4),
    };
  },
});

// === Tool: Transfer SUI ===
const transferSuiTool = tool({
  description: "Transfer SUI to another address. Amount is in SUI (not MIST).",
  parameters: z.object({
    recipient: z.string().describe("Recipient Sui address"),
    amount: z.number().positive().describe("Amount in SUI"),
  }),
  execute: async ({ recipient, amount }) => {
    // Safety guardrail: max transfer limit
    if (amount > 10) {
      return { error: "Transfer exceeds safety limit of 10 SUI. Request manual approval." };
    }

    const amountMist = BigInt(Math.round(amount * 1_000_000_000));
    const tx = new Transaction();
    tx.transferObjects(
      [tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)])],
      tx.pure.address(recipient),
    );

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    return {
      success: true,
      digest: result.digest,
      amount: `${amount} SUI`,
      recipient,
    };
  },
});

// === Tool: Swap Tokens ===
const swapTokensTool = tool({
  description: "Swap tokens on Sui DEX. Specify input coin, output coin, and amount.",
  parameters: z.object({
    fromCoin: z.string().describe("Input coin type (e.g., '0x2::sui::SUI')"),
    toCoin: z.string().describe("Output coin type"),
    amount: z.number().positive().describe("Amount of input token to swap"),
  }),
  execute: async ({ fromCoin, toCoin, amount }) => {
    // Safety: max swap limit
    if (amount > 100) {
      return { error: "Swap exceeds safety limit. Request manual approval." };
    }

    // Use 7K or Cetus aggregator for best route
    // (simplified — in production, use the actual aggregator SDK)
    const decimals = fromCoin.includes("usdc") ? 6 : 9;
    const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

    return {
      status: "swap_executed",
      fromCoin,
      toCoin,
      amountIn: amount,
      // In production, return actual swap result
      note: "Integrate with 7K or Cetus aggregator SDK for actual execution",
    };
  },
});

// === Tool: Query DeFi Position ===
const queryPositionTool = tool({
  description: "Query DeFi positions (lending, staking, LP) for an address",
  parameters: z.object({
    protocol: z.enum(["suilend", "navi", "scallop", "cetus", "aftermath"]),
    address: z.string().optional(),
  }),
  execute: async ({ protocol, address }) => {
    const targetAddress = address || agentAddress;

    // Query owned objects filtered by protocol types
    const objects = await client.getOwnedObjects({
      owner: targetAddress,
      options: { showType: true, showContent: true },
    });

    return {
      address: targetAddress,
      protocol,
      positions: objects.data.slice(0, 10).map((o) => ({
        objectId: o.data?.objectId,
        type: o.data?.type,
      })),
    };
  },
});

// === Tool: Get Transaction History ===
const getHistoryTool = tool({
  description: "Get recent transaction history for an address",
  parameters: z.object({
    address: z.string().optional(),
    limit: z.number().optional().default(5),
  }),
  execute: async ({ address, limit }) => {
    const targetAddress = address || agentAddress;
    const txns = await client.queryTransactionBlocks({
      filter: { FromAddress: targetAddress },
      limit,
      options: { showEffects: true, showInput: true },
    });

    return txns.data.map((tx) => ({
      digest: tx.digest,
      timestamp: tx.timestampMs,
      status: tx.effects?.status?.status,
    }));
  },
});
```

### Step 3: Build the Agent (Vercel AI SDK)

```typescript
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const tools = {
  getBalance: getBalanceTool,
  transferSui: transferSuiTool,
  swapTokens: swapTokensTool,
  queryPosition: queryPositionTool,
  getHistory: getHistoryTool,
};

async function runAgent(userMessage: string) {
  const result = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    tools,
    maxSteps: 10, // Allow multi-step reasoning
    system: `You are a DeFi agent managing a Sui wallet.
Your address is: ${agentAddress}

Rules:
- Always check balance before transfers or swaps
- Never transfer more than 10 SUI without explicit user confirmation
- Always explain what you are about to do before executing
- If unsure, ask for clarification instead of guessing
- Report transaction digests after every on-chain action`,
    prompt: userMessage,
  });

  return result.text;
}

// Example usage
const response = await runAgent("What's my SUI balance? If I have more than 5 SUI, swap 1 SUI to USDC.");
console.log(response);
```

### Step 4: Build the Agent (LangChain)

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-20250514",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Wrap Sui tools for LangChain
const langchainTools = [
  new DynamicStructuredTool({
    name: "get_balance",
    description: "Get SUI or token balance for an address",
    schema: z.object({
      address: z.string().optional(),
      coinType: z.string().optional(),
    }),
    func: async ({ address, coinType }) => {
      const result = await getBalanceTool.execute({ address, coinType });
      return JSON.stringify(result);
    },
  }),
  new DynamicStructuredTool({
    name: "transfer_sui",
    description: "Transfer SUI to an address",
    schema: z.object({
      recipient: z.string(),
      amount: z.number(),
    }),
    func: async ({ recipient, amount }) => {
      const result = await transferSuiTool.execute({ recipient, amount });
      return JSON.stringify(result);
    },
  }),
];

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a DeFi agent managing Sui wallet {address}. Be careful with funds."],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({ llm: model, tools: langchainTools, prompt });
const executor = new AgentExecutor({ agent, tools: langchainTools });

const result = await executor.invoke({
  input: "Check my balance and send 0.5 SUI to 0x123...",
  address: agentAddress,
});
```

### Step 5: Safety Guardrails

```typescript
// === Spending Limits ===
interface SpendingLimits {
  maxSingleTransfer: bigint;   // Max per transaction
  maxDailySpend: bigint;       // Max per 24h
  allowedRecipients?: string[]; // Allowlist (optional)
  allowedProtocols?: string[];  // DEXs/protocols allowed
  requireConfirmation: bigint;  // Amount threshold requiring human approval
}

const SAFETY_CONFIG: SpendingLimits = {
  maxSingleTransfer: BigInt("10000000000"),   // 10 SUI
  maxDailySpend: BigInt("50000000000"),       // 50 SUI per day
  requireConfirmation: BigInt("5000000000"),  // Confirm above 5 SUI
};

let dailySpend = BigInt(0);
let lastResetDate = new Date().toDateString();

function validateTransaction(amountMist: bigint, recipient?: string): {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
} {
  // Reset daily counter
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySpend = BigInt(0);
    lastResetDate = today;
  }

  if (amountMist > SAFETY_CONFIG.maxSingleTransfer) {
    return { allowed: false, reason: "Exceeds single transaction limit", requiresConfirmation: false };
  }

  if (dailySpend + amountMist > SAFETY_CONFIG.maxDailySpend) {
    return { allowed: false, reason: "Exceeds daily spending limit", requiresConfirmation: false };
  }

  if (SAFETY_CONFIG.allowedRecipients && recipient) {
    if (!SAFETY_CONFIG.allowedRecipients.includes(recipient)) {
      return { allowed: false, reason: "Recipient not in allowlist", requiresConfirmation: false };
    }
  }

  const requiresConfirmation = amountMist > SAFETY_CONFIG.requireConfirmation;

  return { allowed: true, requiresConfirmation };
}
```

### Step 6: Handoff

- "I need the agent to swap via DEX" -> route to `integrate-7k` or `integrate-cetus`
- "Set up wallet infrastructure" -> route to `integrate-shinami`
- "I want gas sponsorship for agent txs" -> route to `build-sponsored-app`
- "Deploy agent as a service" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **ALWAYS implement spending limits** — AI agents MUST have per-transaction and daily spending caps. An unconstrained agent with wallet access is a liability.
2. **NEVER hardcode mnemonics in source code** — use environment variables or a secrets manager. Rotate keys regularly.
3. **ALWAYS validate before executing** — check balances, verify addresses, and confirm amounts before signing transactions.
4. **Require human confirmation for large transactions** — any transaction above a threshold should pause and request explicit user approval.
5. **Log every action** — maintain an audit trail of every tool call, transaction, and decision the agent makes.
6. **Use allowlists for recipients and protocols** — restrict which addresses the agent can send to and which protocols it can interact with.
7. **Handle errors gracefully** — failed transactions should be reported clearly, not silently retried. Implement exponential backoff for network issues.
8. **Test with testnet first** — always develop and test agents on testnet before giving them mainnet wallet access.
9. **Separate agent wallet from user wallet** — the agent should have its own funded wallet with limited balance, not access to the user's main wallet.

## References

- Vercel AI SDK: https://sdk.vercel.ai
- LangChain JS: https://js.langchain.com
- Sui TypeScript SDK: https://sdk.mystenlabs.com/typescript
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
