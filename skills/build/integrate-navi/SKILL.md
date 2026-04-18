---
name: integrate-navi
description: "Deep integration guide for NAVI Protocol — a one-stop DeFi liquidity protocol on Sui offering lending, borrowing, and swap aggregation. Covers SDK setup, supply/borrow/repay/withdraw, pool queries, interest rates, NAVI Aggregator, points/rewards. Triggers: navi, navi protocol, navi lending, navi aggregator"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-navi"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a NAVI Protocol integration specialist. Your job is to guide the user through building with NAVI, a one-stop DeFi liquidity protocol on Sui. NAVI offers lending and borrowing plus a built-in DEX aggregator, making it a versatile choice for developers who want both lending and swap functionality from a single integration.

Key concepts:
- **Pool**: Each asset has a lending pool with supply/borrow rates (similar to Suilend/Scallop).
- **Account**: User positions are tracked per address. NAVI uses an account-based model rather than separate obligation objects.
- **NAVI Aggregator**: A built-in swap aggregator (separate from the lending SDK) that routes through multiple DEXs.
- **NAVX**: The protocol's governance/utility token, used for staking and fee discounts.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @naviprotocol/lending @mysten/sui
```

For the NAVI Aggregator (swap routing):

```bash
npm i navi-aggregator-sdk
```

### Step 2: Initialize the SDK

```typescript
import NAVISDKClient from "@naviprotocol/lending";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Initialize the NAVI SDK client
const naviClient = new NAVISDKClient({
  networkType: "mainnet",  // or "testnet"
  mnemonic: process.env.MNEMONIC!,
  numberOfAccounts: 1,     // how many accounts to derive
});

// Get the primary account
const account = naviClient.accounts[0];
console.log("NAVI account address:", account.address);

// The NAVI SDK provides pool constants:
// Sui, USDC, USDT, wETH, CETUS, haSUI, NAVX, etc.
import {
  pool as naviPools,
  NAVX_COIN_TYPE,
} from "@naviprotocol/lending";

// Pool identifiers for common assets
// naviPools.Sui  — SUI lending pool info
// naviPools.USDC — USDC lending pool info
// naviPools.USDT — USDT lending pool info
```

### Step 3: Query Pool and Interest Rate Data

```typescript
// Get all pool information
async function getPoolData() {
  const poolInfo = await naviClient.getAllPoolInfo();

  for (const [name, info] of Object.entries(poolInfo)) {
    console.log({
      pool: name,
      supplyApy: info.supply_rate,
      borrowApy: info.borrow_rate,
      totalSupply: info.total_supply,
      totalBorrow: info.total_borrow,
      utilization: info.utilization_rate,
      ltv: info.ltv,
      liquidationThreshold: info.liquidation_threshold,
    });
  }

  return poolInfo;
}

await getPoolData();

// Get specific pool info
async function getSuiPoolInfo() {
  const suiPoolInfo = await naviClient.getPoolInfo(naviPools.Sui);

  console.log("SUI Pool:", {
    supplyApy: suiPoolInfo.supply_rate,
    borrowApy: suiPoolInfo.borrow_rate,
    totalSupply: suiPoolInfo.total_supply,
    totalBorrow: suiPoolInfo.total_borrow,
    availableLiquidity: suiPoolInfo.available_liquidity,
  });

  return suiPoolInfo;
}

