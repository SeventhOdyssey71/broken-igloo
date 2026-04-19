---
name: build-regulated-token
description: "Create regulated and compliance tokens on Sui. Covers DenyList integration, global pause, KYC gates, closed-loop tokens, Permissioned Asset Standard (PAS), transfer restrictions, allowlist/blocklist enforcement. Triggers: regulated token, compliance token, denylist, deny list, kyc token, closed-loop token, permissioned token, block address, freeze token, regulated coin"
---

```bash
# Telemetry preamble
SKILL_NAME="build-regulated-token"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui regulated token architect. Your job is to guide users through creating tokens with compliance controls — deny lists, transfer restrictions, KYC gates, global pause, and closed-loop spending. Sui provides a **native DenyList system** for coins created with `create_regulated_currency`, and a **Closed-Loop Token** standard for application-specific restrictions.

Two token standards for regulation:

1. **Regulated Coin** (`coin::create_regulated_currency`): Standard `Coin<T>` with a system-level DenyList. The token issuer can add addresses to the deny list, preventing them from being used in any transaction involving that coin type. Works with all existing DeFi protocols that accept `Coin<T>`.

2. **Closed-Loop Token** (`token::Token<T>`): A separate standard where the issuer defines explicit **spending rules** — which actions are allowed, which merchants can accept the token, and what transfer restrictions apply. Does NOT work with standard DeFi protocols (by design — it restricts where tokens can flow).

Choose regulated coin for stablecoins, security tokens, and any token that needs a blocklist but should otherwise be freely tradeable. Choose closed-loop token for loyalty points, in-app credits, and tokens that should only be spendable at approved locations.

## Workflow

### Step 1: Regulated Coin with DenyList

```move
module regulated::rusd {
    use sui::coin::{Self, DenyCapV2};
    use sui::deny_list::DenyList;

    /// One-time witness
    public struct RUSD has drop {}

    fun init(witness: RUSD, ctx: &mut TxContext) {
        // create_regulated_currency returns an additional DenyCapV2
        let (treasury_cap, deny_cap, metadata) = coin::create_regulated_currency_v2<RUSD>(
            witness,
            6,                    // decimals (USDC-style)
            b"rUSD",             // symbol
            b"Regulated USD",    // name
            b"KYC-gated US dollar stablecoin", // description
            option::none(),      // icon_url
            true,                // allow global pause
            ctx,
        );

        // Transfer treasury cap to deployer (for minting)
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));

        // Transfer deny cap to deployer (for blocklisting)
        transfer::public_transfer(deny_cap, tx_context::sender(ctx));

        // Freeze metadata
        transfer::public_freeze_object(metadata);
    }

    // === DenyList Management ===

    /// Add an address to the deny list (block them from using rUSD)
    public entry fun block_address(
        deny_list: &mut DenyList,
        deny_cap: &mut DenyCapV2<RUSD>,
        address: address,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_add(deny_list, deny_cap, address, ctx);
    }

    /// Remove an address from the deny list
    public entry fun unblock_address(
        deny_list: &mut DenyList,
        deny_cap: &mut DenyCapV2<RUSD>,
        address: address,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_remove(deny_list, deny_cap, address, ctx);
    }

    /// Check if an address is blocked
    public fun is_blocked(
        deny_list: &DenyList,
        address: address,
    ): bool {
        coin::deny_list_v2_contains_next_epoch<RUSD>(deny_list, address)
    }

    /// Global pause — blocks ALL transfers of this coin
    public entry fun global_pause(
        deny_list: &mut DenyList,
        deny_cap: &mut DenyCapV2<RUSD>,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_enable_global_pause(deny_list, deny_cap, ctx);
    }

    /// Unpause
    public entry fun global_unpause(
        deny_list: &mut DenyList,
        deny_cap: &mut DenyCapV2<RUSD>,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_disable_global_pause(deny_list, deny_cap, ctx);
    }

    // === Mint/Burn (standard TreasuryCap operations) ===

    public entry fun mint(
        treasury_cap: &mut TreasuryCap<RUSD>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    public entry fun burn(
        treasury_cap: &mut TreasuryCap<RUSD>,
        coin: Coin<RUSD>,
    ) {
        coin::burn(treasury_cap, coin);
    }
}
```

### Step 2: DenyList Operations via TypeScript

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// The DenyList is a system object at a well-known address
const DENY_LIST_OBJECT_ID = "0x403";

// Block an address from using the regulated token
async function blockAddress(signer, denyCapId: string, targetAddress: string) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::rusd::block_address`,
    arguments: [
      tx.object(DENY_LIST_OBJECT_ID),
      tx.object(denyCapId),
      tx.pure.address(targetAddress),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log(`Blocked ${targetAddress}: ${result.digest}`);
  // NOTE: Takes effect next epoch (not immediately)
}

