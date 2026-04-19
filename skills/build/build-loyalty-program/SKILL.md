---
name: build-loyalty-program
description: "Build a loyalty and rewards program on Sui. Covers closed-loop tokens for points earning, redemption at approved merchants, tiered rewards, gamification mechanics, referral bonuses, expiring points, leaderboards. Triggers: loyalty program, rewards program, loyalty points, reward points, gamification, referral program, loyalty token, merchant rewards"
---

```bash
# Telemetry preamble
SKILL_NAME="build-loyalty-program"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui loyalty program architect. Your job is to guide users through building on-chain loyalty and rewards systems where users earn points through actions, redeem them at approved locations, and progress through tiers. Sui's **Closed-Loop Token** standard (`token::Token<T>`) is the native primitive for loyalty points — tokens that can only be spent at approved merchants, never freely traded on DEXs.

Why closed-loop tokens for loyalty:
- **Controlled circulation**: Points cannot be sold on secondary markets, preserving their intended value
- **Merchant approval**: Only authorized merchants can accept points, preventing fraud
- **Auditable**: All point issuance, spending, and burning is on-chain
- **Composable**: Points can be earned across multiple partner apps via PTBs

Architecture:

```
┌─────────────┐     earn      ┌──────────────┐     spend     ┌──────────────┐
│   User       │──────────────>│  Loyalty      │──────────────>│  Merchant     │
│   Actions    │               │  Points       │               │  Redemption   │
│  (purchase,  │               │  (Token<T>)   │               │  (MerchantCap)│
│   referral,  │               │               │               │               │
│   streak)    │               │  Tier Badge   │               │               │
└─────────────┘               │  (NFT object) │               └──────────────┘
                              └──────────────┘
```

## Workflow

### Step 1: Design the Loyalty Program

| Parameter        | Question                                 | Options                               |
| ---------------- | ---------------------------------------- | ------------------------------------- |
| **Points name**  | What are your loyalty points called?     | Custom name (e.g., "Stars", "Gems")   |
| **Earn rates**   | How do users earn points?                | Purchase (1:1), actions, referrals    |
| **Tiers**        | How many membership tiers?               | Bronze/Silver/Gold/Platinum           |
| **Redemption**   | What can points buy?                     | Discounts, products, services         |
| **Expiry**       | Do points expire?                        | Never, 6 months, 1 year              |
| **Transferable** | Can users send points to each other?     | No (closed-loop), Yes (peer-to-peer)  |

### Step 2: Core Loyalty Module

```move
module loyalty::program {
    use sui::token::{Self, Token, TokenPolicy, TokenPolicyCap, ActionRequest};
    use sui::coin::{Self, TreasuryCap};
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use std::string::String;

    // === Error Codes ===
    const ENotMerchant: u64 = 0;
    const EInsufficientPoints: u64 = 1;
    const EInvalidTier: u64 = 2;
    const ETierRequirementNotMet: u64 = 3;
    const EPointsExpired: u64 = 4;

    // === Constants ===
    const TIER_BRONZE: u8 = 0;
    const TIER_SILVER: u8 = 1;
    const TIER_GOLD: u8 = 2;
    const TIER_PLATINUM: u8 = 3;

    const SILVER_THRESHOLD: u64 = 1_000;
    const GOLD_THRESHOLD: u64 = 5_000;
    const PLATINUM_THRESHOLD: u64 = 25_000;

    // === One-Time Witness ===
    public struct PROGRAM has drop {}

    // === Objects ===

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Program configuration (shared object)
    public struct LoyaltyConfig has key {
        id: UID,
        /// Points per SUI spent (e.g., 10 points per SUI)
        earn_rate: u64,
        /// Referral bonus points
        referral_bonus: u64,
        /// Point expiry duration in ms (0 = never expire)
        expiry_ms: u64,
        /// Total points issued (lifetime)
        total_issued: u64,
        /// Total points redeemed (lifetime)
        total_redeemed: u64,
        /// Active members count
        total_members: u64,
        /// Registered merchants
        merchant_count: u64,
    }

    /// Merchant capability — authorizes point acceptance
    public struct MerchantCap has key, store {
        id: UID,
        name: String,
        merchant_address: address,
        total_points_accepted: u64,
    }

    /// User membership card (NFT)
    public struct MembershipCard has key, store {
        id: UID,
        /// Current tier level
        tier: u8,
        /// Total points earned (lifetime, for tier calculation)
        lifetime_points: u64,
        /// Current streak (consecutive days active)
        streak_days: u64,
        /// Last activity timestamp
        last_active: u64,
        /// Referral code (unique per member)
        referral_code: String,
        /// Number of successful referrals
        referrals_made: u64,
        /// Member since
        joined_at: u64,
    }

    // === Events ===
    public struct PointsEarned has copy, drop {
        member: address,
        amount: u64,
        reason: String,
    }

    public struct PointsRedeemed has copy, drop {
        member: address,
        merchant: address,
        amount: u64,
    }

    public struct TierUpgrade has copy, drop {
        member: address,
        old_tier: u8,
        new_tier: u8,
    }

