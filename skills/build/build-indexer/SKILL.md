---
name: build-indexer
description: "Build a custom Sui indexer for querying blockchain data. Covers event subscriptions, Sui GraphQL API, database persistence, real-time WebSocket feeds, and managed indexing services (ZettaBlock, Sentio, Envio). Triggers: indexer, index, events, graphql, websocket, sui events, query events, zettablock, sentio, envio, real-time data"
---

```bash
# Telemetry preamble
SKILL_NAME="build-indexer"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui indexing specialist. Your job is to guide the user through building custom indexers for Sui blockchain data — from simple event listeners to full database-backed indexing pipelines. Sui provides multiple data access patterns: the JSON-RPC API, a GraphQL API, WebSocket subscriptions for real-time events, and third-party managed indexing services.

**When to build a custom indexer:**
- You need historical event data aggregated in a database
- You need real-time notifications when specific on-chain events occur
- You need custom views/queries not supported by the standard RPC
- You need to power a dashboard, analytics, or search feature

**Indexing approaches:**
| Approach | Latency | Complexity | Best For |
|----------|---------|------------|----------|
| Event polling (RPC) | ~3s | Low | Simple apps, prototypes |
| WebSocket subscription | ~1s | Medium | Real-time UIs, bots |
| GraphQL API | ~3s | Low | Complex queries, explorers |
| Custom indexer + DB | ~1-3s | High | Production apps, analytics |
| Managed (ZettaBlock, Sentio) | ~5s | Low | Production without infra |

## Workflow

### Step 1: Event Polling with JSON-RPC

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Query events by Move event type
async function queryEvents(eventType: string, limit: number = 50) {
  const events = await client.queryEvents({
    query: { MoveEventType: eventType },
    limit,
    order: "descending",
  });

  return events.data.map((event) => ({
    id: event.id,
    type: event.type,
    parsedJson: event.parsedJson,
    timestamp: event.timestampMs,
    txDigest: event.id.txDigest,
  }));
}

// Example: query all swap events from a DEX
const swapEvents = await queryEvents(
  "0x<PACKAGE_ID>::pool::SwapEvent",
  100,
);

// Query events with pagination (cursor-based)
async function queryAllEvents(eventType: string) {
  const allEvents: any[] = [];
  let cursor: any = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 50,
    });

    allEvents.push(...page.data);
    cursor = page.nextCursor;
    hasNextPage = page.hasNextPage;
  }

  return allEvents;
}

// Query events by sender address
const senderEvents = await client.queryEvents({
  query: { Sender: "0x<ADDRESS>" },
  limit: 20,
});

// Query events by transaction digest
const txEvents = await client.queryEvents({
  query: { Transaction: "DIGEST_HERE" },
});
```

### Step 2: Real-Time WebSocket Subscriptions

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Subscribe to events in real-time
async function subscribeToEvents(eventType: string) {
  const unsubscribe = await client.subscribeEvent({
    filter: { MoveEventType: eventType },
    onMessage: (event) => {
      console.log("New event:", {
        type: event.type,
        data: event.parsedJson,
        timestamp: event.timestampMs,
        txDigest: event.id.txDigest,
      });

      // Process the event (save to DB, send notification, etc.)
      processEvent(event);
    },
  });

  console.log("Subscribed to events. Press Ctrl+C to unsubscribe.");

  // To unsubscribe later:
  // await unsubscribe();
}

// Subscribe to transaction effects (broader than events)
async function subscribeToTransactions(address: string) {
  const unsubscribe = await client.subscribeTransaction({
    filter: { FromAddress: address },
    onMessage: (tx) => {
      console.log("New transaction:", tx.digest);
    },
  });
}
```

### Step 3: Sui GraphQL API

```typescript
// The Sui GraphQL API provides powerful querying capabilities
// Endpoint: https://sui-mainnet.mystenlabs.com/graphql

async function graphqlQuery(query: string, variables?: Record<string, any>) {
  const response = await fetch(
    "https://sui-mainnet.mystenlabs.com/graphql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  return response.json();
}

// Example: Query object with all fields
const objectQuery = `
  query GetObject($id: SuiAddress!) {
    object(address: $id) {
      objectId
      version
      digest
      owner {
        ... on AddressOwner {
          owner { address }
        }
        ... on Shared {
          initialSharedVersion
        }
      }
      asMoveObject {
        contents {
          type { repr }
          json
        }
      }
    }
  }
`;

const result = await graphqlQuery(objectQuery, {
  id: "0x<OBJECT_ID>",
});

// Example: Query events with filtering
const eventsQuery = `
  query GetEvents($type: String!, $after: String, $first: Int) {
    events(
      filter: { eventType: $type }
      after: $after
      first: $first
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        sendingModule { name }
        type { repr }
        json
        timestamp
      }
    }
  }
`;

// Example: Query all coins for an address
const coinsQuery = `
  query GetCoins($address: SuiAddress!) {
    address(address: $address) {
      balance(type: "0x2::sui::SUI") {
        totalBalance
      }
      coins(type: "0x2::sui::SUI") {
        nodes {
          coinObjectId: address
          balance
        }
      }
    }
  }
`;

// Example: Query transaction blocks
const txQuery = `
  query GetTransactions($address: SuiAddress!, $first: Int) {
    address(address: $address) {
      transactionBlocks(first: $first) {
        nodes {
          digest
          effects {
            status
            gasEffects {
              gasSummary {
                computationCost
                storageCost
              }
            }
          }
        }
      }
    }
  }
`;
```

### Step 4: Build a Database-Backed Indexer

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Pool } from "pg"; // PostgreSQL

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize database schema
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      tx_digest TEXT NOT NULL,
      event_seq INTEGER NOT NULL,
      parsed_json JSONB NOT NULL,
      timestamp_ms BIGINT,
      sender TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tx_digest, event_seq)
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_events_sender ON events(sender);
    CREATE INDEX IF NOT EXISTS idx_events_json ON events USING GIN(parsed_json);
  `);
}

