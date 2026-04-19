---
name: integrate-aftermath
description: "Deep integration guide for Aftermath Finance — DEX aggregation, liquid staking (afSUI), swap router, and liquidity pools on Sui. Covers staking SUI for afSUI, swap routing, pool queries, and PTB composition. Triggers: aftermath, afsui, liquid staking, aftermath swap, aftermath pool, aftermath finance, lst"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-aftermath"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are an Aftermath Finance integration specialist. Aftermath Finance is a major DeFi hub on Sui offering three core products: a **DEX with multi-asset pools** (similar to Balancer), a **liquid staking token (afSUI)**, and a **swap router** that aggregates across multiple DEX venues. Your job is to guide the user through building with Aftermath's TypeScript SDK.

**Key Concepts:**
- **afSUI**: Aftermath's liquid staking token. Users stake SUI and receive afSUI, which accrues staking rewards over time. afSUI is freely tradeable and composable with DeFi protocols.
- **Pools**: Aftermath pools support 2-8 assets with custom weights (like Balancer), enabling more capital-efficient liquidity for correlated assets.
- **Router**: A swap aggregator that finds optimal routes across Aftermath pools, Cetus CLMM, DeepBook, and other Sui DEXs.

## Workflow

### Step 1: Install Dependencies

```bash
npm i aftermath-ts-sdk @mysten/sui
```

The `aftermath-ts-sdk` is the official SDK providing access to all Aftermath products: staking, pools, swaps, routing, and farming.

### Step 2: Initialize the SDK

```typescript
import { Aftermath } from "aftermath-ts-sdk";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Initialize the Aftermath SDK
const af = new Aftermath("MAINNET");
await af.init();

// Access sub-modules
const staking = af.Staking();
const pools = af.Pools();
const router = af.Router();
```

### Step 3: Liquid Staking — Stake SUI for afSUI

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Get current afSUI exchange rate
const stakingPosition = await staking.getStakingPositions();
console.log("afSUI exchange rate:", stakingPosition);

// Stake SUI to receive afSUI
const stakeAmount = BigInt("1000000000"); // 1 SUI (9 decimals)

const stakeTx = await staking.getStakeTransaction({
  walletAddress: senderAddress,
  suiStakeAmount: stakeAmount,
});

const stakeResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: stakeTx,
  options: { showEffects: true },
});
console.log("Stake tx digest:", stakeResult.digest);
```

### Step 4: Unstake afSUI Back to SUI

```typescript
// Unstake afSUI back to SUI
// Note: unstaking may have a delay depending on the epoch
const unstakeAmount = BigInt("950000000"); // amount of afSUI to unstake

const unstakeTx = await staking.getUnstakeTransaction({
  walletAddress: senderAddress,
  afSuiUnstakeAmount: unstakeAmount,
});

const unstakeResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: unstakeTx,
  options: { showEffects: true },
});
console.log("Unstake tx digest:", unstakeResult.digest);
```

### Step 5: Query Pools

```typescript
// Get all Aftermath pools
const allPools = await pools.getAllPools();
console.log(`Total pools: ${allPools.length}`);

for (const pool of allPools.slice(0, 5)) {
  console.log("Pool:", {
    objectId: pool.objectId,
    name: pool.name,
    coins: pool.coins,
    tvl: pool.tvl,
    fees: pool.fees,
  });
}

// Get a specific pool by ID
const poolId = "0x<POOL_OBJECT_ID>";
const pool = await pools.getPool({ objectId: poolId });
console.log("Pool details:", {
  name: pool.name,
  coinTypes: pool.coinTypes,
  balances: pool.balances,
  weights: pool.weights,
  swapFee: pool.swapFee,
});

// Get pool spot price
const spotPrice = await pool.getSpotPrice({
  coinInType: "0x2::sui::SUI",
  coinOutType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
});
console.log("Spot price SUI/USDC:", spotPrice);
```

### Step 6: Execute a Swap via Pool

```typescript
// Direct pool swap (single pool, no routing)
const swapAmount = BigInt("1000000000"); // 1 SUI

const tradeResult = await pool.getTradeAmountOut({
  coinInType: "0x2::sui::SUI",
  coinOutType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  coinInAmount: swapAmount,
});

console.log("Expected output:", tradeResult.coinOutAmount.toString());
console.log("Price impact:", tradeResult.priceImpact);

// Build and execute the swap transaction
const swapTx = await pool.getSwapTransaction({
  walletAddress: senderAddress,
  coinInType: "0x2::sui::SUI",
  coinOutType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  coinInAmount: swapAmount,
  slippage: 0.005, // 0.5%
});

const swapResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: swapTx,
  options: { showEffects: true },
});
console.log("Swap tx:", swapResult.digest);
```

### Step 7: Use the Router for Best-Route Swaps

```typescript
// The router finds optimal paths across multiple DEXs on Sui
// (Aftermath pools, Cetus, DeepBook, etc.)
const routeResult = await router.getCompleteTradeRouteGivenAmountIn({
  coinInType: "0x2::sui::SUI",
  coinOutType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  coinInAmount: BigInt("5000000000"), // 5 SUI
});

console.log("Route:", {
  expectedOutput: routeResult.coinOut.amount.toString(),
  routes: routeResult.routes.map((r) => ({
    dex: r.provider,
    percentage: r.percentage,
    path: r.paths,
  })),
  priceImpact: routeResult.priceImpact,
});

// Execute the routed swap
const routedSwapTx = await router.getTransactionForCompleteTradeRoute({
  walletAddress: senderAddress,
  completeRoute: routeResult,
  slippage: 0.005, // 0.5%
});

const routedResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: routedSwapTx,
  options: { showEffects: true },
});
console.log("Routed swap tx:", routedResult.digest);
```

### Step 8: Add Liquidity to a Pool

```typescript
// Add liquidity to a multi-asset pool
const depositAmounts = {
  "0x2::sui::SUI": BigInt("1000000000"),           // 1 SUI
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC": BigInt("1500000"), // 1.5 USDC
};

const addLiqTx = await pool.getDepositTransaction({
  walletAddress: senderAddress,
  amountsIn: depositAmounts,
  slippage: 0.005,
});

const addLiqResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: addLiqTx,
  options: { showEffects: true },
});
console.log("Add liquidity tx:", addLiqResult.digest);

// Remove liquidity
const lpCoinAmount = BigInt("500000000"); // LP tokens to burn

const removeLiqTx = await pool.getWithdrawTransaction({
  walletAddress: senderAddress,
  amountsOutDirection: depositAmounts, // proportional withdrawal
  lpCoinAmount,
  slippage: 0.005,
});

const removeLiqResult = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: removeLiqTx,
  options: { showEffects: true },
});
console.log("Remove liquidity tx:", removeLiqResult.digest);
```

### Step 9: Compose afSUI with DeFi via PTBs

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Example: Stake SUI for afSUI, then deposit afSUI into a lending protocol
// This is a single atomic transaction using PTBs

const tx = new Transaction();
tx.setSender(senderAddress);

// Step 1: Get the stake transaction and compose it
const stakeTxData = await staking.getStakeTransaction({
  walletAddress: senderAddress,
  suiStakeAmount: BigInt("2000000000"), // 2 SUI
});

// Step 2: Use the resulting afSUI in your own protocol
// You would need to extract the afSUI coin result and chain it
// The exact composition depends on the downstream protocol

// For manual composition with your own vault:
const AFSUI_TYPE = "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI";

// After staking, the afSUI coin object can be passed to your contract
// tx.moveCall({
//   target: `${YOUR_PACKAGE}::vault::deposit`,
//   arguments: [tx.object(YOUR_VAULT_ID), afSuiCoin],
//   typeArguments: [AFSUI_TYPE],
// });
```

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `SlippageExceeded` | Price moved beyond tolerance | Increase slippage or reduce trade size |
| `InsufficientBalance` | Not enough coins in wallet | Check balance, merge coin objects first |
| `PoolNotFound` | Invalid pool object ID | Verify pool ID on correct network |
| `InvalidCoinType` | Wrong coin type string | Verify full coin type with `0x` prefix |
| `StakingCapReached` | Validator stake cap full | Try a different validator or wait |

### Step 10: Handoff

- "I want concentrated liquidity positions" -> route to `integrate-cetus`
- "Route swaps through all DEXs" -> route to `integrate-7k`
- "Build a DeFi protocol using afSUI" -> route to `build-defi-protocol`
- "Deploy to mainnet" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always use the Router for user-facing swaps**: Direct pool swaps miss better routes. The Router aggregates across all Sui DEXs for optimal pricing.
2. **Always set slippage protection**: Never execute trades with `slippage: 0` or no slippage parameter. Use 0.5% as a sensible default.
3. **afSUI is NOT 1:1 with SUI**: The exchange rate changes every epoch as staking rewards accrue. Always query the current rate before displaying values to users.
4. **Handle multi-coin wallets**: Users may hold SUI or afSUI across multiple coin objects. Merge them before operations.
5. **Check pool weights before depositing**: Aftermath pools can have custom weights (e.g., 80/20). Depositing in wrong proportions incurs price impact.
6. **Unstaking may have epoch delays**: SUI unstaking is not instant — it depends on the epoch boundary. Communicate expected wait times to users.
7. **Use the SDK, not raw Move calls**: The Aftermath SDK handles complex pool math, routing, and transaction building. Raw Move calls are error-prone for weighted pools.

## References

- Aftermath Finance Docs: https://docs.aftermath.finance
- Aftermath GitHub: https://github.com/AftermathFinance
- afSUI type: `0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI`
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — protocol catalog
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