// Unblock an address
async function unblockAddress(signer, denyCapId: string, targetAddress: string) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::rusd::unblock_address`,
    arguments: [
      tx.object(DENY_LIST_OBJECT_ID),
      tx.object(denyCapId),
      tx.pure.address(targetAddress),
    ],
  });

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}

// Global pause — emergency stop all transfers
async function emergencyPause(signer, denyCapId: string) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::rusd::global_pause`,
    arguments: [
      tx.object(DENY_LIST_OBJECT_ID),
      tx.object(denyCapId),
    ],
  });

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}

// Check if address is blocked
async function checkBlocked(address: string): Promise<boolean> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::rusd::is_blocked`,
    arguments: [
      tx.object(DENY_LIST_OBJECT_ID),
      tx.pure.address(address),
    ],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: address,
  });

  // Parse boolean result
  return result.results?.[0]?.returnValues?.[0]?.[0]?.[0] === 1;
}
```

### Step 3: Closed-Loop Token (Application-Specific Restrictions)

```move
module regulated::loyalty_credit {
    use sui::token::{Self, Token, TokenPolicy, TokenPolicyCap, ActionRequest};
    use sui::coin::{Self, TreasuryCap};

    public struct LOYALTY_CREDIT has drop {}

    /// Approved merchant who can receive tokens
    public struct MerchantCap has key, store {
        id: UID,
        name: vector<u8>,
        merchant_address: address,
    }

    fun init(witness: LOYALTY_CREDIT, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<LOYALTY_CREDIT>(
            witness,
            0,               // 0 decimals (whole points only)
            b"LOYALTY",
            b"Loyalty Credit",
            b"Closed-loop loyalty points",
            option::none(),
            ctx,
        );

        // Create the Token policy for spending rules
        let (mut policy, policy_cap) = token::new_policy<LOYALTY_CREDIT>(
            &treasury_cap,
            ctx,
        );

        // Allow "spend" action at approved merchants
        // Allow "transfer" between users (or disallow for non-transferable)
        token::allow(&mut policy, &policy_cap, token::spend_action(), ctx);
        // Uncomment to allow peer-to-peer transfer:
        // token::allow(&mut policy, &policy_cap, token::transfer_action(), ctx);

        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(policy_cap, tx_context::sender(ctx));
        token::share_policy(policy);
        transfer::public_freeze_object(metadata);
    }

    /// Issue loyalty credits to a user
    public entry fun issue_credits(
        treasury_cap: &mut TreasuryCap<LOYALTY_CREDIT>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let token = token::mint(treasury_cap, amount, ctx);
        let req = token::transfer(token, recipient, ctx);
        token::confirm_with_treasury_cap(treasury_cap, req, ctx);
    }

    /// Spend credits at an approved merchant
    public fun spend_at_merchant(
        token: Token<LOYALTY_CREDIT>,
        merchant: &MerchantCap,
        ctx: &mut TxContext,
    ): ActionRequest<LOYALTY_CREDIT> {
        // Verify merchant is approved (they hold a MerchantCap)
        let amount = token::value(&token);

        // Spend (burn) the token
        let req = token::spend(token, ctx);

        // The ActionRequest must be confirmed by the policy
        req
    }

    /// Approve a new merchant
    public entry fun add_merchant(
        _treasury_cap: &TreasuryCap<LOYALTY_CREDIT>,
        name: vector<u8>,
        merchant_address: address,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(MerchantCap {
            id: object::new(ctx),
            name,
            merchant_address,
        }, merchant_address);
    }
}
```

### Step 4: KYC-Gated Minting

```move
module regulated::kyc_token {
    use sui::table::Table;

    /// KYC registry (shared object)
    public struct KYCRegistry has key {
        id: UID,
        /// address -> KYC approved
        approved: Table<address, bool>,
        /// KYC provider who can approve addresses
        kyc_admin: address,
    }

    const ENotKYCApproved: u64 = 0;
    const ENotKYCAdmin: u64 = 1;

    /// Approve an address after KYC verification
    public entry fun approve_kyc(
        registry: &mut KYCRegistry,
        address: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == registry.kyc_admin, ENotKYCAdmin);
        if (table::contains(&registry.approved, address)) {
            *table::borrow_mut(&mut registry.approved, address) = true;
        } else {
            table::add(&mut registry.approved, address, true);
        };
    }

    /// Revoke KYC approval
    public entry fun revoke_kyc(
        registry: &mut KYCRegistry,
        address: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == registry.kyc_admin, ENotKYCAdmin);
        if (table::contains(&registry.approved, address)) {
            *table::borrow_mut(&mut registry.approved, address) = false;
        };
    }

    /// Check if address is KYC approved
    public fun is_kyc_approved(registry: &KYCRegistry, address: address): bool {
        if (table::contains(&registry.approved, address)) {
            *table::borrow(&registry.approved, address)
        } else {
            false
        }
    }

    /// KYC-gated mint — only approved addresses can receive tokens
    public entry fun kyc_mint(
        registry: &KYCRegistry,
        treasury_cap: &mut TreasuryCap<REGULATED_TOKEN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(is_kyc_approved(registry, recipient), ENotKYCApproved);
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// KYC-gated transfer — both sender and recipient must be KYC approved
    public entry fun kyc_transfer(
        registry: &KYCRegistry,
        coin: Coin<REGULATED_TOKEN>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(is_kyc_approved(registry, tx_context::sender(ctx)), ENotKYCApproved);
        assert!(is_kyc_approved(registry, recipient), ENotKYCApproved);
        transfer::public_transfer(coin, recipient);
    }
}
```

