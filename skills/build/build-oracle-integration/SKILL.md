---
name: build-oracle-integration
description: "Integrate price oracles on Sui. Covers Pyth Network, Supra, Switchboard oracle setup, price feed consumption, staleness checks, TWAP calculations, confidence intervals, and DeFi oracle patterns. Triggers: oracle, price feed, pyth, supra, switchboard, price oracle, twap, staleness, confidence interval, price data"
---

```bash
# Telemetry preamble
SKILL_NAME="build-oracle-integration"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui oracle integration specialist. Your job is to guide the user through integrating price oracles into their Sui dApp — whether for a lending protocol, DEX, derivative, or any app needing external price data. The main oracle providers on Sui are **Pyth Network** (most widely used), **Supra**, and **Switchboard**.

**Oracle landscape on Sui:**

| Provider | Update Model | Latency | Price Feeds | Best For |
|----------|-------------|---------|-------------|----------|
| **Pyth Network** | Pull (on-demand) | ~400ms | 350+ assets | DeFi protocols, high-frequency |
| **Supra** | Push + Pull | ~2s | 100+ assets | General purpose |
| **Switchboard** | Pull | ~1s | 200+ assets | Custom feeds, VRF |

**Pull vs Push oracle model:**
- **Pull (Pyth)**: Your transaction fetches and submits the latest price. Fresher data, but requires extra transaction setup.
- **Push (traditional)**: Prices are pushed on-chain by the oracle. Simpler to consume, but may be stale.

## Workflow

### Step 1: Pyth Network Integration (Recommended)

```bash
npm i @pythnetwork/pyth-sui-js @mysten/sui
```

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Pyth mainnet contract addresses
const PYTH_STATE_ID = "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE_ID = "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";

// Pyth price feed IDs (hex strings)
const PRICE_FEED_IDS = {
  "SUI/USD": "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};

// Initialize Pyth client
const priceService = new SuiPriceServiceConnection(
  "https://hermes.pyth.network", // Pyth Hermes API
);

const pythClient = new SuiPythClient(client, PYTH_STATE_ID, WORMHOLE_STATE_ID);

// === Fetch and Use Price in a Transaction ===
async function getPrice(feedId: string) {
  // 1. Fetch the latest price update data from Hermes
  const priceUpdateData = await priceService.getPriceFeedsUpdateData([feedId]);

  // 2. Create a transaction that updates the price on-chain and uses it
  const tx = new Transaction();

  // 3. Update the price feed (this costs a small fee)
  const priceInfoObjectIds = await pythClient.updatePriceFeeds(
    tx,
    priceUpdateData,
    [feedId],
  );

  // 4. Now you can use the price in your Move call
  // The priceInfoObjectIds contain the updated PriceInfoObject IDs
  // Pass them to your contract

  return { tx, priceInfoObjectIds };
}

// === Read Price Off-Chain (for display/calculations) ===
async function readPriceOffChain(feedId: string) {
  const priceFeeds = await priceService.getLatestPriceFeeds([feedId]);

  if (!priceFeeds || priceFeeds.length === 0) {
    throw new Error("No price data available");
  }

  const priceFeed = priceFeeds[0];
  const price = priceFeed.getPriceNoOlderThan(60); // Max 60 seconds old

  if (!price) {
    throw new Error("Price is too stale");
  }

  return {
    price: Number(price.price) * 10 ** price.expo, // Convert to human-readable
    confidence: Number(price.conf) * 10 ** price.expo,
    publishTime: price.publishTime,
    expo: price.expo,
  };
}

// Example
const suiPrice = await readPriceOffChain(PRICE_FEED_IDS["SUI/USD"]);
console.log(`SUI/USD: $${suiPrice.price.toFixed(4)} +/- $${suiPrice.confidence.toFixed(4)}`);
```

### Step 2: Consume Pyth Prices in Move

