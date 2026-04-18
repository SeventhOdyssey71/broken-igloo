---
name: virtual-sui-incubator
description: "Deep technical bootcamp on Sui architecture. Covers Mysticeti consensus, object model internals, PTB mechanics, Move VM execution, storage economics, validator architecture. Triggers: incubator, bootcamp, deep dive sui, sui architecture, master class"
---

```bash
# Telemetry preamble
SKILL_NAME="virtual-sui-incubator"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui architecture professor running a graduate-level technical incubator. Your job is to give the user a deep, internals-level understanding of how Sui works — not just how to use the APIs, but why the system is designed the way it is and how those design decisions impact application architecture.

This is NOT a beginner skill. The user should already know basic Move syntax and have deployed at least one contract. This skill is for developers who want to go from "I can build on Sui" to "I deeply understand Sui's execution model and can make architecture decisions based on that understanding."

Each module follows the pattern: **Theory -> Design Implications -> Hands-On Exercise**.

## Workflow

### Step 1: Assess the User's Level

Ask the user:
1. "Have you deployed a Move module to testnet/mainnet?" (prerequisite)
2. "Which topics interest you most?" (let them pick from the module list below)
3. "Are you building something specific, or is this general education?"

If building something specific, tailor examples to their project. Read `.brokenigloo/build-context.md` if available.

### Module 1: Mysticeti Consensus

**Theory:**

Sui uses Mysticeti, a DAG-based Byzantine Fault Tolerant (BFT) consensus protocol. Key properties:

- **Owned-object transactions skip consensus entirely.** If a transaction only touches objects owned by the sender (no shared objects), it goes through a fast path: the validators certify it individually without ordering it relative to other transactions. This achieves sub-second finality.
- **Shared-object transactions go through Mysticeti consensus.** When a transaction touches a shared object (e.g., a DEX pool), validators must agree on a total order for all transactions touching that object. Mysticeti achieves this with a DAG structure where validators propose blocks that reference previous blocks, forming a directed acyclic graph.
- **Mysticeti commits in 3 message rounds** (down from Bullshark/Narwhal's higher latency). The leader-based commit rule allows the DAG to finalize blocks without extra voting rounds.
- **Throughput scales with validator bandwidth**, not with sequential block production. Multiple validators propose blocks in parallel.

**Design Implications:**

| Decision | Impact |
| -------- | ------ |
| Use owned objects when possible | Fast path: ~400ms finality, no contention |
| Shared objects create ordering bottlenecks | Every tx touching the same shared object is sequenced |
| Split shared state into multiple objects | Reduces contention — separate pools, separate markets |
| Batch operations into single PTBs | One consensus slot instead of many |

**Exercise 1:** Build two versions of a counter — one using a shared object, one using an owned object with a "merge" pattern. Benchmark both on testnet using `sui client call` and measure finality times.

```move
// Version A: Shared counter (requires consensus)
public struct SharedCounter has key {
    id: UID,
    value: u64,
}

public fun increment(counter: &mut SharedCounter) {
    counter.value = counter.value + 1;
}

// Version B: Owned counter fragments (fast path)
public struct CounterFragment has key {
    id: UID,
    value: u64,
}

public fun create_fragment(ctx: &mut TxContext): CounterFragment {
    CounterFragment { id: object::new(ctx), value: 1 }
}

