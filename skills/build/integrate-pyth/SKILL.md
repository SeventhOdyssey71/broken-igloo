---
name: integrate-pyth
description: "Deep Pyth oracle integration on Sui. Covers price feed setup, VAA updates in PTBs, staleness checks, confidence intervals, TWAP calculation, multi-price-feed transactions, error handling, supported price IDs. Triggers: pyth, pyth oracle, price feed, oracle integration, price oracle, pyth network, vaa, price data, oracle price"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-pyth"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Pyth oracle integration specialist for Sui. Pyth Network is the primary price oracle on Sui, providing real-time price feeds for crypto assets, equities, forex, and commodities. Your job is to guide users through integrating Pyth price data into their Sui Move contracts and TypeScript applications.

Key architecture: Pyth uses a **pull oracle** model. Prices are NOT pushed on-chain automatically. Instead, your application fetches the latest price update (a VAA — Verified Action Approval) from Pyth's off-chain Hermes service, then includes it as part of your transaction. The on-chain Pyth contract verifies the VAA signature and updates the price feed object.

This is different from Chainlink (push model). On Sui, YOU are responsible for updating the price feed in your transaction. If you don't update it, you get stale data.

```
┌─────────────┐     1. Get VAA    ┌──────────────┐
│   Your App   │────────────────>│  Pyth Hermes   │
│  (Frontend/  │<────────────────│  (Off-chain)   │
│   Backend)   │  2. Returns VAA  └──────────────┘
└──────┬──────┘
       │ 3. Include VAA in PTB
       ▼
┌──────────────┐     4. Verify VAA    ┌──────────────┐
│  Sui Network  │────────────────────>│  Pyth Contract │
│  (Your TX)    │  5. Read price      │  (On-chain)    │
└──────────────┘                      └──────────────┘
```

## Workflow

### Step 1: Dependencies and Setup

```bash
# TypeScript dependencies
npm i @pythnetwork/pyth-sui-js @mysten/sui

# Find your price feed IDs at:
# https://pyth.network/developers/price-feed-ids
```

**Common Sui price feed IDs:**

| Asset      | Price Feed ID (Mainnet)                                            |
| ---------- | ------------------------------------------------------------------ |
| SUI/USD    | `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744` |
| BTC/USD    | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| ETH/USD    | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| USDC/USD   | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| SOL/USD    | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |

**Pyth contract on Sui:**

```typescript
// Mainnet
const PYTH_STATE_ID = "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE_ID = "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";

// Testnet
const PYTH_STATE_ID_TESTNET = "0x..."; // Check Pyth docs for current testnet address
```

### Step 2: Fetch Price Updates from Hermes

```typescript
import { SuiPriceServiceConnection } from "@pythnetwork/pyth-sui-js";

// Connect to Pyth Hermes (the off-chain price service)
const priceService = new SuiPriceServiceConnection(
  "https://hermes.pyth.network",
);

// Price feed IDs you need
const SUI_USD_FEED = "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";
const BTC_USD_FEED = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

// Fetch latest price updates (returns VAAs)
async function getLatestPriceUpdates(feedIds: string[]) {
  const priceUpdates = await priceService.getLatestVaas(feedIds);
  return priceUpdates; // Array of base64-encoded VAAs
}

// Get human-readable current prices (for display only — NOT for on-chain use)
async function getCurrentPrices(feedIds: string[]) {
  const prices = await priceService.getLatestPriceFeeds(feedIds);

  return prices?.map((priceFeed) => {
    const price = priceFeed.getPriceNoOlderThan(60); // Max 60 seconds old
    if (!price) return null;

    return {
      id: priceFeed.id,
      price: Number(price.price) * Math.pow(10, price.expo),
      confidence: Number(price.conf) * Math.pow(10, price.expo),
      publishTime: price.publishTime,
    };
  });
}

// Example
const prices = await getCurrentPrices([SUI_USD_FEED, BTC_USD_FEED]);
console.log("SUI/USD:", prices[0]?.price); // e.g., 1.23
console.log("BTC/USD:", prices[1]?.price); // e.g., 67890.45
```

