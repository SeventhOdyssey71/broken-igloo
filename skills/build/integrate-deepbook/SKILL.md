---
name: integrate-deepbook
description: "Deep integration guide for DeepBook V3 — the native on-chain Central Limit Order Book (CLOB) built by Mysten Labs. Covers BalanceManager, pool creation, limit/market orders, cancellation, flash loans, DEEP staking. Triggers: deepbook, order book, limit order, clob, deepbook pool"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-deepbook"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a DeepBook V3 integration specialist. Your job is to guide the user through building with DeepBook, the native on-chain Central Limit Order Book (CLOB) on Sui. DeepBook is built and maintained by Mysten Labs and is a core primitive of the Sui ecosystem.

DeepBook is fundamentally different from AMMs like Cetus: it uses a traditional order book with bids and asks at specific price levels. Makers post limit orders; takers fill them with market orders. This makes it ideal for precise trading, market making, and any use case where price discovery and order control matter.

Key concepts:
- **BalanceManager**: A shared object that holds your trading balances (deposits). Required before placing any orders.
- **Pool**: A trading pair (e.g., SUI/USDC) with an order book of bids and asks.
- **DEEP token**: The native token. Staking DEEP provides fee discounts.
- **Flash loans**: Borrow from pool liquidity atomically within a single PTB.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/deepbook-v3 @mysten/sui
```

### Step 2: Initialize the SDK

```typescript
import { DeepBookClient } from "@mysten/deepbook-v3";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
const senderAddress = keypair.getPublicKey().toSuiAddress();

// Initialize the DeepBook client
const dbClient = new DeepBookClient({
  address: senderAddress,
  env: "mainnet",
  client: suiClient,
});

// Key constants for mainnet
// DEEP token type:
const DEEP_TYPE = "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP";
// Common pool keys (use dbClient.getPoolByName for convenience):
// "SUI_USDC" -> SUI/USDC pool
// "DEEP_SUI" -> DEEP/SUI pool
```

### Step 3: Create a BalanceManager

A BalanceManager is a shared object that holds your trading funds. You must create one before trading. Think of it as your on-chain trading account.

```typescript
// Create a new BalanceManager
async function createBalanceManager(): Promise<string> {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.balanceManager.createBalanceManager(tx);

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  // Find the created BalanceManager object ID from the transaction effects
  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType.includes("BalanceManager")
  );
  const balanceManagerId = created?.objectId;
  console.log("BalanceManager created:", balanceManagerId);
  return balanceManagerId!;
}

const balanceManagerId = await createBalanceManager();

// IMPORTANT: Save this ID — you reuse the same BalanceManager for all trading
```

### Step 4: Deposit Funds into BalanceManager

```typescript
// Deposit SUI into your BalanceManager
async function depositSUI(amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  dbClient.balanceManager.deposit(tx, {
    balanceManager: balanceManagerId,
    coinType: "0x2::sui::SUI",
    coin,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Deposit tx:", result.digest);
}

// Deposit 10 SUI
await depositSUI(10_000_000_000n);

// Deposit USDC (requires you to have USDC coin objects)
async function depositUSDC(amount: bigint, usdcCoinId: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const USDC_TYPE =
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

  dbClient.balanceManager.deposit(tx, {
    balanceManager: balanceManagerId,
    coinType: USDC_TYPE,
    coin: tx.object(usdcCoinId),
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("USDC deposit tx:", result.digest);
}

// Deposit DEEP for fee discounts
async function depositDEEP(deepCoinId: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.balanceManager.deposit(tx, {
    balanceManager: balanceManagerId,
    coinType: DEEP_TYPE,
    coin: tx.object(deepCoinId),
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("DEEP deposit tx:", result.digest);
}
```

### Step 5: Query Pools and Order Book State

```typescript
// Get pool information
const poolKey = "SUI_USDC";

// Get the order book: top bids and asks
async function getOrderBook() {
  const tx = new Transaction();

  // Get Level 2 order book (aggregated price levels)
  const [bids, asks] = dbClient.pool.getLevel2Range(tx, {
    poolKey,
    priceLow: 0,
    priceHigh: Number.MAX_SAFE_INTEGER,
  });

  const result = await suiClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: senderAddress,
  });

  // Parse the results to see the order book
  console.log("Order book result:", result);
}

// Get the mid price
async function getMidPrice(): Promise<number> {
  const tx = new Transaction();
  dbClient.pool.midPrice(tx, { poolKey });

  const result = await suiClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: senderAddress,
  });

  // Parse the returned value
  const midPrice = result.results?.[0]?.returnValues?.[0];
  console.log("Mid price:", midPrice);
  return Number(midPrice);
}

// Check your BalanceManager balances
async function checkBalances() {
  const tx = new Transaction();

  dbClient.balanceManager.checkManagerBalance(tx, {
    balanceManager: balanceManagerId,
    coinType: "0x2::sui::SUI",
  });

  const result = await suiClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: senderAddress,
  });
  console.log("Balance:", result.results?.[0]?.returnValues);
}
```

### Step 6: Place Limit Orders

```typescript
// Place a limit BID (buy SUI with USDC)
async function placeLimitBid(price: number, quantity: number) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.placeLimitOrder(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    clientOrderId: Date.now(), // unique ID for tracking
    price,                     // price in USDC per SUI
    quantity,                  // quantity in base asset (SUI)
    isBid: true,               // true = buy order
    expiration: 0,             // 0 = no expiration (Good-Til-Cancelled)
    selfMatchingOption: 0,     // 0 = cancel taker, 1 = cancel maker
    payWithDeep: true,         // pay fees in DEEP for discount
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
  console.log("Limit bid placed:", result.digest);

  // Parse the order ID from events
  const orderEvent = result.events?.find((e) =>
    e.type.includes("OrderPlaced")
  );
  console.log("Order details:", orderEvent?.parsedJson);
}

