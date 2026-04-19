---
name: build-subscription
description: "Build subscription and membership systems on Sui. Covers closed-loop tokens for recurring access, time-based expiry, tiered membership NFTs, renewal logic, auto-payment with sponsored transactions. Triggers: subscription, membership, recurring payment, subscription nft, membership tier, subscription system, recurring access"
---

```bash
# Telemetry preamble
SKILL_NAME="build-subscription"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui subscription system architect. Your job is to guide the user through building on-chain subscription and membership systems using Sui Move. Subscriptions on Sui are modeled as **owned objects with time-based validity** — they are NOT database rows or smart contract mappings like on EVM. Each subscription is a first-class object that the user holds in their wallet, with built-in expiry timestamps, tier metadata, and renewal capabilities.

Key patterns:
- **Subscription NFT**: An owned object with `valid_until: u64` (epoch timestamp) that gates access
- **Tiered Membership**: Dynamic fields on the subscription object for tier-specific perks
- **Closed-Loop Tokens**: Service credits that can only be spent at approved merchants
- **Auto-renewal**: Sponsored transactions triggered by a backend cron or Sui's future scheduled transactions

## Workflow

### Step 1: Design the Subscription Model

Interview the user to determine their subscription structure:

| Parameter          | Question                                              | Options                                        |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------- |
| **Tiers**          | How many subscription levels?                         | Single, Basic/Pro/Enterprise, Custom            |
| **Duration**       | Subscription period?                                  | Monthly (30d), Annual (365d), Custom            |
| **Payment**        | What token for payment?                               | SUI, USDC, custom token                         |
| **Access Model**   | How is access verified?                               | Object ownership, on-chain check, API verify    |
| **Renewability**   | Auto-renew or manual?                                 | Manual, auto (sponsored tx), grace period       |
| **Transferability**| Can subscriptions be transferred/traded?              | Non-transferable, transferable, marketplace     |

### Step 2: Core Move Module — Subscription Object

```move
module subscription::membership {
    use sui::clock::Clock;
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::event;
    use sui::display;
    use sui::package;

    // === Error Codes ===
    const ESubscriptionExpired: u64 = 0;
    const EInvalidTier: u64 = 1;
    const EInsufficientPayment: u64 = 2;
    const EAlreadyActive: u64 = 3;
    const ENotExpired: u64 = 4;

    // === Constants ===
    const MONTH_MS: u64 = 2_592_000_000;  // 30 days in milliseconds
    const YEAR_MS: u64 = 31_536_000_000;   // 365 days in milliseconds

    const TIER_BASIC: u8 = 1;
    const TIER_PRO: u8 = 2;
    const TIER_ENTERPRISE: u8 = 3;

    // === One-Time Witness ===
    public struct MEMBERSHIP has drop {}

    // === Objects ===

    /// Admin capability for managing the subscription service
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Global subscription service config (shared object)
    public struct SubscriptionService has key {
        id: UID,
        /// Price per tier per month (in MIST)
        price_basic: u64,
        price_pro: u64,
        price_enterprise: u64,
        /// Revenue collection
        revenue: Balance<SUI>,
        /// Total active subscriptions (for analytics)
        total_subscribers: u64,
        /// Grace period after expiry (in ms)
        grace_period_ms: u64,
        /// Paused state
        paused: bool,
    }

    /// The subscription NFT held by the user
    public struct Subscription has key, store {
        id: UID,
        /// Tier level (1=Basic, 2=Pro, 3=Enterprise)
        tier: u8,
        /// Timestamp when subscription becomes active
        started_at: u64,
        /// Timestamp when subscription expires
        valid_until: u64,
        /// Whether auto-renewal is enabled
        auto_renew: bool,
        /// Original subscriber address (for analytics)
        original_subscriber: address,
    }

    // === Events ===
    public struct SubscriptionCreated has copy, drop {
        subscription_id: ID,
        subscriber: address,
        tier: u8,
        valid_until: u64,
    }

    public struct SubscriptionRenewed has copy, drop {
        subscription_id: ID,
        new_valid_until: u64,
        tier: u8,
    }

    public struct SubscriptionUpgraded has copy, drop {
        subscription_id: ID,
        old_tier: u8,
        new_tier: u8,
    }