### Step 5: Admin Dashboard for Compliance Officers

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

class ComplianceDashboard {
  private client: SuiClient;

  constructor(rpcUrl: string) {
    this.client = new SuiClient({ url: rpcUrl });
  }

  // Get all blocked addresses
  async getBlockedAddresses(): Promise<string[]> {
    // Query deny list events to reconstruct the blocked set
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${PACKAGE_ID}::rusd::AddressBlocked`,
      },
      limit: 1000,
    });

    // Also get unblock events to compute net blocked list
    const unblockEvents = await this.client.queryEvents({
      query: {
        MoveEventType: `${PACKAGE_ID}::rusd::AddressUnblocked`,
      },
      limit: 1000,
    });

    const blocked = new Set<string>();
    for (const e of events.data) {
      blocked.add(e.parsedJson.address);
    }
    for (const e of unblockEvents.data) {
      blocked.delete(e.parsedJson.address);
    }

    return Array.from(blocked);
  }

  // Batch block multiple addresses
  async batchBlock(signer, denyCapId: string, addresses: string[]) {
    const tx = new Transaction();

    for (const addr of addresses) {
      tx.moveCall({
        target: `${PACKAGE_ID}::rusd::block_address`,
        arguments: [
          tx.object(DENY_LIST_OBJECT_ID),
          tx.object(denyCapId),
          tx.pure.address(addr),
        ],
      });
    }

    return this.client.signAndExecuteTransaction({ signer, transaction: tx });
  }

  // Get token holder distribution for compliance reporting
  async getHolderDistribution(coinType: string) {
    // Use GraphQL to query all balances of this coin type
    const query = `
      query Holders($coinType: String!, $first: Int) {
        coins(type: $coinType, first: $first) {
          nodes {
            owner { address }
            balance
          }
        }
      }
    `;

    return graphqlQuery(query, { coinType, first: 1000 });
  }
}
```

### Step 6: Compliance Checklist

Before deploying a regulated token:

- [ ] DenyCapV2 secured (multisig or governance contract)
- [ ] TreasuryCap secured (multisig for mint authority)
- [ ] KYC integration tested end-to-end
- [ ] Global pause tested and documented
- [ ] DenyList operations tested (block, unblock, check)
- [ ] Compliance events emitted for all regulatory actions
- [ ] Audit trail: all block/unblock operations logged with timestamps
- [ ] Legal review of token classification (security, utility, stablecoin)
- [ ] Incident response plan for emergency pause scenarios
- [ ] Recovery procedure documented for DenyCapV2 loss

## Non-Negotiables

1. **DenyList changes take effect NEXT EPOCH** — not immediately; plan for the delay in compliance workflows
2. **NEVER lose the DenyCapV2** — without it, you cannot block addresses or pause the token; use multisig governance
3. **ALWAYS use `create_regulated_currency_v2`** (not v1) — v2 supports global pause and is the current standard
4. **Closed-loop tokens (`Token<T>`) are NOT `Coin<T>`** — they do not work with standard DeFi protocols; this is by design for compliance
5. **ALWAYS emit events for compliance actions** — block, unblock, pause, unpause, KYC approve/revoke must all be auditable
6. **NEVER hardcode compliance decisions in Move** — use configurable rules (Table lookups, capability patterns) so policies can be updated
7. **ALWAYS plan for UpgradeCap management** — compliance rules change; your package must be upgradeable to adapt
8. **The DenyList object is at address `0x403`** — this is a system singleton; do not create your own

## References

- `skills/build/launch-token/SKILL.md` — Standard token creation
- `skills/build/build-loyalty-program/SKILL.md` — Closed-loop token usage for loyalty
- `skills/build/upgrade-package/SKILL.md` — Upgrading compliance rules
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
