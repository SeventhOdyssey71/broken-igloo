# Move Best Practices and Advanced Patterns for Sui

This reference covers idiomatic patterns, design principles, testing strategies, gas optimization, upgrade safety, and security practices for production Move development on Sui.

---

## 1. Code Organization

### One Module Per Concern

Split your package into focused modules. A typical project structure:

```
my_package/
  Move.toml
  sources/
    admin.move        # Admin capabilities and governance
    types.move        # Core structs/types
    events.move       # Event definitions
    core.move         # Main business logic
    helpers.move      # Internal utility functions
  tests/
    core_tests.move
    admin_tests.move
```

### Function Visibility

```move
module example::visibility {
    // `public` — callable by anyone (other packages, transactions)
    // Use for your external API
    public fun transfer_item(item: Item, recipient: address) { /* ... */ }

    // `public(package)` — callable only within the same package
    // Use for internal cross-module helpers
    public(package) fun validate_item(item: &Item): bool { /* ... */ }

    // `entry` — callable only from transactions (not from other Move code)
    // Use for transaction entry points that should not be composed in PTBs by other packages
    entry fun admin_migrate(cap: &AdminCap) { /* ... */ }

    // private (no modifier) — callable only within this module
    // Use for implementation details
    fun calculate_fee(amount: u64): u64 { /* ... */ }
}
```

**Guidelines:**
- Default to `public(package)` for helper functions.
- Use `public` for functions that external packages or PTBs should call.
- Use `entry` sparingly — it prevents composability. Prefer `public` in most cases.
- Keep private functions for internal-only logic.

### Module Naming Conventions

- Use `snake_case` for module names: `token_swap`, `lending_pool`
- Use `PascalCase` for struct names: `LendingPool`, `AdminCap`
- Use `UPPER_SNAKE_CASE` for error constants: `EInsufficientBalance`
- Use `snake_case` for function names: `create_pool`, `deposit_collateral`

### Package Dependency Management (Move.toml)

```toml
[package]
name = "my_defi_protocol"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/mainnet" }
DeepBook = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/deepbook", rev = "main" }

[addresses]
my_defi_protocol = "0x0"
```

Pin dependency revisions to specific commits or tags for reproducible builds. Avoid `rev = "main"` in production — use a tagged release.

---

## 2. Design Patterns

### Capability Pattern

The most fundamental Sui pattern. A capability is an object that grants permission to perform an action. Whoever owns the capability object has the permission.

```move
module example::capability {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// Only the holder of AdminCap can call admin functions
    public struct AdminCap has key, store {
        id: UID,
    }

    /// More granular: a capability for minting, separate from admin
    public struct MintCap has key, store {
        id: UID,
        max_supply: u64,
        minted: u64,
    }

    fun init(ctx: &mut TxContext) {
        // Transfer AdminCap to the deployer
        transfer::transfer(AdminCap {
            id: object::new(ctx),
        }, tx_context::sender(ctx));

        transfer::transfer(MintCap {
            id: object::new(ctx),
            max_supply: 1_000_000,
            minted: 0,
        }, tx_context::sender(ctx));
    }

    /// Admin-only function: requires presenting the AdminCap
    public fun set_fee(_cap: &AdminCap, _new_fee: u64) {
        // Only someone who owns AdminCap can call this
    }

    /// Mint-only function: requires MintCap
    public fun mint(cap: &mut MintCap, amount: u64, ctx: &mut TxContext) {
        assert!(cap.minted + amount <= cap.max_supply, 0);
        cap.minted = cap.minted + amount;
        // ... mint tokens ...
    }
}
```

**Key insight**: capabilities can be transferred, shared, wrapped, or destroyed. This makes permission systems very flexible — you can delegate, revoke (by destroying), or require multi-party approval (multisig owns the cap).

### Witness Pattern

A witness is a type with `drop` that can only be created in the module that defines it. It proves the caller is the defining module. Used for one-time initialization.

```move
module example::my_coin {
    use sui::coin;
    use sui::transfer;
    use sui::tx_context::TxContext;

    /// The witness — has `drop`, no `store` or `key`
    /// Can only be created here in the init function
    public struct MY_COIN has drop {}

    /// init receives the witness as a parameter (created by the runtime)
    fun init(witness: MY_COIN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness, // Proves this is the MY_COIN module
            9,
            b"MYC",
            b"My Coin",
            b"",
            option::none(),
            ctx
        );
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(metadata);
    }
}
```