    // === Init ===
    fun init(otw: MEMBERSHIP, ctx: &mut TxContext) {
        // Create Display for subscription NFTs
        let publisher = package::claim(otw, ctx);

        let mut display = display::new<Subscription>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"Subscription — Tier {tier}"));
        display::add(&mut display, string::utf8(b"description"), string::utf8(b"Active subscription valid until {valid_until}"));
        display::add(&mut display, string::utf8(b"image_url"), string::utf8(b"https://example.com/sub-tier-{tier}.png"));
        display::update_version(&mut display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));

        // Create admin cap
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));

        // Create shared service config
        transfer::share_object(SubscriptionService {
            id: object::new(ctx),
            price_basic: 1_000_000_000,       // 1 SUI/month
            price_pro: 5_000_000_000,          // 5 SUI/month
            price_enterprise: 20_000_000_000,  // 20 SUI/month
            revenue: balance::zero(),
            total_subscribers: 0,
            grace_period_ms: 259_200_000,      // 3-day grace
            paused: false,
        });
    }

    // === Subscribe ===
    public entry fun subscribe(
        service: &mut SubscriptionService,
        tier: u8,
        months: u64,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!service.paused, ESubscriptionExpired);
        assert!(tier >= TIER_BASIC && tier <= TIER_ENTERPRISE, EInvalidTier);

        let price_per_month = get_tier_price(service, tier);
        let total_price = price_per_month * months;
        assert!(coin::value(&payment) >= total_price, EInsufficientPayment);

        // Take payment
        let paid = coin::split(&mut payment, total_price, ctx);
        balance::join(&mut service.revenue, coin::into_balance(paid));

        // Return change
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(payment);
        };

        let now = clock::timestamp_ms(clock);
        let duration = MONTH_MS * months;

        let subscription = Subscription {
            id: object::new(ctx),
            tier,
            started_at: now,
            valid_until: now + duration,
            auto_renew: false,
            original_subscriber: tx_context::sender(ctx),
        };

        service.total_subscribers = service.total_subscribers + 1;

        event::emit(SubscriptionCreated {
            subscription_id: object::id(&subscription),
            subscriber: tx_context::sender(ctx),
            tier,
            valid_until: now + duration,
        });

        transfer::transfer(subscription, tx_context::sender(ctx));
    }

    // === Renew ===
    public entry fun renew(
        service: &mut SubscriptionService,
        sub: &mut Subscription,
        months: u64,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let price_per_month = get_tier_price(service, sub.tier);
        let total_price = price_per_month * months;
        assert!(coin::value(&payment) >= total_price, EInsufficientPayment);

        let paid = coin::split(&mut payment, total_price, ctx);
        balance::join(&mut service.revenue, coin::into_balance(paid));

        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(payment);
        };

        let now = clock::timestamp_ms(clock);
        let duration = MONTH_MS * months;

        // If still active, extend from current expiry; if expired, start from now
        if (sub.valid_until > now) {
            sub.valid_until = sub.valid_until + duration;
        } else {
            sub.valid_until = now + duration;
        };

        event::emit(SubscriptionRenewed {
            subscription_id: object::id(sub),
            new_valid_until: sub.valid_until,
            tier: sub.tier,
        });
    }

    // === Upgrade Tier ===
    public entry fun upgrade_tier(
        service: &mut SubscriptionService,
        sub: &mut Subscription,
        new_tier: u8,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(new_tier > sub.tier, EInvalidTier);
        assert!(new_tier <= TIER_ENTERPRISE, EInvalidTier);

        let now = clock::timestamp_ms(clock);
        assert!(sub.valid_until > now, ESubscriptionExpired);

        // Pro-rate: charge difference for remaining time
        let remaining_ms = sub.valid_until - now;
        let remaining_months = remaining_ms / MONTH_MS + 1; // Round up

        let old_price = get_tier_price(service, sub.tier);
        let new_price = get_tier_price(service, new_tier);
        let price_diff = (new_price - old_price) * remaining_months;

        assert!(coin::value(&payment) >= price_diff, EInsufficientPayment);

        let paid = coin::split(&mut payment, price_diff, ctx);
        balance::join(&mut service.revenue, coin::into_balance(paid));

        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(payment);
        };

        let old_tier = sub.tier;
        sub.tier = new_tier;

        event::emit(SubscriptionUpgraded {
            subscription_id: object::id(sub),
            old_tier,
            new_tier,
        });
    }

    // === Validation (called by other modules or off-chain) ===
    public fun is_active(sub: &Subscription, clock: &Clock): bool {
        sub.valid_until > clock::timestamp_ms(clock)
    }

    public fun is_in_grace_period(sub: &Subscription, service: &SubscriptionService, clock: &Clock): bool {
        let now = clock::timestamp_ms(clock);
        now > sub.valid_until && now <= sub.valid_until + service.grace_period_ms
    }

    public fun tier(sub: &Subscription): u8 { sub.tier }
    public fun valid_until(sub: &Subscription): u64 { sub.valid_until }

    // === Admin Functions ===
    public entry fun withdraw_revenue(
        _admin: &AdminCap,
        service: &mut SubscriptionService,
        ctx: &mut TxContext,
    ) {
        let amount = balance::value(&service.revenue);
        let revenue = coin::from_balance(balance::split(&mut service.revenue, amount), ctx);
        transfer::public_transfer(revenue, tx_context::sender(ctx));
    }

    public entry fun update_prices(
        _admin: &AdminCap,
        service: &mut SubscriptionService,
        basic: u64,
        pro: u64,
        enterprise: u64,
    ) {
        service.price_basic = basic;
        service.price_pro = pro;
        service.price_enterprise = enterprise;
    }

    public entry fun pause_service(_admin: &AdminCap, service: &mut SubscriptionService) {
        service.paused = true;
    }

    // === Internal ===
    fun get_tier_price(service: &SubscriptionService, tier: u8): u64 {
        if (tier == TIER_BASIC) { service.price_basic }
        else if (tier == TIER_PRO) { service.price_pro }
        else { service.price_enterprise }
    }
}
```

### Step 3: Access Gating in Your Application

**On-chain gating (other Move modules):**

```move
module myapp::premium_content {
    use subscription::membership::{Self, Subscription, SubscriptionService};
    use sui::clock::Clock;

