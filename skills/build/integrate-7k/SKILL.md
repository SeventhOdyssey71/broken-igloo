---
name: integrate-7k
description: "Deep integration guide for 7K Aggregator — the meta-DEX aggregator on Sui that routes swaps across all DEXs for best pricing. Covers quote fetching, swap building, slippage protection, PTB composition, and error handling. Triggers: 7k, 7k aggregator, swap aggregator, best swap rate, dex aggregator"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-7k"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a 7K Aggregator integration specialist. Your job is to guide the user through building with 7K, the meta-DEX aggregator on Sui. 7K aggregates liquidity from every major Sui DEX — Cetus, DeepBook, FlowX, Turbos, Aftermath, and more — to find the optimal swap route for any token pair.

Think of 7K as the "1inch" of Sui. Instead of integrating each DEX separately, you call 7K once and it splits your trade across multiple pools and protocols to get the best execution price. This is the **default choice for any swap integration** on Sui.

Key concepts:
- **Quote**: An off-chain price quote that finds the best route across all Sui DEXs.
- **Swap Transaction**: A PTB built from the quote that executes the swap on-chain.
- **Slippage**: The maximum acceptable deviation from the quoted price.
- **Routes**: The path(s) the swap takes — may split across multiple DEXs for better pricing.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @7kprotocol/sdk-ts @mysten/sui
```

### Step 2: Initialize the SDK

```typescript
import { SevenKSDK } from "@7kprotocol/sdk-ts";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Initialize the 7K SDK
const sdk = new SevenKSDK();

// Common coin types for reference
const SUI_TYPE = "0x2::sui::SUI";
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDT_TYPE = "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN";
const DEEP_TYPE = "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP";
```

### Step 3: Get a Swap Quote

```typescript
// Get a quote for swapping SUI to USDC
async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
) {
  const quote = await sdk.getQuote({
    tokenIn,
    tokenOut,
    amountIn, // In smallest units (MIST for SUI, micro for USDC)
  });

  console.log({
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    routes: quote.routes,
    priceImpact: quote.priceImpact,
  });

  return quote;
}

// Quote: Swap 1 SUI to USDC
const quote = await getSwapQuote(SUI_TYPE, USDC_TYPE, "1000000000"); // 1 SUI in MIST
console.log(`1 SUI = ~${Number(quote.amountOut) / 1e6} USDC`);

// Quote: Swap 100 USDC to SUI
const reverseQuote = await getSwapQuote(USDC_TYPE, SUI_TYPE, "100000000"); // 100 USDC
console.log(`100 USDC = ~${Number(reverseQuote.amountOut) / 1e9} SUI`);

// Quote: Swap SUI to DEEP
const deepQuote = await getSwapQuote(SUI_TYPE, DEEP_TYPE, "10000000000"); // 10 SUI
console.log(`10 SUI = ~${Number(deepQuote.amountOut) / 1e9} DEEP`);
```

### Step 4: Execute a Swap

```typescript
// Complete swap flow: quote -> build -> sign -> execute
async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number = 50 // 0.5% default
) {
  // Step 1: Get quote
  const quote = await sdk.getQuote({
    tokenIn,
    tokenOut,
    amountIn,
  });

  console.log("Quote received:");
  console.log(`  Input:  ${quote.amountIn} (${tokenIn.split("::").pop()})`);
  console.log(`  Output: ${quote.amountOut} (${tokenOut.split("::").pop()})`);

  // Step 2: Build the swap transaction
  const tx = await sdk.buildSwapTransaction(quote, senderAddress, {
    slippage: slippageBps / 10000, // convert bps to decimal
  });

  // Step 3: Sign and execute
  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
      showBalanceChanges: true,
    },
  });

  console.log("Swap executed:", result.digest);
  console.log("Balance changes:", result.balanceChanges);

  return result;
}

// Swap 1 SUI to USDC
await executeSwap(SUI_TYPE, USDC_TYPE, "1000000000");

