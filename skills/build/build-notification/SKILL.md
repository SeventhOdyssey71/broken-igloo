---
name: build-notification
description: "Build notification and alerting systems for Sui dApps. Covers event monitoring, WebSocket subscriptions, push notifications, email/Telegram/Discord integration, webhook handlers, real-time alerts for on-chain activity. Triggers: notification, alert, event monitoring, websocket, push notification, telegram bot, discord bot, webhook, on-chain alerts"
---

```bash
# Telemetry preamble
SKILL_NAME="build-notification"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui notification systems architect. Your job is to help users build real-time alerting and notification pipelines that monitor on-chain events and deliver alerts through various channels — push notifications, email, Telegram, Discord, and webhooks. On Sui, all state changes emit **events** that can be subscribed to via WebSocket or polled via RPC. Your notification system bridges on-chain events to off-chain delivery channels.

Architecture:

```
┌─────────────────────┐
│   Sui Full Node      │
│   (Event Stream)     │
└──────────┬──────────┘
           │ WebSocket / Poll
┌──────────▼──────────┐
│   Event Listener     │
│   (Node.js service)  │
└──────────┬──────────┘
           │ Filter & Route
┌──────────▼──────────┐
│   Notification       │
│   Router             │
├──────────────────────┤
│ ┌──────┐ ┌────────┐ │
│ │Email │ │Telegram│ │
│ └──────┘ └────────┘ │
│ ┌──────┐ ┌────────┐ │
│ │Discord│ │Webhook│ │
│ └──────┘ └────────┘ │
│ ┌──────────────────┐ │
│ │Push Notification │ │
│ └──────────────────┘ │
└──────────────────────┘
```

## Workflow

### Step 1: Event Subscription via WebSocket

```typescript
import { SuiClient } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// Subscribe to Move events from a specific package
async function subscribeToEvents(packageId: string) {
  const unsubscribe = await client.subscribeEvent({
    filter: {
      Package: packageId,
    },
    onMessage: (event) => {
      console.log("Event received:", event.type);
      console.log("Data:", event.parsedJson);
      console.log("Timestamp:", event.timestampMs);

      // Route to notification handlers
      routeNotification(event);
    },
  });

  // Keep alive — unsubscribe when done
  process.on("SIGINT", () => {
    unsubscribe();
    process.exit(0);
  });
}

// Subscribe to specific event types
async function subscribeToSwapEvents(poolPackage: string) {
  await client.subscribeEvent({
    filter: {
      MoveEventType: `${poolPackage}::pool::SwapEvent`,
    },
    onMessage: (event) => {
      const { amount_in, amount_out, token_in, token_out } = event.parsedJson;
      handleSwapAlert({ amount_in, amount_out, token_in, token_out, timestamp: event.timestampMs });
    },
  });
}

// Subscribe to transaction effects on a specific object
async function subscribeToObjectChanges(objectId: string) {
  await client.subscribeTransaction({
    filter: {
      ChangedObject: objectId,
    },
    onMessage: (tx) => {
      console.log("Object changed in tx:", tx.digest);
      handleObjectChangeAlert(objectId, tx);
    },
  });
}
```

### Step 2: Polling-Based Event Listener (More Reliable)

```typescript
import { SuiClient, EventId } from "@mysten/sui/client";

class EventPoller {
  private client: SuiClient;
  private cursor: EventId | null = null;
  private running = false;
  private pollIntervalMs: number;
  private handlers: Map<string, ((event: any) => void)[]> = new Map();

  constructor(client: SuiClient, pollIntervalMs = 2000) {
    this.client = client;
    this.pollIntervalMs = pollIntervalMs;
  }