### Step 3: Update Price Feed in a PTB

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
const priceService = new SuiPriceServiceConnection("https://hermes.pyth.network");

// Create Pyth client for Sui
const pythClient = new SuiPythClient(client, PYTH_STATE_ID, WORMHOLE_STATE_ID);

async function buildTxWithPriceUpdate(
  senderAddress: string,
  priceFeedIds: string[],
) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Step 1: Fetch latest VAAs from Hermes
  const vaas = await priceService.getLatestVaas(priceFeedIds);

  // Step 2: Add price update calls to the transaction
  // This verifies the VAA and updates the on-chain price feed objects
  const priceInfoObjectIds = await pythClient.updatePriceFeeds(
    tx,
    vaas,
    priceFeedIds,
  );

  // priceInfoObjectIds are the on-chain PriceInfoObject IDs
  // Pass these to your Move contract that needs the price

  return { tx, priceInfoObjectIds };
}

// Complete example: Swap with price check
async function swapWithPriceGuard(
  signer,
  poolId: string,
  coinId: string,
  amount: bigint,
) {
  const { tx, priceInfoObjectIds } = await buildTxWithPriceUpdate(
    signer.toSuiAddress(),
    [SUI_USD_FEED],
  );

  // Split coins for the swap
  const [inputCoin] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(amount)]);

  // Call your swap function with price guard
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::swap_with_price_check`,
    arguments: [
      tx.object(poolId),
      inputCoin,
      tx.object(priceInfoObjectIds[0]), // PriceInfoObject for SUI/USD
      tx.object("0x6"), // Clock
    ],
  });

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}
```

### Step 4: Read Pyth Prices in Move

```move
module defi::price_guard {
    use pyth::price_info::PriceInfoObject;
    use pyth::price::{Self, Price};
    use pyth::price_identifier;
    use pyth::i64;
    use sui::clock::Clock;

    // === Error Codes ===
    const EPriceStale: u64 = 0;
    const EPriceNegative: u64 = 1;
    const EConfidenceTooWide: u64 = 2;
    const EPriceFeedMismatch: u64 = 3;

    // Maximum acceptable staleness (30 seconds)
    const MAX_STALENESS_SECS: u64 = 30;

    // Maximum acceptable confidence interval (5% of price)
    const MAX_CONFIDENCE_PCT: u64 = 5;

    /// Get the USD price with full validation
    public fun get_validated_price(
        price_info: &PriceInfoObject,
        expected_feed_id: vector<u8>,
        clock: &Clock,
    ): (u64, u64, i64::I64) {
        // Get the price
        let price_struct = pyth::price_info::get_price_no_older_than(
            price_info,
            clock,
            MAX_STALENESS_SECS,
        );

        // Validate feed ID matches what we expect
        let feed_id = pyth::price_info::get_price_identifier(price_info);
        // assert!(price_identifier::get_bytes(&feed_id) == expected_feed_id, EPriceFeedMismatch);

        // Extract price components
        let price_value = price::get_price(&price_struct);
        let confidence = price::get_conf(&price_struct);
        let expo = price::get_expo(&price_struct);

        // Validate price is positive
        assert!(!i64::get_is_negative(&price_value), EPriceNegative);

        let price_u64 = i64::get_magnitude_if_positive(&price_value);
        let conf_u64 = confidence;

        // Validate confidence is not too wide
        // confidence / price < MAX_CONFIDENCE_PCT / 100
        assert!(conf_u64 * 100 < price_u64 * MAX_CONFIDENCE_PCT, EConfidenceTooWide);

        (price_u64, conf_u64, expo)
    }

    /// Convert a token amount to USD value
    /// Returns USD value scaled by 10^usd_decimals
    public fun amount_to_usd(
        amount: u64,
        token_decimals: u8,
        price: u64,
        price_expo: i64::I64,
        usd_decimals: u8,
    ): u64 {
        // price = price_value * 10^expo
        // usd_value = amount * price / 10^token_decimals * 10^usd_decimals

        let amount_128 = (amount as u128);
        let price_128 = (price as u128);

        // Handle negative exponent (most common: expo = -8)
        let expo_magnitude = i64::get_magnitude_if_negative(&price_expo);

        // amount * price * 10^usd_decimals / (10^token_decimals * 10^expo_magnitude)
        let numerator = amount_128 * price_128 * (pow10(usd_decimals) as u128);
        let denominator = (pow10(token_decimals) as u128) * (pow10((expo_magnitude as u8)) as u128);

        ((numerator / denominator) as u64)
    }

    fun pow10(exp: u8): u64 {
        let mut result: u64 = 1;
        let mut i: u8 = 0;
        while (i < exp) {
            result = result * 10;
            i = i + 1;
        };
        result
    }

    /// Example: Liquidation check using Pyth price
    public fun check_liquidation(
        collateral_amount: u64,
        debt_amount: u64,
        collateral_price_info: &PriceInfoObject,
        debt_price_info: &PriceInfoObject,
        liquidation_threshold_bps: u64, // e.g., 8000 = 80%
        clock: &Clock,
    ): bool {
        let (coll_price, _, coll_expo) = get_validated_price(
            collateral_price_info,
            vector[], // pass expected feed ID
            clock,
        );
        let (debt_price, _, debt_expo) = get_validated_price(
            debt_price_info,
            vector[],
            clock,
        );

        let collateral_usd = amount_to_usd(collateral_amount, 9, coll_price, coll_expo, 6);
        let debt_usd = amount_to_usd(debt_amount, 6, debt_price, debt_expo, 6);

        // health = collateral_usd * 10000 / debt_usd
        // liquidatable if health < liquidation_threshold_bps
        let health = collateral_usd * 10_000 / debt_usd;
        health < liquidation_threshold_bps
    }
}
```

