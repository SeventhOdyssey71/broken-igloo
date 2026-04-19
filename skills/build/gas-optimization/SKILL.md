---
name: gas-optimization
description: "Gas optimization guide for Sui Move. Covers owned vs shared object costs, PTB batching, storage rebates, object size optimization, benchmarking gas usage, computation vs storage costs, and cost-effective design patterns. Triggers: gas optimization, gas cost, gas fee, storage rebate, object size, optimize gas, reduce gas, gas benchmark, computation cost, storage cost, sui gas"
---

```bash
# Telemetry preamble
SKILL_NAME="gas-optimization"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui gas optimization specialist. Your job is to guide the user through minimizing gas costs for their Sui applications. Sui's gas model is fundamentally different from EVM: you pay for **computation**, **storage**, and **non-refundable overhead**, but you get **storage rebates** when deleting objects. Understanding these components is key to building cost-efficient applications.

**Sui Gas Model:**

| Component | Description | How to Reduce |
|-----------|-------------|---------------|
| **Computation** | CPU cycles for execution | Simpler logic, fewer Move calls |
| **Storage (write)** | Creating/growing objects | Smaller objects, fewer fields |
| **Storage (read)** | Reading objects | Fewer object accesses per tx |
| **Storage rebate** | Refund for deleting objects | Delete objects when no longer needed |
| **Non-refundable** | Fixed overhead per tx | Batch operations in PTBs |

**Key insight**: On Sui, **storage is the dominant cost**, not computation. A transaction that creates a large object costs much more than one with complex math on small objects.

## Workflow

### Step 1: Understand the Cost Breakdown

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Inspect gas costs of a transaction
async function analyzeGasCost(digest: string) {
  const tx = await client.getTransactionBlock({
    digest,
    options: { showEffects: true },
  });

  const gasUsed = tx.effects!.gasUsed;
  console.log("Gas Breakdown:");
  console.log("  Computation:", gasUsed.computationCost, "MIST");
  console.log("  Storage:", gasUsed.storageCost, "MIST");
  console.log("  Storage Rebate:", gasUsed.storageRebate, "MIST");
  console.log("  Non-refundable:", gasUsed.nonRefundableStorageFee, "MIST");

  const totalCost =
    BigInt(gasUsed.computationCost) +
    BigInt(gasUsed.storageCost) -
    BigInt(gasUsed.storageRebate);

  console.log("  NET COST:", totalCost.toString(), "MIST");
  console.log("  NET COST:", Number(totalCost) / 1e9, "SUI");
}
```

### Step 2: Owned vs Shared Object Costs

```
Owned Objects:
  - Transactions can be processed in PARALLEL
  - Lower consensus overhead
  - Faster finality (~400ms)
  - Cheaper per transaction

Shared Objects:
  - Transactions must go through CONSENSUS
  - Higher overhead (consensus ordering)
  - Slower finality (~2-3s)
  - More expensive per transaction

Rule of thumb: shared object txs cost ~2-5x more than owned object txs
```

**Optimization: Prefer owned objects when possible**

```move
// EXPENSIVE: Global counter as shared object
// Every increment requires consensus
public struct GlobalCounter has key {
    id: UID,
    count: u64,
}

// CHEAPER: Per-user counter as owned object
// Increments are parallel, no consensus needed
public struct UserCounter has key {
    id: UID,
    count: u64,
}

// BEST: Aggregate user counters off-chain or via events
// No on-chain storage cost for the count at all
public struct CountEvent has copy, drop {
    user: address,
    action: u8,
}
```

### Step 3: Object Size Optimization

```move
// EXPENSIVE: Large object with redundant data
public struct ExpensiveNFT has key, store {
    id: UID,
    name: String,              // ~50 bytes
    description: String,       // ~500 bytes (!)
    full_image_data: vector<u8>, // ~100KB (!!!)
    creator: address,
    attributes: vector<String>, // variable
    metadata_json: String,     // ~1KB
}
// Estimated object size: ~102KB
// Storage cost: ~102KB * reference_gas_price

// CHEAPER: Minimal on-chain data, link to off-chain storage
public struct CheapNFT has key, store {
    id: UID,
    name: String,              // ~50 bytes
    number: u64,               // 8 bytes
    image_url: String,         // ~100 bytes (URL, not image data)
    attributes_hash: vector<u8>, // 32 bytes (hash of attributes)
}
// Estimated object size: ~200 bytes
// Storage cost: ~500x cheaper!

// Use Display standard for metadata — it's a separate shared object,
// not per-NFT storage:
// display.add("description", "Collection description");
// display.add("image_url", "{image_url}");
```

### Step 4: PTB Batching

```typescript
// EXPENSIVE: 5 separate transactions (5x base cost)
for (const recipient of recipients) {
  const tx = new Transaction();
  tx.transferObjects(
    [tx.splitCoins(tx.gas, [tx.pure.u64("100000000")])],
    tx.pure.address(recipient),
  );
  await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
}

// CHEAPER: 1 PTB with 5 operations (1x base cost)
const tx = new Transaction();
for (const recipient of recipients) {
  tx.transferObjects(
    [tx.splitCoins(tx.gas, [tx.pure.u64("100000000")])],
    tx.pure.address(recipient),
  );
}
await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });

// EVEN CHEAPER: Use makeMoveVec for batch operations
const tx = new Transaction();
const coins = recipients.map(() =>
  tx.splitCoins(tx.gas, [tx.pure.u64("100000000")])
);
// Transfer all at once
recipients.forEach((recipient, i) => {
  tx.transferObjects([coins[i]], tx.pure.address(recipient));
});
```

### Step 5: Storage Rebates (Delete Objects to Save Gas)

