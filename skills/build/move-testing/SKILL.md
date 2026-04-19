---
name: move-testing
description: "Comprehensive Move testing guide for Sui. Covers test_scenario, expected_failure, testing with Clock and Random, coverage reports, integration testing patterns, event assertions, and test organization. Triggers: move test, test scenario, unit test, integration test, test move, coverage, expected failure, test clock, test random, sui move test"
---

```bash
# Telemetry preamble
SKILL_NAME="move-testing"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Move testing specialist for Sui. Your job is to guide the user through writing comprehensive tests for their Move modules — from simple unit tests to complex multi-party integration tests using `test_scenario`. Sui Move has a powerful built-in testing framework that simulates transactions, multiple users, shared objects, and system objects like Clock and Random.

**Testing approaches in Sui Move:**

| Approach | Complexity | Best For |
|----------|-----------|----------|
| **Unit tests** | Low | Pure functions, math, validation |
| **test_scenario** | Medium | Multi-party interactions, shared objects |
| **expected_failure** | Low | Error path verification |
| **Integration tests** | High | End-to-end flows, protocol interactions |

## Workflow

### Step 1: Basic Unit Tests

```move
#[test_only]
module my_package::math_tests {
    use my_package::math;

    #[test]
    fun test_add() {
        assert!(math::add(2, 3) == 5, 0);
    }

    #[test]
    fun test_multiply() {
        assert!(math::multiply(4, 5) == 20, 0);
    }

    #[test]
    fun test_divide() {
        assert!(math::divide(10, 3) == 3, 0); // integer division
    }

    #[test]
    #[expected_failure(abort_code = math::EDivideByZero)]
    fun test_divide_by_zero() {
        math::divide(10, 0); // Should abort
    }

    #[test]
    fun test_sqrt() {
        assert!(math::sqrt(0) == 0, 0);
        assert!(math::sqrt(1) == 1, 0);
        assert!(math::sqrt(4) == 2, 0);
        assert!(math::sqrt(9) == 3, 0);
        assert!(math::sqrt(100) == 10, 0);
        // Non-perfect squares should floor
        assert!(math::sqrt(8) == 2, 0);
        assert!(math::sqrt(99) == 9, 0);
    }

    #[test]
    fun test_max_values() {
        // Test with u64 max to verify no overflow
        let max = 18446744073709551615u64;
        assert!(math::add(0, max) == max, 0);
    }