### Step 5: Multi-Feed Price Update Pattern

```typescript
// Fetch and update multiple price feeds in a single transaction
async function buildMultiFeedTx(
  senderAddress: string,
  feedIds: string[],
) {
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Fetch all VAAs in one call
  const vaas = await priceService.getLatestVaas(feedIds);

  // Update all feeds in the transaction
  const priceObjects = await pythClient.updatePriceFeeds(tx, vaas, feedIds);

  // Now use them in your contract
  // priceObjects[0] = SUI/USD PriceInfoObject
  // priceObjects[1] = BTC/USD PriceInfoObject
  // priceObjects[2] = ETH/USD PriceInfoObject

  tx.moveCall({
    target: `${PACKAGE_ID}::vault::rebalance`,
    arguments: [
      tx.object(VAULT_ID),
      tx.object(priceObjects[0]), // SUI/USD
      tx.object(priceObjects[1]), // BTC/USD
      tx.object(priceObjects[2]), // ETH/USD
      tx.object("0x6"), // Clock
    ],
  });

  return tx;
}
```

### Step 6: TWAP (Time-Weighted Average Price) Calculation

```move
module defi::twap {
    use pyth::price_info::PriceInfoObject;
    use sui::clock::Clock;
    use sui::table::{Self, Table};

    /// TWAP accumulator
    public struct TWAPAccumulator has key {
        id: UID,
        /// Historical price observations: timestamp -> price
        observations: Table<u64, u64>,
        /// Observation timestamps in order
        timestamps: vector<u64>,
        /// Maximum number of observations to keep
        max_observations: u64,
        /// Last recorded price
        last_price: u64,
        /// Last observation timestamp
        last_timestamp: u64,
    }

    /// Record a new price observation
    public entry fun record_observation(
        acc: &mut TWAPAccumulator,
        price_info: &PriceInfoObject,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock);
        // Only record if enough time has passed (e.g., 1 minute)
        if (now - acc.last_timestamp < 60_000) return;

        let (price, _, _) = get_price_from_pyth(price_info, clock);

        table::add(&mut acc.observations, now, price);
        vector::push_back(&mut acc.timestamps, now);

        // Trim old observations
        while (vector::length(&acc.timestamps) > acc.max_observations) {
            let old_ts = vector::remove(&mut acc.timestamps, 0);
            table::remove(&mut acc.observations, old_ts);
        };

        acc.last_price = price;
        acc.last_timestamp = now;
    }

    /// Calculate TWAP over the last N minutes
    public fun calculate_twap(
        acc: &TWAPAccumulator,
        window_ms: u64,
        clock: &Clock,
    ): u64 {
        let now = clock::timestamp_ms(clock);
        let cutoff = now - window_ms;

        let mut sum: u128 = 0;
        let mut weight: u128 = 0;
        let len = vector::length(&acc.timestamps);

        let mut i = 0;
        while (i < len) {
            let ts = *vector::borrow(&acc.timestamps, i);
            if (ts >= cutoff) {
                let price = *table::borrow(&acc.observations, ts);
                let next_ts = if (i + 1 < len) {
                    *vector::borrow(&acc.timestamps, i + 1)
                } else {
                    now
                };
                let duration = (next_ts - ts as u128);
                sum = sum + (price as u128) * duration;
                weight = weight + duration;
            };
            i = i + 1;
        };

        if (weight == 0) { acc.last_price }
        else { ((sum / weight) as u64) }
    }
}
```

