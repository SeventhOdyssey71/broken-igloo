---
name: build-rwa
description: "Tokenize real-world assets on Sui. Covers PropertyToken pattern, fractional ownership, KYC-gated Kiosk trading, compliance checklist, Display standard for RWAs, legal wrapper patterns, dividend distribution, asset lifecycle management. Triggers: rwa, real world asset, tokenize property, fractional ownership, property token, real estate token, commodity token, asset tokenization"
---

```bash
# Telemetry preamble
SKILL_NAME="build-rwa"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui real-world asset (RWA) tokenization architect. Your job is to guide users through representing physical or traditional financial assets as on-chain objects on Sui — real estate, commodities, bonds, invoices, art, and more. RWA tokenization on Sui leverages the object model to create rich, metadata-bearing tokens that represent fractional ownership with built-in compliance controls.

Key architecture differences from EVM RWAs:
- **Objects, not mappings**: Each fractional share is a distinct owned object with metadata, not a fungible ERC-20 balance
- **Display standard**: Rich on-chain metadata (property address, valuation, legal entity) rendered by wallets and explorers
- **Kiosk + TransferPolicy**: Secondary trading with enforced compliance (KYC checks, jurisdiction restrictions, holding periods)
- **Dynamic fields**: Attach evolving data (appraisals, inspections, rental income) to the token object over time

## Workflow

### Step 1: Asset Structuring

Interview the user to determine the RWA structure:

| Parameter           | Question                                               | Options                              |
| ------------------- | ------------------------------------------------------ | ------------------------------------ |
| **Asset Class**     | What type of real-world asset?                         | Real estate, commodity, bond, invoice, art |
| **Fractionalization** | How many shares/fractions?                           | Fixed (e.g., 1000 shares), Variable  |
| **Compliance**      | What KYC/AML requirements?                             | None, basic KYC, accredited investor |
| **Income**          | Does the asset generate income?                        | Rent, dividends, interest, none      |
| **Trading**         | Can shares be traded on secondary market?              | Yes (Kiosk), restricted, non-transferable |
| **Legal Wrapper**   | Is there an SPV/legal entity?                          | LLC, trust, foundation, none         |

### Step 2: Core RWA Token Module

```move
module rwa::property_token {
    use sui::display;
    use sui::package;
    use sui::transfer_policy;
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use std::string::String;

    // === Error Codes ===
    const ENotAuthorized: u64 = 0;
    const EExceedsMaxShares: u64 = 1;
    const ENotKYCApproved: u64 = 2;
    const ETransferRestricted: u64 = 3;
    const EDividendAlreadyClaimed: u64 = 4;

    // === One-Time Witness ===
    public struct PROPERTY_TOKEN has drop {}

    // === Objects ===

    /// Admin capability for the property issuer
    public struct IssuerCap has key, store {
        id: UID,
    }

    /// Global property registry (shared object)
    public struct PropertyRegistry has key {
        id: UID,
        /// KYC-approved addresses
        kyc_approved: Table<address, KYCStatus>,
        /// Total properties registered
        total_properties: u64,
        /// Platform fee basis points
        platform_fee_bps: u64,
        /// Collected fees
        fee_balance: Balance<SUI>,
    }

    public struct KYCStatus has store, drop {
        approved: bool,
        accredited: bool, // accredited investor status
        jurisdiction: String, // 2-letter country code
        approved_at: u64,
        expires_at: u64,
    }

    /// Represents a single property/asset (shared object)
    public struct Property has key {
        id: UID,
        /// Legal name of the property/asset
        name: String,
        /// Physical address or asset identifier
        location: String,
        /// Legal entity (SPV) that holds the asset
        legal_entity: String,
        /// Total number of fractional shares
        total_shares: u64,
        /// Shares issued so far
        shares_issued: u64,
        /// Current appraised value (in USD cents)
        appraised_value: u64,
        /// Last appraisal date (timestamp ms)
        last_appraisal: u64,
        /// Asset status
        status: u8, // 0=active, 1=paused, 2=liquidating, 3=liquidated
        /// Accumulated rental income for distribution
        income_balance: Balance<SUI>,
        /// Current dividend epoch
        dividend_epoch: u64,
        /// Dividend per share for current epoch (in MIST)
        dividend_per_share: u64,
        /// Track who claimed dividends in current epoch
        dividend_claims: Table<ID, u64>, // share_id -> last claimed epoch
    }