// Place a limit ASK (sell SUI for USDC)
async function placeLimitAsk(price: number, quantity: number) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.placeLimitOrder(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    clientOrderId: Date.now(),
    price,
    quantity,
    isBid: false,              // false = sell order
    expiration: 0,
    selfMatchingOption: 0,
    payWithDeep: true,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Limit ask placed:", result.digest);
}

// Example: Buy 5 SUI at $1.20 each
await placeLimitBid(1.2, 5);

// Example: Sell 3 SUI at $1.50 each
await placeLimitAsk(1.5, 3);
```

### Step 7: Place Market Orders

```typescript
// Market buy SUI (taker order, fills immediately at best available price)
async function marketBuy(quantity: number) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.placeMarketOrder(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    clientOrderId: Date.now(),
    quantity,
    isBid: true,               // true = market buy
    selfMatchingOption: 0,
    payWithDeep: true,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
  console.log("Market buy:", result.digest);
}

// Market sell SUI
async function marketSell(quantity: number) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.placeMarketOrder(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    clientOrderId: Date.now(),
    quantity,
    isBid: false,
    selfMatchingOption: 0,
    payWithDeep: true,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Market sell:", result.digest);
}
```

### Step 8: Cancel Orders

```typescript
// Cancel a specific order by order ID
async function cancelOrder(orderId: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.cancelOrder(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    orderId,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Order cancelled:", result.digest);
}

// Cancel all open orders in a pool
async function cancelAllOrders() {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.cancelAllOrders(tx, {
    poolKey,
    balanceManager: balanceManagerId,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("All orders cancelled:", result.digest);
}
```

### Step 9: Flash Loans

DeepBook pools support flash loans — borrow tokens from pool liquidity and repay within the same PTB.

```typescript
async function flashLoanArbitrage() {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Step 1: Borrow from DeepBook pool
  const [borrowedCoin, flashLoanReceipt] = dbClient.pool.borrowFlashLoan(tx, {
    poolKey: "SUI_USDC",
    borrowAsBase: true,        // borrow base asset (SUI)
    amount: 100_000_000_000n,  // 100 SUI
  });

  // Step 2: Use the borrowed funds (e.g., arbitrage on another DEX)
  // ... your arbitrage logic here using borrowedCoin ...
  const profitCoin = borrowedCoin; // placeholder — your arb returns this

  // Step 3: Repay the flash loan (MUST happen in same PTB)
  dbClient.pool.repayFlashLoan(tx, {
    poolKey: "SUI_USDC",
    borrowAsBase: true,
    coin: profitCoin,
    flashLoanReceipt,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Flash loan arb:", result.digest);
}
```

### Step 10: Stake DEEP for Fee Discounts

```typescript
// Stake DEEP tokens to get reduced trading fees
async function stakeDEEP(poolKey: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.stakeDeep(tx, {
    poolKey,
    balanceManager: balanceManagerId,
    amount: 1000_000_000_000n, // 1000 DEEP
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("DEEP staked:", result.digest);
}

// Unstake DEEP
async function unstakeDEEP(poolKey: string) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  dbClient.pool.unstakeDeep(tx, {
    poolKey,
    balanceManager: balanceManagerId,
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("DEEP unstaked:", result.digest);
}
```

### Step 11: Withdraw from BalanceManager

```typescript
async function withdrawSUI(amount: bigint) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  const coin = dbClient.balanceManager.withdraw(tx, {
    balanceManager: balanceManagerId,
    coinType: "0x2::sui::SUI",
    amount,
  });

  tx.transferObjects([coin], tx.pure.address(senderAddress));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  console.log("Withdraw tx:", result.digest);
}
```

### When to Use DeepBook vs AMMs

| Use Case | DeepBook (CLOB) | AMM (Cetus/7K) |
|----------|-----------------|-----------------|
| Limit orders at exact price | Best choice | Not possible |
| Market making / quoting | Best choice | Impermanent loss risk |
| Large trades with minimal slippage | Good (if liquidity) | AMM may be better aggregated |
| Simple token swaps | Overkill | Best choice (use 7K) |
| Flash loans | Supported | Varies by protocol |
| Automated trading bots | Best choice | Simpler but less control |
| Price discovery | Native | Derived from pool state |

### Step 12: Handoff

- "I want simple swaps, not an order book" -> route to `integrate-7k` or `integrate-cetus`
- "Build a custom DeFi protocol" -> route to `build-defi-protocol`
- "Deploy my trading bot" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for the protocol catalog. Never block on missing files.

## Non-Negotiables

1. **Always create a BalanceManager first**: You cannot trade on DeepBook without a BalanceManager. Create one, save its ID, and reuse it across all trading operations.
2. **Deposit funds before placing orders**: Orders will fail if your BalanceManager doesn't have sufficient balance. Always deposit before trading.
3. **Use clientOrderId for tracking**: Always set a unique `clientOrderId` on every order. This lets you correlate orders with events and manage them programmatically.
4. **Flash loans must repay in same PTB**: The flash loan receipt is a hot potato — if you don't repay within the same Programmable Transaction Block, the transaction aborts.
5. **Handle order expiration**: For time-sensitive strategies, set `expiration` to a future epoch. `0` means Good-Til-Cancelled.
6. **Stake DEEP for fee discounts**: If trading frequently, stake DEEP tokens in the pool to reduce taker and maker fees significantly.
7. **Check pool existence**: Not all token pairs have DeepBook pools. Query available pools before attempting to trade.

## References

- DeepBook Docs: https://docs.deepbook.tech/
- DeepBook V3 GitHub: https://github.com/MystenLabs/deepbookv3
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