The runtime creates one instance of `MY_COIN` and passes it to `init`. Since only this module defines the type, and `init` runs exactly once at publish time, the witness guarantees one-time initialization.

### Hot Potato Pattern

A "hot potato" is a struct with no abilities — it cannot be stored, copied, dropped, or transferred. It must be consumed by a specific function in the same transaction. This forces callers to complete a multi-step flow.

```move
module example::hot_potato {
    use sui::object::UID;

    /// No abilities — cannot be dropped, stored, or transferred
    /// Must be consumed by `complete_action`
    public struct ActionReceipt {
        amount: u64,
        fee: u64,
    }

    /// Step 1: Start an action, returns a hot potato
    public fun begin_action(amount: u64): ActionReceipt {
        ActionReceipt {
            amount,
            fee: amount / 100, // 1% fee
        }
    }

    /// Step 2: MUST be called to consume the hot potato
    /// The transaction will abort if this is not called
    public fun complete_action(receipt: ActionReceipt): u64 {
        let ActionReceipt { amount, fee } = receipt; // Destructure to consume
        amount - fee
    }
}
```

Use cases: flash loans (borrow → use → repay), multi-step swaps, forced fee collection.

### Publisher Pattern

`Publisher` is a framework object that proves package-level identity. Created with `package::claim` using a One-Time Witness. Used for setting up `Display`, `TransferPolicy`, and other framework integrations.

```move
module example::my_nft {
    use sui::package;
    use sui::display;
    use sui::transfer;
    use sui::tx_context::TxContext;
    use std::string;

    public struct MY_NFT has drop {}

    public struct GameItem has key, store {
        id: UID,
        name: String,
        power: u64,
    }

    fun init(otw: MY_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        // Publisher proves we are the GameItem package
        // Required for creating Display and TransferPolicy
        let mut display = display::new<GameItem>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"{name}"));
        display::add(&mut display, string::utf8(b"power"), string::utf8(b"Power: {power}"));
        display::update_version(&mut display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
    }
}
```

### Version Pattern (Upgradeable Shared Objects)

When you upgrade a package, existing shared objects still reference the old module. Use a version field to handle migrations:

```move
module example::versioned {
    use sui::object::{Self, UID};
    use sui::dynamic_field;
    use sui::tx_context::TxContext;

    const VERSION: u64 = 1;
    const EWrongVersion: u64 = 0;

    public struct GlobalState has key {
        id: UID,
        version: u64,
    }

    /// All public functions check the version
    public fun do_something(state: &mut GlobalState) {
        assert!(state.version == VERSION, EWrongVersion);
        // ... business logic ...
    }

    /// Called after an upgrade to migrate state
    public fun migrate(state: &mut GlobalState, _admin: &AdminCap) {
        assert!(state.version == VERSION - 1, EWrongVersion);
        state.version = VERSION;
        // Add new dynamic fields, restructure data, etc.
    }
}
```

After upgrading the package, bump `VERSION` to 2 and call `migrate` to update the shared object.

### Bag/Table Pattern

`Bag` and `Table` are heterogeneous and homogeneous dynamic collections:

```move
module example::collections {
    use sui::bag::{Self, Bag};
    use sui::table::{Self, Table};
    use sui::object::{Self, UID};
    use sui::tx_context::TxContext;

    public struct GameWorld has key {
        id: UID,
        // Bag: heterogeneous — different value types per key
        settings: Bag, // "max_players" => u64, "name" => String, "active" => bool
        // Table: homogeneous — all values same type
        scores: Table<address, u64>, // player => score
    }

    public fun create_world(ctx: &mut TxContext): GameWorld {
        let mut settings = bag::new(ctx);
        bag::add(&mut settings, b"max_players", 100u64);
        bag::add(&mut settings, b"game_name", b"My Game");

        GameWorld {
            id: object::new(ctx),
            settings,
            scores: table::new(ctx),
        }
    }

    public fun set_score(world: &mut GameWorld, player: address, score: u64) {
        if (table::contains(&world.scores, player)) {
            *table::borrow_mut(&mut world.scores, player) = score;
        } else {
            table::add(&mut world.scores, player, score);
        };
    }
}
```

---

## 3. Object Design

### When to Use Each Object Type

| Object Type | Consensus? | Concurrent Access? | Best For |
|---|---|---|---|
| **Owned** | No (fast) | No (single owner) | User wallets, personal items, capabilities |
| **Shared** | Yes (slower) | Yes (anyone can access) | Pools, registries, global state |
| **Immutable** | No (fast) | Yes (read-only) | Metadata, configs, published content |
| **Wrapped** | Follows parent | Follows parent | Composition, child objects |

