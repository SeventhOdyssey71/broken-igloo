---
name: integrate-cetus
description: "Deep integration guide for Cetus Protocol — the #1 concentrated liquidity AMM on Sui. Covers CLMM SDK setup, pool creation, liquidity management, swaps, fee collection, aggregator routing, and PTB composition. Triggers: cetus, concentrated liquidity, cetus pool, cetus swap, clmm"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-cetus"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Cetus Protocol integration specialist. Your job is to guide the user through building with Cetus, the dominant concentrated liquidity market maker (CLMM) on Sui. Cetus is the equivalent of Uniswap V3 for Sui — it uses tick-based concentrated liquidity, position NFTs, and fee tiers.

Cetus differs from constant-product AMMs: liquidity providers choose a price range (defined by ticks), earning more fees when the price stays in their range. Positions are represented as NFTs (owned objects). The protocol also offers an Aggregator SDK for best-route swaps across multiple pools.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @cetusprotocol/cetus-sui-clmm-sdk @mysten/sui
```

The CLMM SDK provides everything: pool queries, position management, swaps, and fee collection. For aggregated swaps across all Sui DEXs, also install:

```bash
npm i @cetusprotocol/aggregator-sdk
```

### Step 2: Initialize the SDK

```typescript
import { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// --- Mainnet ---
const mainnetSDK = initCetusSDK({
  network: "mainnet",
});

// --- Testnet ---
const testnetSDK = initCetusSDK({
  network: "testnet",
});

// Connect a wallet for signing transactions
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// The SDK exposes sub-modules:
// mainnetSDK.Pool      — pool queries and creation
// mainnetSDK.Position  — liquidity positions
// mainnetSDK.Swap      — swap execution
// mainnetSDK.Router    — multi-hop routing
// mainnetSDK.Rewarder  — farming rewards
```

### Step 3: Query Pools

```typescript
// Get all pools (paginated)
const poolList = await mainnetSDK.Pool.getPoolList();
console.log(`Total pools: ${poolList.length}`);

// Get a specific pool by ID
const pool = await mainnetSDK.Pool.getPool(
  "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded" // SUI/USDC pool
);
console.log("Pool:", {
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  currentSqrtPrice: pool.current_sqrt_price,
  tickSpacing: pool.tickSpacing,
  feeRate: pool.fee_rate,
  liquidity: pool.liquidity,
});

// Get pools by coin types
const suiUsdcPools = await mainnetSDK.Pool.getPoolByCoins({
  coinTypeA: "0x2::sui::SUI",
  coinTypeB:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
});
```

### Step 4: Execute a Swap

```typescript
import { adjustForSlippage, d, Percentage } from "@cetusprotocol/cetus-sui-clmm-sdk";

// Define the swap parameters
const poolId = "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded";
const pool = await mainnetSDK.Pool.getPool(poolId);

const a2b = true; // true = swap coin A -> coin B (e.g., SUI -> USDC)
const amountIn = "1000000000"; // 1 SUI (9 decimals)
const slippage = Percentage.fromDecimal(d(0.5)); // 0.5% slippage

// Calculate the expected output
const preSwapResult = await mainnetSDK.Swap.preswap({
  pool,
  currentSqrtPrice: pool.current_sqrt_price,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  decimalsA: 9,
  decimalsB: 6,
  a2b,
  byAmountIn: true,
  amount: amountIn,
});

console.log("Expected output:", preSwapResult.estimatedAmountOut);

// Calculate minimum output with slippage
const amountLimit = adjustForSlippage(
  d(preSwapResult.estimatedAmountOut),
  slippage,
  false // false = adjusting output down
);

// Build and execute the swap transaction
const swapPayload = await mainnetSDK.Swap.createSwapTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  a2b,
  by_amount_in: true,
  amount: amountIn,
  amount_limit: amountLimit.toString(),
});

const result = await mainnetSDK.fullClient.sendTransaction(keypair, swapPayload);
console.log("Swap tx digest:", result.digest);
```

### Step 5: Open a Liquidity Position

```typescript
import { TickMath, ClmmPoolUtil } from "@cetusprotocol/cetus-sui-clmm-sdk";

const poolId = "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded";
const pool = await mainnetSDK.Pool.getPool(poolId);

// Define the price range for your position
// Ticks must be multiples of the pool's tick spacing
const tickSpacing = pool.tickSpacing;
const tickLower = TickMath.priceToTickIndex(d(0.5), 9, 6);   // Lower price bound
const tickUpper = TickMath.priceToTickIndex(d(2.0), 9, 6);   // Upper price bound