// Swap 50 USDC to SUI with tighter slippage (0.1%)
await executeSwap(USDC_TYPE, SUI_TYPE, "50000000", 10);
```

### Step 5: Build a Swap Interface

```typescript
// Complete swap interface with validation and error handling
async function swap(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps?: number;
  senderAddress: string;
}): Promise<{ digest: string; amountOut: string } | { error: string }> {
  const { tokenIn, tokenOut, amountIn, slippageBps = 50, senderAddress } = params;

  // Validate input
  if (BigInt(amountIn) <= 0n) {
    return { error: "Amount must be greater than 0" };
  }

  if (tokenIn === tokenOut) {
    return { error: "Cannot swap a token to itself" };
  }

  try {
    // Step 1: Get quote
    const quote = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn,
    });

    if (!quote || BigInt(quote.amountOut) === 0n) {
      return { error: "No route found for this swap pair" };
    }

    // Step 2: Check price impact
    const priceImpact = Number(quote.priceImpact || 0);
    if (priceImpact > 5) {
      return {
        error: `Price impact too high: ${priceImpact.toFixed(2)}%. Consider a smaller trade.`,
      };
    }

    // Step 3: Build transaction
    const tx = await sdk.buildSwapTransaction(quote, senderAddress, {
      slippage: slippageBps / 10000,
    });

    // Step 4: Dry run to check for errors
    const dryRun = await suiClient.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: suiClient }),
    });

    if (dryRun.effects.status.status !== "success") {
      return { error: `Dry run failed: ${dryRun.effects.status.error}` };
    }

    // Step 5: Execute
    const result = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showBalanceChanges: true },
    });

    await suiClient.waitForTransaction({ digest: result.digest });

    return {
      digest: result.digest,
      amountOut: quote.amountOut,
    };
  } catch (error: any) {
    return { error: `Swap failed: ${error.message}` };
  }
}

// Usage
const result = await swap({
  tokenIn: SUI_TYPE,
  tokenOut: USDC_TYPE,
  amountIn: "5000000000", // 5 SUI
  slippageBps: 50,
  senderAddress,
});

if ("error" in result) {
  console.error(result.error);
} else {
  console.log(`Swap success! Tx: ${result.digest}, Got: ${result.amountOut}`);
}
```

### Step 6: Compose 7K Swaps with PTBs

```typescript
// Example: Swap SUI -> USDC via 7K, then deposit USDC into a lending protocol
async function swapAndDeposit() {
  // Step 1: Get the 7K quote
  const quote = await sdk.getQuote({
    tokenIn: SUI_TYPE,
    tokenOut: USDC_TYPE,
    amountIn: "10000000000", // 10 SUI
  });

  // Step 2: Build the swap transaction
  // 7K returns a Transaction object that we can extend
  const tx = await sdk.buildSwapTransaction(quote, senderAddress, {
    slippage: 0.005,
  });

  // Step 3: The swap output coin is automatically transferred to the sender.
  // For PTB composition, you may need to use the lower-level API
  // to get a coin reference for chaining.

  // Alternative approach for composition: build a fresh transaction
  // and use raw moveCall for the swap, then chain the output
  const composeTx = new Transaction();
  composeTx.setSender(senderAddress);

  // Split SUI for the swap
  const [swapInput] = composeTx.splitCoins(composeTx.gas, [
    composeTx.pure.u64("10000000000"),
  ]);

  // Add the 7K swap steps (the SDK builds multiple moveCall steps)
  // Then chain with your deposit
  // The exact composition depends on the 7K route

  // For simple cases, execute the swap first, then deposit in a second tx
  // For atomic guarantees, use the lending protocol's SDK builder
  // with a pre-swap step
}

// Example: Build a multi-swap batch
async function batchSwaps() {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Swap 1: 5 SUI -> USDC
  const quote1 = await sdk.getQuote({
    tokenIn: SUI_TYPE,
    tokenOut: USDC_TYPE,
    amountIn: "5000000000",
  });
  const tx1 = await sdk.buildSwapTransaction(quote1, senderAddress, {
    slippage: 0.005,
  });

  // Execute first swap
  const result1 = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx1,
  });
  console.log("Swap 1:", result1.digest);

  // Swap 2: 5 SUI -> DEEP
  const quote2 = await sdk.getQuote({
    tokenIn: SUI_TYPE,
    tokenOut: DEEP_TYPE,
    amountIn: "5000000000",
  });
  const tx2 = await sdk.buildSwapTransaction(quote2, senderAddress, {
    slippage: 0.005,
  });

  const result2 = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx2,
  });
  console.log("Swap 2:", result2.digest);
}
```

### Step 7: Advanced — Token Discovery and Supported Pairs

```typescript
// Get all tokens supported by 7K
async function getSupportedTokens() {
  const tokens = await sdk.getTokenList();

  for (const token of tokens) {
    console.log({
      name: token.name,
      symbol: token.symbol,
      coinType: token.coinType,
      decimals: token.decimals,
    });
  }

  return tokens;
}

