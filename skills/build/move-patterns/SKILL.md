---
name: move-patterns
description: "Advanced Move design patterns reference for Sui. Covers Capability, Witness, Hot Potato, Publisher, Version, Transfer Policy, Sentinel, and Namespace patterns with complete code examples. Triggers: move pattern, design pattern, capability pattern, witness pattern, hot potato, publisher pattern, version pattern, transfer policy pattern, move best practices, move architecture"
---

```bash
# Telemetry preamble
SKILL_NAME="move-patterns"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Move design patterns expert for Sui. Your job is to guide the user through applying the correct design patterns for their use case. These patterns are the building blocks of secure, idiomatic Sui Move — every serious Sui project uses multiple patterns from this list. Understanding when and why to use each pattern is critical.

## Workflow

### Pattern 1: Capability Pattern

**When to use**: Controlling who can perform admin actions (minting, pausing, upgrading, fee changes).

**Why**: Sui does not have `msg.sender` checks like Solidity. Instead, you use owned objects (capabilities) to gate access.

```move
module patterns::capability {
    /// Admin capability — whoever owns this object can perform admin actions
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Minter capability — separate from admin, for principle of least privilege
    public struct MintCap has key, store {
        id: UID,
        max_supply: u64,
        minted: u64,
    }

    /// Create capabilities during module init
    fun init(ctx: &mut TxContext) {
        // Transfer to deployer
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
        transfer::transfer(MintCap {
            id: object::new(ctx),
            max_supply: 10000,
            minted: 0,
        }, ctx.sender());
    }

    /// Only the AdminCap holder can call this
    entry fun set_fee(_admin: &AdminCap, new_fee: u64) {
        // The type system enforces access — if you don't own an AdminCap,
        // you can't pass one as an argument
    }

    /// MintCap holder can mint (but not admin things)
    entry fun mint(cap: &mut MintCap, ctx: &mut TxContext) {
        assert!(cap.minted < cap.max_supply, 0);
        cap.minted = cap.minted + 1;
        // ... mint logic
    }

    /// Transfer capability to a new admin (ownership handoff)
    entry fun transfer_admin(cap: AdminCap, new_admin: address) {
        transfer::transfer(cap, new_admin);
    }

    /// Destroy capability (revoke permanently)
    entry fun revoke_admin(cap: AdminCap) {
        let AdminCap { id } = cap;
        object::delete(id);
    }
}
```

**Key rules:**
- Use `&AdminCap` (immutable reference) when you just need to verify the caller has the cap
- Use `&mut MintCap` when the operation modifies the cap (e.g., incrementing a counter)
- Use `AdminCap` (by value) when transferring or destroying the cap
- Create separate capabilities for separate concerns (admin vs minter vs pauser)

### Pattern 2: Witness Pattern (One-Time Witness)

**When to use**: Creating singletons that can only be initialized once — coin types, publisher objects, protocol registrations.

**Why**: The One-Time Witness (OTW) is a special type that the Sui runtime creates exactly once, in the `init` function. It proves you are the module publisher.

```move
module patterns::witness {
    use sui::coin;
    use sui::package;

    /// The One-Time Witness — MUST match the module name in UPPER_CASE
    /// MUST have only `drop` ability
    public struct WITNESS has drop {}

    /// Regular Witness — used for type-level authorization
    public struct MyProtocolWitness has drop {}

    fun init(otw: WITNESS, ctx: &mut TxContext) {
        // OTW is automatically created by the runtime and passed here
        // It can only be used once — this is the ONLY place it exists

        // Use OTW to create a coin
        let (treasury_cap, metadata) = coin::create_currency(
            otw,
            9,
            b"TOKEN",
            b"My Token",
            b"Description",
            option::none(),
            ctx,
        );

        // Use OTW to claim Publisher (proves you authored this module)
        // Actually, Publisher uses the OTW type parameter:
        // let publisher = package::claim(otw, ctx);

        transfer::public_transfer(treasury_cap, ctx.sender());
        transfer::public_freeze_object(metadata);
    }

