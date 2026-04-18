# 15 Most Common Move Errors on Sui

> A catalog of the most frequently encountered Move errors when building on Sui, with examples and fixes for each.

---

## 1. Missing Ability on Struct

**Error:**
```
error[E04005]: type does not have the ability 'key'
  ┌── sources/example.move:10:9
  │
  │   transfer::transfer(my_struct, tx_context::sender(ctx));
  │   ^^^^^^^^ The type 'MyStruct' does not have the ability 'key'
```

**Cause:** Trying to transfer/share/freeze an object that lacks the `key` ability. On Sui, all objects need `key` and the first field must be `id: UID`.

**Fix:**
```move
// WRONG
public struct MyStruct has store {
    value: u64,
}

// RIGHT
public struct MyStruct has key, store {
    id: UID,
    value: u64,
}
```

---

## 2. Coin vs Balance Confusion in Shared Objects

**Error:**
```
error[E04005]: type does not have the ability 'store'
  ┌── sources/pool.move:8:5
  │
  │   coin: Coin<SUI>,
  │   ^^^^ 'Coin<SUI>' does not have 'store' in this context
```

**Cause:** Storing `Coin<T>` directly inside a shared object. `Coin<T>` is an owned object and should not be nested inside shared objects.

**Fix:**
```move
// WRONG
public struct Pool has key {
    id: UID,
    funds: Coin<SUI>,  // Coin is an owned object
}

// RIGHT
public struct Pool has key {
    id: UID,
    funds: Balance<SUI>,  // Balance is a raw value, not an object
}

// Convert at entry function boundaries:
public fun deposit(pool: &mut Pool, coin: Coin<SUI>) {
    let balance = coin::into_balance(coin);
    balance::join(&mut pool.funds, balance);
}
```

---

## 3. One-Time Witness Name Mismatch

**Error:**
```
error: invalid one-time witness type. The struct name must match the module name in uppercase
```

**Cause:** The one-time witness (OTW) struct name doesn't match the module name in uppercase.

**Fix:**
```move
// Module name: my_token
module my_package::my_token {
    // WRONG
    public struct MyToken has drop {}

    // RIGHT — must be module name in UPPERCASE
    public struct MY_TOKEN has drop {}

    fun init(witness: MY_TOKEN, ctx: &mut TxContext) {
        // Use witness for coin::create_currency, etc.
    }
}
```

---

## 4. Borrow Checker — Simultaneous Mutable Borrows

**Error:**
```
error[E05001]: cannot mutably borrow since other borrows exist
  ┌── sources/example.move:15:9
  │
  │   let a = &mut pool.balance_x;
  │   let c = &mut pool.balance_y;  // ERROR: pool already mutably borrowed via 'a'
```

**Cause:** Move's borrow checker prevents multiple mutable references to the same struct simultaneously.

**Fix:**
```move
// WRONG — two mutable borrows from same parent
public fun swap(pool: &mut Pool) {
    let bx = &mut pool.balance_x;
    let by = &mut pool.balance_y; // Error!
}

// RIGHT — use intermediate variables or restructure
public fun swap(pool: &mut Pool) {
    let reserve_x = balance::value(&pool.balance_x);
    let reserve_y = balance::value(&pool.balance_y);
    let out_amount = calculate(reserve_x, reserve_y);
    // Now do one mutation at a time
    balance::join(&mut pool.balance_x, input_balance);
    let output = balance::split(&mut pool.balance_y, out_amount);
}
```

---

## 5. Shared Object Transfer Attempt

**Error:**
```
MoveAbort: SharedObjectOperationNotAllowed — cannot transfer a shared object
```

**Cause:** Trying to `transfer::transfer` or `transfer::public_transfer` a shared object. Once shared, an object cannot become owned.

**Fix:**
```move
// WRONG — cannot transfer a shared object
public fun take_pool(pool: Pool, ctx: &TxContext) {
    transfer::transfer(pool, tx_context::sender(ctx)); // Runtime error!
}

// RIGHT — shared objects stay shared
// If you need to "close" a pool, destroy it and return balances:
public fun close_pool(pool: Pool, _admin: &AdminCap, ctx: &mut TxContext): (Coin<X>, Coin<Y>) {
    let Pool { id, balance_x, balance_y, .. } = pool;
    object::delete(id);
    (coin::from_balance(balance_x, ctx), coin::from_balance(balance_y, ctx))
}
```

---

## 6. Object Version Mismatch (Equivocation)

**Error:**
```
EquivocationDetected: Object X at version V has already been used in a different transaction
```