**Rule of thumb**: default to owned objects. Only use shared objects when multiple parties need write access to the same object in the same transaction.

### Dynamic Fields vs Dynamic Object Fields

```move
// Dynamic field: value is stored inline within the parent object
// Good for: small values (u64, bool, small structs)
dynamic_field::add(&mut parent.id, key, value);

// Dynamic object field: value is a separate object on-chain
// Good for: large objects that should be independently addressable
dynamic_object_field::add(&mut parent.id, key, child_object);
```

Dynamic object fields show up as separate objects in explorers and can be queried independently. Use them when the child should be visible.

### Object Size Optimization

```move
// BAD: Coin<T> is a full object (has UID overhead)
public struct Pool has key {
    id: UID,
    balance_a: Coin<A>, // Unnecessary overhead
}

// GOOD: Balance<T> is just the numeric value (no UID)
public struct Pool has key {
    id: UID,
    balance_a: Balance<A>, // Lighter, cheaper storage
}
```

Every stored byte costs gas. Minimize struct fields, use `Balance` instead of `Coin` inside objects, and avoid storing data that can be derived.

---

## 4. Testing Best Practices

### test_scenario Module

The `test_scenario` module simulates real multi-party transactions:

```move
#[test_only]
module example::tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use example::my_module;

    #[test]
    fun test_full_flow() {
        let admin = @0xAD;
        let user = @0xB0B;

        // Transaction 1: Admin creates the pool
        let mut scenario = ts::begin(admin);
        {
            my_module::create_pool(ts::ctx(&mut scenario));
        };

        // Transaction 2: User deposits into the pool
        ts::next_tx(&mut scenario, user);
        {
            let mut pool = ts::take_shared<my_module::Pool>(&scenario);
            let coin = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));

            my_module::deposit(&mut pool, coin, ts::ctx(&mut scenario));

            // Assert the pool balance increased
            assert!(my_module::get_balance(&pool) == 1_000_000_000, 0);

            ts::return_shared(pool);
        };

        // Transaction 3: Admin withdraws
        ts::next_tx(&mut scenario, admin);
        {
            let mut pool = ts::take_shared<my_module::Pool>(&scenario);
            let admin_cap = ts::take_from_sender<my_module::AdminCap>(&scenario);

            let withdrawn = my_module::withdraw(&mut pool, &admin_cap, ts::ctx(&mut scenario));
            assert!(coin::value(&withdrawn) == 1_000_000_000, 1);

            // Clean up
            transfer::public_transfer(withdrawn, admin);
            ts::return_shared(pool);
            ts::return_to_sender(&scenario, admin_cap);
        };

        ts::end(scenario);
    }
}
```

### Expected Failure Tests

```move
#[test]
#[expected_failure(abort_code = example::my_module::EInsufficientBalance)]
fun test_withdraw_too_much() {
    let admin = @0xAD;
    let mut scenario = ts::begin(admin);
    {
        my_module::create_pool(ts::ctx(&mut scenario));
    };
    ts::next_tx(&mut scenario, admin);
    {
        let mut pool = ts::take_shared<my_module::Pool>(&scenario);
        let admin_cap = ts::take_from_sender<my_module::AdminCap>(&scenario);

        // This should abort with EInsufficientBalance
        let coin = my_module::withdraw_amount(&mut pool, &admin_cap, 999, ts::ctx(&mut scenario));

        transfer::public_transfer(coin, admin);
        ts::return_shared(pool);
        ts::return_to_sender(&scenario, admin_cap);
    };
    ts::end(scenario);
}
```

### Testing with Clock

```move
#[test]
fun test_time_locked_action() {
    let admin = @0xAD;
    let mut scenario = ts::begin(admin);
    {
        my_module::create_timelock(ts::ctx(&mut scenario));
    };
    ts::next_tx(&mut scenario, admin);
    {
        let mut timelock = ts::take_shared<my_module::Timelock>(&scenario);
        let mut clock = sui::clock::create_for_testing(ts::ctx(&mut scenario));

        // Advance the clock to simulate time passing
        sui::clock::set_for_testing(&mut clock, 1_000_000); // 1000 seconds

        my_module::execute_after_delay(&mut timelock, &clock, ts::ctx(&mut scenario));

        ts::return_shared(timelock);
        sui::clock::destroy_for_testing(clock);
    };
    ts::end(scenario);
}
```

