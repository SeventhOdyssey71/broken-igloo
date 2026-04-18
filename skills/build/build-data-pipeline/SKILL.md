---
name: build-data-pipeline
description: "Build data pipelines and indexers for Sui. Covers Move event emission, JSON-RPC subscriptions, custom indexers, GraphQL API, managed indexing with ZettaBlock/Sentio. Triggers: data pipeline, indexer, events, analytics, webhooks, event subscription"
---

```bash
# Telemetry preamble
SKILL_NAME="build-data-pipeline"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui data pipeline architect. Your job is to help the user build systems that capture, process, and serve on-chain data from the Sui network. This includes emitting events from Move modules, subscribing to those events in real-time, building custom indexers, and integrating with managed indexing platforms.

Sui's data model is fundamentally different from EVM chains. There are no "logs" attached to transactions in the EVM sense. Instead, Move modules explicitly emit structured events via `sui::event::emit`. Events are the primary indexing mechanism. Object state changes can also be tracked, but events are the canonical way to build pipelines. Sui also provides a GraphQL API for complex queries that go beyond simple JSON-RPC.

## Workflow

### Step 1: Identify Data Requirements

Interview the user to determine what data they need:

| Data Type              | Source                          | Best Approach                          |
| ---------------------- | ------------------------------- | -------------------------------------- |
| **Custom events**      | Your own Move modules           | Emit events + subscribe via WebSocket  |
| **Token transfers**    | `0x2::coin` events              | Subscribe to `CoinBalanceChange`       |
| **DEX swaps**          | Cetus/DeepBook/Turbos events    | Subscribe to protocol-specific events  |
| **Object mutations**   | Any on-chain object             | `suix_subscribeTransaction` + filter   |
| **Historical queries** | Past transactions/events        | Sui GraphQL API or managed indexer     |
| **Aggregate analytics**| Cross-protocol metrics          | ZettaBlock / Sentio / custom indexer   |

### Step 2: Emit Events from Move Modules

Every state change in your Move module MUST emit a corresponding event. Events are structs with `copy` and `drop` abilities.

```move
module my_app::events {
    use sui::event;

    /// Event emitted when a swap occurs
    public struct SwapEvent has copy, drop {
        pool_id: ID,
        sender: address,
        amount_in: u64,
        amount_out: u64,
        coin_type_in: ascii::String,
        coin_type_out: ascii::String,
        timestamp: u64,
    }

    /// Event emitted when liquidity is added
    public struct LiquidityAddedEvent has copy, drop {
        pool_id: ID,
        provider: address,
        amount_a: u64,
        amount_b: u64,
        lp_tokens_minted: u64,
    }