**Cause:** Two transactions tried to use the same owned object concurrently. Sui's owned-object model requires sequential access.

**Fix:**
- For objects that need concurrent access: convert from owned to shared using `transfer::public_share_object`
- For owned objects: serialize transactions (wait for one to finalize before submitting the next)
- In TypeScript: re-fetch the object after each transaction to get the latest version

```typescript
// After executing a transaction, refresh object data
const tx = await client.signAndExecuteTransaction({ /* ... */ });
await client.waitForTransaction({ digest: tx.digest });
// Now re-fetch any objects used in the next transaction
const freshObject = await client.getObject({ id: objectId });
```

---

## 7. public(friend) Deprecation

**Error:**
```
error: 'public(friend)' is deprecated. Use 'public(package)' instead.
```

**Cause:** Sui Move edition 2024 replaced `friend` declarations and `public(friend)` with `public(package)`.

**Fix:**
```move
// WRONG (old syntax)
friend my_package::other_module;
public(friend) fun internal_helper() { /* ... */ }

// RIGHT (current syntax)
public(package) fun internal_helper() { /* ... */ }
```

---

## 8. Arithmetic Overflow

**Error:**
```
MoveAbort: arithmetic overflow in function at offset N
```

**Cause:** u64 or u128 multiplication overflow. Common in DeFi math with large token amounts.

**Fix:**
```move
// WRONG — overflows for large values
let result = (amount * price) / SCALE;  // u64 * u64 can overflow

// RIGHT — upcast to u128 for intermediate calculation
let result = (((amount as u128) * (price as u128)) / (SCALE as u128) as u64);

// Or use a safe math library
public fun mul_div(a: u64, b: u64, denominator: u64): u64 {
    let result = ((a as u128) * (b as u128)) / (denominator as u128);
    assert!(result <= (U64_MAX as u128), E_OVERFLOW);
    (result as u64)
}
```

---

## 9. Missing or Invalid `init` Function Signature

**Error:**
```
error: 'init' function has an invalid signature
```

**Cause:** The `init` function has the wrong parameter types, wrong visibility, or missing OTW parameter.

**Fix:**
```move
// WRONG — public init (init must be private)
public fun init(ctx: &mut TxContext) { /* ... */ }

// WRONG — entry init
public entry fun init(ctx: &mut TxContext) { /* ... */ }

// WRONG — immutable TxContext
fun init(ctx: &TxContext) { /* ... */ }

// WRONG — extra parameters
fun init(witness: MY_MODULE, x: u64, ctx: &mut TxContext) { /* ... */ }

// RIGHT — with one-time witness
fun init(witness: MY_MODULE, ctx: &mut TxContext) {
    // ...
}

// RIGHT — without one-time witness
fun init(ctx: &mut TxContext) {
    // ...
}
```

**Symptom if init is silently wrong:** Expected objects (TreasuryCap, AdminCap) don't exist after publish.

---

## 10. Dynamic Field Not Found

**Error:**
```
MoveAbort: DynamicFieldDoesNotExist
```

**Cause:** Trying to borrow or remove a dynamic field that doesn't exist on the object.

**Fix:**
```move
// WRONG — no check before access
let value = dynamic_field::borrow<String, u64>(&obj.id, key);

// RIGHT — check existence first
if (dynamic_field::exists_<String>(&obj.id, key)) {
    let value = dynamic_field::borrow<String, u64>(&obj.id, key);
    // use value
} else {
    // handle missing field
};

// Or use dynamic_field::exists_with_type for type-safe check
```

---

## 11. Insufficient Gas Budget

**Error:**
```
InsufficientGas: gas budget X is not enough to cover execution cost Y
```

**Cause:** Transaction gas budget is lower than the actual computation cost. Common with complex PTBs, package publish, or large Move computations.

**Fix:**
```bash
# Too low for publish
sui client publish --gas-budget 10000000  # 10M MIST — usually too low

# Fix: use more for publish
sui client publish --gas-budget 500000000  # 500M MIST

# Regular function calls
sui client call --gas-budget 50000000  # 50M MIST
```

```typescript
// BEST — dry-run first to get exact cost
const dryRun = await client.dryRunTransactionBlock({
    transactionBlock: await tx.build({ client }),
});
const gasUsed = BigInt(dryRun.effects.gasUsed.computationCost) +
                BigInt(dryRun.effects.gasUsed.storageCost);
tx.setGasBudget(Number(gasUsed * 150n / 100n)); // 1.5x buffer
```

---

## 12. Type Mismatch in Move Call