    const ESubscriptionRequired: u64 = 100;
    const EProTierRequired: u64 = 101;

    public entry fun access_premium_feature(
        sub: &Subscription,
        service: &SubscriptionService,
        clock: &Clock,
    ) {
        assert!(membership::is_active(sub, clock), ESubscriptionRequired);
        assert!(membership::tier(sub) >= 2, EProTierRequired); // Pro or higher
        // ... premium logic here
    }
}
```

**Off-chain gating (API middleware):**

```typescript
import { SuiClient } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

async function verifySubscription(userAddress: string): Promise<{
  active: boolean;
  tier: number;
  expiresAt: number;
}> {
  // Find subscription objects owned by the user
  const objects = await client.getOwnedObjects({
    owner: userAddress,
    filter: { StructType: `${PACKAGE_ID}::membership::Subscription` },
    options: { showContent: true },
  });

  if (objects.data.length === 0) {
    return { active: false, tier: 0, expiresAt: 0 };
  }

  const sub = objects.data[0].data.content.fields;
  const now = Date.now();

  return {
    active: Number(sub.valid_until) > now,
    tier: Number(sub.tier),
    expiresAt: Number(sub.valid_until),
  };
}

// Express middleware
function requireSubscription(minTier: number = 1) {
  return async (req, res, next) => {
    const { active, tier } = await verifySubscription(req.user.suiAddress);
    if (!active) return res.status(403).json({ error: "Subscription required" });
    if (tier < minTier) return res.status(403).json({ error: `Tier ${minTier}+ required` });
    next();
  };
}

app.get("/api/premium", requireSubscription(2), (req, res) => {
  res.json({ data: "Pro content" });
});
```

### Step 4: Auto-Renewal with Sponsored Transactions

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

// Backend cron job: check expiring subscriptions and auto-renew
async function processAutoRenewals() {
  // Query subscriptions expiring in the next 24 hours
  const expiringWithin = Date.now() + 86_400_000;

  // Use GraphQL or event indexing to find expiring subscriptions
  const expiring = await findExpiringSubscriptions(expiringWithin);

  for (const sub of expiring) {
    if (!sub.auto_renew) continue;

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::membership::renew`,
      arguments: [
        tx.object(SERVICE_OBJECT_ID),
        tx.object(sub.id),
        tx.pure.u64(1), // 1 month
        tx.object(sub.payment_coin_id),
        tx.object("0x6"), // Clock
      ],
    });

    // Sponsor the gas so the user doesn't need to approve
    await client.signAndExecuteTransaction({
      signer: sponsorKeypair,
      transaction: tx,
    });
  }
}

// Run every hour
setInterval(processAutoRenewals, 3_600_000);
```

### Step 5: Frontend Integration

```typescript
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

function SubscribeButton({ tier, months }: { tier: number; months: number }) {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const handleSubscribe = async () => {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(priceForTier(tier) * months)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::membership::subscribe`,
      arguments: [
        tx.object(SERVICE_OBJECT_ID),
        tx.pure.u8(tier),
        tx.pure.u64(months),
        payment,
        tx.object("0x6"), // Clock
      ],
    });

    signAndExecute({ transaction: tx });
  };

  return <button onClick={handleSubscribe}>Subscribe</button>;
}
```

## Non-Negotiables

1. **ALWAYS use `Clock` for time checks** — never rely on epoch number alone; `clock::timestamp_ms` gives millisecond precision
2. **Subscription objects MUST have `key` ability** — they are owned objects the user holds in their wallet
3. **Add `store` only if subscriptions should be transferable** — omit `store` to make them soulbound
4. **ALWAYS emit events** for subscribe, renew, upgrade, and cancel — indexers and analytics depend on these
5. **NEVER trust client-side time** for access gating — always verify on-chain using Clock or check object state server-side
6. **ALWAYS handle the grace period** — abrupt cutoff frustrates users; give 3-7 days grace after expiry
7. **ALWAYS return change** from payment coins — take only the exact amount needed, return the rest

## References

- `skills/build/build-defi-protocol/SKILL.md` — DeFi patterns for payment handling
- `skills/build/launch-token/SKILL.md` — Custom payment token creation
- `skills/build/integrate-enoki/SKILL.md` — Sponsored transaction setup
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
