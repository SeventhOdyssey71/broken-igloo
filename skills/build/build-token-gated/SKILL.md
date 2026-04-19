---
name: build-token-gated
description: "Build token-gated access on Sui. Covers Seal encryption for gated content, NFT membership passes, coin-based access control, subscription models with closed-loop tokens, and on-chain access verification. Triggers: token gate, token gated, gated access, membership, nft access, subscription token, closed loop token, access control, gated content"
---

```bash
# Telemetry preamble
SKILL_NAME="build-token-gated"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui access control specialist. Your job is to guide the user through building token-gated systems — features or content accessible only to holders of specific tokens, NFTs, or memberships. Sui offers multiple patterns: on-chain Move checks, client-side verification via `getOwnedObjects`, and **Seal encryption** for truly gated content that cannot be accessed without satisfying an on-chain policy.

**Token-gating approaches:**

| Approach | Security | Complexity | Best For |
|----------|----------|------------|----------|
| **Client-side check** | Low (bypassable) | Low | UI feature toggling |
| **Server-side RPC check** | Medium | Medium | API access, server features |
| **Move on-chain check** | High | Medium | Smart contract gating |
| **Seal encryption** | Very High | High | Content encryption, secrets |
| **Closed-loop tokens** | High | Medium | Subscription/credits |

## Workflow

### Step 1: NFT Membership Pass (Move)

```move
module membership::pass {
    use std::string::String;
    use sui::clock::Clock;
    use sui::event;

    // === Membership NFT ===
    public struct MembershipPass has key, store {
        id: UID,
        tier: u8,          // 0=basic, 1=premium, 2=vip
        issued_to: address,
        expires_at: u64,   // timestamp in ms (0 = never expires)
        benefits: vector<String>,
    }

    // === Admin Cap ===
    public struct MembershipAdmin has key, store {
        id: UID,
    }

    // === Events ===
    public struct MembershipIssued has copy, drop {
        pass_id: ID,
        tier: u8,
        recipient: address,
    }

    // === Issue Membership ===
    entry fun issue_pass(
        _admin: &MembershipAdmin,
        tier: u8,
        recipient: address,
        expires_at: u64,
        benefits: vector<String>,
        ctx: &mut TxContext,
    ) {
        let pass = MembershipPass {
            id: object::new(ctx),
            tier,
            issued_to: recipient,
            expires_at,
            benefits,
        };

        event::emit(MembershipIssued {
            pass_id: object::id(&pass),
            tier,
            recipient,
        });

        transfer::public_transfer(pass, recipient);
    }

    // === Verify Membership (on-chain) ===
    /// Other modules call this to verify membership before granting access
    public fun verify_membership(
        pass: &MembershipPass,
        required_tier: u8,
        clock: &Clock,
        ctx: &TxContext,
    ): bool {
        // Check ownership
        // Note: if the user passes the object, they must own it
        let is_owner = pass.issued_to == ctx.sender();

        // Check tier
        let has_tier = pass.tier >= required_tier;

        // Check expiration
        let not_expired = pass.expires_at == 0 ||
            pass.expires_at > clock::timestamp_ms(clock);

        is_owner && has_tier && not_expired
    }

    // === Gate a function with membership ===
    entry fun premium_action(
        pass: &MembershipPass,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(verify_membership(pass, 1, clock, ctx), 0); // Requires premium+

        // ... premium-only logic here
    }
}
```

### Step 2: Coin-Based Access Control

```move
module gated::coin_gate {
    use sui::coin::Coin;

    /// Gate function access based on token balance
    public fun require_balance<T>(
        coin: &Coin<T>,
        min_balance: u64,
    ) {
        assert!(coin::value(coin) >= min_balance, 0);
    }

    /// Example: function only accessible to users holding 100+ GOV tokens
    entry fun governance_only_action<GOV>(
        stake: &Coin<GOV>,
        // ... other params
    ) {
        require_balance(stake, 100_000_000_000); // 100 tokens (9 decimals)
        // ... gated logic
    }
}
```

### Step 3: Server-Side Token Gate (TypeScript)

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

const NFT_TYPE = "0x<PACKAGE>::membership::MembershipPass";
const REQUIRED_COIN_TYPE = "0x<PACKAGE>::token::GOV_TOKEN";
const MIN_BALANCE = 100_000_000_000n; // 100 tokens

// Check if a user holds a specific NFT type
async function hasNFT(
  userAddress: string,
  nftType: string,
): Promise<boolean> {
  const objects = await client.getOwnedObjects({
    owner: userAddress,
    filter: { StructType: nftType },
    options: { showContent: true },
  });

  return objects.data.length > 0;
}

// Check if a user holds minimum token balance
async function hasMinBalance(
  userAddress: string,
  coinType: string,
  minBalance: bigint,
): Promise<boolean> {
  const balance = await client.getBalance({
    owner: userAddress,
    coinType,
  });

  return BigInt(balance.totalBalance) >= minBalance;
}

// Check membership tier
async function getMembershipTier(
  userAddress: string,
): Promise<number | null> {
  const objects = await client.getOwnedObjects({
    owner: userAddress,
    filter: { StructType: NFT_TYPE },
    options: { showContent: true },
  });

  if (objects.data.length === 0) return null;

  // Find the highest tier pass
  let maxTier = 0;
  for (const obj of objects.data) {
    const content = obj.data?.content;
    if (content?.dataType === "moveObject") {
      const tier = (content.fields as any).tier;
      if (tier > maxTier) maxTier = tier;
    }
  }

  return maxTier;
}

// Express middleware for token gating
function requireNFT(nftType: string) {
  return async (req: any, res: any, next: any) => {
    const userAddress = req.headers["x-sui-address"];
    if (!userAddress) {
      return res.status(401).json({ error: "No Sui address provided" });
    }

    const hasAccess = await hasNFT(userAddress, nftType);
    if (!hasAccess) {
      return res.status(403).json({ error: "NFT membership required" });
    }

    next();
  };
}

// Usage in Express
app.get("/api/premium-content", requireNFT(NFT_TYPE), (req, res) => {
  res.json({ content: "This is premium content!" });
});
```

