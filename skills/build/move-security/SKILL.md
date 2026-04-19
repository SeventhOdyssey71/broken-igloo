---
name: move-security
description: "Move security deep dive for Sui. Covers common vulnerabilities, secure patterns, capability escrow risks, flash loan defenses, reentrancy considerations, integer overflow, access control auditing, and a comprehensive audit checklist. Triggers: move security, audit, vulnerability, secure move, security checklist, flash loan attack, reentrancy, overflow, access control, capability escrow, move audit"
---

```bash
# Telemetry preamble
SKILL_NAME="move-security"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Move security specialist for Sui. Your job is to guide the user through identifying and fixing security vulnerabilities in their Move code. While Move's type system and resource model eliminate entire categories of bugs (reentrancy, double-spending), Sui-specific patterns introduce new attack surfaces. This skill covers the vulnerabilities that remain and how to defend against them.

**Move security advantages (what you DON'T need to worry about):**
- No reentrancy (no dynamic dispatch like Solidity's `call`)
- No double-spending (resource semantics enforce single-use)
- No uninitialized storage (all values must be initialized)
- No unchecked external calls (all calls are statically resolved)

**Sui-specific attack surfaces (what you DO need to worry about):**
- Access control via capabilities (wrong, missing, or leaked caps)
- Flash loan attacks on price-dependent logic
- Shared object manipulation (frontrunning, MEV)
- Integer overflow/underflow in math
- Oracle manipulation and staleness
- Upgrade attacks via UpgradeCap
- Type confusion with generics

## Workflow

### Vulnerability 1: Missing Access Control

**The Bug:**
```move
// VULNERABLE: Anyone can call this
entry fun set_fee(pool: &mut Pool, new_fee: u64) {
    pool.fee = new_fee;
}
```

**The Fix:**
```move
// SECURE: Only AdminCap holder can call this
entry fun set_fee(_admin: &AdminCap, pool: &mut Pool, new_fee: u64) {
    pool.fee = new_fee;
}
```

**Advanced — Capability Escrow Risk:**
```move
// VULNERABLE: Storing capabilities in accessible locations
public struct VulnerableProtocol has key {
    id: UID,
    admin_cap: AdminCap, // BAD: if this object is shared, anyone who
                          // can borrow it can use the cap
}

// SECURE: Capabilities should be owned, not stored in shared objects
// OR use capability delegation with explicit checks
public struct SecureProtocol has key {
    id: UID,
    // Admin cap is held separately by the admin address
    // NOT stored in the shared protocol object
}
```

### Vulnerability 2: Integer Overflow/Underflow

**The Bug:**
```move
// VULNERABLE: Can overflow on u64
public fun calculate_reward(amount: u64, rate: u64): u64 {
    amount * rate / 10000 // Overflows if amount * rate > u64::MAX
}
```

**The Fix:**
```move
// SECURE: Use u128 for intermediate calculations
public fun calculate_reward(amount: u64, rate: u64): u64 {
    let result = (amount as u128) * (rate as u128) / 10000u128;
    assert!(result <= (18446744073709551615u128), EOverflow); // u64::MAX
    (result as u64)
}
```

**More patterns:**
```move
// SECURE: Safe subtraction
public fun safe_sub(a: u64, b: u64): u64 {
    assert!(a >= b, EUnderflow);
    a - b
}

// SECURE: Safe multiplication with overflow check
public fun safe_mul(a: u64, b: u64): u64 {
    if (a == 0 || b == 0) return 0;
    let result = a * b;
    assert!(result / a == b, EOverflow); // Overflow check
    result
}

// SECURE: Division rounding — always round against the user
public fun div_round_down(a: u64, b: u64): u64 {
    assert!(b > 0, EDivByZero);
    a / b
}