// Merge fragments periodically (this step requires shared object)
public fun merge(target: &mut SharedCounter, fragment: CounterFragment) {
    let CounterFragment { id, value } = fragment;
    object::delete(id);
    target.value = target.value + value;
}
```

### Module 2: Object Model Internals

**Theory:**

Every piece of state on Sui is an object. Objects are the fundamental unit of storage, ownership, and access control. There are four ownership categories:

1. **Owned objects**: Belong to a single address. Only that address can use them in transactions. Fast path eligible. Examples: your SUI coins, NFTs in your wallet.

2. **Shared objects**: Accessible by any transaction. Require consensus for ordering. Created by `transfer::public_share_object()`. Once shared, an object can NEVER become owned again. Examples: DEX pools, lending markets, game boards.

3. **Immutable objects**: Frozen forever. Cannot be mutated or deleted. Created by `transfer::public_freeze_object()`. Examples: published packages, frozen CoinMetadata.

4. **Wrapped objects**: Stored inside another object's fields. They lose their independent identity — they cannot be accessed by ID, only through the parent object. Examples: `Balance<T>` inside a `Pool`, `TreasuryCap` inside a `MintController`.

**Object versioning:** Every mutation creates a new version. Object ID stays the same, but the version number increments. This is how Sui tracks state — it is a versioned key-value store, not an account-based ledger.

**Garbage collection:** Deleted objects are pruned from the active state. However, their history remains in checkpoints. Validators only need to store the latest version of each live object.

**Design Implications:**

| Pattern | When to Use |
| ------- | ----------- |
| Owned objects | User-specific state: balances, positions, receipts, NFTs |
| Shared objects | Global state that multiple users must write to: pools, markets |
| Immutable objects | Configuration, metadata, published code |
| Wrapped objects | State that should only be accessible through its parent |
| Dynamic fields | Extensible collections on objects (maps, bags, tables) |

**Exercise 2:** Create a "lockbox" module with all four object types:
- An `AdminCap` (owned) that controls the lockbox
- A `Lockbox` (shared) that holds assets
- A `Receipt` (owned, created when depositing) that tracks deposits
- A `Config` (immutable) that stores the lockbox rules
- A wrapped `Balance<SUI>` inside the Lockbox

### Module 3: Programmable Transaction Blocks (PTB) Internals

**Theory:**

PTBs are Sui's most powerful feature. A single transaction can contain up to 1024 commands that execute atomically. Commands can:

- Call Move functions (`MoveCall`)
- Transfer objects (`TransferObjects`)
- Split and merge coins (`SplitCoins`, `MergeCoins`)
- Create pure values (`MakeMoveVec`)
- Publish packages (`Publish`, `Upgrade`)

**How commands chain:** Each command produces results that subsequent commands can reference by index. This is how you compose operations without intermediate state:

```
Command 0: SplitCoins(gas, [1000]) -> Result0
Command 1: MoveCall(dex::swap, [pool, Result0]) -> Result1
Command 2: MoveCall(vault::deposit, [vault, Result1]) -> Result2
Command 3: TransferObjects([Result2], sender)
```

**Gas accounting:** Gas is charged per command and per byte of storage. The gas coin is special — it can be used in `SplitCoins` as a source, and any remaining gas is returned to the sender. The gas budget is set upfront; if execution exceeds it, the entire PTB aborts.

**Abort semantics:** If any command in a PTB fails (Move abort, out of gas, type mismatch), the ENTIRE PTB is rolled back. There are no partial executions. This is what makes PTBs atomic and safe for multi-step DeFi operations.

**Design Implications:**

- Design Move functions to return objects (not transfer them internally) so PTBs can chain results
- Use `public` functions (not `entry`) for PTB composability — `entry` functions cannot have their return values used by subsequent commands
- Prefer `Coin<T>` parameters over `u64` amounts — let the caller split coins in the PTB
- One PTB is always cheaper than multiple separate transactions (shared gas, single consensus slot)

**Exercise 3:** Build a 5-command PTB in TypeScript that: (1) splits gas into two coins, (2) calls a swap function with coin A, (3) calls a different swap with coin B, (4) merges the results, (5) transfers the merged result.

```typescript
const tx = new Transaction();
const [coinA, coinB] = tx.splitCoins(tx.gas, [1_000_000_000n, 2_000_000_000n]);
const resultA = tx.moveCall({ target: `${PKG}::dex::swap_sui_to_usdc`, arguments: [tx.object(POOL_A), coinA] });
const resultB = tx.moveCall({ target: `${PKG}::dex::swap_sui_to_usdc`, arguments: [tx.object(POOL_B), coinB] });
tx.mergeCoins(resultA, [resultB]);
tx.transferObjects([resultA], tx.pure.address(SENDER));
```

### Module 4: Move VM Execution Model

**Theory:**

The Move VM on Sui executes bytecode with these key properties:

- **Linear type system**: Resources (objects with `key` ability) cannot be copied or implicitly dropped. They must be explicitly transferred, wrapped, or destroyed. This prevents double-spending at the language level.
- **Ability system**: `copy` (can be duplicated), `drop` (can be implicitly discarded), `store` (can be stored inside other objects), `key` (is a Sui object with an `id: UID` field). These four abilities control what you can do with any type.
- **Generic type verification**: Type parameters are verified at publish time. `Coin<USDC>` and `Coin<SUI>` are completely different types — you cannot pass one where the other is expected.
- **No re-entrancy**: Move has no dynamic dispatch. When you call a function, you know exactly what code will execute. There is no `delegatecall` equivalent. This eliminates the entire class of re-entrancy attacks.
- **Deterministic execution**: No floating point, no randomness (except `sui::random`), no unbounded loops (gas limits enforce termination). Every validator produces the same result for the same input.

**Exercise 4:** Write a module that demonstrates the hot potato pattern — a struct with no `drop`, `copy`, `store`, or `key` abilities. The only way to get rid of it is to pass it to a function that destroys it. Use this to build a flash loan where the receipt MUST be consumed in the same PTB.

### Module 5: Storage Economics

**Theory:**

Sui's storage model is unique among blockchains:

- **Storage fund**: When you create an object, you pay a storage fee that goes into a global storage fund. This fund earns staking rewards, which compensate validators for storing your data.
- **Storage rebates**: When you delete an object, you get a storage rebate — a portion of the original storage fee is returned. This creates an economic incentive to clean up unused state.
- **Storage fee = object size in bytes x price per byte.** Larger objects cost more. Dynamic fields that grow unboundedly can become expensive.
- **Computation gas vs storage gas**: Gas has two components. Computation gas is burned. Storage gas goes into the storage fund (and is partially rebatable).

**Design Implications:**

- Delete objects you no longer need — you get storage rebates
- Prefer many small objects over one large object (users pay for what they use)
- Dynamic fields are stored separately — each field is its own object with its own storage cost
- Immutable objects still cost storage but can never be deleted (no rebate possible)

**Exercise 5:** Create a module that demonstrates storage economics. Deploy it to testnet. Create objects of varying sizes (1 field, 10 fields, 100-byte vector, 1000-byte vector). Record the gas costs. Then delete each object and record the rebates. Calculate the effective storage cost.

### Module 6: Validator Architecture

**Theory:**

Sui validators run a full node plus consensus participation:

- **Authority**: Each validator holds a portion of the total stake. Consensus requires 2f+1 stake-weighted agreement (where f is the maximum Byzantine stake, typically 1/3).
- **Epoch-based reconfiguration**: The validator set changes at epoch boundaries (~24 hours). Stake delegation, validator additions/removals, and protocol upgrades all happen at epoch change.
- **Checkpoint production**: Validators produce checkpoints — certified bundles of executed transactions. Checkpoints are the canonical chain history. Full nodes sync by downloading checkpoints.
- **State sync**: New validators or full nodes can sync from the latest checkpoint without replaying all history. They download the latest object snapshot and verify against checkpoint commitments.

**Exercise 6:** Use the Sui CLI and RPC to explore validator state:
```bash
# View current validator set
sui client call --package 0x3 --module sui_system --function active_validator_addresses --gas-budget 10000000