### Step 4: Seal-Encrypted Token-Gated Content

```typescript
import { SealClient } from "@mysten/seal";

// For the strongest token-gating, use Seal encryption
// Content is encrypted client-side and can ONLY be decrypted
// by users who satisfy the on-chain access policy

// See the integrate-seal skill for full Seal setup
// Here's the token-gating specific flow:

// 1. Define the access policy in Move (see Step 1 above for the seal_approve pattern)
// 2. Encrypt content using the policy ID
const { encryptedData } = await sealClient.encrypt({
  policyId: "0x<MEMBERSHIP_POLICY_OBJECT>",
  data: new TextEncoder().encode("Premium article content..."),
});

// 3. Store encrypted content (Walrus, your server, etc.)
// 4. Users can only decrypt if they satisfy the policy
//    (e.g., own a MembershipPass NFT)
```

### Step 5: Closed-Loop Token Subscriptions

```move
module subscription::credits {
    use sui::token::{Self, Token, TokenPolicy, ActionRequest};
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};

    /// Closed-loop credit token — cannot be freely transferred
    public struct CREDIT has drop {}

    /// Subscription service
    public struct SubscriptionService has key {
        id: UID,
        price_per_credit: u64, // in MIST
        credits_per_purchase: u64,
    }

    fun init(otw: CREDIT, ctx: &mut TxContext) {
        let (treasury_cap, coin_metadata) = coin::create_currency(
            otw,
            0, // 0 decimals — credits are whole numbers
            b"CREDIT",
            b"Service Credit",
            b"Credits for premium features",
            option::none(),
            ctx,
        );

        // Create token policy (closed-loop: no free transfers)
        let (mut policy, policy_cap) = token::new_policy(&treasury_cap, ctx);

        // Only allow spending (not transferring)
        // This makes the token closed-loop — users can only spend credits
        // within the app, never send them to other addresses

        transfer::public_transfer(treasury_cap, ctx.sender());
        transfer::public_transfer(policy_cap, ctx.sender());
        token::share_policy(policy);
        transfer::public_freeze_object(coin_metadata);
    }

    /// Purchase credits with SUI
    entry fun purchase_credits(
        service: &SubscriptionService,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(coin::value(&payment) >= service.price_per_credit * service.credits_per_purchase, 0);

        // Transfer SUI payment to service owner
        transfer::public_transfer(payment, /* service owner address */);

        // Mint credits for the buyer
        // (requires TreasuryCap — passed from admin or stored in service)
    }

    /// Spend credits to access a feature
    entry fun use_credit(
        credit: Token<CREDIT>,
        amount: u64,
    ) {
        assert!(token::value(&credit) >= amount, 0);
        // Burn the used credits
        let request = token::spend(credit, ctx);
        token::confirm_with_treasury_cap(&treasury_cap, request);
    }
}
```

### Step 6: Handoff

- "I want to encrypt content with Seal" -> route to `integrate-seal`
- "I need NFTs for my membership" -> route to `build-nft-collection`
- "I need a governance token" -> route to `launch-token`
- "Deploy my token-gated app" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/02-objects-ownership-standards.md` for object model. Never block on missing files.

## Non-Negotiables

1. **Use server-side or on-chain checks for real access control** — client-side checks are easily bypassed. Never rely solely on frontend gating for valuable content.
2. **Use Seal for truly secret content** — if the content must never be visible to unauthorized users (even with API tampering), encrypt it with Seal.
3. **Check expiration for time-bound access** — always verify membership expiration using `Clock`, not client timestamps.
4. **Handle token transfers** — when a user transfers their NFT or tokens, their access should be revoked immediately on the next check.
5. **Closed-loop tokens must restrict transfer** — use Token (not Coin) standard for credits/subscriptions to prevent unauthorized transfers.
6. **Emit events for access grants and revocations** — your indexer and frontend need to know when access changes.

## References

- Sui Token Standard (Closed-Loop): https://docs.sui.io/standards/closed-loop-token
- Seal Encryption: https://docs.seal.mystenlabs.com
- `skills/data/sui-knowledge/02-objects-ownership-standards.md` — object model
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
