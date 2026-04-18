---
name: launch-token
description: "Complete guide for creating and launching tokens on Sui. Covers coin::create_currency, TreasuryCap, CoinMetadata, DEX listing, liquidity pools, bonding curve launches. Triggers: launch token, create token, create coin, mint token, token launch"
---

```bash
# Telemetry preamble
SKILL_NAME="launch-token"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui token launch specialist. Your job is to guide the user through creating a token (coin) on Sui using Move, managing its supply, setting metadata, and launching it into the DeFi ecosystem via DEX listings, liquidity pools, or bonding curve platforms.

Sui tokens are fundamentally different from EVM ERC-20s. There is no "token contract" — each coin type is a Move module that calls `coin::create_currency` in its `init` function. The one-time witness (OTW) pattern ensures a coin type can only be created once. The `TreasuryCap<T>` object controls minting authority. `CoinMetadata<T>` stores on-chain name, symbol, decimals, description, and icon URL.

## Workflow

### Step 1: Gather Token Requirements

Interview the user to determine their token design:

| Parameter        | Question                                          | Default         |
| ---------------- | ------------------------------------------------- | --------------- |
| **Name**         | Full token name (e.g., "Igloo Coin")              | Required        |
| **Symbol**       | Ticker symbol (e.g., "IGLOO")                     | Required        |
| **Decimals**     | Decimal places (6 = USDC-style, 9 = SUI-style)   | 9               |
| **Description**  | One-line description of the token                 | Required        |
| **Icon URL**     | URL to token icon (PNG, 256x256 recommended)      | Optional        |
| **Total Supply** | Fixed supply, or mintable?                        | Decide in Step 3 |
| **Distribution** | Airdrop, fair launch, bonding curve, LP seed?     | Decide in Step 5 |

### Step 2: Write the Coin Module

Every Sui coin follows this exact pattern. The module name MUST match the witness struct name in lowercase.

```move
module my_token::igloo {
    use sui::coin::{Self, TreasuryCap, CoinMetadata};
    use sui::url;

    /// One-time witness — MUST match module name in UPPERCASE
    public struct IGLOO has drop {}