    /// Type-level witness for inter-module authorization
    /// Another module can require `MyProtocolWitness` as proof
    public fun create_witness(): MyProtocolWitness {
        MyProtocolWitness {}
    }

    /// Only this module can create the witness, so only this module
    /// can call functions that require it
    public fun register_with_protocol(
        _witness: MyProtocolWitness,
        // ... other params
    ) {
        // The caller proved they have access to this module's witness
    }
}
```

**Key rules:**
- OTW struct name MUST be the module name in UPPER_CASE
- OTW MUST have only the `drop` ability (no `key`, `store`, or `copy`)
- OTW is only available in the `init` function
- Regular witnesses are for inter-module authorization (not singleton creation)

### Pattern 3: Hot Potato Pattern

**When to use**: Enforcing that an action is completed within the same transaction — flash loans, atomic swaps, approval flows.

**Why**: A "hot potato" is a struct with no `drop`, `store`, or `copy` abilities. It MUST be consumed (passed to a function that destroys it) in the same transaction. The type system prevents it from being stored or discarded.

```move
module patterns::hot_potato {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};

    /// The hot potato — no abilities except key (if needed) or none
    /// MUST be consumed in the same transaction
    public struct FlashLoanReceipt {
        pool_id: ID,
        amount: u64,
        fee: u64,
    }

    /// Lending pool
    public struct Pool<phantom T> has key {
        id: UID,
        balance: Balance<T>,
        fee_bps: u64,
    }

    /// Borrow — returns the coins AND a receipt (hot potato)
    public fun flash_borrow<T>(
        pool: &mut Pool<T>,
        amount: u64,
        ctx: &mut TxContext,
    ): (Coin<T>, FlashLoanReceipt) {
        let coin = coin::from_balance(
            balance::split(&mut pool.balance, amount),
            ctx,
        );

        let fee = amount * pool.fee_bps / 10000;

        let receipt = FlashLoanReceipt {
            pool_id: object::id(pool),
            amount,
            fee,
        };

        // The caller MUST consume this receipt before the transaction ends
        // If they don't, the transaction aborts
        (coin, receipt)
    }

    /// Repay — consumes the receipt (hot potato is destroyed)
    public fun flash_repay<T>(
        pool: &mut Pool<T>,
        repayment: Coin<T>,
        receipt: FlashLoanReceipt,
    ) {
        let FlashLoanReceipt { pool_id, amount, fee } = receipt;

        // Verify repayment is to the correct pool
        assert!(pool_id == object::id(pool), 0);

        // Verify repayment amount covers loan + fee
        assert!(coin::value(&repayment) >= amount + fee, 1);

        // Return funds to pool
        balance::join(&mut pool.balance, coin::into_balance(repayment));
    }

    // Usage in a PTB:
    // 1. Call flash_borrow() — get coins + receipt
    // 2. Use the borrowed coins (swap, arbitrage, etc.)
    // 3. Call flash_repay() with coins + receipt
    // If step 3 is missing, the transaction ABORTS because
    // FlashLoanReceipt has no `drop` and cannot be discarded
}
```

**Key rules:**
- Hot potato structs must have NO abilities (no `drop`, `store`, `copy`, or `key`)
- They can only exist within a single transaction
- The consuming function must verify the hot potato's data (pool_id, amounts)
- This pattern is THE way to enforce atomic invariants in Move

### Pattern 4: Publisher Pattern

**When to use**: Proving you are the author of a package — required for Display, TransferPolicy, and other framework features.

```move
module patterns::publisher_demo {
    use sui::package;
    use sui::display;

    /// OTW for claiming Publisher
    public struct PUBLISHER_DEMO has drop {}

    public struct MyNFT has key, store {
        id: UID,
        name: std::string::String,
    }