    public struct MemberJoined has copy, drop {
        member: address,
        referrer: Option<address>,
    }

    // === Init ===
    fun init(otw: PROGRAM, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<PROGRAM>(
            otw, 0, b"STARS", b"Loyalty Stars",
            b"Earn and redeem at participating merchants",
            option::none(), ctx,
        );

        // Create token policy with spending rules
        let (mut policy, policy_cap) = token::new_policy<PROGRAM>(&treasury_cap, ctx);
        token::allow(&mut policy, &policy_cap, token::spend_action(), ctx);
        // Do NOT allow transfer_action to keep it closed-loop

        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(policy_cap, tx_context::sender(ctx));
        token::share_policy(policy);
        transfer::public_freeze_object(metadata);

        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));

        transfer::share_object(LoyaltyConfig {
            id: object::new(ctx),
            earn_rate: 10,
            referral_bonus: 100,
            expiry_ms: 0, // No expiry by default
            total_issued: 0,
            total_redeemed: 0,
            total_members: 0,
            merchant_count: 0,
        });
    }

    // === Join Program ===
    public entry fun join_program(
        config: &mut LoyaltyConfig,
        referral_card: Option<&mut MembershipCard>,
        treasury_cap: &mut TreasuryCap<PROGRAM>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let member = tx_context::sender(ctx);

        let card = MembershipCard {
            id: object::new(ctx),
            tier: TIER_BRONZE,
            lifetime_points: 0,
            streak_days: 0,
            last_active: now,
            referral_code: generate_referral_code(member),
            referrals_made: 0,
            joined_at: now,
        };

        config.total_members = config.total_members + 1;

        // Issue referral bonus if referred
        let referrer = if (option::is_some(&referral_card)) {
            let ref_card = option::borrow_mut(option::borrow_mut(&mut referral_card));
            ref_card.referrals_made = ref_card.referrals_made + 1;

            // Mint referral bonus to referrer
            let bonus = token::mint(treasury_cap, config.referral_bonus, ctx);
            let req = token::transfer(bonus, ref_card.original_owner(), ctx);
            token::confirm_with_treasury_cap(treasury_cap, req, ctx);

            config.total_issued = config.total_issued + config.referral_bonus;
            option::some(ref_card.original_owner())
        } else {
            option::none()
        };

        event::emit(MemberJoined { member, referrer });
        transfer::transfer(card, member);
    }

    // === Earn Points ===
    public entry fun earn_points(
        config: &mut LoyaltyConfig,
        card: &mut MembershipCard,
        treasury_cap: &mut TreasuryCap<PROGRAM>,
        amount: u64,
        reason: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);

        // Apply tier multiplier
        let multiplier = get_tier_multiplier(card.tier);
        let points = amount * multiplier / 100;

        // Update card
        card.lifetime_points = card.lifetime_points + points;
        card.last_active = now;

        // Check for tier upgrade
        let old_tier = card.tier;
        let new_tier = calculate_tier(card.lifetime_points);
        if (new_tier > old_tier) {
            card.tier = new_tier;
            event::emit(TierUpgrade {
                member: tx_context::sender(ctx),
                old_tier,
                new_tier,
            });
        };

        config.total_issued = config.total_issued + points;

        // Mint points as closed-loop tokens
        let points_token = token::mint(treasury_cap, points, ctx);
        let req = token::transfer(points_token, tx_context::sender(ctx), ctx);
        token::confirm_with_treasury_cap(treasury_cap, req, ctx);

        event::emit(PointsEarned {
            member: tx_context::sender(ctx),
            amount: points,
            reason,
        });
    }

    // === Redeem Points at Merchant ===
    public fun redeem_at_merchant(
        config: &mut LoyaltyConfig,
        merchant: &mut MerchantCap,
        points: Token<PROGRAM>,
        ctx: &mut TxContext,
    ): ActionRequest<PROGRAM> {
        let amount = token::value(&points);

        merchant.total_points_accepted = merchant.total_points_accepted + amount;
        config.total_redeemed = config.total_redeemed + amount;

        event::emit(PointsRedeemed {
            member: tx_context::sender(ctx),
            merchant: merchant.merchant_address,
            amount,
        });

        // Spend (burn) the points — returns ActionRequest for policy confirmation
        token::spend(points, ctx)
    }

    // === Admin: Register Merchant ===
    public entry fun register_merchant(
        _admin: &AdminCap,
        config: &mut LoyaltyConfig,
        name: String,
        merchant_address: address,
        ctx: &mut TxContext,
    ) {
        config.merchant_count = config.merchant_count + 1;

        transfer::transfer(MerchantCap {
            id: object::new(ctx),
            name,
            merchant_address,
            total_points_accepted: 0,
        }, merchant_address);
    }

    // === Internal ===
    fun get_tier_multiplier(tier: u8): u64 {
        if (tier == TIER_BRONZE) { 100 }       // 1x
        else if (tier == TIER_SILVER) { 125 }   // 1.25x
        else if (tier == TIER_GOLD) { 150 }     // 1.5x
        else { 200 }                             // 2x (Platinum)
    }

    fun calculate_tier(lifetime_points: u64): u8 {
        if (lifetime_points >= PLATINUM_THRESHOLD) { TIER_PLATINUM }
        else if (lifetime_points >= GOLD_THRESHOLD) { TIER_GOLD }
        else if (lifetime_points >= SILVER_THRESHOLD) { TIER_SILVER }
        else { TIER_BRONZE }
    }

    fun generate_referral_code(addr: address): String {
        // Simple referral code from address bytes
        string::utf8(b"REF-") // In production, use a better encoding
    }
}
```

### Step 3: Gamification — Streak Tracking and Achievements

```move
module loyalty::achievements {
    use sui::event;
    use sui::clock::Clock;
    use loyalty::program::MembershipCard;

