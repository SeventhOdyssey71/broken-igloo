---
name: integrate-scallop
description: "Deep integration guide for Scallop — the first Sui Foundation grant recipient and battle-tested lending protocol. Covers ScallopClient setup, supply/borrow/repay, obligation management, market queries, points/rewards, and comparison with Suilend. Triggers: scallop, scallop lending, scallop deposit, scallop borrow"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-scallop"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Scallop Protocol integration specialist. Your job is to guide the user through building with Scallop, the first protocol to receive a Sui Foundation grant and one of the most battle-tested lending markets on Sui. Scallop has been audited multiple times and has consistently held significant TVL.

Key concepts:
- **ScallopClient**: High-level SDK interface for all lending operations. Abstracts the complexity of direct Move calls.
- **ScallopBuilder**: Lower-level transaction builder for composing Scallop calls with other protocols in PTBs.
- **Obligation**: An owned object representing a user's lending position (like Suilend). Each user can have multiple.
- **sCoins**: Supply receipt tokens (e.g., sSUI, sUSDC) that represent deposits and accrue interest.
- **Markets**: Individual lending pools per asset type with supply/borrow rates.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @scallop-io/sui-scallop-sdk @mysten/sui
```

### Step 2: Initialize the SDK

```typescript
import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Initialize Scallop SDK
const scallop = new Scallop({
  networkType: "mainnet",  // or "testnet"
  keypair,
});

// Create the high-level client
const scallopClient = await scallop.createScallopClient();

// Create the transaction builder (for PTB composition)
const scallopBuilder = await scallop.createScallopBuilder();

// Create the query client (for reading on-chain data)
const scallopQuery = await scallop.createScallopQuery();

console.log("Scallop SDK initialized");
```

### Step 3: Query Market Data

```typescript
// Get all market data
const marketData = await scallopQuery.getMarketPools();

for (const [assetName, pool] of Object.entries(marketData)) {
  console.log({
    asset: assetName,
    supplyApy: pool.supplyApy,
    borrowApy: pool.borrowApy,
    totalSupply: pool.totalSupply,
    totalBorrow: pool.totalBorrow,
    utilization: pool.utilization,
  });
}

// Get specific asset market info
const suiMarket = await scallopQuery.getMarketPool("sui");
console.log("SUI supply APY:", suiMarket?.supplyApy);
console.log("SUI borrow APY:", suiMarket?.borrowApy);

const usdcMarket = await scallopQuery.getMarketPool("usdc");
console.log("USDC supply APY:", usdcMarket?.supplyApy);

// Get supported collateral assets
const supportedAssets = await scallopQuery.getSupportedCoins();
console.log("Supported assets:", supportedAssets);