  on(eventType: string, handler: (event: any) => void) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async start(packageId: string) {
    this.running = true;
    console.log(`Polling events for package ${packageId}...`);

    while (this.running) {
      try {
        const events = await this.client.queryEvents({
          query: { Package: packageId },
          cursor: this.cursor,
          limit: 100,
          order: "ascending",
        });

        for (const event of events.data) {
          const handlers = this.handlers.get(event.type) || [];
          const wildcardHandlers = this.handlers.get("*") || [];

          for (const handler of [...handlers, ...wildcardHandlers]) {
            try {
              handler(event);
            } catch (err) {
              console.error("Handler error:", err);
            }
          }
        }

        if (events.nextCursor) {
          this.cursor = events.nextCursor;
        }

        // Save cursor for crash recovery
        await saveCursor(this.cursor);

      } catch (err) {
        console.error("Poll error:", err);
      }

      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  stop() {
    this.running = false;
  }
}

// Usage
const poller = new EventPoller(client, 2000);

poller.on(`${PACKAGE_ID}::pool::SwapEvent`, (event) => {
  sendTelegramAlert(`Swap: ${event.parsedJson.amount_in} -> ${event.parsedJson.amount_out}`);
});

poller.on(`${PACKAGE_ID}::pool::LiquidityAdded`, (event) => {
  sendDiscordAlert(`Liquidity added: ${event.parsedJson.amount}`);
});

poller.on("*", (event) => {
  logToDatabase(event);
});

poller.start(PACKAGE_ID);
```

### Step 3: Telegram Bot Integration

```typescript
import TelegramBot from "node-telegram-bot-api";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });

// Store chat IDs of subscribers
const subscribers = new Map<string, Set<string>>(); // address -> chatIds

// /subscribe command
bot.onText(/\/subscribe (.+)/, (msg, match) => {
  const chatId = msg.chat.id.toString();
  const address = match![1];

  if (!subscribers.has(address)) {
    subscribers.set(address, new Set());
  }
  subscribers.get(address)!.add(chatId);

  bot.sendMessage(chatId, `Subscribed to alerts for ${address.slice(0, 10)}...`);
});

// /unsubscribe command
bot.onText(/\/unsubscribe (.+)/, (msg, match) => {
  const chatId = msg.chat.id.toString();
  const address = match![1];

  subscribers.get(address)?.delete(chatId);
  bot.sendMessage(chatId, `Unsubscribed from alerts for ${address.slice(0, 10)}...`);
});

// Send alert to all subscribers of an address
async function sendTelegramAlert(address: string, message: string) {
  const chatIds = subscribers.get(address);
  if (!chatIds) return;

  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (err) {
      console.error(`Failed to send to ${chatId}:`, err);
    }
  }
}

// Format a swap event for Telegram
function formatSwapAlert(event: any): string {
  const { amount_in, amount_out, token_in, token_out } = event.parsedJson;
  return [
    `<b>Swap Alert</b>`,
    `${formatAmount(amount_in)} ${token_in} -> ${formatAmount(amount_out)} ${token_out}`,
    `<a href="https://suiscan.xyz/mainnet/tx/${event.id.txDigest}">View TX</a>`,
  ].join("\n");
}
```

### Step 4: Discord Webhook Integration

```typescript
async function sendDiscordWebhook(webhookUrl: string, content: {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  url?: string;
}) {
  const embed = {
    title: content.title,
    description: content.description,
    color: content.color,
    fields: content.fields,
    url: content.url,
    timestamp: new Date().toISOString(),
    footer: { text: "Sui Alert Bot" },
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// Example: Large transfer alert
async function alertLargeTransfer(event: any) {
  const { amount, sender, recipient } = event.parsedJson;
  const amountSUI = Number(amount) / 1e9;

  if (amountSUI > 10000) { // Alert on transfers > 10K SUI
    await sendDiscordWebhook(process.env.DISCORD_WEBHOOK_URL!, {
      title: "Large Transfer Detected",
      description: `${amountSUI.toLocaleString()} SUI transferred`,
      color: 0xff0000, // Red for large amounts
      fields: [
        { name: "From", value: `\`${sender.slice(0, 10)}...\``, inline: true },
        { name: "To", value: `\`${recipient.slice(0, 10)}...\``, inline: true },
        { name: "Amount", value: `${amountSUI.toLocaleString()} SUI`, inline: true },
      ],
      url: `https://suiscan.xyz/mainnet/tx/${event.id.txDigest}`,
    });
  }
}
```

### Step 5: Email Notifications

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

async function sendEmailAlert(
  to: string,
  subject: string,
  htmlContent: string,
) {
  await resend.emails.send({
    from: "alerts@yourdapp.com",
    to,
    subject,
    html: htmlContent,
  });
}

// Template for transaction alert email
function buildTransactionEmail(event: any): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2>Transaction Alert</h2>
      <p>Activity detected on your monitored address.</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Type</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${event.type.split("::").pop()}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>TX Digest</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            <a href="https://suiscan.xyz/mainnet/tx/${event.id.txDigest}">
              ${event.id.txDigest.slice(0, 20)}...
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Time</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${new Date(Number(event.timestampMs)).toLocaleString()}</td>
        </tr>
      </table>
    </div>
  `;
}
```

### Step 6: Webhook Delivery System

```typescript
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// Register webhooks
interface WebhookRegistration {
  id: string;
  url: string;
  secret: string;
  eventTypes: string[];
  address?: string;
}

const webhooks: WebhookRegistration[] = [];

// Register a new webhook endpoint
app.post("/api/webhooks/register", (req, res) => {
  const { url, eventTypes, address } = req.body;
  const secret = crypto.randomBytes(32).toString("hex");

  const registration: WebhookRegistration = {
    id: crypto.randomUUID(),
    url,
    secret,
    eventTypes,
    address,
  };

  webhooks.push(registration);
  res.json({ id: registration.id, secret }); // Client stores the secret
});

// Deliver webhook with HMAC signature
async function deliverWebhook(webhook: WebhookRegistration, payload: any) {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", webhook.secret)
    .update(body)
    .digest("hex");

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Id": webhook.id,
      },
      body,
    });

    if (!response.ok) {
      console.error(`Webhook delivery failed: ${response.status}`);
      // Queue for retry
      await queueRetry(webhook, payload);
    }
  } catch (err) {
    console.error(`Webhook delivery error:`, err);
    await queueRetry(webhook, payload);
  }
}