    fun init(otw: PUBLISHER_DEMO, ctx: &mut TxContext) {
        // Claim Publisher — proves you authored this module
        let publisher = package::claim(otw, ctx);

        // Use Publisher to create Display
        let mut disp = display::new<MyNFT>(&publisher, ctx);
        disp.add(std::string::utf8(b"name"), std::string::utf8(b"{name}"));
        display::update_version(&mut disp);

        // Publisher can also be used for:
        // - Creating TransferPolicy
        // - Registering with Kiosk extensions
        // - Any framework feature that requires authorship proof

        transfer::public_transfer(publisher, ctx.sender());
        transfer::public_transfer(disp, ctx.sender());
    }
}
```

### Pattern 5: Version Pattern (Upgradeability)

**When to use**: Making shared objects compatible with package upgrades.

```move
module patterns::versioned {
    use sui::dynamic_field;

    const CURRENT_VERSION: u64 = 1;
    const EWrongVersion: u64 = 0;

    /// Versioned shared object
    public struct Protocol has key {
        id: UID,
        version: u64,
    }

    /// Admin cap for version management
    public struct ProtocolAdminCap has key {
        id: UID,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Protocol {
            id: object::new(ctx),
            version: CURRENT_VERSION,
        });
        transfer::transfer(ProtocolAdminCap {
            id: object::new(ctx),
        }, ctx.sender());
    }

    /// All public functions check the version
    entry fun do_something(protocol: &mut Protocol) {
        assert!(protocol.version == CURRENT_VERSION, EWrongVersion);
        // ... logic
    }

    /// Migration function — called after package upgrade
    entry fun migrate(
        protocol: &mut Protocol,
        _admin: &ProtocolAdminCap,
    ) {
        assert!(protocol.version == CURRENT_VERSION - 1, EWrongVersion);
        protocol.version = CURRENT_VERSION;
        // ... migrate state using dynamic fields if needed
    }

    /// Use dynamic fields for extensible state
    /// This allows adding new fields without changing the struct
    entry fun add_new_feature_state(
        protocol: &mut Protocol,
        _admin: &ProtocolAdminCap,
    ) {
        dynamic_field::add(&mut protocol.id, b"new_feature_enabled", true);
    }
}
```

### Pattern 6: Transfer Policy Pattern

**When to use**: Enforcing rules on how objects can be transferred — royalties, allowlists, soulbound tokens.

```move
module patterns::transfer_rules {
    use sui::transfer_policy::{Self, TransferPolicy, TransferPolicyCap, TransferRequest};
    use sui::package::Publisher;

    public struct MyItem has key, store {
        id: UID,
    }

    /// Create a TransferPolicy with custom rules
    entry fun create_policy(
        publisher: &Publisher,
        ctx: &mut TxContext,
    ) {
        let (policy, cap) = transfer_policy::new<MyItem>(publisher, ctx);

        // The policy is shared — marketplaces read it
        transfer::public_share_object(policy);
        transfer::public_transfer(cap, ctx.sender());
    }

    /// Custom rule: require a minimum price
    public fun enforce_min_price(
        request: &mut TransferRequest<MyItem>,
        min_price: u64,
    ) {
        let paid = transfer_policy::paid(request);
        assert!(paid >= min_price, 0);
    }
}
```

### Pattern 7: Sentinel Pattern (Type-Level Access Control)

**When to use**: Using phantom types to restrict which modules can call certain functions.

```move
module patterns::sentinel {
    /// Phantom type parameter restricts access at compile time
    public struct Vault<phantom Auth> has key {
        id: UID,
        balance: u64,
    }

    /// Only the module that defines `Auth` type can create a vault
    public fun create_vault<Auth: drop>(
        _auth: Auth,
        initial_balance: u64,
        ctx: &mut TxContext,
    ): Vault<Auth> {
        Vault {
            id: object::new(ctx),
            balance: initial_balance,
        }
    }

    /// Withdraw requires the auth type — only the defining module can provide it
    public fun withdraw<Auth: drop>(
        _auth: Auth,
        vault: &mut Vault<Auth>,
        amount: u64,
    ): u64 {
        assert!(vault.balance >= amount, 0);
        vault.balance = vault.balance - amount;
        amount
    }
}