    /// Event emitted when an admin action occurs
    public struct AdminActionEvent has copy, drop {
        action: ascii::String,
        admin: address,
        timestamp: u64,
    }
}
```

Emit events in your core functions:

```move
public fun swap<X, Y>(
    pool: &mut Pool<X, Y>,
    coin_in: Coin<X>,
    min_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Y> {
    let amount_in = coin::value(&coin_in);
    // ... swap logic ...
    let amount_out = coin::value(&coin_out);

    event::emit(SwapEvent {
        pool_id: object::id(pool),
        sender: tx_context::sender(ctx),
        amount_in,
        amount_out,
        coin_type_in: type_name::into_string(type_name::get<X>()),
        coin_type_out: type_name::into_string(type_name::get<Y>()),
        timestamp: clock::timestamp_ms(clock),
    });

    coin_out
}
```

### Step 3: Real-Time Event Subscription (WebSocket)

Use `suix_subscribeEvent` for real-time streaming. This is the most common pattern for live dashboards and bots.

```typescript
import { SuiClient, SuiEventFilter } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// Filter by event type from your package
const filter: SuiEventFilter = {
  MoveEventType: `${PACKAGE_ID}::events::SwapEvent`,
};

// Subscribe — returns an unsubscribe function
const unsubscribe = await client.subscribeEvent({
  filter,
  onMessage: (event) => {
    console.log("New swap event:", {
      poolId: event.parsedJson.pool_id,
      sender: event.parsedJson.sender,
      amountIn: event.parsedJson.amount_in,
      amountOut: event.parsedJson.amount_out,
      timestamp: event.timestampMs,
      txDigest: event.id.txDigest,
    });

    // Persist to database
    persistEvent(event);
  },
});

// Clean shutdown
process.on("SIGINT", async () => {
  await unsubscribe();
  process.exit(0);
});
```

**Reconnection logic is critical.** WebSocket connections drop. Always wrap subscriptions with retry:

```typescript
async function subscribeWithRetry(
  client: SuiClient,
  filter: SuiEventFilter,
  handler: (event: SuiEvent) => void,
  maxRetries = 10,
) {
  let retries = 0;
  let backoff = 1000; // 1 second initial backoff

  async function connect() {
    try {
      const unsub = await client.subscribeEvent({
        filter,
        onMessage: (event) => {
          retries = 0; // Reset on successful message
          backoff = 1000;
          handler(event);
        },
      });
      console.log("Subscribed to events");
      return unsub;
    } catch (err) {
      retries++;
      if (retries > maxRetries) {
        console.error("Max retries exceeded. Exiting.");
        process.exit(1);
      }
      console.error(`Subscription failed (attempt ${retries}). Retrying in ${backoff}ms...`);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30000); // Exponential backoff, max 30s
      return connect();
    }
  }

  return connect();
}
```

### Step 4: Historical Event Queries

For backfilling or querying past events, use `queryEvents`:

```typescript
// Query all swap events from your package, paginated
async function queryAllSwapEvents(client: SuiClient, packageId: string) {
  let cursor: string | null = null;
  const allEvents = [];

  do {
    const page = await client.queryEvents({
      query: { MoveEventType: `${packageId}::events::SwapEvent` },
      cursor,
      limit: 50,       // Max 50 per page
      order: "ascending",
    });

    allEvents.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return allEvents;
}
```

### Step 5: Sui GraphQL API for Complex Queries

For queries that span multiple object types, use the Sui GraphQL API (available at `https://sui-mainnet.mystenlabs.com/graphql`):

```graphql
# Query all coins owned by an address with their balances
query GetPortfolio($address: SuiAddress!) {
  address(address: $address) {
    balances {
      nodes {
        coinType { repr }
        totalBalance
        coinObjectCount
      }
    }
  }
}

# Query transaction blocks with specific filters
query RecentTransactions($package: SuiAddress!) {
  transactionBlocks(
    filter: { changedObject: $package }
    first: 20
  ) {
    nodes {
      digest
      effects {
        status
        gasEffects { gasSummary { computationCost storageCost } }
      }
      sender { address }
    }
  }
}

# Query events with structured filters
query SwapEvents($eventType: String!) {
  events(
    filter: { eventType: $eventType }
    first: 100
  ) {
    nodes {
      sendingModule { name package { address } }
      type { repr }
      json
      timestamp
    }
  }
}
```

```typescript
// TypeScript client for GraphQL
async function queryGraphQL(query: string, variables: Record<string, any>) {
  const response = await fetch("https://sui-mainnet.mystenlabs.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
```

### Step 6: Database Persistence Pattern

Store events in a structured database for querying:

```typescript
// PostgreSQL schema for event storage
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS swap_events (
    id SERIAL PRIMARY KEY,
    tx_digest TEXT NOT NULL UNIQUE,
    event_seq INTEGER NOT NULL,
    pool_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    amount_in BIGINT NOT NULL,
    amount_out BIGINT NOT NULL,
    coin_type_in TEXT NOT NULL,
    coin_type_out TEXT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_swap_pool ON swap_events(pool_id);
  CREATE INDEX IF NOT EXISTS idx_swap_sender ON swap_events(sender);
  CREATE INDEX IF NOT EXISTS idx_swap_timestamp ON swap_events(timestamp_ms);
`;

// Persist function
import { Pool } from "pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function persistEvent(event: SuiEvent) {
  const parsed = event.parsedJson as any;
  await db.query(
    `INSERT INTO swap_events (tx_digest, event_seq, pool_id, sender, amount_in, amount_out, coin_type_in, coin_type_out, timestamp_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tx_digest) DO NOTHING`,
    [
      event.id.txDigest,
      event.id.eventSeq,
      parsed.pool_id,
      parsed.sender,
      parsed.amount_in,
      parsed.amount_out,
      parsed.coin_type_in,
      parsed.coin_type_out,
      event.timestampMs,
    ],
  );
}
```

### Step 7: Managed Indexing (ZettaBlock / Sentio)

For production analytics without managing infrastructure:

- **ZettaBlock**: SQL-based indexing, pre-built Sui tables, custom materialized views. Best for dashboards and BI.
- **Sentio**: Event-driven processors, metrics, alerts. Best for monitoring and real-time analytics.
- **Envio**: HyperIndex for Sui — code-first indexing with auto-generated GraphQL.

### Step 8: Update Build Context

Update `.brokenigloo/build-context.md` with:
- Event types emitted by your modules
- Indexer architecture (self-hosted vs managed)
- Database schema
- Subscription filters in use
- Backfill status (which checkpoint you've indexed to)

### Step 9: Handoff

- "Build a frontend for this data" -> route to `build-with-claude`
- "Debug my event emission" -> route to `debug-move`
- "Secure my indexer infrastructure" -> route to `cso`

## Prior Context

Read `.brokenigloo/build-context.md` for existing Move modules and their event types. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for existing indexing solutions. Never block on missing files.

## Non-Negotiables

1. **Events must be emitted for every state change**: If state changes and no event is emitted, the data is invisible to indexers. This is non-recoverable without a contract upgrade.
2. **Include error handling and reconnection logic**: WebSocket subscriptions will drop. Every subscription must have exponential backoff retry logic. Never assume a connection stays alive.
3. **Event structs must have `copy` and `drop`**: These are required abilities for `sui::event::emit`. Missing them is a compile error.
4. **Use `ON CONFLICT` / upsert for idempotent writes**: Events may be delivered more than once during reconnection. Database writes must be idempotent.
5. **Paginate all historical queries**: `queryEvents` returns max 50 items per page. Always implement cursor-based pagination for backfills.
6. **Never rely solely on object polling**: Sui is event-driven. Polling `getObject` repeatedly is expensive and misses intermediate states. Use events.
7. **Include timestamps in all events**: Always pass a `&Clock` to functions that emit events and include `clock::timestamp_ms` in the event struct.
8. **Separate indexer from application**: The indexer process should be a standalone service, not embedded in your frontend or API server.

## References

- `references/defi-program-patterns.md` — Move event emission patterns
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — indexing SDKs and managed platforms
- `.brokenigloo/build-context.md` — stack decisions and module inventory

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
