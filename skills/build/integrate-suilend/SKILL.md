---
name: integrate-suilend
description: "Deep integration guide for Suilend — the leading lending protocol on Sui (from the Solend team). Covers SDK setup, depositing collateral, borrowing, repaying, withdrawing, market queries, liquidation, SpringSui sSUI liquid staking, and PTB composition. Triggers: suilend, lending, borrow suilend, deposit suilend"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-suilend"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Suilend integration specialist. Your job is to guide the user through building with Suilend, the leading lending/borrowing protocol on Sui. Suilend was built by the team behind Solend (Solana's top lending protocol), bringing battle-tested lending mechanics to Sui.

Key concepts:
- **Obligation**: An owned object representing a user's lending position (collateral deposited + loans outstanding). Each user can have multiple obligations.
- **Reserve**: A pool for a single asset type (e.g., SUI reserve, USDC reserve). Tracks total deposits, borrows, interest rates.
- **LendingMarket**: The shared object that contains all reserves and protocol configuration.
- **cTokens**: Receipt tokens representing deposits (like Compound's cTokens). They accrue interest over time.
- **SpringSui (sSUI)**: Suilend's liquid staking token — stake SUI and receive sSUI that earns staking yield.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @suilend/sdk @mysten/sui
```

For SpringSui liquid staking:

```bash
npm i @suilend/springsui-sdk
```

### Step 2: Initialize the SDK

```typescript
import { SuilendClient } from "@suilend/sdk";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Initialize Suilend client — this fetches the on-chain lending market data
const suilend = await SuilendClient.initialize(
  suiClient,
  "mainnet"  // or "testnet"
);

// The client auto-discovers:
// - LendingMarket object ID
// - All reserves (SUI, USDC, USDT, wETH, etc.)
// - Current interest rates and utilization
console.log("Lending market loaded");
```

### Step 3: Query Market Data

```typescript
// Get all reserves and their current state
const reserves = suilend.reserves;

for (const reserve of reserves) {
  console.log({
    coinType: reserve.coinType,
    symbol: reserve.symbol,
    depositApy: reserve.depositApy,        // Current supply APY
    borrowApy: reserve.borrowApy,          // Current borrow APY
    totalDeposits: reserve.totalDeposits,  // Total supplied
    totalBorrows: reserve.totalBorrows,    // Total borrowed
    utilization: reserve.utilization,      // Utilization rate (0-1)
    ltv: reserve.ltv,                      // Loan-to-value ratio
    liquidationThreshold: reserve.liquidationThreshold,
  });
}

// Get a specific reserve
const suiReserve = suilend.getReserve("0x2::sui::SUI");
console.log("SUI supply APY:", suiReserve?.depositApy);
console.log("SUI borrow APY:", suiReserve?.borrowApy);

// Get USDC reserve
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const usdcReserve = suilend.getReserve(USDC_TYPE);
console.log("USDC supply APY:", usdcReserve?.depositApy);
```

### Step 4: Deposit Collateral

```typescript
// Deposit SUI as collateral
async function depositSUI(amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Split SUI from gas coin
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  // Deposit into Suilend
  // This creates or updates an Obligation object for the user
  await suilend.deposit(
    tx,
    "0x2::sui::SUI",
    depositCoin,
    senderAddress
  );

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  console.log("Deposit tx:", result.digest);
}

// Deposit 10 SUI
await depositSUI(10_000_000_000n);

// Deposit USDC
async function depositUSDC(usdcCoinId: string, amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  await suilend.deposit(
    tx,
    USDC_TYPE,
    tx.object(usdcCoinId),
    senderAddress
  );

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("USDC deposit tx:", result.digest);
}
```

### Step 5: Borrow Against Collateral

```typescript
// First, get the user's obligation (lending position)
const obligations = await suilend.getObligations(senderAddress);
console.log("User obligations:", obligations.length);

if (obligations.length > 0) {
  const obligation = obligations[0];
  console.log("Obligation ID:", obligation.id);
  console.log("Deposited collateral:", obligation.deposits);
  console.log("Outstanding borrows:", obligation.borrows);
  console.log("Health factor:", obligation.healthFactor);
}

// Borrow USDC against SUI collateral
async function borrowUSDC(amount: bigint) {
  const obligations = await suilend.getObligations(senderAddress);
  if (obligations.length === 0) {
    console.error("No obligation found. Deposit collateral first.");
    return;
  }

  const obligationId = obligations[0].id;
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const borrowedCoin = await suilend.borrow(
    tx,
    USDC_TYPE,
    amount,
    obligationId,
    senderAddress
  );

  // Transfer borrowed USDC to sender
  tx.transferObjects([borrowedCoin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
  console.log("Borrow tx:", result.digest);
}

// Borrow 100 USDC (6 decimals)
await borrowUSDC(100_000_000n);
```

### Step 6: Repay Loans

```typescript
// Repay USDC loan
async function repayUSDC(usdcCoinId: string, amount: bigint) {
  const obligations = await suilend.getObligations(senderAddress);
  if (obligations.length === 0) {
    console.error("No obligation found.");
    return;
  }

  const obligationId = obligations[0].id;
  const tx = new Transaction();
  tx.setSender(senderAddress);

  await suilend.repay(
    tx,
    USDC_TYPE,
    tx.object(usdcCoinId),
    obligationId,
    senderAddress
  );

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Repay tx:", result.digest);
}

// Repay SUI loan using gas coin
async function repaySUI(amount: bigint) {
  const obligations = await suilend.getObligations(senderAddress);
  const obligationId = obligations[0].id;

  const tx = new Transaction();
  tx.setSender(senderAddress);

  const [repayCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  await suilend.repay(
    tx,
    "0x2::sui::SUI",
    repayCoin,
    obligationId,
    senderAddress
  );

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("SUI repay tx:", result.digest);
}
```

### Step 7: Withdraw Collateral

```typescript
// Withdraw deposited SUI collateral
async function withdrawSUI(amount: bigint) {
  const obligations = await suilend.getObligations(senderAddress);
  const obligationId = obligations[0].id;

  const tx = new Transaction();
  tx.setSender(senderAddress);

  const withdrawnCoin = await suilend.withdraw(
    tx,
    "0x2::sui::SUI",
    amount,
    obligationId,
    senderAddress
  );

  tx.transferObjects([withdrawnCoin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Withdraw tx:", result.digest);
}

// Withdraw 5 SUI
await withdrawSUI(5_000_000_000n);
```

### Step 8: Compose Deposit + Borrow in One PTB

```typescript
// Atomic deposit-and-borrow in a single transaction
async function depositAndBorrow(
  depositAmount: bigint,
  borrowAmount: bigint
) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Step 1: Split SUI for deposit
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositAmount)]);

  // Step 2: Deposit SUI as collateral
  await suilend.deposit(
    tx,
    "0x2::sui::SUI",
    depositCoin,
    senderAddress
  );

  // Step 3: Get obligation (may have been created by deposit)
  const obligations = await suilend.getObligations(senderAddress);
  const obligationId = obligations[0]?.id;

  // Step 4: Borrow USDC against the just-deposited SUI
  const borrowedCoin = await suilend.borrow(
    tx,
    USDC_TYPE,
    borrowAmount,
    obligationId,
    senderAddress
  );

  // Step 5: Send borrowed USDC to wallet
  tx.transferObjects([borrowedCoin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  console.log("Deposit + borrow tx:", result.digest);
}

// Deposit 10 SUI and borrow 5 USDC in one atomic transaction
await depositAndBorrow(10_000_000_000n, 5_000_000n);
```

### Step 9: Liquidation Mechanics

```typescript
// Check if an obligation is liquidatable
async function checkLiquidation(obligationId: string) {
  const obligation = await suilend.getObligation(obligationId);

  console.log("Health factor:", obligation.healthFactor);
  console.log("Liquidatable:", obligation.healthFactor < 1.0);

  // Health factor < 1.0 means the position can be liquidated
  // Liquidators repay part of the debt and receive collateral at a discount
}

// Liquidate an unhealthy position
async function liquidate(
  unhealthyObligationId: string,
  repayType: string,
  withdrawType: string,
  repayAmount: bigint,
  repayCoinId: string
) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const seizedCollateral = await suilend.liquidate(
    tx,
    unhealthyObligationId,
    repayType,
    withdrawType,
    tx.object(repayCoinId),
    senderAddress
  );

  // Seized collateral is at a discount — the liquidation bonus
  tx.transferObjects([seizedCollateral], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Liquidation tx:", result.digest);
}
```

### Step 10: SpringSui Liquid Staking (sSUI)

SpringSui lets you stake SUI and receive sSUI, a liquid staking token that earns staking yield while remaining DeFi-composable.

```typescript
import { SpringSuiClient } from "@suilend/springsui-sdk";

const springSui = await SpringSuiClient.initialize(suiClient);

// Stake SUI to receive sSUI
async function stakeSUI(amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  const sSuiCoin = await springSui.stake(tx, suiCoin);

  tx.transferObjects([sSuiCoin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Stake tx:", result.digest);
}

// Stake 100 SUI to get sSUI
await stakeSUI(100_000_000_000n);

// Unstake sSUI to get SUI back
async function unstakeSUI(sSuiCoinId: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const suiCoin = await springSui.unstake(tx, tx.object(sSuiCoinId));

  tx.transferObjects([suiCoin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Unstake tx:", result.digest);
}

// Get sSUI exchange rate
const exchangeRate = await springSui.getExchangeRate();
console.log("1 sSUI =", exchangeRate, "SUI");

// Compose: Stake SUI + Deposit sSUI as collateral in one PTB
async function stakeAndDeposit(amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Step 1: Stake SUI -> sSUI
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  const sSuiCoin = await springSui.stake(tx, suiCoin);

  // Step 2: Deposit sSUI as collateral on Suilend
  await suilend.deposit(
    tx,
    springSui.sSuiCoinType,
    sSuiCoin,
    senderAddress
  );

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Stake + deposit tx:", result.digest);
}
```

### Step 11: Handoff

- "Compare Suilend with Scallop" -> route to `integrate-scallop`
- "Build a custom lending protocol" -> route to `build-defi-protocol`
- "Swap tokens before depositing" -> route to `integrate-7k` or `integrate-cetus`
- "Deploy my integration" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always check health factor before borrowing**: Query the obligation's health factor before and after borrowing. A health factor below 1.0 means liquidation. Never borrow up to the max — leave a safety margin of at least 20%.
2. **Handle obligation lifecycle**: Users may have zero or multiple obligations. Always query obligations first and handle the case where none exist (deposit creates one automatically).
3. **Interest accrues continuously**: Borrow amounts grow over time. When building UIs, show real-time debt including accrued interest, not just the original borrow amount.
4. **Withdraw respects collateral requirements**: You cannot withdraw collateral if it would push the health factor below 1.0. Check before attempting withdrawal.
5. **Use PTB composition for atomic operations**: Deposit + borrow, repay + withdraw, swap + deposit should all be composed in a single PTB for atomicity and gas efficiency.
6. **SpringSui sSUI is a yield-bearing collateral**: sSUI earns staking yield even while deposited as collateral on Suilend. Recommend sSUI deposits over raw SUI when users want maximum yield.
7. **Never hardcode reserve addresses**: Use the SDK's auto-discovery to find reserve addresses. They can change with protocol upgrades.

## References

- Suilend Website: https://suilend.fi/
- Suilend SDK: `@suilend/sdk`
- SpringSui SDK: `@suilend/springsui-sdk`
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