    const DAY_MS: u64 = 86_400_000;

    public struct Achievement has key, store {
        id: UID,
        name: vector<u8>,
        description: vector<u8>,
        badge_url: vector<u8>,
        earned_at: u64,
    }

    public struct AchievementUnlocked has copy, drop {
        member: address,
        achievement: vector<u8>,
    }

    /// Check in daily to maintain streak
    public entry fun daily_checkin(
        card: &mut MembershipCard,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let time_since_last = now - card.last_active;

        if (time_since_last < DAY_MS * 2) {
            // Within 48 hours — streak continues
            card.streak_days = card.streak_days + 1;
        } else {
            // Streak broken
            card.streak_days = 1;
        };
        card.last_active = now;

        // Check streak milestones
        if (card.streak_days == 7) {
            mint_achievement(b"Week Warrior", b"7-day check-in streak", now, ctx);
        } else if (card.streak_days == 30) {
            mint_achievement(b"Monthly Master", b"30-day check-in streak", now, ctx);
        } else if (card.streak_days == 100) {
            mint_achievement(b"Century Club", b"100-day check-in streak", now, ctx);
        };
    }

    fun mint_achievement(
        name: vector<u8>,
        description: vector<u8>,
        now: u64,
        ctx: &mut TxContext,
    ) {
        let achievement = Achievement {
            id: object::new(ctx),
            name,
            description,
            badge_url: b"https://example.com/badges/",
            earned_at: now,
        };

        event::emit(AchievementUnlocked {
            member: tx_context::sender(ctx),
            achievement: name,
        });

        transfer::transfer(achievement, tx_context::sender(ctx));
    }
}
```

### Step 4: Frontend Integration

```typescript
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

function LoyaltyDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [memberCard, setMemberCard] = useState(null);
  const [pointsBalance, setPointsBalance] = useState(0);

  useEffect(() => {
    if (account) {
      // Fetch membership card
      fetchMemberCard(account.address).then(setMemberCard);
      // Fetch points balance
      fetchPointsBalance(account.address).then(setPointsBalance);
    }
  }, [account]);

  const tierNames = ["Bronze", "Silver", "Gold", "Platinum"];
  const tierColors = ["#CD7F32", "#C0C0C0", "#FFD700", "#E5E4E2"];

  return (
    <div className="max-w-md mx-auto p-4">
      {memberCard ? (
        <>
          <div
            className="rounded-xl p-6 text-white mb-4"
            style={{ background: `linear-gradient(135deg, ${tierColors[memberCard.tier]}, #333)` }}
          >
            <h2 className="text-2xl font-bold">{tierNames[memberCard.tier]} Member</h2>
            <p className="text-4xl font-bold mt-2">{pointsBalance} Stars</p>
            <p className="mt-1">Streak: {memberCard.streak_days} days</p>
            <p className="text-sm opacity-80">
              Lifetime: {memberCard.lifetime_points} points earned
            </p>
          </div>
          <button
            onClick={() => handleDailyCheckin(signAndExecute, memberCard.id)}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg"
          >
            Daily Check-in
          </button>
        </>
      ) : (
        <button
          onClick={() => handleJoinProgram(signAndExecute)}
          className="w-full py-3 bg-green-600 text-white rounded-lg"
        >
          Join Loyalty Program
        </button>
      )}
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS use Closed-Loop Token (`token::Token<T>`)** for loyalty points — not `Coin<T>`; loyalty points must not be freely tradeable
2. **MerchantCap is the ONLY way to accept points** — never allow spending without merchant verification
3. **Tier calculations use lifetime_points, not current balance** — spending points should not reduce your tier
4. **ALWAYS emit events** for earning, spending, tier changes, and achievements — analytics and partner reporting depend on these
5. **NEVER allow direct peer-to-peer point transfers** unless explicitly designed — closed-loop means issuer controls flow
6. **Streak resets MUST be fair** — use a 48-hour window, not 24-hour sharp, to accommodate timezone differences
7. **AdminCap and TreasuryCap MUST be separate concerns** — AdminCap for program config, TreasuryCap for point minting
8. **Points balances MUST be verifiable on-chain** — users should be able to independently verify their balance

## References

- `skills/build/build-regulated-token/SKILL.md` — Closed-loop token standard details
- `skills/build/build-subscription/SKILL.md` — Tiered membership patterns
- `skills/build/integrate-enoki/SKILL.md` — Gasless UX for loyalty interactions
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