### Testing with Random

```move
#[test]
fun test_random_loot_drop() {
    let user = @0xB0B;
    let mut scenario = ts::begin(user);
    {
        my_module::setup(ts::ctx(&mut scenario));
    };
    ts::next_tx(&mut scenario, user);
    {
        let mut game = ts::take_shared<my_module::Game>(&scenario);
        // Create a deterministic Random for testing
        let mut random = sui::random::create_for_testing(ts::ctx(&mut scenario));
        sui::random::set_for_testing(&mut random, 42); // Seed for reproducibility

        my_module::open_loot_box(&mut game, &random, ts::ctx(&mut scenario));

        ts::return_shared(game);
        sui::random::destroy_for_testing(random);
    };
    ts::end(scenario);
}
```

---

## 5. Gas Optimization

### PTB Composition Reduces Gas

Instead of multiple transactions, batch operations into a single Programmable Transaction Block:

```typescript
// BAD: 3 separate transactions (3x base gas cost)
await client.signAndExecuteTransaction({ transaction: tx1, signer });
await client.signAndExecuteTransaction({ transaction: tx2, signer });
await client.signAndExecuteTransaction({ transaction: tx3, signer });

// GOOD: 1 PTB with 3 operations (1x base gas cost)
const tx = new Transaction();
tx.moveCall({ target: '0xPKG::mod::step1', arguments: [...] });
tx.moveCall({ target: '0xPKG::mod::step2', arguments: [...] });
tx.moveCall({ target: '0xPKG::mod::step3', arguments: [...] });
await client.signAndExecuteTransaction({ transaction: tx, signer });
```

### Owned Objects Skip Consensus

Transactions that only touch **owned objects** skip the consensus protocol entirely. They are processed in the fast path (single-owner execution), which is cheaper and faster.

**Design implication**: if an object is only ever used by one party, make it owned, not shared.

### Minimize Shared Object Contention

When many transactions touch the same shared object, they must be sequenced through consensus. This creates a bottleneck. Strategies:

```move
// BAD: Single shared counter (bottleneck)
public struct GlobalCounter has key {
    id: UID,
    count: u64,
}

// GOOD: Per-user owned counters, aggregate off-chain
public struct UserCounter has key {
    id: UID,
    owner: address,
    count: u64,
}
```

### Storage Rebates

Deleting objects returns a storage rebate. Design your system to clean up objects that are no longer needed:

```move
/// Delete a completed order and reclaim storage
public fun delete_completed_order(order: Order) {
    let Order { id, .. } = order;
    object::delete(id); // Storage rebate returned to the transaction sender
}
```

### Dynamic Fields Cost Tradeoffs

- **Struct fields**: cheaper to access (single object read), but increase object size permanently.
- **Dynamic fields**: slight overhead per access (extra lookup), but keep the parent object small and allow heterogeneous/unbounded collections.

Rule: use struct fields for a small, fixed number of fields. Use dynamic fields for collections or optional data.

---

## 6. Upgrade Patterns

### Compatible Upgrade Rules

When upgrading a published package, you can:
- Add new modules
- Add new functions to existing modules
- Add new structs to existing modules
- Change function implementations (body)

You **cannot**:
- Remove or rename existing public functions
- Change public function signatures (parameters, return types)
- Remove or change struct field layouts for structs that have `key` or `store`
- Remove modules

### UpgradeCap Lifecycle

```move
// The UpgradeCap is returned when a package is published.
// It controls who can upgrade the package and what kind of upgrades are allowed.

// Restrict to only compatible upgrades (default)
sui::package::only_additive_upgrades(&mut upgrade_cap);

// Restrict to only dependency changes (most restrictive)
sui::package::only_dep_upgrades(&mut upgrade_cap);

// Make the package permanently immutable (burn the cap)
sui::package::make_immutable(upgrade_cap);
```

### Version Migration Pattern

```move
module example::pool_v2 {
    const VERSION: u64 = 2;
    const EWrongVersion: u64 = 0;

    public struct Pool has key {
        id: UID,
        version: u64,
        balance: Balance<SUI>,
        // New field added in V2 (stored as dynamic field for compatibility):
        // fee_bps is added via dynamic_field during migration
    }

    /// Migrate from V1 to V2
    public fun migrate_v1_to_v2(
        pool: &mut Pool,
        admin_cap: &AdminCap,
    ) {
        assert!(pool.version == 1, EWrongVersion);
        pool.version = 2;

        // Add new V2 data as dynamic fields (struct layout cannot change)
        dynamic_field::add(&mut pool.id, b"fee_bps", 30u64); // 0.3% default fee
    }

    /// All V2 functions check version
    public fun deposit(pool: &mut Pool, coin: Coin<SUI>) {
        assert!(pool.version == VERSION, EWrongVersion);
        let fee_bps: u64 = *dynamic_field::borrow(&pool.id, b"fee_bps");
        // ... V2 logic with fees ...
    }
}
```