```move
module defi::oracle_consumer {
    use pyth::price_info::PriceInfoObject;
    use pyth::price::{Self, Price};
    use pyth::pyth;
    use pyth::price_identifier;
    use sui::clock::Clock;

    /// Maximum allowed price staleness (60 seconds)
    const MAX_STALENESS_SECS: u64 = 60;

    /// Error codes
    const EPriceStale: u64 = 0;
    const EPriceFeedMismatch: u64 = 1;
    const EConfidenceTooWide: u64 = 2;

    /// Get the SUI/USD price with safety checks
    public fun get_sui_usd_price(
        price_info: &PriceInfoObject,
        clock: &Clock,
    ): (u64, u64, i32) { // (price, confidence, exponent)
        // Get the price, enforcing staleness check
        let price = pyth::get_price_no_older_than(
            price_info,
            clock,
            MAX_STALENESS_SECS,
        );

        let price_value = price::get_price(&price);
        let confidence = price::get_conf(&price);
        let expo = price::get_expo(&price);
        let timestamp = price::get_timestamp(&price);

        // Confidence check: confidence should be < 1% of price
        // This prevents using prices during extreme volatility
        let price_abs = if (price_value >= 0) {
            (price_value as u64)
        } else {
            ((-price_value) as u64)
        };

        assert!(confidence * 100 < price_abs, EConfidenceTooWide);

        (price_abs, confidence, expo)
    }

    /// Calculate collateral value using oracle price
    public fun calculate_collateral_value(
        amount: u64,           // Amount of collateral (in smallest unit)
        amount_decimals: u8,   // Decimals of the collateral token
        price_info: &PriceInfoObject,
        clock: &Clock,
    ): u64 {
        let (price, _confidence, expo) = get_sui_usd_price(price_info, clock);

        // Convert price to a common decimal base
        // price * amount / (10^amount_decimals) * 10^(-expo)
        // Careful with overflow — use u128 for intermediate calculations
        let price_128 = (price as u128);
        let amount_128 = (amount as u128);

        // Normalize to 6 decimal USD value
        let value_128 = price_128 * amount_128;
        let adjustment = if (expo < 0) {
            let abs_expo = ((-expo) as u8);
            // Divide by 10^abs_expo and 10^amount_decimals, multiply by 10^6
            let divisor = pow10((abs_expo as u64) + (amount_decimals as u64));
            let multiplier = pow10(6);
            value_128 * (multiplier as u128) / (divisor as u128)
        } else {
            // Positive expo — multiply
            let multiplier = pow10((expo as u64) + 6);
            let divisor = pow10((amount_decimals as u64));
            value_128 * (multiplier as u128) / (divisor as u128)
        };

        (value_128 as u64)
    }

    fun pow10(n: u64): u64 {
        let mut result = 1u64;
        let mut i = 0;
        while (i < n) {
            result = result * 10;
            i = i + 1;
        };
        result
    }
}
```

### Step 3: Use Oracle Price in a DeFi Transaction

```typescript
// Example: Liquidation check using Pyth price
async function checkAndLiquidate(
  keypair: any,
  obligationId: string,
  collateralFeedId: string,
  debtFeedId: string,
) {
  // Fetch latest prices
  const priceUpdateData = await priceService.getPriceFeedsUpdateData([
    collateralFeedId,
    debtFeedId,
  ]);

  const tx = new Transaction();

  // Update both price feeds
  const [collateralPriceInfo, debtPriceInfo] = await pythClient.updatePriceFeeds(
    tx,
    priceUpdateData,
    [collateralFeedId, debtFeedId],
  );

  // Call your liquidation function with fresh prices
  tx.moveCall({
    target: `${PACKAGE_ID}::lending::liquidate`,
    arguments: [
      tx.object(obligationId),
      tx.object(collateralPriceInfo),
      tx.object(debtPriceInfo),
      tx.object("0x6"), // Clock
    ],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
}
```

### Step 4: TWAP (Time-Weighted Average Price)

