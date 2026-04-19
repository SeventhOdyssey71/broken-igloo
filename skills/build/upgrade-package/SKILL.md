---
name: upgrade-package
description: "Guide to upgrading Sui Move packages. Covers compatibility rules (additive, compatible, dep-only), UpgradeCap lifecycle, UpgradeTicket flow, version migration, multisig governance for upgrades, testing upgrades, rollback strategies. Triggers: upgrade package, upgrade move, package upgrade, upgradeability, upgrade cap, version migration, move upgrade, upgrade contract"
---

```bash
# Telemetry preamble
SKILL_NAME="upgrade-package"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui package upgrade specialist. Your job is to guide the user through the full lifecycle of upgrading Move packages on Sui — from understanding compatibility rules, to executing the upgrade, to migrating state in existing shared objects. Package upgrades on Sui are fundamentally different from EVM proxy patterns. There are no proxies, no delegatecall, no storage slots. Instead, Sui has a **native package upgrade system** where a new version of your package is published and linked to the original via the `UpgradeCap`.

Key concepts:
- **UpgradeCap**: An owned object created when a package is first published. Whoever holds it can authorize upgrades.
- **UpgradeTicket**: A hot-potato object that authorizes a single upgrade operation. Created from UpgradeCap, consumed during publish.
- **Compatibility policies**: Rules that restrict what changes are allowed (additive-only, compatible, dep-only, immutable).
- **Version linking**: Each upgrade creates a new package ID but links back to the original. Existing shared objects continue to work with the new code.

## Workflow

### Step 1: Understand Compatibility Policies

| Policy         | What You CAN Do                                           | What You CANNOT Do                           |
| -------------- | --------------------------------------------------------- | -------------------------------------------- |
| **Compatible** | Add new functions, add new modules, add new structs, change function bodies, add abilities to generics | Remove functions, change function signatures, remove struct fields, change struct layouts |
| **Additive**   | Add new modules only                                       | Modify existing modules at all                |
| **Dep-only**   | Update dependency versions only                            | Change any of your own code                   |
| **Immutable**  | Nothing — package is frozen forever                        | Any changes at all                            |

The default policy after publish is **Compatible**. You can make it more restrictive (Compatible -> Additive -> Dep-only -> Immutable) but NEVER less restrictive.

### Step 2: Plan Your Upgrade

Before writing any code, verify what changes are allowed:

```bash
# Check your current package info
sui client object <UPGRADE_CAP_ID> --json

# The policy field tells you the current compatibility level:
# 0 = Compatible
# 128 = Additive  
# 192 = Dep-only
# 255 = Immutable
```

**Compatible policy rules in detail:**

```move
// ALLOWED: Add new public functions
public fun new_feature(pool: &mut Pool): u64 { ... }

// ALLOWED: Add new entry functions
public entry fun new_action(pool: &mut Pool, ctx: &mut TxContext) { ... }

// ALLOWED: Change function body (implementation)
public fun calculate_fee(amount: u64): u64 {
    // Changed from 1% to 0.5%
    amount / 200  // was: amount / 100
}

// ALLOWED: Add new struct
public struct NewFeature has key, store {
    id: UID,
    data: u64,
}

// ALLOWED: Add new module to the package
module my_package::new_module {
    // entirely new module
}

// FORBIDDEN: Remove or rename existing public function
// FORBIDDEN: Change function parameter types or return type
// FORBIDDEN: Remove struct fields or change field types
// FORBIDDEN: Remove abilities from structs
// FORBIDDEN: Change struct layout (field order, add fields to existing struct)
```

### Step 3: Version-Aware Module Pattern

Design your modules to support upgrades from the start:

```move
module my_package::pool {
    use sui::dynamic_field;

    /// Pool struct — fields can NEVER change after first publish
    public struct Pool has key {
        id: UID,
        balance_x: Balance<X>,
        balance_y: Balance<Y>,
        fee_bps: u64,
        // DO NOT add fields here after publish — it breaks compatibility
        // Use dynamic fields for extensibility (see below)
    }

    /// For post-upgrade extensions, use dynamic fields
    /// This pattern lets you "add fields" without changing the struct layout
    public struct V2Config has store, drop {
        new_fee_model: u8,
        flash_loan_enabled: bool,
    }

    /// Migrate existing Pool objects to support v2 features
    public entry fun migrate_to_v2(pool: &mut Pool, _admin: &AdminCap) {
        // Add v2 config as a dynamic field
        dynamic_field::add(&mut pool.id, b"v2_config", V2Config {
            new_fee_model: 1,
            flash_loan_enabled: true,
        });
    }