public fun div_round_up(a: u64, b: u64): u64 {
    assert!(b > 0, EDivByZero);
    (a + b - 1) / b
}
```

### Vulnerability 3: Flash Loan Price Manipulation

**The Bug:**
```move
// VULNERABLE: Reads pool price that can be manipulated via flash loan
entry fun liquidate(
    pool: &Pool,           // Attacker manipulates this pool first
    obligation: Obligation,
    ctx: &mut TxContext,
) {
    let price = get_pool_spot_price(pool); // Manipulated!
    let collateral_value = obligation.collateral * price;

    if (collateral_value < obligation.debt) {
        // Liquidate at manipulated price
        // Attacker profits from artificial liquidation
    };
}
```

**The Fix:**
```move
// SECURE: Use oracle price, not pool spot price
entry fun liquidate(
    price_info: &PriceInfoObject, // Pyth oracle — not manipulable
    obligation: Obligation,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // Oracle price with staleness check
    let price = pyth::get_price_no_older_than(price_info, clock, 60);
    let confidence = price::get_conf(&price);

    // Use conservative price (price - confidence for collateral)
    let conservative_price = price::get_price(&price) - (confidence as i64);
    let collateral_value = obligation.collateral * (conservative_price as u64);

    if (collateral_value < obligation.debt) {
        // Legitimate liquidation based on oracle
    };
}
```

### Vulnerability 4: Missing Hot Potato Validation

**The Bug:**
```move
// VULNERABLE: Flash loan receipt doesn't validate the pool
public fun flash_repay<T>(
    pool: &mut Pool<T>,
    repayment: Coin<T>,
    receipt: FlashLoanReceipt,
) {
    let FlashLoanReceipt { amount, fee } = receipt;
    // BUG: No check that repayment goes to the SAME pool
    // Attacker could borrow from Pool A and "repay" to Pool B
    assert!(coin::value(&repayment) >= amount + fee, 0);
    balance::join(&mut pool.balance, coin::into_balance(repayment));
}
```

**The Fix:**
```move
// SECURE: Validate pool_id in the receipt
public fun flash_repay<T>(
    pool: &mut Pool<T>,
    repayment: Coin<T>,
    receipt: FlashLoanReceipt,
) {
    let FlashLoanReceipt { pool_id, amount, fee } = receipt;
    // CRITICAL: Verify the receipt belongs to THIS pool
    assert!(pool_id == object::id(pool), EWrongPool);
    assert!(coin::value(&repayment) >= amount + fee, EInsufficientRepayment);
    balance::join(&mut pool.balance, coin::into_balance(repayment));
}
```

### Vulnerability 5: Type Confusion with Generics

**The Bug:**
```move
// VULNERABLE: No verification that T matches the pool's coin type
public fun deposit<T>(pool: &mut Pool, coin: Coin<T>) {
    // If Pool stores Balance<SUI> but user passes Coin<FAKE_TOKEN>,
    // the type system catches this at compile time for specific types.
    // BUT: if Pool uses dynamic typing (dynamic fields), this can fail.
}
```

**The Fix:**
```move
// SECURE: Use phantom type parameters to bind types
public struct Pool<phantom T> has key {
    id: UID,
    balance: Balance<T>,  // T is bound — only Coin<T> can be deposited
}

// The phantom type parameter ensures compile-time type safety
public fun deposit<T>(pool: &mut Pool<T>, coin: Coin<T>) {
    balance::join(&mut pool.balance, coin::into_balance(coin));
}
```

### Vulnerability 6: Shared Object Frontrunning

**The Attack:**
```
Attacker sees User's pending transaction to buy NFT at price X.
Attacker frontruns with a transaction that changes the price to X+Y.
User's transaction executes at the higher price.
```

**Defenses:**
```move
// Defense 1: Slippage protection
entry fun swap(
    pool: &mut Pool,
    coin_in: Coin<SUI>,
    min_amount_out: u64, // User specifies minimum acceptable output
    ctx: &mut TxContext,
) {
    let amount_out = calculate_output(pool, coin::value(&coin_in));
    assert!(amount_out >= min_amount_out, ESlippageExceeded);
    // ... execute swap
}

// Defense 2: Commit-reveal for auctions
public struct SealedBid has key {
    id: UID,
    bidder: address,
    commitment: vector<u8>, // hash(bid_amount + salt)
    revealed: bool,
}

// Phase 1: Submit hash commitment
entry fun submit_bid(
    commitment: vector<u8>,
    ctx: &mut TxContext,
) {
    let bid = SealedBid {
        id: object::new(ctx),
        bidder: ctx.sender(),
        commitment,
        revealed: false,
    };
    transfer::share_object(bid);
}

// Phase 2: Reveal actual bid (after bidding period)
entry fun reveal_bid(
    bid: &mut SealedBid,
    amount: u64,
    salt: vector<u8>,
) {
    // Verify hash matches
    let mut data = bcs::to_bytes(&amount);
    vector::append(&mut data, salt);
    let hash = sui::hash::blake2b256(&data);
    assert!(hash == bid.commitment, EInvalidReveal);
    bid.revealed = true;
}
```

### Vulnerability 7: UpgradeCap Risks

**The Risk:**
```move
// If a single address holds the UpgradeCap, they can:
// 1. Upgrade the contract to steal funds
// 2. Change access control logic
// 3. Modify fee structures
// This is a centralization risk
```

**Defenses:**
```move
// Option 1: Burn the UpgradeCap (immutable package)
entry fun make_immutable(cap: sui::package::UpgradeCap) {
    sui::package::make_immutable(cap);
}

// Option 2: Transfer to multisig address
// See build-multisig skill for details

// Option 3: Time-locked upgrades
public struct TimelockUpgrade has key {
    id: UID,
    upgrade_cap: sui::package::UpgradeCap,
    pending_digest: Option<vector<u8>>,
    execute_after: u64, // timestamp
}