    #[test]
    #[expected_failure] // Any abort code
    fun test_overflow() {
        let max = 18446744073709551615u64;
        math::add(max, 1); // Should overflow/abort
    }
}
```

### Step 2: test_scenario for Multi-Party Tests

```move
#[test_only]
module my_package::nft_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::test_utils;
    use my_package::nft::{Self, MyNFT, MintCap};

    // Addresses for test users
    const ADMIN: address = @0xAD;
    const USER1: address = @0xB1;
    const USER2: address = @0xB2;

    // === Helper: Set up the module (simulates init) ===
    fun setup(scenario: &mut Scenario) {
        // First transaction: module deployer
        ts::next_tx(scenario, ADMIN);
        {
            nft::init_for_testing(ts::ctx(scenario));
        };
    }

    #[test]
    fun test_mint_nft() {
        let mut scenario = ts::begin(ADMIN);

        // Setup: deploy the module
        setup(&mut scenario);

        // Transaction 1: Admin mints an NFT for USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut mint_cap = ts::take_from_sender<MintCap>(&scenario);

            nft::mint_and_transfer(
                &mut mint_cap,
                std::string::utf8(b"Test NFT"),
                std::string::utf8(b"A test NFT"),
                std::string::utf8(b"https://example.com/image.png"),
                vector::empty(),
                USER1,
                ts::ctx(&mut scenario),
            );

            // Verify minted count
            assert!(nft::total_minted(&mint_cap) == 1, 0);

            ts::return_to_sender(&scenario, mint_cap);
        };

        // Transaction 2: Verify USER1 received the NFT
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<MyNFT>(&scenario);

            assert!(nft::name(&nft) == &std::string::utf8(b"Test NFT"), 0);
            assert!(nft::number(&nft) == 1, 0);

            ts::return_to_sender(&scenario, nft);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_transfer_nft() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Mint to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut mint_cap = ts::take_from_sender<MintCap>(&scenario);
            nft::mint_and_transfer(
                &mut mint_cap,
                std::string::utf8(b"Test NFT"),
                std::string::utf8(b"Desc"),
                std::string::utf8(b"https://img.png"),
                vector::empty(),
                USER1,
                ts::ctx(&mut scenario),
            );
            ts::return_to_sender(&scenario, mint_cap);
        };

        // USER1 transfers to USER2
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<MyNFT>(&scenario);
            transfer::public_transfer(nft, USER2);
        };

        // Verify USER2 has it
        ts::next_tx(&mut scenario, USER2);
        {
            let nft = ts::take_from_sender<MyNFT>(&scenario);
            assert!(nft::number(&nft) == 1, 0);
            ts::return_to_sender(&scenario, nft);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = nft::ESupplyExhausted)]
    fun test_supply_limit() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut mint_cap = ts::take_from_sender<MintCap>(&scenario);

            // Mint until supply is exhausted (assuming max_supply = 1000)
            // For testing, we would set max_supply lower
            // Or use a test-specific init with lower supply
            let mut i = 0;
            while (i <= nft::max_supply(&mint_cap)) {
                nft::mint_and_transfer(
                    &mut mint_cap,
                    std::string::utf8(b"NFT"),
                    std::string::utf8(b"Desc"),
                    std::string::utf8(b"img"),
                    vector::empty(),
                    USER1,
                    ts::ctx(&mut scenario),
                );
                i = i + 1;
            };

            ts::return_to_sender(&scenario, mint_cap);
        };

        ts::end(scenario);
    }
}
```

### Step 3: Testing with Shared Objects

```move
#[test_only]
module my_package::pool_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin;
    use sui::sui::SUI;
    use my_package::pool::{Self, Pool, LP};

    const ADMIN: address = @0xAD;
    const ALICE: address = @0xA1;
    const BOB: address = @0xB0;

    #[test]
    fun test_add_and_remove_liquidity() {
        let mut scenario = ts::begin(ADMIN);

        // Create the pool (shared object)
        ts::next_tx(&mut scenario, ADMIN);
        {
            pool::create_pool(ts::ctx(&mut scenario));
        };

        // Alice adds liquidity
        ts::next_tx(&mut scenario, ALICE);
        {
            // Take the shared pool
            let mut pool = ts::take_shared<Pool>(&scenario);

            // Create test coins
            let coin_a = coin::mint_for_testing<SUI>(1000000000, ts::ctx(&mut scenario));
            let coin_b = coin::mint_for_testing<SUI>(1000000000, ts::ctx(&mut scenario));

            pool::add_liquidity(&mut pool, coin_a, coin_b, ts::ctx(&mut scenario));

            // Return the shared object
            ts::return_shared(pool);
        };

        // Verify Alice received LP tokens
        ts::next_tx(&mut scenario, ALICE);
        {
            let lp = ts::take_from_sender<LP>(&scenario);
            assert!(coin::value(&lp) > 0, 0);
            ts::return_to_sender(&scenario, lp);
        };

        // Alice removes liquidity
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut pool = ts::take_shared<Pool>(&scenario);
            let lp = ts::take_from_sender<LP>(&scenario);

            pool::remove_liquidity(&mut pool, lp, ts::ctx(&mut scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario);
    }
}
```

### Step 4: Testing with Clock

```move
#[test_only]
module my_package::time_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use my_package::subscription::{Self, Subscription};

    const USER: address = @0xA1;

    #[test]
    fun test_subscription_expiry() {
        let mut scenario = ts::begin(USER);

        // Create a Clock for testing
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        // Set the clock to a specific time (milliseconds)
        clock::set_for_testing(&mut clock, 1000000); // t = 1,000,000 ms

        ts::next_tx(&mut scenario, USER);
        {
            // Create a subscription that expires at t = 2,000,000
            subscription::create(
                &clock,
                2000000, // expires_at
                ts::ctx(&mut scenario),
            );
        };

        // Check: subscription should be active at t = 1,500,000
        clock::set_for_testing(&mut clock, 1500000);
        ts::next_tx(&mut scenario, USER);
        {
            let sub = ts::take_from_sender<Subscription>(&scenario);
            assert!(subscription::is_active(&sub, &clock), 0);
            ts::return_to_sender(&scenario, sub);
        };

        // Check: subscription should be expired at t = 2,500,000
        clock::set_for_testing(&mut clock, 2500000);
        ts::next_tx(&mut scenario, USER);
        {
            let sub = ts::take_from_sender<Subscription>(&scenario);
            assert!(!subscription::is_active(&sub, &clock), 0);
            ts::return_to_sender(&scenario, sub);
        };

        // Advance clock incrementally
        clock::increment_for_testing(&mut clock, 1000); // +1 second

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
```

### Step 5: Testing with Random

```move
#[test_only]
module my_package::random_tests {
    use sui::test_scenario::{Self as ts};
    use sui::random::{Self, Random};
    use my_package::game::{Self};

    const PLAYER: address = @0xA1;

    #[test]
    fun test_battle_with_randomness() {
        let mut scenario = ts::begin(@0x0);

        // Create Random for testing
        random::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, PLAYER);
        {
            // Create a hero for the player
            game::create_hero(
                std::string::utf8(b"TestHero"),
                ts::ctx(&mut scenario),
            );
        };

        ts::next_tx(&mut scenario, PLAYER);
        {
            let mut hero = ts::take_from_sender(&scenario);
            let r = ts::take_shared<Random>(&scenario);

            // Battle — the outcome uses Random
            game::battle_enemy(
                &r,
                &mut hero,
                0, // goblin
                ts::ctx(&mut scenario),
            );

            // Verify hero state changed (either won or lost)
            // We can't predict the exact outcome due to randomness
            // But we can verify invariants:
            assert!(game::level(&hero) >= 1, 0); // Level should be >= 1
            // Health should be <= max_health
            assert!(game::health(&hero) <= 100, 0);

            ts::return_to_sender(&scenario, hero);
            ts::return_shared(r);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_random_distribution() {
        // Test that randomness produces a reasonable distribution
        let mut scenario = ts::begin(@0x0);
        random::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, PLAYER);
        {
            let r = ts::take_shared<Random>(&scenario);
            let mut rng = random::new_generator(&r, ts::ctx(&mut scenario));

            let mut count_low = 0u64;
            let mut count_high = 0u64;
            let mut i = 0;

            while (i < 100) {
                let val = random::generate_u64_in_range(&mut rng, 1, 100);
                if (val <= 50) {
                    count_low = count_low + 1;
                } else {
                    count_high = count_high + 1;
                };
                i = i + 1;
            };

            // Rough check: both should be > 20 (very unlikely to fail)
            assert!(count_low > 20, 0);
            assert!(count_high > 20, 0);

            ts::return_shared(r);
        };

        ts::end(scenario);
    }
}
```

### Step 6: Testing Events

```move
#[test_only]
module my_package::event_tests {
    use sui::test_scenario::{Self as ts};
    use sui::event;
    use sui::test_utils;
    use my_package::nft::{Self, NFTMinted};

    const ADMIN: address = @0xAD;
    const USER: address = @0xA1;

    #[test]
    fun test_mint_emits_event() {
        let mut scenario = ts::begin(ADMIN);

        // Setup
        ts::next_tx(&mut scenario, ADMIN);
        {
            nft::init_for_testing(ts::ctx(&mut scenario));
        };

        // Mint and check events
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut mint_cap = ts::take_from_sender(&scenario);

            nft::mint_and_transfer(
                &mut mint_cap,
                std::string::utf8(b"Test NFT"),
                std::string::utf8(b"Desc"),
                std::string::utf8(b"img"),
                vector::empty(),
                USER,
                ts::ctx(&mut scenario),
            );

            ts::return_to_sender(&scenario, mint_cap);
        };

        // Verify events emitted in the previous transaction
        // Note: event checking depends on the test framework version
        // The number of events emitted can be checked:
        let effects = ts::next_tx(&mut scenario, ADMIN);
        let num_events = ts::num_user_events(&effects);
        assert!(num_events == 1, 0); // One NFTMinted event

        ts::end(scenario);
    }
}
```

### Step 7: Test Organization and init_for_testing

```move
// In your main module, add a test-only init helper:
module my_package::nft {
    // ... production code ...

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(MY_NFT {}, ctx);
    }
}

