---
name: build-analytics-dashboard
description: "Build an analytics dashboard for Sui. Covers GraphQL queries, SuiVision/SuiScan APIs, chart rendering with Recharts/D3, real-time updates via event subscriptions, portfolio tracking, TVL calculations, transaction history, token price feeds. Triggers: analytics dashboard, dashboard, analytics, portfolio tracker, tvl dashboard, sui analytics, transaction history, chart, data visualization"
---

```bash
# Telemetry preamble
SKILL_NAME="build-analytics-dashboard"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui analytics dashboard architect. Your job is to help users build data visualization dashboards that display on-chain Sui data — portfolio balances, protocol TVL, transaction history, token prices, and real-time activity feeds. You combine Sui's GraphQL API, RPC queries, and third-party data providers to build rich, interactive dashboards.

Data sources:
- **Sui GraphQL API** (`https://sui-mainnet.mystenlabs.com/graphql`): Structured queries for objects, transactions, events, checkpoints
- **Sui JSON-RPC**: Real-time subscriptions, specific object reads, balance queries
- **SuiVision API**: Pre-aggregated analytics, token prices, trending collections
- **Pyth Network**: Real-time price feeds for DeFi dashboards
- **Custom indexer**: Your own event indexer for application-specific data

## Workflow

### Step 1: Data Layer Setup