### Upgrade Governance

For critical protocols, use multisig to control the UpgradeCap:

```typescript
import { MultiSigPublicKey } from '@mysten/sui/multisig';

// Create a 2-of-3 multisig that owns the UpgradeCap
const multisig = MultiSigPublicKey.fromPublicKeys({
  threshold: 2,
  publicKeys: [
    { publicKey: admin1.getPublicKey(), weight: 1 },
    { publicKey: admin2.getPublicKey(), weight: 1 },
    { publicKey: admin3.getPublicKey(), weight: 1 },
  ],
});

// Transfer UpgradeCap to the multisig address
const tx = new Transaction();
tx.transferObjects(
  [tx.object('0xUPGRADE_CAP_ID')],
  multisig.toSuiAddress()
);
```

---

## 7. Error Handling

### Named Error Constants

```move
module example::errors {
    /// Caller is not the admin
    const ENotAdmin: u64 = 0;
    /// Insufficient balance for the operation
    const EInsufficientBalance: u64 = 1;
    /// The pool is paused
    const EPoolPaused: u64 = 2;
    /// Invalid input parameter
    const EInvalidInput: u64 = 3;
    /// Operation has expired
    const EExpired: u64 = 4;

    public fun deposit(pool: &mut Pool, coin: Coin<SUI>, ctx: &TxContext) {
        assert!(!pool.paused, EPoolPaused);
        assert!(coin::value(&coin) > 0, EInvalidInput);
        // ...
    }
}
```

### Error Code Conventions

- Use `E` prefix for all error constants: `ENotAdmin`, `EInsufficientFunds`
- Start from 0 and increment sequentially within each module
- Document each error constant with a comment
- Use `assert!(condition, ERROR_CODE)` — this aborts with the code if the condition is false

### assert! vs abort

```move
// assert! — preferred for conditional checks (more readable)
assert!(balance >= amount, EInsufficientBalance);

// abort — used for unconditional failure (rare)
if (some_complex_condition()) {
    // ... handle ...
} else {
    abort EInvalidState
};
```

---

## 8. Security Patterns

### Input Validation at Entry Functions

Always validate all inputs at the outermost `public` / `entry` function:

```move
public fun create_order(
    pool: &mut Pool,
    price: u64,
    quantity: u64,
    coin: Coin<SUI>,
    ctx: &mut TxContext
) {
    // Validate inputs FIRST
    assert!(price > 0, EInvalidPrice);
    assert!(quantity > 0, EInvalidQuantity);
    assert!(quantity <= MAX_ORDER_SIZE, EOrderTooLarge);
    assert!(coin::value(&coin) >= price * quantity, EInsufficientPayment);

    // Business logic after validation
    // ...
}
```

### Capability Delegation and Escrow

```move
/// A time-limited delegated capability
public struct DelegatedMintCap has key {
    id: UID,
    original_owner: address,
    delegate: address,
    max_mint: u64,
    minted: u64,
    expiry_ms: u64,
}

public fun delegated_mint(
    cap: &mut DelegatedMintCap,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == cap.delegate, ENotDelegate);
    assert!(clock::timestamp_ms(clock) < cap.expiry_ms, EExpired);
    assert!(cap.minted + amount <= cap.max_mint, EExceedsLimit);
    cap.minted = cap.minted + amount;
    // ... mint logic ...
}

/// Revoke delegation by destroying the cap
public fun revoke_delegation(cap: DelegatedMintCap, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == cap.original_owner, ENotOwner);
    let DelegatedMintCap { id, .. } = cap;
    object::delete(id);
}
```

### Time-Based Locks