    /// Fractional ownership share (owned by investor)
    public struct PropertyShare has key, store {
        id: UID,
        /// Reference to the parent property
        property_id: ID,
        /// Number of shares this token represents
        shares: u64,
        /// Property name (for Display)
        property_name: String,
        /// Property location (for Display)
        property_location: String,
        /// When this share was issued
        issued_at: u64,
        /// Original investor address
        original_investor: address,
    }

    // === Events ===
    public struct PropertyCreated has copy, drop {
        property_id: ID,
        name: String,
        total_shares: u64,
    }

    public struct SharesIssued has copy, drop {
        property_id: ID,
        share_id: ID,
        investor: address,
        shares: u64,
    }

    public struct DividendDistributed has copy, drop {
        property_id: ID,
        total_amount: u64,
        dividend_per_share: u64,
        epoch: u64,
    }

    public struct DividendClaimed has copy, drop {
        property_id: ID,
        share_id: ID,
        investor: address,
        amount: u64,
    }

    public struct AppraisalUpdated has copy, drop {
        property_id: ID,
        old_value: u64,
        new_value: u64,
        timestamp: u64,
    }

    // === Init ===
    fun init(otw: PROPERTY_TOKEN, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        // Display for property shares
        let mut display = display::new<PropertyShare>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"{property_name} — {shares} shares"));
        display::add(&mut display, string::utf8(b"description"), string::utf8(b"Fractional ownership of {property_name} at {property_location}"));
        display::add(&mut display, string::utf8(b"image_url"), string::utf8(b"https://rwa.example.com/property/{property_id}/image.png"));
        display::add(&mut display, string::utf8(b"project_url"), string::utf8(b"https://rwa.example.com/property/{property_id}"));
        display::update_version(&mut display);

        // TransferPolicy for KYC-gated trading
        let (policy, policy_cap) = transfer_policy::new<PropertyShare>(&publisher, ctx);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
        transfer::public_share_object(policy);
        transfer::public_transfer(policy_cap, tx_context::sender(ctx));

        // Issuer cap
        transfer::transfer(IssuerCap { id: object::new(ctx) }, tx_context::sender(ctx));

        // Property registry
        transfer::share_object(PropertyRegistry {
            id: object::new(ctx),
            kyc_approved: table::new(ctx),
            total_properties: 0,
            platform_fee_bps: 100, // 1%
            fee_balance: balance::zero(),
        });
    }

    // === Create Property ===
    public entry fun create_property(
        _issuer: &IssuerCap,
        registry: &mut PropertyRegistry,
        name: String,
        location: String,
        legal_entity: String,
        total_shares: u64,
        appraised_value: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let property = Property {
            id: object::new(ctx),
            name,
            location,
            legal_entity,
            total_shares,
            shares_issued: 0,
            appraised_value,
            last_appraisal: clock::timestamp_ms(clock),
            status: 0,
            income_balance: balance::zero(),
            dividend_epoch: 0,
            dividend_per_share: 0,
            dividend_claims: table::new(ctx),
        };

        registry.total_properties = registry.total_properties + 1;

        event::emit(PropertyCreated {
            property_id: object::id(&property),
            name: property.name,
            total_shares,
        });

        transfer::share_object(property);
    }

    // === Issue Shares (KYC Required) ===
    public entry fun issue_shares(
        _issuer: &IssuerCap,
        registry: &PropertyRegistry,
        property: &mut Property,
        shares: u64,
        investor: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Verify KYC
        assert!(table::contains(&registry.kyc_approved, investor), ENotKYCApproved);
        let kyc = table::borrow(&registry.kyc_approved, investor);
        assert!(kyc.approved, ENotKYCApproved);
        assert!(kyc.expires_at > clock::timestamp_ms(clock), ENotKYCApproved);

        // Verify shares available
        assert!(property.shares_issued + shares <= property.total_shares, EExceedsMaxShares);
        property.shares_issued = property.shares_issued + shares;

        let share = PropertyShare {
            id: object::new(ctx),
            property_id: object::id(property),
            shares,
            property_name: property.name,
            property_location: property.location,
            issued_at: clock::timestamp_ms(clock),
            original_investor: investor,
        };

        event::emit(SharesIssued {
            property_id: object::id(property),
            share_id: object::id(&share),
            investor,
            shares,
        });

        transfer::public_transfer(share, investor);
    }

    // === Dividend Distribution ===
    public entry fun distribute_dividends(
        _issuer: &IssuerCap,
        property: &mut Property,
        income: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&income);
        let per_share = amount / property.shares_issued;

        balance::join(&mut property.income_balance, coin::into_balance(income));
        property.dividend_epoch = property.dividend_epoch + 1;
        property.dividend_per_share = per_share;

        event::emit(DividendDistributed {
            property_id: object::id(property),
            total_amount: amount,
            dividend_per_share: per_share,
            epoch: property.dividend_epoch,
        });
    }

    /// Claim dividends for a property share
    public entry fun claim_dividends(
        property: &mut Property,
        share: &PropertyShare,
        ctx: &mut TxContext,
    ) {
        let share_id = object::id(share);

        // Check if already claimed for this epoch
        let last_claimed = if (table::contains(&property.dividend_claims, share_id)) {
            *table::borrow(&property.dividend_claims, share_id)
        } else {
            0
        };
        assert!(last_claimed < property.dividend_epoch, EDividendAlreadyClaimed);

        // Calculate dividend
        let dividend_amount = share.shares * property.dividend_per_share;

        // Update claim record
        if (table::contains(&property.dividend_claims, share_id)) {
            *table::borrow_mut(&mut property.dividend_claims, share_id) = property.dividend_epoch;
        } else {
            table::add(&mut property.dividend_claims, share_id, property.dividend_epoch);
        };

        // Pay dividend
        let dividend = coin::from_balance(
            balance::split(&mut property.income_balance, dividend_amount),
            ctx,
        );

        event::emit(DividendClaimed {
            property_id: object::id(property),
            share_id,
            investor: tx_context::sender(ctx),
            amount: dividend_amount,
        });

        transfer::public_transfer(dividend, tx_context::sender(ctx));
    }

    // === Update Appraisal ===
    public entry fun update_appraisal(
        _issuer: &IssuerCap,
        property: &mut Property,
        new_value: u64,
        clock: &Clock,
    ) {
        let old_value = property.appraised_value;
        property.appraised_value = new_value;
        property.last_appraisal = clock::timestamp_ms(clock);

        event::emit(AppraisalUpdated {
            property_id: object::id(property),
            old_value,
            new_value,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // === KYC Management ===
    public entry fun approve_investor(
        _issuer: &IssuerCap,
        registry: &mut PropertyRegistry,
        investor: address,
        accredited: bool,
        jurisdiction: String,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock);
        let status = KYCStatus {
            approved: true,
            accredited,
            jurisdiction,
            approved_at: now,
            expires_at: now + 31_536_000_000, // 1 year
        };

        if (table::contains(&registry.kyc_approved, investor)) {
            *table::borrow_mut(&mut registry.kyc_approved, investor) = status;
        } else {
            table::add(&mut registry.kyc_approved, investor, status);
        };
    }

    // === View Functions ===
    public fun share_value_usd(property: &Property, share: &PropertyShare): u64 {
        (property.appraised_value / property.total_shares) * share.shares
    }
}
```

### Step 3: Secondary Market Trading (KYC-Gated Kiosk)

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

// Custom TransferPolicy rule that checks KYC status
// The rule verifies the buyer is KYC-approved before completing the transfer

async function purchasePropertyShare(
  signer,
  sellerKioskId: string,
  shareId: string,
  price: bigint,
  buyerKioskId: string,
  buyerKioskCapId: string,
) {
  const tx = new Transaction();

  // Payment
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);

  // Purchase from Kiosk
  const [share, transferRequest] = tx.moveCall({
    target: "0x2::kiosk::purchase",
    typeArguments: [`${PACKAGE_ID}::property_token::PropertyShare`],
    arguments: [
      tx.object(sellerKioskId),
      tx.pure.id(shareId),
      payment,
    ],
  });

  // Satisfy KYC rule (custom TransferPolicy rule)
  tx.moveCall({
    target: `${PACKAGE_ID}::kyc_rule::verify`,
    typeArguments: [`${PACKAGE_ID}::property_token::PropertyShare`],
    arguments: [
      tx.object(TRANSFER_POLICY_ID),
      transferRequest,
      tx.object(REGISTRY_ID), // KYC registry
      tx.object("0x6"), // Clock
    ],
  });

  // Confirm transfer
  tx.moveCall({
    target: "0x2::transfer_policy::confirm_request",
    typeArguments: [`${PACKAGE_ID}::property_token::PropertyShare`],
    arguments: [tx.object(TRANSFER_POLICY_ID), transferRequest],
  });

  // Place in buyer's Kiosk
  tx.moveCall({
    target: "0x2::kiosk::place",
    typeArguments: [`${PACKAGE_ID}::property_token::PropertyShare`],
    arguments: [tx.object(buyerKioskId), tx.object(buyerKioskCapId), share],
  });

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}
```

### Step 4: Investor Dashboard

```typescript
// Fetch all property shares owned by an investor
async function getInvestorPortfolio(address: string) {
  const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

  const objects = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: `${PACKAGE_ID}::property_token::PropertyShare` },
    options: { showContent: true, showDisplay: true },
  });

  return Promise.all(
    objects.data.map(async (obj) => {
      const fields = obj.data.content.fields;
      const propertyId = fields.property_id;

      // Fetch current property data
      const property = await client.getObject({
        id: propertyId,
        options: { showContent: true },
      });
      const propFields = property.data.content.fields;

      return {
        shareId: obj.data.objectId,
        propertyName: fields.property_name,
        location: fields.property_location,
        shares: Number(fields.shares),
        totalShares: Number(propFields.total_shares),
        ownershipPct: (Number(fields.shares) / Number(propFields.total_shares) * 100).toFixed(2),
        currentValue: Number(propFields.appraised_value) / Number(propFields.total_shares) * Number(fields.shares),
        pendingDividend: Number(propFields.dividend_per_share) * Number(fields.shares),
        display: obj.data.display?.data,
      };
    }),
  );
}
```

### Step 5: Compliance Checklist for RWA Projects

- [ ] Legal entity (SPV/LLC) created to hold the physical asset
- [ ] Legal opinion on token classification in target jurisdictions
- [ ] KYC/AML provider integrated (e.g., Sumsub, Onfido, Chainalysis)
- [ ] Accredited investor verification (for securities)
- [ ] Transfer restrictions enforced via TransferPolicy
- [ ] Holding period lockups implemented if required
- [ ] Dividend distribution mechanism tested
- [ ] Appraisal update workflow with authorized appraiser
- [ ] Liquidation procedure documented and coded
- [ ] Tax reporting integration (1099 generation)
- [ ] Audit trail for all ownership changes
- [ ] Insurance for the physical asset
- [ ] Display standard configured for wallet/explorer rendering

## Non-Negotiables

1. **ALWAYS enforce KYC on all share transfers** — RWA tokens represent regulated securities in most jurisdictions; unrestricted trading violates securities law
2. **PropertyShare MUST have `key + store`** for Kiosk trading, but ALWAYS pair with a KYC TransferPolicy rule
3. **ALWAYS maintain an audit trail** — emit events for every issuance, transfer, dividend, and appraisal update
4. **NEVER allow share issuance beyond total_shares** — the on-chain representation must match the legal structure exactly
5. **ALWAYS use Display standard** — wallets and explorers must render property details for investor clarity
6. **Dynamic fields for evolving asset data** — appraisals, inspections, and legal documents change over time; use dynamic fields, not struct fields
7. **IssuerCap MUST be under multisig** — a single key controlling real-world asset tokens is an unacceptable risk
8. **ALWAYS separate the legal entity from the token** — the token represents a claim on the SPV, not direct ownership of the asset

## References

- `skills/build/build-regulated-token/SKILL.md` — DenyList and compliance token patterns
- `skills/build/build-marketplace/SKILL.md` — Kiosk trading mechanics
- `skills/build/integrate-seal/SKILL.md` — Encrypted document storage for legal docs
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