```typescript
// src/lib/data.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const GRAPHQL_URL = "https://sui-mainnet.mystenlabs.com/graphql";

// GraphQL helper
async function graphqlQuery<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(result.errors[0].message);
  }
  return result.data;
}

// Fetch portfolio balances for an address
export async function getPortfolio(address: string) {
  const balances = await client.getAllBalances({ owner: address });

  return Promise.all(
    balances.map(async (b) => {
      const metadata = await client.getCoinMetadata({ coinType: b.coinType });
      return {
        coinType: b.coinType,
        symbol: metadata?.symbol || b.coinType.split("::").pop(),
        name: metadata?.name || "Unknown",
        decimals: metadata?.decimals || 9,
        balance: BigInt(b.totalBalance),
        formattedBalance: (
          Number(BigInt(b.totalBalance)) / Math.pow(10, metadata?.decimals || 9)
        ).toFixed(4),
        coinObjectCount: b.coinObjectCount,
      };
    }),
  );
}

// Fetch transaction history
export async function getTransactionHistory(
  address: string,
  limit = 50,
  cursor?: string,
) {
  const query = `
    query TransactionHistory($address: SuiAddress!, $first: Int, $after: String) {
      transactionBlocks(
        filter: { signAddress: $address }
        first: $first
        after: $after
      ) {
        nodes {
          digest
          effects {
            status
            gasEffects {
              gasSummary {
                computationCost
                storageCost
                storageRebate
              }
            }
            timestamp
          }
          kind {
            __typename
            ... on ProgrammableTransactionBlock {
              inputs { __typename }
              transactions { __typename }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  return graphqlQuery(query, { address, first: limit, after: cursor });
}
```

### Step 2: TVL and Protocol Analytics

```typescript
// Calculate TVL for a protocol's pools
export async function calculateProtocolTVL(poolIds: string[]): Promise<{
  totalTvlUsd: number;
  pools: { id: string; tvlUsd: number; tokenA: string; tokenB: string }[];
}> {
  const pools = await Promise.all(
    poolIds.map(async (poolId) => {
      const obj = await client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      const fields = obj.data?.content?.fields;
      if (!fields) return null;

      // Get token balances from pool
      const balanceA = BigInt(fields.balance_a || fields.coin_a || "0");
      const balanceB = BigInt(fields.balance_b || fields.coin_b || "0");

      // Get USD prices (from Pyth or CoinGecko)
      const priceA = await getTokenPriceUsd(fields.type_a);
      const priceB = await getTokenPriceUsd(fields.type_b);

      const tvlA = Number(balanceA) / 1e9 * priceA;
      const tvlB = Number(balanceB) / 1e9 * priceB;

      return {
        id: poolId,
        tvlUsd: tvlA + tvlB,
        tokenA: fields.type_a,
        tokenB: fields.type_b,
      };
    }),
  );

  const validPools = pools.filter(Boolean);
  const totalTvlUsd = validPools.reduce((sum, p) => sum + p!.tvlUsd, 0);

  return { totalTvlUsd, pools: validPools };
}

// Network-level metrics via GraphQL
export async function getNetworkMetrics() {
  const query = `
    query NetworkMetrics {
      epoch {
        epochId
        startTimestamp
        referenceGasPrice
        totalStake
        validatorSet {
          activeValidators {
            name
            stakingPoolSuiBalance
            commissionRate
          }
        }
      }
      checkpoints(last: 1) {
        nodes {
          sequenceNumber
          timestamp
          networkTotalTransactions
        }
      }
    }
  `;

  return graphqlQuery(query);
}
```

### Step 3: Chart Components with Recharts

```typescript
// src/components/TVLChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useEffect, useState } from "react";

interface TVLDataPoint {
  timestamp: number;
  date: string;
  tvlUsd: number;
}

function TVLChart({ poolIds }: { poolIds: string[] }) {
  const [data, setData] = useState<TVLDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistoricalTVL(poolIds).then((history) => {
      setData(history);
      setLoading(false);
    });
  }, [poolIds]);

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded" />;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Total Value Locked</h3>
      <div className="text-3xl font-bold mb-2">
        ${data[data.length - 1]?.tvlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString()} />
          <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, "TVL"]}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
          />
          <Area
            type="monotone"
            dataKey="tvlUsd"
            stroke="#4F46E5"
            fill="#4F46E5"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Transaction volume chart
function VolumeChart({ events }: { events: any[] }) {
  // Aggregate events by day
  const dailyVolume = events.reduce((acc, event) => {
    const day = new Date(Number(event.timestampMs)).toISOString().split("T")[0];
    acc[day] = (acc[day] || 0) + Number(event.parsedJson.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(dailyVolume)
    .map(([date, volume]) => ({ date, volume: volume / 1e9 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis tickFormatter={(v) => `${v.toFixed(0)} SUI`} />
        <Tooltip />
        <Line type="monotone" dataKey="volume" stroke="#10B981" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Step 4: Real-Time Activity Feed

```typescript
// src/components/ActivityFeed.tsx
import { useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

interface Activity {
  digest: string;
  type: string;
  description: string;
  timestamp: number;
  amount?: string;
}

function ActivityFeed({ packageId }: { packageId: string }) {
  const client = useSuiClient();
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    // Subscribe to real-time events
    const unsubPromise = client.subscribeEvent({
      filter: { Package: packageId },
      onMessage: (event) => {
        const activity = parseEventToActivity(event);
        setActivities((prev) => [activity, ...prev].slice(0, 100)); // Keep last 100
      },
    });

    // Load recent events on mount
    client.queryEvents({
      query: { Package: packageId },
      limit: 20,
      order: "descending",
    }).then((result) => {
      setActivities(result.data.map(parseEventToActivity));
    });

    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  }, [packageId]);

  return (
    <div className="bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold p-4 border-b">Live Activity</h3>
      <div className="divide-y max-h-96 overflow-y-auto">
        {activities.map((a) => (
          <div key={a.digest} className="p-3 hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                  {a.type}
                </span>
                <p className="text-sm mt-1">{a.description}</p>
              </div>
              <span className="text-xs text-gray-500">
                {formatTimeAgo(a.timestamp)}
              </span>
            </div>
            {a.amount && (
              <p className="text-sm font-medium mt-1">{a.amount}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseEventToActivity(event: any): Activity {
  const eventName = event.type.split("::").pop();
  const data = event.parsedJson;

  return {
    digest: event.id.txDigest,
    type: eventName,
    description: formatEventDescription(eventName, data),
    timestamp: Number(event.timestampMs),
    amount: data.amount ? `${Number(data.amount) / 1e9} SUI` : undefined,
  };
}
```

### Step 5: Portfolio Tracker Component

```typescript
// src/components/Portfolio.tsx
import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

function Portfolio() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [portfolio, setPortfolio] = useState([]);
  const [totalUsd, setTotalUsd] = useState(0);

  useEffect(() => {
    if (!account) return;

    getPortfolio(account.address).then(async (tokens) => {
      // Enrich with USD values
      const enriched = await Promise.all(
        tokens.map(async (t) => {
          const priceUsd = await getTokenPriceUsd(t.coinType);
          const valueUsd = Number(t.formattedBalance) * priceUsd;
          return { ...t, priceUsd, valueUsd };
        }),
      );

      const total = enriched.reduce((sum, t) => sum + t.valueUsd, 0);
      setPortfolio(enriched.sort((a, b) => b.valueUsd - a.valueUsd));
      setTotalUsd(total);
    });
  }, [account]);

  if (!account) return <p>Connect wallet to view portfolio</p>;

  const pieData = portfolio.map((t) => ({
    name: t.symbol,
    value: t.valueUsd,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold">Portfolio Value</h3>
        <p className="text-3xl font-bold mt-2">
          ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Token Balances</h3>
        <div className="space-y-3">
          {portfolio.map((token, i) => (
            <div key={token.coinType} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="font-medium">{token.symbol}</span>
              </div>
              <div className="text-right">
                <p className="font-medium">{token.formattedBalance}</p>
                <p className="text-sm text-gray-500">${token.valueUsd.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 6: Dashboard Layout

```typescript
// src/pages/Dashboard.tsx
import { TVLChart } from "../components/TVLChart";
import { VolumeChart } from "../components/VolumeChart";
import { ActivityFeed } from "../components/ActivityFeed";
import { Portfolio } from "../components/Portfolio";

function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Analytics Dashboard</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <MetricCard title="Total Value Locked" value="$12.4M" change="+5.2%" />
        <MetricCard title="24h Volume" value="$1.8M" change="+12.1%" />
        <MetricCard title="Active Users (24h)" value="3,421" change="-2.3%" />
        <MetricCard title="Total Transactions" value="142,891" change="+8.7%" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <TVLChart poolIds={POOL_IDS} />
        <VolumeChart events={recentEvents} />
      </div>

      {/* Portfolio and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Portfolio />
        </div>
        <ActivityFeed packageId={PACKAGE_ID} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, change }: {
  title: string;
  value: string;
  change: string;
}) {
  const isPositive = change.startsWith("+");
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className={`text-sm mt-1 ${isPositive ? "text-green-600" : "text-red-600"}`}>
        {change}
      </p>
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS cache RPC responses** — GraphQL and RPC calls should be cached with appropriate TTLs to avoid rate limiting
2. **ALWAYS paginate large queries** — never try to fetch all transactions or events in a single query; use cursor-based pagination
3. **ALWAYS handle loading and error states** in every chart component — show skeletons during load, graceful error messages on failure
4. **NEVER trust client-side calculations for financial displays** — verify portfolio values server-side; client-side price feeds can be stale
5. **ALWAYS use `ResponsiveContainer`** from Recharts — dashboards must work on mobile and desktop
6. **ALWAYS normalize token amounts by decimals** — display human-readable amounts, not raw MIST/smallest-unit values
7. **ALWAYS include links to explorer** for every transaction and object — users must be able to verify data independently
8. **ALWAYS set reasonable polling intervals** for real-time data — 2-5 seconds for activity feeds, 30-60 seconds for metrics

## References

- `skills/build/build-data-pipeline/SKILL.md` — Event indexing and data aggregation
- `skills/build/build-notification/SKILL.md` — Real-time event subscriptions
- `skills/build/integrate-dapp-kit/SKILL.md` — dApp Kit for wallet integration
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