// Get total protocol TVL
const tvl = await scallopQuery.getTotalValueLocked();
console.log("Total TVL:", tvl);
```

### Step 4: Supply (Deposit) Assets

```typescript
// Supply SUI to earn interest
// This returns sSUI (Scallop's supply receipt token)
async function supplySUI(amount: number) {
  const tx = await scallopClient.supply("sui", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("Supply tx:", result.digest);
}

// Supply 10 SUI (amount is in whole units, not MIST)
await supplySUI(10);

// Supply USDC
async function supplyUSDC(amount: number) {
  const tx = await scallopClient.supply("usdc", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("USDC supply tx:", result.digest);
}

// Supply 100 USDC
await supplyUSDC(100);
```

### Step 5: Using the Builder for Custom Transactions

The ScallopBuilder gives you full control for composing with other protocols.

```typescript
// Supply SUI using the builder (more control)
async function supplySUIWithBuilder(amount: number) {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  // Split SUI from gas
  const [suiCoin] = tx.splitSUIFromGas([amount * 1e9]); // convert to MIST

  // Supply to Scallop
  const sCoin = await tx.deposit("sui", suiCoin);

  // sCoin is your receipt — transfer it to yourself
  tx.transferObjects([sCoin], senderAddress);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("Builder supply tx:", result.digest);
}
```

### Step 6: Borrow Against Collateral

```typescript
// Get user's obligations first
async function getObligations() {
  const obligations = await scallopQuery.getObligations(senderAddress);

  for (const ob of obligations) {
    console.log({
      obligationId: ob.id,
      deposits: ob.deposits,
      borrows: ob.borrows,
      healthFactor: ob.healthFactor,
    });
  }

  return obligations;
}

// Borrow USDC against deposited SUI collateral
async function borrowUSDC(amount: number) {
  // Method 1: Simple client approach
  const tx = await scallopClient.borrow("usdc", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("Borrow tx:", result.digest);
}

// Borrow 50 USDC
await borrowUSDC(50);

// Borrow using the builder (for PTB composition)
async function borrowWithBuilder(amount: number, obligationId: string) {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  // Borrow USDC
  const borrowedCoin = await tx.borrow("usdc", amount * 1e6, obligationId);

  // You can now chain this coin into another protocol call
  tx.transferObjects([borrowedCoin], senderAddress);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("Builder borrow tx:", result.digest);
}
```

### Step 7: Repay Loans

```typescript
// Repay USDC loan
async function repayUSDC(amount: number) {
  const tx = await scallopClient.repay("usdc", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("Repay tx:", result.digest);
}

// Repay 25 USDC
await repayUSDC(25);

// Repay SUI loan
async function repaySUI(amount: number) {
  const tx = await scallopClient.repay("sui", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("SUI repay tx:", result.digest);
}

// Repay using builder for custom logic
async function repayWithBuilder(amount: number, obligationId: string) {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  // If repaying with a specific coin object
  const [repayCoin] = tx.splitSUIFromGas([amount * 1e9]);
  await tx.repay("sui", repayCoin, obligationId);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("Builder repay tx:", result.digest);
}
```

### Step 8: Withdraw Collateral

```typescript
// Withdraw SUI collateral
async function withdrawSUI(amount: number) {
  const tx = await scallopClient.withdraw("sui", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("Withdraw tx:", result.digest);
}

// Withdraw 5 SUI
await withdrawSUI(5);

// Withdraw USDC
async function withdrawUSDC(amount: number) {
  const tx = await scallopClient.withdraw("usdc", amount, senderAddress);

  const result = await scallopClient.suiKit.signAndSendTxn(tx);
  console.log("USDC withdraw tx:", result.digest);
}
```

### Step 9: Obligation Management

```typescript
// Create a new obligation explicitly
async function createObligation() {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  const [obligationId, obligationKey] = await tx.createObligation();

  // The obligation key is needed for some operations — keep it safe
  tx.transferObjects([obligationKey], senderAddress);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("New obligation created:", result.digest);
}

// Check obligation health
async function checkHealth(obligationId: string) {
  const obligation = await scallopQuery.getObligation(obligationId);

  console.log({
    collateralValue: obligation.totalCollateralValue,
    borrowValue: obligation.totalBorrowValue,
    healthFactor: obligation.healthFactor,
    isLiquidatable: obligation.healthFactor < 1.0,
  });

  return obligation;
}

// Get all obligations for a user
async function listAllObligations() {
  const obligations = await scallopQuery.getObligations(senderAddress);

  console.log(`Found ${obligations.length} obligations:`);
  for (const ob of obligations) {
    console.log(`  ID: ${ob.id}, Health: ${ob.healthFactor}`);
  }

  return obligations;
}
```

### Step 10: Compose with Other Protocols (PTB)

```typescript
// Example: Swap on Cetus -> Deposit on Scallop in one transaction
async function swapAndDeposit() {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  // Step 1: Split SUI for swap
  const [swapCoin] = tx.splitSUIFromGas([5_000_000_000]); // 5 SUI

  // Step 2: Swap SUI to USDC on a DEX (raw moveCall)
  const CETUS_PACKAGE = "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb";
  const CETUS_CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e69d9fb27baea4b8";
  const SUI_USDC_POOL = "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded";

  const [usdcCoin] = tx.txBlock.moveCall({
    target: `${CETUS_PACKAGE}::pool_script::swap_a2b`,
    arguments: [
      tx.txBlock.object(CETUS_CONFIG),
      tx.txBlock.object(SUI_USDC_POOL),
      swapCoin,
      tx.txBlock.pure.u64(0),
      tx.txBlock.pure.bool(true),
      tx.txBlock.object("0x6"),
    ],
    typeArguments: [
      "0x2::sui::SUI",
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    ],
  });

  // Step 3: Deposit USDC into Scallop
  const sCoin = await tx.deposit("usdc", usdcCoin);
  tx.transferObjects([sCoin], senderAddress);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("Swap + deposit tx:", result.digest);
}
```

### Step 11: Points and Rewards

```typescript
// Query Scallop points/rewards for a user
async function checkRewards() {
  // Scallop has a points system that rewards active lenders/borrowers
  // Points accumulate based on supply and borrow volumes

  const obligations = await scallopQuery.getObligations(senderAddress);

  for (const ob of obligations) {
    console.log("Obligation:", ob.id);
    console.log("  Rewards pending:", ob.pendingRewards);
  }

  // Claim rewards (if available)
  // Scallop periodically distributes SCA token rewards
}

// Claim Scallop rewards
async function claimRewards(obligationId: string) {
  const builder = await scallop.createScallopBuilder();
  const tx = builder.createTxBlock();
  tx.setSender(senderAddress);

  const rewardCoin = await tx.claimReward(obligationId);
  tx.transferObjects([rewardCoin], senderAddress);

  const txBlock = tx.txBlock;
  const result = await scallopClient.suiKit.signAndSendTxn(txBlock);
  console.log("Claim rewards tx:", result.digest);
}
```

### Scallop vs Suilend: When to Use Which

| Factor | Scallop | Suilend |
|--------|---------|---------|
| **Maturity** | First Sui Foundation grant; longer track record | Built by Solend team; newer on Sui |
| **Audits** | Multiple audits, battle-tested | Solend codebase lineage, audited |
| **Supported assets** | Broad asset support | Growing asset list |
| **SDK ergonomics** | ScallopClient (high-level) + Builder (low-level) | Single SuilendClient |
| **Liquid staking** | Partners with LST protocols | SpringSui (sSUI) built in |
| **Points/rewards** | SCA token rewards + points | Suilend points program |
| **Builder pattern** | Yes — ScallopBuilder for PTB composition | Direct Transaction composition |
| **Best for** | Production apps needing battle-tested reliability | Apps wanting LST integration + lending |

**Recommendation**: For maximum reliability and longest track record, use Scallop. For integrated liquid staking (sSUI) + lending in one SDK, use Suilend. For DeFi aggregators, integrate both and let users choose.

### Step 12: Handoff

- "Compare with Suilend" -> route to `integrate-suilend`
- "Add swap routing" -> route to `integrate-7k` or `integrate-cetus`
- "Build a custom lending protocol" -> route to `build-defi-protocol`
- "Deploy my integration" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always check health factor before borrowing or withdrawing**: Query the obligation's health factor before any operation that increases borrow or decreases collateral. A health factor below 1.0 triggers liquidation.
2. **Use ScallopBuilder for PTB composition**: When composing Scallop with other protocols, use ScallopBuilder's `createTxBlock()` which gives you access to both Scallop helpers and raw PTB operations.
3. **Handle sCoins correctly**: Supply receipt tokens (sSUI, sUSDC) accrue value over time. When displaying balances, convert sCoin amounts using the current exchange rate, not 1:1.
4. **Asset names are lowercase strings**: Scallop uses lowercase asset names ("sui", "usdc", "usdt") not full coin type paths. The SDK maps these internally.
5. **Interest accrues continuously**: Like all lending protocols, interest compounds. Show real-time debt and earnings in UIs.
6. **Never hardcode object IDs**: Use the SDK's discovery methods. Object IDs change across networks and protocol upgrades.
7. **Obligation keys must be stored securely**: Some operations require the ObligationKey object. If lost, you cannot manage that obligation.

## References

- Scallop Website: https://scallop.io/
- Scallop SDK GitHub: https://github.com/scallop-io/sui-scallop-sdk
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