```move
// Every object stored on-chain has a storage deposit
// When you DELETE an object, you get ~99% of the deposit back

// BAD: Never deleting temporary objects
entry fun process_order(order: Order) {
    // Process the order...
    // But the Order object stays on-chain forever!
    transfer::public_transfer(order, @0x0); // Sending to burn address wastes gas
}

// GOOD: Properly delete temporary objects
entry fun process_order(order: Order) {
    // Process the order...
    let Order { id, amount: _, buyer: _ } = order;
    object::delete(id);
    // Storage deposit is refunded!
}

// PATTERN: Use wrapper objects that get cleaned up
public struct TempReceipt has key {
    id: UID,
    data: u64,
}

entry fun create_and_use(ctx: &mut TxContext) {
    let receipt = TempReceipt { id: object::new(ctx), data: 42 };
    // ... use receipt ...
    let TempReceipt { id, data: _ } = receipt;
    object::delete(id);
    // Net storage cost: ~0 (create + delete in same tx)
}
```

### Step 6: Efficient Data Structures

```move
// EXPENSIVE: vector for large collections (linear scan)
public struct Registry has key {
    id: UID,
    entries: vector<Entry>, // O(n) lookup, entire vector loaded on access
}

// CHEAPER: Table for key-value lookups (O(1), lazy loading)
public struct Registry has key {
    id: UID,
    entries: Table<address, Entry>, // Only loads accessed entries
}

// CHEAPEST for infrequent access: dynamic fields
// No upfront cost, only pay when accessing specific fields
public struct Registry has key {
    id: UID,
    // Entries stored as dynamic fields — each is a separate object
    // Only the accessed entry is loaded, not the entire collection
}

entry fun add_entry(registry: &mut Registry, key: address, value: u64) {
    dynamic_field::add(&mut registry.id, key, value);
}

entry fun get_entry(registry: &Registry, key: address): u64 {
    *dynamic_field::borrow(&registry.id, key)
}
```

### Step 7: Gas Budget Best Practices

```typescript
// Setting gas budget correctly

// Too low: transaction fails, gas is still consumed
const tx = new Transaction();
tx.setGasBudget(1_000_000); // Might be too low for complex operations

// Too high: no extra cost (unused budget is refunded), but wallet UI
// shows a scary number
tx.setGasBudget(1_000_000_000); // 1 SUI — wastefully high for simple tx

// Best practice: use dry-run to estimate, then add margin
async function executeWithOptimalGas(tx: Transaction, keypair: any) {
  tx.setSender(keypair.getPublicKey().toSuiAddress());

  // Dry run to estimate gas
  const dryRunResult = await client.dryRunTransactionBlock({
    transactionBlock: await tx.build({ client }),
  });

  const estimatedGas =
    BigInt(dryRunResult.effects.gasUsed.computationCost) +
    BigInt(dryRunResult.effects.gasUsed.storageCost);

  // Add 20% margin
  const gasBudget = (estimatedGas * 120n) / 100n;
  tx.setGasBudget(gasBudget);

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
}
```

### Step 8: Benchmarking Gas Usage

```bash
# Run Move tests with gas profiling
sui move test --gas-profiling

# Compare gas costs between two implementations
sui move test --filter test_implementation_a --statistics
sui move test --filter test_implementation_b --statistics
```

```move
// In tests, you can measure gas by checking test statistics output
#[test]
fun bench_vector_approach() {
    // ... vector-based implementation
    // Check the --statistics output for gas used
}

#[test]
fun bench_table_approach() {
    // ... table-based implementation
    // Compare gas usage in --statistics output
}
```

### Gas Optimization Cheat Sheet

| Optimization | Savings | Effort |
|-------------|---------|--------|
| Batch operations in PTBs | 50-80% | Low |
| Use owned objects instead of shared | 50-70% | Medium |
| Minimize object size (URLs, not data) | 30-90% | Low |
| Delete temporary objects | 30-99% rebate | Low |
| Use Table/dynamic fields vs vectors | 20-60% for reads | Medium |
| Combine coin objects before operations | 10-30% | Low |
| Use events instead of on-chain storage | 90%+ | Medium |
| Dry-run for accurate gas budgets | N/A (UX) | Low |

### Step 9: Handoff

- "I need to design my Move architecture" -> route to `move-patterns`
- "Review my code for efficiency" -> route to `review-and-iterate`
- "Deploy to mainnet" -> route to `deploy-to-mainnet`
- "Debug a gas error" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Storage dominates cost, not computation** — optimize object sizes first, computation second. A smaller object saves more gas than a simpler algorithm.
2. **Delete objects when no longer needed** — storage rebates return ~99% of the storage deposit. Never leave temporary objects on-chain.
3. **Batch operations in PTBs** — every separate transaction has a fixed overhead. Combine related operations into a single PTB.
4. **Use owned objects over shared objects when possible** — shared objects require consensus and cost 2-5x more. Only use shared when multiple users must access the same object.
5. **Never store large data on-chain** — images, documents, and large JSON should be on Walrus or IPFS. Store only hashes and URLs on-chain.
6. **Use Table for key-value lookups, not vectors** — vectors load entirely into memory on access. Tables load only the accessed entry.
7. **Dry-run before setting gas budgets** — never hardcode gas budgets. Use `dryRunTransactionBlock` and add a 20% margin.
8. **Use events for indexable data that does not need on-chain access** — events are 10-100x cheaper than object storage and are indexable by explorers and custom indexers.

## References

- Sui Gas Pricing: https://docs.sui.io/concepts/tokenomics/gas-pricing
- Sui Gas in Move: https://docs.sui.io/concepts/tokenomics/gas-in-sui
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