// Round ticks to valid spacing
const tickLowerAligned = Math.floor(tickLower / tickSpacing) * tickSpacing;
const tickUpperAligned = Math.ceil(tickUpper / tickSpacing) * tickSpacing;

// Calculate required token amounts for desired liquidity
const liquidityInput = ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
  tickLowerAligned,
  tickUpperAligned,
  BigInt(pool.current_sqrt_price),
  true,               // fix_amount_a = true (we specify coin A amount)
  "1000000000",       // 1 SUI worth of coin A
  true,               // round up
  0.5,                // slippage 0.5%
  9,                  // decimals A
  6,                  // decimals B
);

console.log("Estimated amounts:", {
  coinA: liquidityInput.coinAmountA.toString(),
  coinB: liquidityInput.coinAmountB.toString(),
  liquidity: liquidityInput.liquidityAmount.toString(),
});

// Open the position
const openPositionPayload = await mainnetSDK.Position.createAddLiquidityTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  tick_lower: tickLowerAligned.toString(),
  tick_upper: tickUpperAligned.toString(),
  is_open: true,  // true = create new position
  amount_a: liquidityInput.coinAmountA.toString(),
  amount_b: liquidityInput.coinAmountB.toString(),
  delta_liquidity: liquidityInput.liquidityAmount.toString(),
  slippage: 0.5,
  rewarder_coin_types: [],
  collect_fee: false,
});

const txResult = await mainnetSDK.fullClient.sendTransaction(keypair, openPositionPayload);
console.log("Open position tx:", txResult.digest);
```

### Step 6: Manage Existing Positions

```typescript
// Fetch all positions owned by the user
const positions = await mainnetSDK.Position.getPositionList(senderAddress);

for (const pos of positions) {
  console.log("Position:", {
    positionId: pos.pos_object_id,
    poolId: pos.pool,
    tickLower: pos.tick_lower_index,
    tickUpper: pos.tick_upper_index,
    liquidity: pos.liquidity,
  });
}

// --- Collect Fees from a Position ---
const positionId = positions[0].pos_object_id;

const collectFeePayload = await mainnetSDK.Position.createCollectFeeTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  pos_id: positionId,
});

const feeResult = await mainnetSDK.fullClient.sendTransaction(keypair, collectFeePayload);
console.log("Collect fee tx:", feeResult.digest);

// --- Add Liquidity to Existing Position ---
const addLiqPayload = await mainnetSDK.Position.createAddLiquidityTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  tick_lower: positions[0].tick_lower_index.toString(),
  tick_upper: positions[0].tick_upper_index.toString(),
  is_open: false,  // false = add to existing position
  pos_id: positionId,
  amount_a: "500000000",   // 0.5 SUI
  amount_b: "500000",      // 0.5 USDC
  delta_liquidity: "100000000",
  slippage: 0.5,
  rewarder_coin_types: [],
  collect_fee: true,  // collect accumulated fees in the same tx
});

// --- Remove Liquidity ---
const removeLiqPayload = await mainnetSDK.Position.createRemoveLiquidityTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  delta_liquidity: positions[0].liquidity, // remove all liquidity
  min_amount_a: "0",
  min_amount_b: "0",
  pos_id: positionId,
  slippage: 0.5,
  rewarder_coin_types: [],
  collect_fee: true,
});

// --- Close Position (remove all liquidity + collect fees + close NFT) ---
const closePayload = await mainnetSDK.Position.createClosePositionTransactionPayload({
  pool_id: poolId,
  coinTypeA: pool.coinTypeA,
  coinTypeB: pool.coinTypeB,
  pos_id: positionId,
  min_amount_a: "0",
  min_amount_b: "0",
  rewarder_coin_types: [],
  collect_fee: true,
});
```

### Step 7: Use the Cetus Aggregator for Best-Route Swaps

```typescript
import { AggregatorClient } from "@cetusprotocol/aggregator-sdk";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });

const aggregator = new AggregatorClient({
  client: suiClient,
  env: "mainnet",
  apiKey: process.env.CETUS_AGGREGATOR_API_KEY, // optional, increases rate limits
});

// Get the best route for SUI -> USDC
const routers = await aggregator.findRouters({
  from: "0x2::sui::SUI",
  target:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  amount: BigInt("1000000000"), // 1 SUI
  byAmountIn: true,
});