// In another module:
module my_app::my_vault {
    use patterns::sentinel;

    /// Only my_app can create this auth type
    public struct MyAuth has drop {}

    public fun setup(ctx: &mut TxContext) {
        let vault = sentinel::create_vault(MyAuth {}, 1000, ctx);
        transfer::share_object(vault);
    }

    public fun my_withdraw(vault: &mut sentinel::Vault<MyAuth>, amount: u64): u64 {
        sentinel::withdraw(MyAuth {}, vault, amount)
    }
}
```

### Pattern 8: Dynamic Field Pattern (Extensible State)

**When to use**: Adding fields to objects after creation, heterogeneous collections, or avoiding struct layout changes.

```move
module patterns::dynamic_fields {
    use sui::dynamic_field as df;
    use sui::dynamic_object_field as dof;

    public struct GameCharacter has key {
        id: UID,
        name: std::string::String,
        level: u64,
    }

    public struct Weapon has key, store {
        id: UID,
        damage: u64,
    }

    /// Add inventory using dynamic fields (values)
    entry fun add_gold(character: &mut GameCharacter, amount: u64) {
        if (df::exists_(&character.id, b"gold")) {
            let gold = df::borrow_mut<vector<u8>, u64>(&mut character.id, b"gold");
            *gold = *gold + amount;
        } else {
            df::add(&mut character.id, b"gold", amount);
        }
    }

    /// Add equipment using dynamic object fields (child objects)
    entry fun equip_weapon(character: &mut GameCharacter, weapon: Weapon) {
        // The weapon becomes a child of the character
        dof::add(&mut character.id, b"weapon", weapon);
    }

    /// Remove equipment
    entry fun unequip_weapon(character: &mut GameCharacter): Weapon {
        dof::remove(&mut character.id, b"weapon")
    }

    /// Check if equipped
    public fun has_weapon(character: &GameCharacter): bool {
        dof::exists_(&character.id, b"weapon")
    }
}
```

### Pattern Quick Reference

| Pattern | Problem | Solution | Key Struct Abilities |
|---------|---------|----------|---------------------|
| **Capability** | Who can do admin actions? | Owned cap objects gate access | `key, store` |
| **Witness** | One-time initialization | OTW type, auto-created in init | `drop` only |
| **Hot Potato** | Enforce atomic completion | No-ability struct must be consumed | NO abilities |
| **Publisher** | Prove module authorship | `package::claim(otw)` in init | Framework managed |
| **Version** | Package upgrade safety | Version field + migration function | N/A |
| **Transfer Policy** | Control how objects transfer | Policy rules checked by Kiosk | Framework managed |
| **Sentinel** | Type-level module access | Phantom type auth parameter | `drop` |
| **Dynamic Field** | Extensible object state | `df::add/remove` on UID | N/A |

### Step: Handoff

- "I need to write tests for my patterns" -> route to `move-testing`
- "Review my code for security" -> route to `move-security`
- "Build a DeFi protocol" -> route to `build-defi-protocol`
- "Debug a Move error" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Use Capability pattern over address checks** — never use `assert!(tx_context::sender(ctx) == ADMIN_ADDRESS)`. Always use capability objects.
2. **OTW must match module name in UPPER_CASE** — `MY_MODULE` for module `my_module`. The runtime enforces this.
3. **Hot potatoes must have zero abilities** — adding `drop` defeats the entire purpose. The type system IS the enforcement.
4. **Version check in every public function** — if you use the Version pattern, every function on the shared object must verify the version. Missing one creates an exploit window.
5. **Claim Publisher in init, not later** — the OTW only exists in init. If you forget to claim Publisher, you cannot create Display or TransferPolicy.
6. **Prefer dynamic fields for extensible state** — if your struct might need new fields in future versions, use dynamic fields from the start.

## References

- Sui Move Patterns: https://docs.sui.io/concepts/sui-move-concepts
- Move Book: https://move-book.com
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