    /// New function added in v2 — uses dynamic field data
    public fun flash_loan_enabled(pool: &Pool): bool {
        if (dynamic_field::exists_(&pool.id, b"v2_config")) {
            let config: &V2Config = dynamic_field::borrow(&pool.id, b"v2_config");
            config.flash_loan_enabled
        } else {
            false // Default for un-migrated pools
        }
    }
}
```

### Step 4: Execute the Upgrade via CLI

```bash
# Step 1: Build the updated package
sui move build

# Step 2: Run tests to verify
sui move test

# Step 3: Execute the upgrade
# The CLI handles UpgradeTicket creation and consumption automatically
sui client upgrade --gas-budget 200000000 --upgrade-capability <UPGRADE_CAP_ID>

# Output:
# Package upgraded successfully
# New Package ID: 0x<new_package_id>
# Previous Package ID: 0x<old_package_id>
```

### Step 5: Programmatic Upgrade via TypeScript

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { execSync } from "child_process";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

async function upgradePackage(
  signer,
  upgradeCapId: string,
  packagePath: string,
) {
  // Build the package and get the compiled modules + digest
  const buildOutput = execSync(
    `sui move build --dump-bytecode-as-base64 --path ${packagePath}`,
    { encoding: "utf-8" },
  );
  const { modules, dependencies, digest } = JSON.parse(buildOutput);

  const tx = new Transaction();

  // Step 1: Authorize the upgrade — creates UpgradeTicket (hot potato)
  const upgradeTicket = tx.moveCall({
    target: "0x2::package::authorize_upgrade",
    arguments: [
      tx.object(upgradeCapId),
      tx.pure.u8(0), // policy: 0 = compatible
      tx.pure(digest, "vector<u8>"),
    ],
  });

  // Step 2: Publish the upgrade — consumes UpgradeTicket, returns UpgradeReceipt
  const upgradeReceipt = tx.upgrade({
    modules,
    dependencies,
    package: ORIGINAL_PACKAGE_ID,
    ticket: upgradeTicket,
  });

  // Step 3: Commit the upgrade — consumes UpgradeReceipt
  tx.moveCall({
    target: "0x2::package::commit_upgrade",
    arguments: [
      tx.object(upgradeCapId),
      upgradeReceipt,
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true },
  });

  // Extract new package ID
  const packageChange = result.objectChanges?.find(
    (c) => c.type === "published",
  );
  console.log("New package ID:", packageChange?.packageId);

  return result;
}
```

### Step 6: Multisig-Governed Upgrades

For production packages, upgrades should require multiple signers:

```move
module my_package::upgrade_governance {
    use sui::package::UpgradeCap;

    /// Wrap UpgradeCap in a governance object
    public struct UpgradeGovernance has key {
        id: UID,
        upgrade_cap: UpgradeCap,
        /// Required approvals for upgrade
        threshold: u64,
        /// Authorized signers
        signers: vector<address>,
        /// Current upgrade proposal
        pending_proposal: Option<UpgradeProposal>,
    }

    public struct UpgradeProposal has store {
        digest: vector<u8>,
        policy: u8,
        approvals: vector<address>,
        created_at: u64,
    }

    /// Propose an upgrade
    public entry fun propose_upgrade(
        gov: &mut UpgradeGovernance,
        digest: vector<u8>,
        policy: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(vector::contains(&gov.signers, &sender), ENotAuthorized);
        assert!(option::is_none(&gov.pending_proposal), EProposalPending);

        option::fill(&mut gov.pending_proposal, UpgradeProposal {
            digest,
            policy,
            approvals: vector[sender],
            created_at: clock::timestamp_ms(clock),
        });
    }

    /// Approve a pending upgrade proposal
    public entry fun approve_upgrade(
        gov: &mut UpgradeGovernance,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(vector::contains(&gov.signers, &sender), ENotAuthorized);

        let proposal = option::borrow_mut(&mut gov.pending_proposal);
        assert!(!vector::contains(&proposal.approvals, &sender), EAlreadyApproved);
        vector::push_back(&mut proposal.approvals, sender);
    }

    /// Execute the upgrade once threshold is met — returns UpgradeTicket
    public fun execute_upgrade(
        gov: &mut UpgradeGovernance,
    ): UpgradeTicket {
        let proposal = option::extract(&mut gov.pending_proposal);
        assert!(vector::length(&proposal.approvals) >= gov.threshold, EInsufficientApprovals);

        let UpgradeProposal { digest, policy, approvals: _, created_at: _ } = proposal;

        package::authorize_upgrade(
            &mut gov.upgrade_cap,
            policy,
            digest,
        )
    }
}
```

### Step 7: State Migration After Upgrade

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