    /// Called once at module publish. Creates the coin type.
    fun init(witness: IGLOO, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<IGLOO>(
            witness,
            9,                                          // decimals
            b"IGLOO",                                   // symbol
            b"Igloo Coin",                              // name
            b"The native token of the brokenigloo ecosystem", // description
            option::some(url::new_unsafe_from_bytes(
                b"https://example.com/igloo-icon.png"
            )),                                         // icon_url
            ctx,
        );

        // CRITICAL DECISION: What to do with TreasuryCap and CoinMetadata
        // Option A: Transfer both to deployer (most flexible)
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(metadata);  // Freeze metadata — no future changes

        // Option B: Share TreasuryCap (for DAO-managed minting)
        // transfer::public_share_object(treasury_cap);

        // Option C: Destroy TreasuryCap (fixed supply — mint everything in init)
        // See Step 3 for fixed-supply pattern
    }
}
```

**Key rules:**
- The witness struct (`IGLOO`) MUST have `has drop` and nothing else — no `store`, no `copy`
- The module name (`igloo`) must be the lowercase version of the witness struct
- `coin::create_currency` can only be called inside `init` with the OTW
- This guarantees no one can ever create a second `Coin<IGLOO>` type

### Step 3: Supply Management Strategy

Choose ONE of these supply strategies:

**Strategy A: Fixed Supply (Mint All at Init, Destroy TreasuryCap)**

```move
fun init(witness: IGLOO, ctx: &mut TxContext) {
    let (mut treasury_cap, metadata) = coin::create_currency<IGLOO>(
        witness, 9, b"IGLOO", b"Igloo Coin", b"Fixed supply token",
        option::none(), ctx,
    );

    // Mint total supply: 1 billion tokens (with 9 decimals)
    let total_supply = coin::mint(&mut treasury_cap, 1_000_000_000_000_000_000, ctx);
    transfer::public_transfer(total_supply, tx_context::sender(ctx));

    // Destroy TreasuryCap — no more minting ever
    transfer::public_transfer(treasury_cap, @0x0); // Or use a burn function
    transfer::public_freeze_object(metadata);
}
```

**Strategy B: Controlled Minting (Keep TreasuryCap)**

```move
/// Only TreasuryCap holder can mint
public entry fun mint(
    treasury_cap: &mut TreasuryCap<IGLOO>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Burn tokens — anyone holding coins can burn
public entry fun burn(
    treasury_cap: &mut TreasuryCap<IGLOO>,
    coin: Coin<IGLOO>,
) {
    coin::burn(treasury_cap, coin);
}
```

**Strategy C: Programmatic Minting (Cap inside shared object)**

```move
public struct MintController has key {
    id: UID,
    treasury_cap: TreasuryCap<IGLOO>,
    max_supply: u64,
    minted: u64,
}

public fun mint_with_limit(
    controller: &mut MintController,
    amount: u64,
    ctx: &mut TxContext,
): Coin<IGLOO> {
    assert!(controller.minted + amount <= controller.max_supply, EExceedsMaxSupply);
    controller.minted = controller.minted + amount;
    coin::mint(&mut controller.treasury_cap, amount, ctx)
}
```

### Step 4: Deploy and Verify

```bash
# Build the Move package
sui move build

# Run tests
sui move test

# Publish to testnet first
sui client publish --gas-budget 100000000

# The output will contain:
# - Package ID: 0x<package_id>
# - TreasuryCap object ID: 0x<treasury_cap_id>
# - CoinMetadata object ID: 0x<metadata_id>

# Verify on explorer
echo "View at: https://suiscan.xyz/testnet/object/<package_id>"
```

Save the TreasuryCap object ID immediately. If you lose it, you lose minting authority permanently.

### Step 5: Token Distribution

Choose a distribution method:

**5a: Direct Airdrop via PTB**

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const tx = new Transaction();

// Split coins for multiple recipients
const recipients = [
  { address: "0xAlice...", amount: 1_000_000_000n },  // 1 token
  { address: "0xBob...",   amount: 5_000_000_000n },  // 5 tokens
];

for (const r of recipients) {
  const coin = tx.moveCall({
    target: `${PACKAGE_ID}::igloo::mint`,
    arguments: [
      tx.object(TREASURY_CAP_ID),
      tx.pure.u64(r.amount),
      tx.pure.address(r.address),
    ],
  });
}

await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
```

**5b: Liquidity Pool on Cetus CLMM**

```typescript
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk";

// 1. Create a pool: IGLOO/SUI
const createPoolParams = {
  coinTypeA: `${PACKAGE_ID}::igloo::IGLOO`,
  coinTypeB: "0x2::sui::SUI",
  tick_spacing: 60,           // Standard for volatile pairs
  initialize_sqrt_price: "1000000000",  // Initial price ratio
  uri: "",
};

// 2. Add initial liquidity
const addLiquidityParams = {
  coinTypeA: `${PACKAGE_ID}::igloo::IGLOO`,
  coinTypeB: "0x2::sui::SUI",
  pool_id: poolId,
  tick_lower: -443580,       // Wide range
  tick_upper: 443580,
  delta_liquidity: "1000000000",
  max_amount_a: 1000000000000n,
  max_amount_b: 1000000000000n,
  is_open: true,
};
```

**5c: Bonding Curve Launch via Turbos.Fun / Movepump**

For fair-launch bonding curve mechanics (similar to pump.fun):

1. Deploy your coin module with TreasuryCap
2. Integrate with Turbos.Fun or Movepump SDK
3. The platform handles bonding curve pricing automatically
4. When market cap threshold is hit, liquidity migrates to a DEX pool

### Step 6: Post-Launch Verification

```typescript
// Verify token metadata on-chain
const metadata = await client.getCoinMetadata({
  coinType: `${PACKAGE_ID}::igloo::IGLOO`,
});
console.log("Name:", metadata.name);
console.log("Symbol:", metadata.symbol);
console.log("Decimals:", metadata.decimals);
console.log("Supply:", await client.getTotalSupply({
  coinType: `${PACKAGE_ID}::igloo::IGLOO`,
}));
```

### Step 7: Update Build Context

Update `.brokenigloo/build-context.md` with:
- Coin type: `{PACKAGE_ID}::igloo::IGLOO`
- TreasuryCap holder and management plan
- Supply strategy (fixed/mintable/capped)
- Distribution plan and timeline
- DEX pool IDs and liquidity details

### Step 8: Handoff

- "Build DeFi around my token" -> route to `build-defi-protocol`
- "Create a data dashboard for my token" -> route to `build-data-pipeline`
- "Audit my token contract" -> route to `review-and-iterate`
- "Deploy to mainnet" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for existing stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for DEX SDKs and listing requirements. Never block on missing files.

## Non-Negotiables

1. **TreasuryCap must be explicitly secured or destroyed**: Never leave TreasuryCap in an ambiguous state. Either transfer it to a known address, lock it in a shared object with access controls, or destroy it for fixed supply. Document the decision.
2. **CoinMetadata should be frozen after initial set**: Call `transfer::public_freeze_object(metadata)` in `init` unless the user has a specific reason to keep it mutable. Mutable metadata is a trust risk.
3. **Never skip the witness pattern**: The OTW (`has drop` only, matching module name) is the ONLY way to create a coin on Sui. Do not attempt workarounds.
4. **Decimals are immutable**: Choose decimals carefully at creation — they cannot be changed after `create_currency`. Standard is 9 (matches SUI) or 6 (matches USDC).
5. **Test on devnet/testnet before mainnet**: Always deploy to testnet first, verify metadata, test minting, and confirm DEX integration before mainnet publish.
6. **Never expose TreasuryCap in public functions without access control**: If you wrap TreasuryCap in a shared object, gate minting behind `AdminCap` or other authorization.
7. **Emit events for all supply changes**: Mint and burn events must be emitted for indexer compatibility.

## References

- `references/defi-program-patterns.md` — Move code patterns for token modules
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — DEX SDKs (Cetus, Turbos, DeepBook)
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