**Error:**
```
error[E04007]: incompatible types
  ┌── sources/example.move:20:25
  │
  │   pool::deposit(pool, amount);
  │                        ^^^^^^ expected 'Coin<SUI>' but found 'u64'
```

**Cause:** Passing raw amounts (u64) instead of Coin objects, or vice versa. Sui Move entry functions typically take `Coin<T>`, not amounts.

**Fix:**
```move
// WRONG — passing raw amount
public entry fun deposit(pool: &mut Pool, amount: u64, ctx: &mut TxContext) {
    // How do you get the actual tokens from just a number?
}

// RIGHT — accept Coin<T> for value transfer
public entry fun deposit(pool: &mut Pool, coin: Coin<SUI>, ctx: &mut TxContext) {
    let balance = coin::into_balance(coin);
    balance::join(&mut pool.funds, balance);
}
```

In TypeScript, use `tx.splitCoins` to create a Coin of the exact amount:
```typescript
const tx = new Transaction();
const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)]);
tx.moveCall({
    target: `${PACKAGE}::pool::deposit`,
    arguments: [tx.object(POOL_ID), depositCoin],
});
```

---

## 13. Orphaned Dynamic Fields (Storage Leak)

**Error:** No compile-time or runtime error, but storage fees accumulate and are never reclaimed.

**Cause:** Deleting an object that has dynamic fields without removing them first.

**Fix:**
```move
// WRONG — deletes parent but orphans dynamic fields
public fun destroy_market(market: Market) {
    let Market { id } = market;
    object::delete(id); // Dynamic fields are now orphaned!
}

// RIGHT — remove all dynamic fields first
public fun destroy_market(market: Market) {
    let Market { mut id } = market;
    // Remove all known dynamic fields
    if (dynamic_field::exists_<TypeName>(&id, type_name::get<SUI>())) {
        let _: Reserve<SUI> = dynamic_field::remove(&mut id, type_name::get<SUI>());
    };
    // ... remove all other fields
    object::delete(id);
}
```

---

## 14. Wrong Clock Object ID

**Error:**
```
MoveAbort: InvalidObject — expected Clock at 0x6
```

**Cause:** Passing the wrong object ID for the `Clock` object. The Sui Clock is always at address `0x6`.

**Fix:**
```move
// In Move — Clock is a shared object at 0x6
use sui::clock::Clock;

public fun time_check(clock: &Clock): u64 {
    clock::timestamp_ms(clock)
}
```

```typescript
// In TypeScript — always use 0x6
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

const tx = new Transaction();
tx.moveCall({
    target: `${PACKAGE}::module::do_something`,
    arguments: [tx.object(SUI_CLOCK_OBJECT_ID)], // Always 0x6
});
```

---

## 15. Entry Function with Return Value

**Error:**
```
error: 'entry' functions cannot return values
```

**Cause:** An `entry` function tries to return a value. Entry functions are the outermost transaction boundary and cannot return to the caller.

**Fix:**
```move
// WRONG — entry functions can't return
public entry fun create_and_return(ctx: &mut TxContext): MyObject {
    MyObject { id: object::new(ctx), value: 42 }
}

// RIGHT (option A) — entry function transfers instead of returning
public entry fun create(ctx: &mut TxContext) {
    let obj = MyObject { id: object::new(ctx), value: 42 };
    transfer::transfer(obj, tx_context::sender(ctx));
}

// RIGHT (option B) — use 'public' (not 'entry') for PTB composability
public fun create(ctx: &mut TxContext): MyObject {
    MyObject { id: object::new(ctx), value: 42 }
}
// Then in a PTB, the return value can be passed to the next call
```

**When to use which:**
- `entry` — standalone transaction endpoints, must handle their own transfers
- `public` — composable functions callable from PTBs, can return values for chaining
- `public(package)` — internal functions only callable from within the same package

---

## Quick Diagnostic Cheat Sheet

| Symptom | First Command | Next Step |
|---------|--------------|-----------|
| Won't compile | `sui move build 2>&1 \| head -20` | Fix the first error, recompile |
| Test fails | `sui move test --filter <name> -v` | Check abort code, add `debug::print` |
| Transaction aborts | `sui client tx-block <DIGEST> --json` | Map abort code to source `assert!` |
| Object not found | `sui client object <ID> --json` | Check network, check if destroyed |
| Slow transaction | Check if using shared objects | Switch to owned objects if possible |
| Stale object | Re-fetch before building PTB | Use `client.getObject()` fresh |
| Publish fails | Increase gas to 500M MIST | Check `Move.toml` dependencies |