### Step 7: Streaming Price Updates (Frontend)

```typescript
// Real-time price feed in the browser
import { SuiPriceServiceConnection } from "@pythnetwork/pyth-sui-js";

function usePythPrice(feedId: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  useEffect(() => {
    const priceService = new SuiPriceServiceConnection("https://hermes.pyth.network");

    // Subscribe to price updates via WebSocket
    priceService.subscribePriceFeedUpdates([feedId], (priceFeed) => {
      const priceData = priceFeed.getPriceNoOlderThan(60);
      if (priceData) {
        setPrice(Number(priceData.price) * Math.pow(10, priceData.expo));
        setConfidence(Number(priceData.conf) * Math.pow(10, priceData.expo));
      }
    });

    return () => {
      priceService.unsubscribePriceFeedUpdates([feedId]);
    };
  }, [feedId]);

  return { price, confidence };
}

// Usage in component
function PriceDisplay() {
  const { price, confidence } = usePythPrice(SUI_USD_FEED);

  return (
    <div>
      <p>SUI/USD: ${price?.toFixed(4)}</p>
      <p>Confidence: +/-${confidence?.toFixed(4)}</p>
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS update the price feed in the SAME transaction** that uses it — never rely on a previously updated price; it may be stale
2. **ALWAYS check price staleness** — use `get_price_no_older_than` with a maximum age (30-60 seconds for DeFi, 300 seconds for less critical uses)
3. **ALWAYS check confidence intervals** — a wide confidence interval means the price is unreliable; reject if confidence > 5% of price
4. **ALWAYS verify the price feed ID matches** — passing the wrong PriceInfoObject silently gives wrong data
5. **NEVER hardcode prices** — always fetch from Pyth; hardcoded prices are stale the moment you deploy
6. **ALWAYS handle the negative exponent** — Pyth prices use `price * 10^expo` where expo is typically -8; incorrect handling causes off-by-orders-of-magnitude errors
7. **Use u128 for intermediate calculations** — price * amount can overflow u64 with large values
8. **ALWAYS fetch VAAs from Hermes, not from Wormhole directly** — Hermes is Pyth's optimized price service for real-time data

## References

- `skills/build/build-defi-protocol/SKILL.md` — DeFi protocol integration
- `skills/build/build-staking/SKILL.md` — Staking with price-based rewards
- `skills/build/build-rwa/SKILL.md` — RWA pricing
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