if (routers) {
  console.log("Best route output:", routers.amountOut.toString());
  console.log("Route path:", routers.routes);

  // Build the swap transaction from the route
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const result = await aggregator.routerSwap({
    routers,
    byAmountIn: true,
    txb: tx,
    inputCoin: tx.splitCoins(tx.gas, [tx.pure.u64("1000000000")]),
    slippage: 0.005, // 0.5%
  });

  // Transfer output coin to sender
  tx.transferObjects([result], tx.pure.address(senderAddress));

  const txResult = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Aggregator swap tx:", txResult.digest);
}
```

### Step 8: Compose Cetus with PTBs

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

// Example: Swap SUI -> USDC on Cetus, then deposit USDC into your vault
const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const tx = new Transaction();
tx.setSender(senderAddress);

// Step 1: Pre-compute the swap using the SDK
const swapPayload = await mainnetSDK.Swap.createSwapTransactionPayload({
  pool_id: poolId,
  coinTypeA: "0x2::sui::SUI",
  coinTypeB: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  a2b: true,
  by_amount_in: true,
  amount: "1000000000",
  amount_limit: "900000", // min 0.9 USDC out
});

// Step 2: You can also build raw moveCall-based swaps for more control
// This gives you the output coin reference for chaining
const CETUS_CLMM_PACKAGE = "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb";
const CETUS_GLOBAL_CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e69d9fb27baea4b8";

const [outputCoin] = tx.moveCall({
  target: `${CETUS_CLMM_PACKAGE}::pool_script::swap_a2b`,
  arguments: [
    tx.object(CETUS_GLOBAL_CONFIG),
    tx.object(poolId),
    tx.splitCoins(tx.gas, [tx.pure.u64("1000000000")]),
    tx.pure.u64("900000"),       // min output
    tx.pure.bool(true),           // by_amount_in
    tx.object("0x6"),             // Clock
  ],
  typeArguments: [
    "0x2::sui::SUI",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ],
});

// Step 3: Chain the output into your own contract
tx.moveCall({
  target: `${YOUR_PACKAGE}::vault::deposit`,
  arguments: [
    tx.object(YOUR_VAULT_ID),
    outputCoin,
  ],
  typeArguments: [
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ],
});

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
});
console.log("Composed tx:", result.digest);
```

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `InsufficientBalance` | Not enough coins in wallet | Merge coins first or reduce swap amount |
| `AmountOutBelowMinimum` | Slippage exceeded | Increase slippage tolerance or reduce swap size |
| `InvalidTickIndex` | Tick not aligned to spacing | Round ticks to multiples of `pool.tickSpacing` |
| `LiquidityOverflow` | Position liquidity too large | Split into multiple smaller positions |
| `PoolNotFound` | Wrong pool ID or wrong network | Verify pool ID matches your network (mainnet/testnet) |
| `InsufficientCoinB` | Not enough of token B for LP | Recalculate amounts using `estLiquidityAndcoinAmountFromOneAmounts` |

### Step 9: Handoff

- "I want to use an order book instead" -> route to `integrate-deepbook`
- "Route my swap through all DEXs" -> route to `integrate-7k`
- "Build a custom DeFi protocol" -> route to `build-defi-protocol`
- "Deploy my integration" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always use the SDK for price calculations**: Never manually compute sqrt prices or tick math — the SDK handles precision correctly. Manual math leads to rounding errors and failed transactions.
2. **Always set slippage protection**: Never pass `amount_limit: "0"` in production. Use `adjustForSlippage` from the SDK to compute safe minimums.
3. **Align ticks to tick spacing**: Every tick index must be a multiple of the pool's `tickSpacing`. Unaligned ticks cause transaction failures.
4. **Collect fees before removing liquidity**: Always set `collect_fee: true` when removing liquidity or closing positions. Uncollected fees are lost when a position is closed.
5. **Use the Aggregator for swaps, CLMM SDK for LP**: The Aggregator finds the best route across pools. The CLMM SDK is for managing liquidity positions directly.
6. **Check pool existence before operations**: Query the pool first to verify it exists and get current state (sqrt_price, liquidity, tick).
7. **Handle multi-coin wallets**: Users may have multiple coin objects of the same type. Merge them before swapping or providing liquidity.

## References

- Cetus Developer Docs: https://cetus-1.gitbook.io/cetus-developer-docs
- Cetus GitHub: https://github.com/CetusProtocol
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