// Alternative: use test_utils::create_one_time_witness
#[test_only]
module my_package::tests {
    use sui::test_utils;

    #[test]
    fun test_with_otw() {
        let otw = test_utils::create_one_time_witness<MY_NFT>();
        // Use otw in init...
    }
}
```

### Step 8: Running Tests and Coverage

```bash
# Run all tests
sui move test

# Run tests with verbose output (shows test names)
sui move test -v

# Run a specific test by name
sui move test --filter test_mint_nft

# Run tests with statistics
sui move test --statistics

# Run tests with gas profiling
sui move test --statistics --gas-profiling

# Generate coverage report
sui move test --coverage

# View coverage summary
sui move coverage summary

# View coverage for a specific module
sui move coverage source --module my_module
```

### Step 9: Handoff

- "I need to review my code for security" -> route to `move-security`
- "I need design patterns" -> route to `move-patterns`
- "Debug a failing test" -> route to `debug-move`
- "Deploy after testing" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Every public function needs at least one test** — happy path at minimum. Critical functions need error path tests too.
2. **Use `test_scenario` for anything involving objects** — pure function tests can use simple `#[test]`, but anything creating/transferring objects needs `test_scenario`.
3. **Always call `ts::end(scenario)`** — failing to end the scenario causes a test-framework abort that masks the real error.
4. **Return or destroy every object taken** — if you `take_from_sender` or `take_shared`, you must `return_to_sender`, `return_shared`, or destroy it. Otherwise the test aborts.
5. **Use `#[expected_failure(abort_code = ...)]` with named constants** — use the actual error constant from your module, not raw numbers. This documents what error you expect.
6. **Test with multiple users** — use different sender addresses (`next_tx(scenario, ALICE)` vs `next_tx(scenario, BOB)`) to verify access control and ownership.
7. **Create Clock and Random with `*_for_testing` functions** — these are special system objects that can only be created with test helpers in test mode.
8. **Run coverage reports before mainnet deployment** — aim for >80% line coverage on critical modules (DeFi, auth, access control).

## References

- Sui Move Testing: https://docs.sui.io/concepts/sui-move-concepts/packages/custom-policies/testing
- Move Test Framework: https://move-book.com/guides/testing.html
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