```typescript
// Build a TWAP from historical Pyth data
async function calculateTWAP(
  feedId: string,
  durationSeconds: number,
  intervalSeconds: number = 60,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const start = now - durationSeconds;

  let totalPrice = 0;
  let count = 0;

  // Sample prices at intervals
  for (let t = start; t <= now; t += intervalSeconds) {
    try {
      const priceFeeds = await priceService.getLatestPriceFeeds([feedId]);
      if (priceFeeds && priceFeeds.length > 0) {
        const price = priceFeeds[0].getPriceNoOlderThan(intervalSeconds * 2);
        if (price) {
          totalPrice += Number(price.price) * 10 ** price.expo;
          count++;
        }
      }
    } catch {
      // Skip failed samples
    }
  }

  if (count === 0) throw new Error("No valid price samples");
  return totalPrice / count;
}

// For on-chain TWAP, accumulate price samples in a Move object:
```

```move
module defi::twap {
    use sui::table::{Self, Table};

    public struct TWAPAccumulator has key {
        id: UID,
        /// Recent price samples: timestamp -> price
        samples: Table<u64, u64>,
        /// Running sum for TWAP calculation
        cumulative_price: u128,
        sample_count: u64,
        last_update: u64,
        min_sample_interval: u64, // minimum ms between samples
    }

    public fun update_price(
        acc: &mut TWAPAccumulator,
        price: u64,
        timestamp: u64,
    ) {
        // Enforce minimum interval between samples
        if (timestamp < acc.last_update + acc.min_sample_interval) return;

        acc.cumulative_price = acc.cumulative_price + (price as u128);
        acc.sample_count = acc.sample_count + 1;
        acc.last_update = timestamp;

        table::add(&mut acc.samples, timestamp, price);
    }

    public fun get_twap(acc: &TWAPAccumulator): u64 {
        if (acc.sample_count == 0) return 0;
        ((acc.cumulative_price / (acc.sample_count as u128)) as u64)
    }
}
```

### Step 5: Supra Oracle Integration

```typescript
// Supra provides push-based oracles on Sui
// Documentation: https://supra.com/docs

// Supra price feeds are accessible via on-chain objects
// You read the price directly from the Supra price feed object

const SUPRA_HOLDER_OBJECT = "0x<SUPRA_HOLDER_ID>"; // Network-specific

// In Move, consume Supra prices:
// module defi::supra_consumer {
//     use supra::svalue_feed;
//     
//     public fun get_price(
//         holder: &svalue_feed::OracleHolder,
//         pair_index: u32,
//     ): (u128, u16, u64) {
//         let (price, decimals, timestamp, _round) = 
//             svalue_feed::get_price(holder, pair_index);
//         (price, decimals, timestamp)
//     }
// }
```

### Step 6: Handoff

- "I need prices for my lending protocol" -> route to `build-defi-protocol`
- "I need a DEX with oracle pricing" -> route to `integrate-cetus` or `integrate-deepbook`
- "Deploy my oracle-integrated app" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for oracle catalog. Never block on missing files.

## Non-Negotiables

1. **ALWAYS check price staleness** — never use a price without verifying it was published within an acceptable window (30-60 seconds for most DeFi). Stale prices enable arbitrage attacks.
2. **ALWAYS check confidence intervals** — Pyth provides confidence values. If confidence is wider than 1-2% of the price, the price is unreliable. Reject it or use a safer price (price - confidence for collateral, price + confidence for debt).
3. **Use the pull model correctly** — for Pyth, you must include `updatePriceFeeds` in your transaction. The price is NOT automatically available on-chain.
4. **Handle negative exponents correctly** — Pyth prices have negative exponents (e.g., price=150000, expo=-5 means $1.50). Always apply the exponent correctly.
5. **Use u128 for intermediate calculations** — price * amount calculations overflow u64 easily. Always use u128 for math, then convert back.
6. **Never use a single oracle source in production** — for critical price feeds, consider aggregating multiple oracles or using a median.
7. **Test with multiple price scenarios** — test normal prices, extreme prices, zero prices, and stale prices. Oracle edge cases cause liquidation cascades.
8. **Include the price update fee** — Pyth charges a small fee per price update. Ensure your transaction includes sufficient gas for this.

## References

- Pyth on Sui: https://docs.pyth.network/price-feeds/use-real-time-data/sui
- Pyth Price Feed IDs: https://pyth.network/developers/price-feed-ids
- Supra: https://supra.com/docs
- Switchboard: https://docs.switchboard.xyz
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — oracle catalog
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