```move
module example::timelock {
    use sui::clock::{Self, Clock};

    public struct TimeLock has key {
        id: UID,
        unlock_timestamp_ms: u64,
        value: Balance<SUI>,
    }

    /// Create a time lock that cannot be withdrawn until the unlock time
    public fun lock(
        coin: Coin<SUI>,
        lock_duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(clock);
        let timelock = TimeLock {
            id: object::new(ctx),
            unlock_timestamp_ms: now + lock_duration_ms,
            value: coin::into_balance(coin),
        };
        transfer::transfer(timelock, tx_context::sender(ctx));
    }

    /// Withdraw only after the lock period
    public fun unlock(
        timelock: TimeLock,
        clock: &Clock,
        ctx: &mut TxContext
    ): Coin<SUI> {
        let TimeLock { id, unlock_timestamp_ms, value } = timelock;
        assert!(clock::timestamp_ms(clock) >= unlock_timestamp_ms, EStillLocked);
        object::delete(id);
        coin::from_balance(value, ctx)
    }
}
```

### Secure Randomness

```move
module example::lottery {
    use sui::random::{Self, Random, RandomGenerator};

    /// Draw a winner using on-chain randomness
    /// MUST be called via entry to prevent test-and-abort attacks
    entry fun draw_winner(
        lottery: &mut Lottery,
        random: &Random,
        ctx: &mut TxContext
    ) {
        let mut generator = random::new_generator(random, ctx);
        let participant_count = vector::length(&lottery.participants);
        let winner_index = random::generate_u64_in_range(&mut generator, 0, participant_count - 1);
        let winner = *vector::borrow(&lottery.participants, winner_index);

        // Transfer prize to winner
        let prize = balance::withdraw_all(&mut lottery.prize_pool);
        transfer::public_transfer(
            coin::from_balance(prize, ctx),
            winner,
        );
    }
}
```

**Critical**: functions that use `Random` should be `entry` functions, not `public`. This prevents composability attacks where a caller wraps the random call in a PTB and aborts if they don't like the outcome (test-and-abort attack).

### Preventing Flash Loan Attacks in DeFi

Flash loan attacks exploit price oracles or pool states within a single transaction. Defenses:

```move
module example::flash_loan_safe {
    use sui::clock::Clock;

    public struct PriceOracle has key {
        id: UID,
        price: u64,
        last_update_ms: u64,
    }

    /// Use time-weighted average price (TWAP) instead of spot price
    public fun get_safe_price(
        oracle: &PriceOracle,
        clock: &Clock,
    ): u64 {
        // Ensure the price is not stale
        let age_ms = clock::timestamp_ms(clock) - oracle.last_update_ms;
        assert!(age_ms < 60_000, EStalePrice); // Max 60 seconds old

        oracle.price
    }

    /// Alternatively: use a receipt pattern that spans multiple transactions
    /// (hot potato that must be resolved in a DIFFERENT tx)
    public struct DelayedAction has key {
        id: UID,
        action_data: vector<u8>,
        created_epoch: u64,
    }

    /// Step 1: Request an action (returns an owned object, not a hot potato)
    public fun request_action(data: vector<u8>, ctx: &mut TxContext) {
        transfer::transfer(DelayedAction {
            id: object::new(ctx),
            action_data: data,
            created_epoch: tx_context::epoch(ctx),
        }, tx_context::sender(ctx));
    }

    /// Step 2: Execute the action (must be a DIFFERENT epoch/transaction)
    public fun execute_action(action: DelayedAction, ctx: &mut TxContext) {
        assert!(tx_context::epoch(ctx) > action.created_epoch, ETooSoon);
        let DelayedAction { id, action_data, .. } = action;
        object::delete(id);
        // ... execute the delayed action ...
    }
}
```

---

## Summary: Quick Reference

| Topic | Best Practice |
|---|---|
| **Visibility** | Default to `public(package)`, use `public` for external APIs |
| **Capabilities** | One cap per permission type; transfer to delegate |
| **Initialization** | Use One-Time Witness for anything that must happen once |
| **Forced flows** | Hot potato pattern (no abilities = must consume) |
| **Collections** | `Table` for same-type, `Bag` for mixed-type, `dynamic_field` for extensibility |
| **Objects** | Owned unless shared access is required; `Balance` not `Coin` inside objects |
| **Testing** | `test_scenario` for multi-party flows; `expected_failure` for abort tests |
| **Gas** | Batch with PTBs; prefer owned objects; delete unused objects for rebates |
| **Upgrades** | Version field + migration function; multisig UpgradeCap |
| **Errors** | `E`-prefixed constants; `assert!` for checks; sequential codes |
| **Security** | Validate inputs early; `entry` for randomness; TWAP for oracle prices |
| **Randomness** | Always use `entry` (not `public`) to prevent test-and-abort attacks |