// After upgrading, migrate existing shared objects to use new features
async function migratePoolsToV2(
  signer,
  adminCapId: string,
  poolIds: string[],
) {
  // Batch migration — up to ~250 pools per transaction
  const BATCH_SIZE = 100;

  for (let i = 0; i < poolIds.length; i += BATCH_SIZE) {
    const batch = poolIds.slice(i, i + BATCH_SIZE);
    const tx = new Transaction();

    for (const poolId of batch) {
      tx.moveCall({
        target: `${NEW_PACKAGE_ID}::pool::migrate_to_v2`,
        arguments: [
          tx.object(poolId),
          tx.object(adminCapId),
        ],
      });
    }

    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
    });

    console.log(`Migrated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.digest}`);
  }
}
```

### Step 8: Restricting Upgrade Capability

```typescript
// Make package more restrictive (one-way, cannot undo)

const tx = new Transaction();

// Restrict from Compatible to Additive
tx.moveCall({
  target: "0x2::package::only_additive_upgrades",
  arguments: [tx.object(UPGRADE_CAP_ID)],
});

// Or restrict to Dep-only
tx.moveCall({
  target: "0x2::package::only_dep_upgrades",
  arguments: [tx.object(UPGRADE_CAP_ID)],
});

// Or make fully immutable (IRREVERSIBLE — package can never be upgraded again)
tx.moveCall({
  target: "0x2::package::make_immutable",
  arguments: [tx.object(UPGRADE_CAP_ID)],
});

await client.signAndExecuteTransaction({ signer, transaction: tx });
```

### Step 9: Testing Upgrades

```bash
# Test the upgrade locally before mainnet
# 1. Publish v1 to testnet
sui client publish --gas-budget 100000000
# Save: PACKAGE_ID_V1, UPGRADE_CAP_ID

# 2. Make your changes

# 3. Verify compatibility by building
sui move build
# If it compiles, the struct layouts haven't changed

# 4. Upgrade on testnet
sui client upgrade --gas-budget 200000000 --upgrade-capability $UPGRADE_CAP_ID

# 5. Verify existing objects still work with new package
sui client call --package $NEW_PACKAGE_ID --module pool --function swap \
  --args $POOL_ID $COIN_ID --gas-budget 50000000

# 6. Test migration function
sui client call --package $NEW_PACKAGE_ID --module pool --function migrate_to_v2 \
  --args $POOL_ID $ADMIN_CAP_ID --gas-budget 50000000

# 7. Test new features
sui client call --package $NEW_PACKAGE_ID --module pool --function new_feature \
  --args $POOL_ID --gas-budget 50000000
```

### Step 10: Update Frontend to Track Package Versions

```typescript
// After upgrade, your frontend needs to call the NEW package ID
// But existing shared objects keep their IDs

// Pattern: store package ID in config, update on upgrade
const config = {
  // OBJECTS stay the same across upgrades
  POOL_ID: "0xabc...",
  ADMIN_CAP_ID: "0xdef...",
  UPGRADE_CAP_ID: "0x123...",

  // PACKAGE ID changes on each upgrade — always use the latest
  PACKAGE_ID: "0x<new_package_id>", // Update this after each upgrade

  // Or dynamically resolve the latest version:
  async getLatestPackageId(upgradeCapId: string): Promise<string> {
    const cap = await client.getObject({
      id: upgradeCapId,
      options: { showContent: true },
    });
    return cap.data.content.fields.package; // Points to latest version
  },
};
```

## Non-Negotiables

1. **NEVER add fields to existing structs** — it breaks layout compatibility; use dynamic fields for extensibility
2. **NEVER remove or rename public functions** — existing callers will break; deprecate by adding new functions instead
3. **ALWAYS test upgrades on testnet first** — a failed upgrade on mainnet can be catastrophic
4. **ALWAYS secure the UpgradeCap** — whoever holds it controls your entire package; use multisig governance for production
5. **ALWAYS design for upgradeability from day one** — use dynamic fields for extensible state, version constants for migration tracking
6. **Restricting upgrade policy is ONE-WAY** — you can go Compatible -> Additive -> Dep-only -> Immutable but never backwards
7. **NEVER call `make_immutable` unless absolutely certain** — once immutable, the package can never be fixed, even for critical bugs
8. **ALWAYS update your frontend package ID** after an upgrade — shared objects stay the same, but the package ID changes

## References

- `skills/build/debug-move/SKILL.md` — Debugging Move compilation and upgrade errors
- `skills/build/review-and-iterate/SKILL.md` — Code review before upgrade
- `skills/build/deploy-testnet/SKILL.md` — Testing upgrades on testnet
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
