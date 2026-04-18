# Move Language for Sui

## Overview

Sui Move is a variant of the Move language originally developed for the Diem (formerly Libra) project. It's a **resource-oriented** programming language designed specifically for safe asset manipulation on blockchains.

## Module Structure

```move
module my_package::my_module {
    // Imports
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::TxContext;
    use sui::coin::{Self, Coin};

    // Struct definitions
    public struct MyObject has key, store {
        id: UID,
        value: u64,
    }

    // Constructor
    public fun new(ctx: &mut TxContext): MyObject {
        MyObject {
            id: object::new(ctx),
            value: 0,
        }
    }

    // Entry function (callable from transactions)
    public entry fun create(ctx: &mut TxContext) {
        let obj = new(ctx);
        transfer::transfer(obj, tx_context::sender(ctx));
    }
}
```

## Abilities System

Every struct in Move declares which **abilities** it has:

| Ability | Meaning                                                              | Use Case                                     |
| ------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `key`   | Can exist as a top-level object (must have `id: UID` as first field) | NFTs, coins, any addressable object          |
| `store` | Can be stored inside other objects and transferred                   | Composable data, transferable assets         |
| `copy`  | Can be duplicated                                                    | Primitive-like data (rarely used for assets) |
| `drop`  | Can be silently destroyed                                            | Temporary data, receipts                     |

### Common Combinations

```move
// Asset (NFT, token) — cannot copy or drop
public struct NFT has key, store { id: UID, name: String }

// Hot potato — must be consumed, cannot be stored or dropped
public struct Receipt { amount: u64 }

// Capability — grants permission to perform actions
public struct AdminCap has key, store { id: UID }

// Pure data — copyable and droppable
public struct Config has copy, drop, store { max_supply: u64 }
```

## Object Patterns

### Creating Objects

```move
public fun create_sword(ctx: &mut TxContext): Sword {
    Sword {
        id: object::new(ctx),
        damage: 100,
    }
}
```

### Transfer Patterns

```move
// Transfer to a specific address (owned object)
transfer::transfer(obj, recipient);

// Share object (anyone can access)
transfer::share_object(obj);

// Freeze object (immutable forever)
transfer::freeze_object(obj);

// Public transfer (for objects with `store` ability)
transfer::public_transfer(obj, recipient);
```

### Ownership in Function Signatures

```move
// Takes ownership (consumes the object)
public fun destroy(obj: MyObject) {
    let MyObject { id, value: _ } = obj;
    object::delete(id);
}

// Mutable reference (modifies but doesn't consume)
public fun increment(obj: &mut MyObject) {
    obj.value = obj.value + 1;
}

// Immutable reference (read-only)
public fun get_value(obj: &MyObject): u64 {
    obj.value
}
```

## The Coin Standard

Sui's fungible token standard — equivalent to ERC-20/SPL Token:

### Creating a New Currency

```move
module my_package::my_coin {
    use sui::coin;

    public struct MY_COIN has drop {}

    fun init(witness: MY_COIN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                          // decimals
            b"MYC",                     // symbol
            b"My Coin",                 // name
            b"A description",           // description
            option::none(),             // icon URL
            ctx,
        );
        // Transfer TreasuryCap to deployer (controls minting)
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        // Freeze metadata (immutable)
        transfer::public_freeze_object(metadata);
    }
}
```

### Key Concepts

- **`TreasuryCap<T>`** — whoever holds this can mint/burn tokens of type `T`
- **`CoinMetadata<T>`** — on-chain metadata (name, symbol, decimals, icon)
- **`Coin<T>`** — an object holding a balance of type `T`
- **`Balance<T>`** — raw balance value (no UID, used inside other objects)

### Coin Operations

```move
// Mint new coins
let coin = coin::mint(&mut treasury_cap, 1000000, ctx);

// Split a coin
let split_coin = coin::split(&mut coin, 500000, ctx);

// Merge coins
coin::join(&mut coin, other_coin);

// Get balance
let amount = coin::value(&coin);

// Burn coins
coin::burn(&mut treasury_cap, coin);
```

## Dynamic Fields

Add arbitrary key-value storage to any object at runtime:

```move
use sui::dynamic_field as df;
use sui::dynamic_object_field as dof;

// Add a field
df::add(&mut parent.id, b"score", 42u64);

// Read a field
let score: &u64 = df::borrow(&parent.id, b"score");

// Modify a field
let score: &mut u64 = df::borrow_mut(&mut parent.id, b"score");
*score = 100;

// Remove a field
let score: u64 = df::remove(&mut parent.id, b"score");

// Dynamic OBJECT fields — child is a full object, visible on-chain
dof::add(&mut parent.id, b"child", child_object);
```

### When to Use

- **Dynamic fields**: Arbitrary data attached to objects (like a HashMap)
- **Dynamic object fields**: When the child needs to be independently addressable
- Replaces Solana's pattern of creating multiple PDAs for storage

## Events

Emit structured events for off-chain indexing:

```move
use sui::event;

public struct SwapEvent has copy, drop {
    pool_id: ID,
    sender: address,
    amount_in: u64,
    amount_out: u64,
}

public fun swap(/* ... */) {
    // ... swap logic ...
    event::emit(SwapEvent {
        pool_id: object::id(pool),
        sender: tx_context::sender(ctx),
        amount_in,
        amount_out,
    });
}
```

## Common Patterns

### Witness Pattern (One-Time Type Proof)

```move
// The witness type has `drop` — can only be created in `init`
public struct MY_TOKEN has drop {}

fun init(witness: MY_TOKEN, ctx: &mut TxContext) {
    // witness proves this is the module's init function
    let (treasury, metadata) = coin::create_currency(witness, ...);
}
```

### Capability Pattern (Access Control)

```move
public struct AdminCap has key, store { id: UID }

// Only callable by AdminCap holder
public fun admin_action(cap: &AdminCap, /* ... */) {
    // cap reference proves caller has admin rights
}
```

### Hot Potato Pattern (Forced Completion)

```move
// No abilities — must be consumed in the same transaction
public struct FlashLoanReceipt {
    pool_id: ID,
    amount: u64,
}

public fun flash_loan(pool: &mut Pool, amount: u64, ctx: &mut TxContext): (Coin<SUI>, FlashLoanReceipt) {
    // ... lend funds ...
    (coin, FlashLoanReceipt { pool_id: object::id(pool), amount })
}

public fun repay(pool: &mut Pool, coin: Coin<SUI>, receipt: FlashLoanReceipt) {
    let FlashLoanReceipt { pool_id, amount } = receipt; // consumes receipt
    // ... verify repayment ...
}
```

## Testing

```move
#[test_only]
module my_package::my_module_tests {
    use sui::test_scenario;
    use my_package::my_module;

    #[test]
    fun test_create() {
        let mut scenario = test_scenario::begin(@0x1);
        {
            my_module::create(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, @0x1);
        {
            let obj = test_scenario::take_from_sender<my_module::MyObject>(&scenario);
            assert!(my_module::get_value(&obj) == 0, 0);
            test_scenario::return_to_sender(&scenario, obj);
        };
        test_scenario::end(scenario);
    }
}
```

Run tests: `sui move test`

## CLI Commands

```bash
# Create a new Move project
sui move new my_project

# Build
sui move build

# Test
sui move test

# Publish to network
sui client publish --gas-budget 100000000

# Call a function
sui client call --package 0x... --module my_module --function create --gas-budget 10000000
```