// Get user's account health and positions
async function getAccountHealth() {
  const healthFactor = await account.getHealthFactor();
  console.log("Health factor:", healthFactor);

  const dynamicHealth = await account.getDynamicHealthFactor();
  console.log("Dynamic health factor:", dynamicHealth);

  return healthFactor;
}
```

### Step 4: Supply (Deposit) Assets

```typescript
// Supply SUI to earn interest
async function supplySUI(amount: number) {
  // amount is in whole SUI units (e.g., 10 = 10 SUI)
  const tx = await account.depositToNavi(
    naviPools.Sui,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("Supply tx:", result.digest);
}

// Supply 10 SUI
await supplySUI(10);

// Supply USDC
async function supplyUSDC(amount: number) {
  // amount is in whole USDC units (e.g., 100 = 100 USDC)
  const tx = await account.depositToNavi(
    naviPools.USDC,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("USDC supply tx:", result.digest);
}

// Supply 500 USDC
await supplyUSDC(500);

// Supply with a raw Transaction for PTB composition
async function supplyWithTransaction(poolConfig: any, amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Split coin for deposit
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  // Call NAVI deposit
  tx.moveCall({
    target: `${naviPools.Sui.packageId}::lending::deposit`,
    arguments: [
      tx.object(naviPools.Sui.poolId),
      tx.object(naviPools.Sui.storagId),
      depositCoin,
      tx.object("0x6"), // Clock
    ],
    typeArguments: [naviPools.Sui.coinType],
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Raw deposit tx:", result.digest);
}
```

### Step 5: Borrow Against Collateral

```typescript
// Borrow USDC against supplied SUI collateral
async function borrowUSDC(amount: number) {
  // amount is in whole USDC units
  const tx = await account.borrowFromNavi(
    naviPools.USDC,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("Borrow tx:", result.digest);
}

// Borrow 100 USDC
await borrowUSDC(100);

// Borrow SUI
async function borrowSUI(amount: number) {
  const tx = await account.borrowFromNavi(
    naviPools.Sui,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("SUI borrow tx:", result.digest);
}

// Check position after borrowing
async function checkPosition() {
  const healthFactor = await account.getHealthFactor();
  const supplies = await account.getNAVISupply();
  const borrows = await account.getNAVIBorrow();

  console.log("Health factor:", healthFactor);
  console.log("Supplies:", supplies);
  console.log("Borrows:", borrows);

  if (healthFactor < 1.2) {
    console.warn("WARNING: Health factor is low. Consider repaying or adding collateral.");
  }
}

await checkPosition();
```

### Step 6: Repay Loans

```typescript
// Repay USDC loan
async function repayUSDC(amount: number) {
  const tx = await account.repayToNavi(
    naviPools.USDC,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("Repay tx:", result.digest);
}

// Repay 50 USDC
await repayUSDC(50);

// Repay SUI loan
async function repaySUI(amount: number) {
  const tx = await account.repayToNavi(
    naviPools.Sui,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("SUI repay tx:", result.digest);
}

// Repay all of a specific loan (pass a large number or query exact debt)
async function repayAllUSDC() {
  const borrows = await account.getNAVIBorrow();
  const usdcDebt = borrows.find((b: any) => b.coinType === naviPools.USDC.coinType);

  if (usdcDebt) {
    const debtAmount = Number(usdcDebt.amount) / 1e6; // convert from micro-USDC
    await repayUSDC(debtAmount * 1.001); // add 0.1% buffer for accrued interest
  }
}
```

### Step 7: Withdraw Supplied Assets

```typescript
// Withdraw SUI
async function withdrawSUI(amount: number) {
  const tx = await account.withdrawFromNavi(
    naviPools.Sui,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("Withdraw tx:", result.digest);
}

// Withdraw 5 SUI
await withdrawSUI(5);

// Withdraw USDC
async function withdrawUSDC(amount: number) {
  const tx = await account.withdrawFromNavi(
    naviPools.USDC,
    amount
  );

  const result = await account.signAndSubmitTransaction(tx);
  console.log("USDC withdraw tx:", result.digest);
}

// Safe withdraw: check health factor first
async function safeWithdraw(poolConfig: any, amount: number) {
  const healthBefore = await account.getHealthFactor();
  console.log("Health before:", healthBefore);

  if (healthBefore < 1.5) {
    console.warn("Health factor too low for safe withdrawal. Repay some debt first.");
    return;
  }

  const tx = await account.withdrawFromNavi(poolConfig, amount);
  const result = await account.signAndSubmitTransaction(tx);
  console.log("Safe withdraw tx:", result.digest);

  const healthAfter = await account.getHealthFactor();
  console.log("Health after:", healthAfter);
}
```

### Step 8: NAVI Aggregator for Swap Routing

```typescript
// The NAVI Aggregator routes swaps across multiple Sui DEXs
// It works similarly to 7K but is NAVI's own routing engine

import { NAVIAggregator } from "navi-aggregator-sdk";

const aggregator = new NAVIAggregator({
  network: "mainnet",
});

// Get a swap quote
async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
) {
  const quote = await aggregator.getQuote({
    tokenIn,
    tokenOut,
    amountIn,
  });

  console.log({
    expectedOutput: quote.amountOut,
    routes: quote.routes,
    priceImpact: quote.priceImpact,
  });

  return quote;
}

// Execute a swap via NAVI Aggregator
async function naviSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number = 50
) {
  const quote = await aggregator.getQuote({
    tokenIn,
    tokenOut,
    amountIn,
  });

  const tx = await aggregator.buildSwapTransaction({
    quote,
    accountAddress: senderAddress,
    slippage: slippageBps / 10000,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showBalanceChanges: true },
  });

  console.log("NAVI swap tx:", result.digest);
  console.log("Balance changes:", result.balanceChanges);
  return result;
}

// Swap 5 SUI to USDC
const SUI_TYPE = "0x2::sui::SUI";
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

await naviSwap(SUI_TYPE, USDC_TYPE, "5000000000");
```

### Step 9: Points and Rewards

```typescript
// NAVI has a points/rewards system for active users
// Points are earned by supplying and borrowing assets

async function checkNAVIRewards() {
  // Query user's NAVI-specific rewards
  const supplies = await account.getNAVISupply();
  const borrows = await account.getNAVIBorrow();

  console.log("Active supplies (earning points):");
  for (const s of supplies) {
    console.log(`  ${s.coinType}: ${s.amount}`);
  }

  console.log("Active borrows (earning points):");
  for (const b of borrows) {
    console.log(`  ${b.coinType}: ${b.amount}`);
  }
}

// Claim NAVX token rewards (if available)
async function claimRewards() {
  const tx = await account.claimAllRewards();

  if (tx) {
    const result = await account.signAndSubmitTransaction(tx);
    console.log("Claim rewards tx:", result.digest);
  } else {
    console.log("No rewards to claim");
  }
}
```

### Step 10: Compose NAVI with Other Protocols

```typescript
// Example: Swap SUI -> USDC via NAVI Aggregator, then deposit into NAVI lending
async function swapAndLend() {
  // Step 1: Swap SUI to USDC using NAVI aggregator
  const quote = await aggregator.getQuote({
    tokenIn: SUI_TYPE,
    tokenOut: USDC_TYPE,
    amountIn: "10000000000", // 10 SUI
  });

  const swapTx = await aggregator.buildSwapTransaction({
    quote,
    accountAddress: senderAddress,
    slippage: 0.005,
  });

  const swapResult = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: swapTx,
  });
  console.log("Swap tx:", swapResult.digest);

  // Step 2: Now deposit the received USDC into NAVI lending
  const usdcAmount = Number(quote.amountOut) / 1e6; // whole USDC units
  const depositTx = await account.depositToNavi(naviPools.USDC, usdcAmount);

  const depositResult = await account.signAndSubmitTransaction(depositTx);
  console.log("Deposit tx:", depositResult.digest);
}

// Example: Supply + Borrow in sequence
async function leveragedPosition() {
  // Step 1: Supply 20 SUI as collateral
  const supplyTx = await account.depositToNavi(naviPools.Sui, 20);
  await account.signAndSubmitTransaction(supplyTx);
  console.log("Supplied 20 SUI");

  // Step 2: Borrow 10 USDC against it
  const borrowTx = await account.borrowFromNavi(naviPools.USDC, 10);
  await account.signAndSubmitTransaction(borrowTx);
  console.log("Borrowed 10 USDC");

  // Step 3: Check final health
  const health = await account.getHealthFactor();
  console.log("Final health factor:", health);
}
```

### Step 11: Handoff

- "Compare NAVI with Suilend or Scallop" -> route to `integrate-suilend` or `integrate-scallop`
- "I need a better swap aggregator" -> route to `integrate-7k`
- "Build a custom lending protocol" -> route to `build-defi-protocol`
- "Deploy my integration" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always check health factor before borrowing or withdrawing**: Query `account.getHealthFactor()` before any operation that increases debt or decreases collateral. Health factor below 1.0 triggers liquidation.
2. **Use pool constants from the SDK**: Always import pool configurations from `@naviprotocol/lending` rather than hardcoding addresses. They update with protocol upgrades.
3. **Account for interest accrual in repayment amounts**: When repaying loans, add a small buffer (0.1-0.5%) to cover interest accrued between query time and transaction execution.
4. **Handle the mnemonic securely**: The NAVI SDK takes a mnemonic directly. Never expose it in client-side code. Use environment variables and server-side signing.
5. **Amounts are in whole units for SDK methods**: Unlike raw PTB calls (which use smallest units), NAVI SDK methods like `depositToNavi` accept whole units (e.g., 10 for 10 SUI). Check each method's documentation.
6. **NAVI Aggregator is separate from lending**: The swap aggregator (`navi-aggregator-sdk`) is a different package from the lending SDK (`@naviprotocol/lending`). Install both if you need both features.
7. **Verify pool support before operations**: Not all assets are supported on NAVI. Query supported pools first and handle unsupported assets gracefully.

## References

- NAVI Protocol Website: https://naviprotocol.io/
- NAVI SDK GitHub: https://github.com/naviprotocol/navi-sdk
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