entry fun propose_upgrade(
    timelock: &mut TimelockUpgrade,
    _admin: &AdminCap,
    digest: vector<u8>,
    clock: &Clock,
) {
    let delay = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    timelock.pending_digest = option::some(digest);
    timelock.execute_after = clock::timestamp_ms(clock) + delay;
}
```

### Vulnerability 8: Incorrect Balance Accounting

**The Bug:**
```move
// VULNERABLE: Not using Balance<T> inside shared objects
public struct BadPool has key {
    id: UID,
    coins: Coin<SUI>, // BAD: Coin<T> in a shared object
}
```

**The Fix:**
```move
// SECURE: Use Balance<T> internally, convert at boundaries
public struct GoodPool has key {
    id: UID,
    balance: Balance<SUI>,
}

entry fun deposit(pool: &mut GoodPool, coin: Coin<SUI>) {
    balance::join(&mut pool.balance, coin::into_balance(coin));
}

entry fun withdraw(pool: &mut GoodPool, amount: u64, ctx: &mut TxContext) {
    let coin = coin::from_balance(
        balance::split(&mut pool.balance, amount),
        ctx,
    );
    transfer::public_transfer(coin, ctx.sender());
}
```

### Security Audit Checklist

Run through this checklist before deploying to mainnet:

**Access Control:**
- [ ] Every admin function requires a capability object parameter
- [ ] Capabilities use the correct reference type (&, &mut, or by value)
- [ ] Capabilities are NOT stored inside shared objects
- [ ] init function transfers all capabilities to the deployer
- [ ] No functions use `tx_context::sender()` for access control (use caps instead)

**Math and Overflow:**
- [ ] All multiplications use u128 intermediate values
- [ ] All subtractions check for underflow (a >= b before a - b)
- [ ] Division rounding is consistent (always round against the user/protocol)
- [ ] No division by zero is possible
- [ ] Fee calculations cannot be gamed by small amounts (dust attacks)

**Object Model:**
- [ ] Shared objects use Balance<T>, not Coin<T>
- [ ] Owned objects have appropriate abilities (key, store for transferable; key only for soulbound)
- [ ] Hot potatoes have NO abilities
- [ ] Dynamic fields are used for extensible state
- [ ] Events are emitted for all state changes

**DeFi-Specific:**
- [ ] Prices come from oracles (Pyth, Supra), not pool spot prices
- [ ] Oracle prices are checked for staleness
- [ ] Flash loan receipts validate the source pool/protocol
- [ ] Slippage protection on all swap/trade functions
- [ ] Minimum liquidity checks to prevent rounding attacks
- [ ] Interest rate calculations handle edge cases (zero balance, zero time)

**Upgradeability:**
- [ ] UpgradeCap is protected (multisig, timelock, or burned)
- [ ] Shared objects have a version field for migration
- [ ] All public functions check the version
- [ ] Migration function exists for state transitions

**General:**
- [ ] All error codes are named constants (not raw numbers)
- [ ] Test coverage > 80% on critical modules
- [ ] Edge cases tested: zero amounts, max values, empty collections
- [ ] Error paths tested with `#[expected_failure]`

### Step: Handoff

- "I need to write tests" -> route to `move-testing`
- "I need design patterns" -> route to `move-patterns`
- "Debug a specific error" -> route to `debug-move`
- "Deploy after security review" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **ALWAYS use capabilities, never address checks** — `assert!(sender == admin_address)` is a Solidity anti-pattern. On Sui, capabilities are objects.
2. **ALWAYS use u128 for intermediate multiplication** — u64 * u64 overflows at ~18.4 * 10^18. Use u128, check bounds, then cast back.
3. **NEVER use pool spot prices for liquidation/valuation** — flash loans can manipulate pool prices within a single transaction. Use oracles.
4. **NEVER store Coin<T> in shared objects** — use Balance<T> internally. Coin<T> is for entry function boundaries only.
5. **ALWAYS validate hot potato data** — flash loan receipts must contain and validate the source pool ID. Missing this check enables cross-pool attacks.
6. **ALWAYS implement slippage protection** — every swap, deposit, and withdrawal should have a min_amount_out parameter.
7. **Protect the UpgradeCap from day one** — once deployed, the UpgradeCap holder controls the package. Use multisig or timelock immediately.
8. **Run the full audit checklist before mainnet** — security is not optional for any protocol handling user funds.

## References

- Sui Move Security: https://docs.sui.io/concepts/sui-move-concepts
- Move Prover (formal verification): https://move-language.github.io/move/prover-user-guide.html
- Common DeFi Attack Vectors: https://github.com/AuditOne/sui-security-compendium
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