// Route events to registered webhooks
function routeNotification(event: any) {
  for (const webhook of webhooks) {
    if (webhook.eventTypes.includes(event.type) || webhook.eventTypes.includes("*")) {
      deliverWebhook(webhook, {
        event_type: event.type,
        data: event.parsedJson,
        tx_digest: event.id.txDigest,
        timestamp: event.timestampMs,
      });
    }
  }
}
```

### Step 7: Alert Rules Engine

```typescript
interface AlertRule {
  id: string;
  name: string;
  condition: (event: any) => boolean;
  channels: ("telegram" | "discord" | "email" | "webhook")[];
  cooldownMs: number; // Prevent alert spam
  lastFired?: number;
}

const rules: AlertRule[] = [
  {
    id: "large-swap",
    name: "Large Swap Alert",
    condition: (event) => {
      if (!event.type.includes("SwapEvent")) return false;
      const amountUsd = estimateUsdValue(event.parsedJson.amount_in, event.parsedJson.token_in);
      return amountUsd > 10_000;
    },
    channels: ["discord", "telegram"],
    cooldownMs: 60_000, // 1 minute cooldown
  },
  {
    id: "liquidation",
    name: "Liquidation Alert",
    condition: (event) => event.type.includes("LiquidationEvent"),
    channels: ["discord", "email", "telegram"],
    cooldownMs: 0, // Always alert
  },
  {
    id: "price-movement",
    name: "Price Movement > 5%",
    condition: (event) => {
      if (!event.type.includes("PriceUpdate")) return false;
      const priceChange = Math.abs(event.parsedJson.price_change_pct);
      return priceChange > 5;
    },
    channels: ["telegram", "webhook"],
    cooldownMs: 300_000, // 5 minutes
  },
];

function evaluateRules(event: any) {
  const now = Date.now();

  for (const rule of rules) {
    if (rule.lastFired && now - rule.lastFired < rule.cooldownMs) continue;

    if (rule.condition(event)) {
      rule.lastFired = now;
      dispatchAlert(rule, event);
    }
  }
}
```

## Non-Negotiables

1. **ALWAYS use polling for production** — WebSocket subscriptions can disconnect; polling with cursor persistence is more reliable
2. **ALWAYS persist the event cursor** — if your service restarts, resume from the last processed event, not from the beginning
3. **ALWAYS implement retry with backoff** for webhook delivery — external services can be temporarily unavailable
4. **NEVER store secrets (API keys, webhook secrets) in code** — use environment variables or a secret manager
5. **ALWAYS implement cooldown/rate limiting** for alerts — a sudden burst of events should not spam users with hundreds of notifications
6. **ALWAYS sign webhook payloads** with HMAC — recipients must verify the signature to prevent spoofing
7. **ALWAYS include the transaction digest** in every notification — users need a link to verify the on-chain event

## References

- `skills/build/build-api/SKILL.md` — Backend API patterns for webhook endpoints
- `skills/build/build-data-pipeline/SKILL.md` — Event indexing and data processing
- `skills/build/build-analytics-dashboard/SKILL.md` — Monitoring dashboard integration
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