// Indexer checkpoint tracking
async function getLastCheckpoint(): Promise<string | null> {
  const result = await db.query(
    "SELECT cursor FROM indexer_state WHERE key = 'last_event_cursor'"
  );
  return result.rows[0]?.cursor || null;
}

async function saveCheckpoint(cursor: string) {
  await db.query(
    `INSERT INTO indexer_state (key, cursor) VALUES ('last_event_cursor', $1)
     ON CONFLICT (key) DO UPDATE SET cursor = $1`,
    [cursor],
  );
}

// Main indexing loop
async function runIndexer(eventTypes: string[]) {
  await initDB();
  console.log("Indexer started. Watching event types:", eventTypes);

  for (const eventType of eventTypes) {
    let cursor = await getLastCheckpoint();
    let hasNextPage = true;

    // First: backfill historical events
    while (hasNextPage) {
      const page = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: cursor ? JSON.parse(cursor) : undefined,
        limit: 50,
      });

      for (const event of page.data) {
        await db.query(
          `INSERT INTO events (event_type, tx_digest, event_seq, parsed_json, timestamp_ms, sender)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tx_digest, event_seq) DO NOTHING`,
          [
            event.type,
            event.id.txDigest,
            event.id.eventSeq,
            JSON.stringify(event.parsedJson),
            event.timestampMs,
            event.sender,
          ],
        );
      }

      if (page.nextCursor) {
        cursor = JSON.stringify(page.nextCursor);
        await saveCheckpoint(cursor);
      }
      hasNextPage = page.hasNextPage;

      console.log(`Indexed ${page.data.length} events (total backfill in progress...)`);
    }

    // Then: subscribe for real-time events
    await client.subscribeEvent({
      filter: { MoveEventType: eventType },
      onMessage: async (event) => {
        await db.query(
          `INSERT INTO events (event_type, tx_digest, event_seq, parsed_json, timestamp_ms, sender)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tx_digest, event_seq) DO NOTHING`,
          [
            event.type,
            event.id.txDigest,
            event.id.eventSeq,
            JSON.stringify(event.parsedJson),
            event.timestampMs,
            event.sender,
          ],
        );
        console.log("Indexed real-time event:", event.id.txDigest);
      },
    });
  }
}

// Run the indexer
runIndexer([
  "0x<PACKAGE>::pool::SwapEvent",
  "0x<PACKAGE>::pool::LiquidityEvent",
]);
```

### Step 5: Managed Indexing Services

**ZettaBlock:**
```typescript
// ZettaBlock provides a managed indexing and GraphQL API
// 1. Go to https://zettablock.com
// 2. Create a Sui indexer pipeline
// 3. Define event filters and transformations
// 4. Query via their GraphQL endpoint

const response = await fetch("https://api.zettablock.com/v1/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.ZETTABLOCK_API_KEY!,
  },
  body: JSON.stringify({
    query: `
      query {
        sui_events(
          where: { event_type: { _eq: "0x<PACKAGE>::pool::SwapEvent" } }
          order_by: { timestamp: desc }
          limit: 100
        ) {
          tx_digest
          event_data
          timestamp
        }
      }
    `,
  }),
});
```

**Sentio:**
```typescript
// Sentio provides event processing with custom handlers
// 1. Go to https://app.sentio.xyz
// 2. Create a new Sui project
// 3. Define event handlers in their DSL
// 4. Deploy and query via API

// Sentio processor example (in their framework):
// SuiBindOptions.bind({
//   address: "0x<PACKAGE>",
//   startCheckpoint: 0n,
// })
// .onEventSwapEvent((event, ctx) => {
//   ctx.meter.Counter("swaps").add(1);
//   ctx.eventLogger.emit("swap", {
//     amount: event.data_decoded.amount,
//   });
// });
```

### Step 6: Handoff

- "I need a frontend for my indexed data" -> route to `integrate-dapp-kit`
- "I need to build a data pipeline" -> route to `build-data-pipeline`
- "Deploy my indexer" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Always use cursor-based pagination** — never assume you can fetch all events in one call. Use `nextCursor` and `hasNextPage` for reliable pagination.
2. **Persist the indexing cursor** — if the indexer crashes, it must resume from where it left off. Store the last processed cursor in the database.
3. **Handle event deduplication** — use `(tx_digest, event_seq)` as a unique key. Events may be delivered more than once, especially during reorgs.
4. **Use WebSocket for real-time, polling for backfill** — subscribe for new events, but use paginated queries for historical data.
5. **Index events, not raw transactions** — Move events are the structured data source. Transaction effects are low-level and harder to parse.
6. **Create database indexes for query patterns** — index on event_type, timestamp, sender, and any JSON fields you query frequently.
7. **Handle checkpoint gaps** — if the RPC node is behind or events are delayed, your indexer should detect and backfill gaps.
8. **Rate limit RPC calls** — add delays between paginated queries to avoid overwhelming the RPC endpoint (100ms between calls is reasonable).

## References

- Sui RPC API: https://docs.sui.io/references/sui-api
- Sui GraphQL: https://docs.sui.io/references/sui-graphql
- ZettaBlock: https://zettablock.com
- Sentio: https://sentio.xyz
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