// Check if a specific pair has a route
async function checkPairAvailability(tokenIn: string, tokenOut: string) {
  try {
    const quote = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn: "1000000000", // probe amount
    });

    if (quote && BigInt(quote.amountOut) > 0n) {
      console.log(`Pair ${tokenIn} -> ${tokenOut}: Available`);
      console.log(`  Routes: ${quote.routes?.length || 0} paths found`);
      return true;
    }
  } catch {
    console.log(`Pair ${tokenIn} -> ${tokenOut}: No route available`);
  }
  return false;
}
```

### Step 8: Error Handling

```typescript
// Common errors and how to handle them
async function safeSwap(tokenIn: string, tokenOut: string, amountIn: string) {
  try {
    const quote = await sdk.getQuote({ tokenIn, tokenOut, amountIn });

    if (!quote) {
      throw new Error("NO_ROUTE: No swap route found for this pair");
    }

    if (BigInt(quote.amountOut) === 0n) {
      throw new Error("ZERO_OUTPUT: Route found but output is 0 — likely insufficient liquidity");
    }

    const tx = await sdk.buildSwapTransaction(quote, senderAddress, {
      slippage: 0.005,
    });

    const result = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`TX_FAILED: ${result.effects?.status?.error}`);
    }

    return { success: true, digest: result.digest, amountOut: quote.amountOut };

  } catch (error: any) {
    const message = error.message || "Unknown error";

    // Categorize errors
    if (message.includes("NO_ROUTE")) {
      console.error("No route: This token pair may not be supported on any DEX");
    } else if (message.includes("ZERO_OUTPUT")) {
      console.error("Zero output: Not enough liquidity for this trade size");
    } else if (message.includes("InsufficientBalance")) {
      console.error("Insufficient balance: You don't have enough tokens");
    } else if (message.includes("slippage") || message.includes("AmountOut")) {
      console.error("Slippage exceeded: Price moved during execution. Increase slippage or retry.");
    } else if (message.includes("TX_FAILED")) {
      console.error("Transaction failed on-chain:", message);
    } else {
      console.error("Unexpected error:", message);
    }

    return { success: false, error: message };
  }
}
```

### When to Use 7K vs Direct Pool Access

| Use Case | 7K Aggregator | Direct DEX (Cetus/DeepBook) |
|----------|--------------|---------------------------|
| Simple token swaps | **Best choice** — optimal routing | Overkill |
| Best execution price | **Best choice** — splits across DEXs | Single pool only |
| Liquidity provision | Not applicable | **Required** — LP is pool-specific |
| Limit orders | Not applicable | **DeepBook** — native CLOB |
| Building a swap UI | **Best choice** — one integration | Must integrate each DEX |
| PTB composition | Good — output is a coin | More control over intermediate steps |
| Flash loans | Not supported | **DeepBook/Cetus** support flash loans |
| Market making | Not applicable | **DeepBook** — order book trading |

### Step 9: Handoff

- "I need limit orders" -> route to `integrate-deepbook`
- "I want to provide liquidity" -> route to `integrate-cetus`
- "Deposit swap output into lending" -> route to `integrate-suilend` or `integrate-scallop`
- "Build a custom DeFi protocol" -> route to `build-defi-protocol`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **7K is the default for swaps**: Unless the user specifically needs LP management, limit orders, or flash loans, always recommend 7K for token swaps. It will always find the best price.
2. **Always set slippage**: Never execute a swap without slippage protection. Default to 0.5% (50 bps) for stable pairs, 1-3% for volatile pairs.
3. **Check price impact before execution**: If price impact exceeds 2-3%, warn the user. Above 5%, suggest splitting the trade into smaller chunks.
4. **Dry run before executing large swaps**: Use `suiClient.dryRunTransactionBlock` to verify the swap will succeed before signing.
5. **Handle "no route" gracefully**: Not all token pairs have routes. Always handle the case where `getQuote` returns null or zero output.
6. **Amounts are in smallest units**: SUI amounts are in MIST (1 SUI = 1e9 MIST). USDC amounts are in micro-USDC (1 USDC = 1e6). Always convert correctly.
7. **Quotes are ephemeral**: A quote reflects prices at one instant. By the time you execute, prices may have moved. This is why slippage protection matters.

## References

- 7K Docs: https://docs.7k.ag/
- 7K Website: https://7k.ag/
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — protocol catalog
- `skills/data/guides/ptb-cookbook.md` — PTB composition recipes
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