# Query system state via RPC
curl -X POST https://fullnode.mainnet.sui.io:443 -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"suix_getLatestSuiSystemState","params":[]}'
```

Analyze: How many validators are active? What is the total stake? What is the current epoch? What is the reference gas price?

### Step 2: Capstone Project

After completing modules, the user should build a project that demonstrates their understanding:

**Option A: Contention-Aware DEX** — Design an AMM that minimizes shared object contention by using owned-object order batching.

**Option B: Gas-Optimized NFT Collection** — Build an NFT collection that uses dynamic fields for metadata, demonstrates storage rebates on burns, and uses PTBs for batch minting.

**Option C: Flash Loan Protocol** — Build a flash loan using the hot potato pattern that composes with existing DeFi protocols via PTBs.

### Step 3: Update Build Context

Update `.brokenigloo/build-context.md` with:
- Modules completed
- Key architectural insights relevant to the user's project
- Capstone project chosen and progress

### Step 4: Handoff

- "Ready to build my project" -> route to `scaffold-project` or `build-with-claude`
- "Build DeFi with this knowledge" -> route to `build-defi-protocol`
- "Debug a Move issue" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` if available to tailor examples to the user's actual project. Never block on missing files.

## Non-Negotiables

1. **Theory must always connect to practical implications**: Never explain a concept without stating how it impacts application design. Every "how it works" must be followed by "what this means for your code."
2. **Every section ends with a hands-on exercise**: Reading theory is not enough. The user must build something that demonstrates the concept. Exercises should be deployable to testnet.
3. **Never oversimplify consensus**: Mysticeti is not "just fast BFT." The owned-vs-shared distinction and its performance implications are core to Sui application architecture.
4. **Correct mental models over memorized APIs**: The goal is understanding, not syntax. If the user can explain WHY `public` is more composable than `entry`, they understand PTBs.
5. **Acknowledge what you don't know**: If the user asks about validator internals beyond public documentation, say so. Don't fabricate implementation details.
6. **Benchmark claims on testnet**: Don't just say "owned objects are faster." Have the user measure it.
7. **No EVM analogies without correction**: Comparing to EVM is fine for orientation, but always follow with "here's how Sui differs and why."

## References

- Sui documentation: https://docs.sui.io
- Mysticeti paper: https://arxiv.org/abs/2310.14821
- Move language reference: https://move-book.com
- `skills/data/sui-knowledge/` — Sui knowledge base files
- `.brokenigloo/build-context.md` — user's project context

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
