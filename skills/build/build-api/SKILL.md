---
name: build-api
description: "Build a backend API for a Sui dApp. Covers Express/Fastify server setup with Sui SDK, transaction building endpoints, sponsored transaction flow, webhook handlers, database integration, authentication with Sui signatures, caching strategies. Triggers: backend api, build api, sui api, express sui, fastify sui, server backend, webhook, dapp backend, transaction endpoint"
---

```bash
# Telemetry preamble
SKILL_NAME="build-api"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui dApp backend architect. Your job is to guide the user through building a production-quality backend API that interfaces with the Sui blockchain. The backend handles transaction construction, sponsored transactions, event indexing, user authentication via Sui signatures, and database persistence for off-chain state.

Architecture:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend        │────>│   Backend API     │────>│  Sui Network  │
│   (React/Next)    │<────│   (Express/       │<────│  (Full Node)  │
│                   │     │    Fastify)        │     │               │
└──────────────────┘     └────────┬───────────┘     └──────────────┘
                                  │
                         ┌────────▼───────────┐
                         │   Database          │
                         │   (PostgreSQL /     │
                         │    Redis cache)     │
                         └────────────────────┘
```

Key responsibilities of the backend:
- **Transaction building**: Construct complex PTBs server-side, send serialized bytes to frontend for signing
- **Sponsored transactions**: Pay gas on behalf of users using a server-held sponsor keypair
- **Event processing**: Index on-chain events into a queryable database
- **Authentication**: Verify Sui wallet signatures for API access
- **Caching**: Cache on-chain reads to reduce RPC calls

## Workflow

### Step 1: Project Setup

```bash
mkdir sui-dapp-api && cd sui-dapp-api
npm init -y

# Core dependencies
npm i express cors helmet dotenv
npm i @mysten/sui zod

# Database
npm i prisma @prisma/client
npx prisma init

# Redis cache (optional)
npm i ioredis

# TypeScript
npm i -D typescript @types/express @types/cors @types/node tsx
npx tsc --init --target es2022 --module nodenext --moduleResolution nodenext \
  --outDir dist --rootDir src --strict true
```

**Project structure:**

```
src/
  index.ts              # Server entry point
  config.ts             # Environment config
  routes/
    transactions.ts     # Transaction building endpoints
    users.ts            # User auth and profile
    webhooks.ts         # Webhook handlers
  services/
    sui.ts              # Sui client and transaction helpers
    sponsor.ts          # Sponsored transaction logic
    auth.ts             # Signature verification
    cache.ts            # Redis cache layer
  middleware/
    auth.ts             # Auth middleware
    rateLimiter.ts      # Rate limiting
    errorHandler.ts     # Global error handler
  workers/
    eventIndexer.ts     # Background event polling
prisma/
  schema.prisma         # Database schema
```

### Step 2: Sui Client Service

```typescript
// src/services/sui.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { config } from "../config.js";

// Singleton Sui client
let suiClient: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!suiClient) {
    suiClient = new SuiClient({
      url: config.SUI_RPC_URL || getFullnodeUrl(config.SUI_NETWORK),
    });
  }
  return suiClient;
}

// Server-side keypair for sponsored transactions and admin operations
let serverKeypair: Ed25519Keypair | null = null;

export function getServerKeypair(): Ed25519Keypair {
  if (!serverKeypair) {
    serverKeypair = Ed25519Keypair.deriveKeypair(config.SERVER_MNEMONIC);
  }
  return serverKeypair;
}

// Build a transaction for a swap operation
export async function buildSwapTransaction(params: {
  senderAddress: string;
  coinObjectId: string;
  amountIn: bigint;
  minAmountOut: bigint;
  poolId: string;
}): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(params.senderAddress);

  const [inputCoin] = tx.splitCoins(tx.object(params.coinObjectId), [
    tx.pure.u64(params.amountIn),
  ]);

  tx.moveCall({
    target: `${config.PACKAGE_ID}::pool::swap`,
    arguments: [
      tx.object(params.poolId),
      inputCoin,
      tx.pure.u64(params.minAmountOut),
      tx.object("0x6"), // Clock
    ],
  });

  // Serialize for frontend signing
  const client = getSuiClient();
  const bytes = await tx.build({ client });
  return bytes;
}

// Execute a server-signed transaction
export async function executeServerTransaction(
  tx: Transaction,
): Promise<string> {
  const client = getSuiClient();
  const keypair = getServerKeypair();

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status.status !== "success") {
    throw new Error(`Transaction failed: ${result.effects?.status.error}`);
  }

  return result.digest;
}
```

### Step 3: Sponsored Transaction Service

```typescript
// src/services/sponsor.ts
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getSuiClient, getServerKeypair } from "./sui.js";

export async function sponsorTransaction(
  txBytes: Uint8Array,
  senderAddress: string,
): Promise<{ sponsoredTxBytes: Uint8Array; sponsorSignature: string }> {
  const client = getSuiClient();
  const sponsor = getServerKeypair();

  // Deserialize the transaction
  const tx = Transaction.from(txBytes);

  // Set the gas owner to the sponsor
  tx.setSender(senderAddress);
  tx.setGasOwner(sponsor.toSuiAddress());

  // Set gas budget
  tx.setGasBudget(50_000_000n); // 0.05 SUI max gas

  // Build with sponsor as gas owner
  const builtBytes = await tx.build({ client });

  // Sponsor signs the transaction
  const { signature: sponsorSignature } = await sponsor.signTransaction(builtBytes);

  return {
    sponsoredTxBytes: builtBytes,
    sponsorSignature,
  };
}

// Execute a dual-signed transaction (user + sponsor)
export async function executeSponsored(
  txBytes: Uint8Array,
  userSignature: string,
  sponsorSignature: string,
): Promise<string> {
  const client = getSuiClient();

  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSignature, sponsorSignature],
    options: { showEffects: true },
  });

  return result.digest;
}
```

### Step 4: Authentication with Sui Signatures

```typescript
// src/services/auth.ts
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

// Generate a challenge message for the user to sign
export function generateChallenge(address: string): string {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  return JSON.stringify({
    message: "Sign in to MyDApp",
    address,
    nonce,
    timestamp,
    expiresAt: timestamp + 300_000, // 5 minutes
  });
}

// Verify the signed challenge and issue a JWT
export async function verifySignInAndIssueToken(
  message: string,
  signature: string,
  expectedAddress: string,
): Promise<string> {
  // Parse and validate the challenge
  const challenge = JSON.parse(message);

  if (challenge.address !== expectedAddress) {
    throw new Error("Address mismatch");
  }

  if (Date.now() > challenge.expiresAt) {
    throw new Error("Challenge expired");
  }

  // Verify the signature
  const messageBytes = new TextEncoder().encode(message);
  const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);

  if (publicKey.toSuiAddress() !== expectedAddress) {
    throw new Error("Signature does not match address");
  }

  // Issue JWT
  const token = jwt.sign(
    { address: expectedAddress, iat: Math.floor(Date.now() / 1000) },
    config.JWT_SECRET,
    { expiresIn: "24h" },
  );

  return token;
}

// Middleware to verify JWT
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = { address: decoded.address };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid auth token" });
  }
}
```

### Step 5: API Routes

```typescript
// src/routes/transactions.ts
import { Router } from "express";
import { z } from "zod";
import { buildSwapTransaction } from "../services/sui.js";
import { sponsorTransaction, executeSponsored } from "../services/sponsor.js";
import { authMiddleware } from "../services/auth.js";

const router = Router();

// Build a swap transaction (user will sign on frontend)
const SwapSchema = z.object({
  coinObjectId: z.string(),
  amountIn: z.string().transform(BigInt),
  minAmountOut: z.string().transform(BigInt),
  poolId: z.string(),
});

router.post("/build-swap", authMiddleware, async (req, res) => {
  try {
    const params = SwapSchema.parse(req.body);
    const txBytes = await buildSwapTransaction({
      senderAddress: req.user.address,
      ...params,
    });

    res.json({
      txBytes: Buffer.from(txBytes).toString("base64"),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sponsor a transaction
const SponsorSchema = z.object({
  txBytes: z.string(), // base64 encoded
});

router.post("/sponsor", authMiddleware, async (req, res) => {
  try {
    const { txBytes } = SponsorSchema.parse(req.body);
    const decodedBytes = new Uint8Array(Buffer.from(txBytes, "base64"));

    const result = await sponsorTransaction(decodedBytes, req.user.address);

    res.json({
      sponsoredTxBytes: Buffer.from(result.sponsoredTxBytes).toString("base64"),
      sponsorSignature: result.sponsorSignature,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Execute a sponsored transaction with user + sponsor signatures
const ExecuteSchema = z.object({
  txBytes: z.string(),
  userSignature: z.string(),
  sponsorSignature: z.string(),
});

router.post("/execute-sponsored", authMiddleware, async (req, res) => {
  try {
    const { txBytes, userSignature, sponsorSignature } = ExecuteSchema.parse(req.body);
    const decodedBytes = new Uint8Array(Buffer.from(txBytes, "base64"));

    const digest = await executeSponsored(decodedBytes, userSignature, sponsorSignature);

    res.json({ digest, explorerUrl: `https://suiscan.xyz/mainnet/tx/${digest}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
```

### Step 6: Database Schema (Prisma)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String   @id @default(uuid())
  suiAddress    String   @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  transactions  Transaction[]
  preferences   UserPreference?
}

model Transaction {
  id          String   @id @default(uuid())
  digest      String   @unique
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // "swap", "deposit", "withdraw", etc.
  status      String   // "pending", "success", "failed"
  data        Json     // Transaction-specific data
  gasUsed     BigInt?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([type, status])
}

model IndexedEvent {
  id          String   @id @default(uuid())
  txDigest    String
  eventSeq    Int
  eventType   String
  packageId   String
  data        Json
  timestampMs BigInt
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@unique([txDigest, eventSeq])
  @@index([eventType, timestampMs])
  @@index([processed])
}

model UserPreference {
  id              String  @id @default(uuid())
  userId          String  @unique
  user            User    @relation(fields: [userId], references: [id])
  emailAlerts     Boolean @default(false)
  telegramChatId  String?
  webhookUrl      String?
}
```

### Step 7: Caching Layer

```typescript
// src/services/cache.ts
import Redis from "ioredis";
import { getSuiClient } from "./sui.js";
import { config } from "../config.js";

const redis = new Redis(config.REDIS_URL);

// Cache object reads with TTL
export async function getCachedObject(objectId: string, ttlSeconds = 30) {
  const cacheKey = `sui:object:${objectId}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from chain
  const client = getSuiClient();
  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  // Cache the result
  await redis.setex(cacheKey, ttlSeconds, JSON.stringify(obj));
  return obj;
}

// Cache coin balances
export async function getCachedBalance(address: string, coinType: string, ttlSeconds = 10) {
  const cacheKey = `sui:balance:${address}:${coinType}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const client = getSuiClient();
  const balance = await client.getBalance({ owner: address, coinType });

  await redis.setex(cacheKey, ttlSeconds, JSON.stringify(balance));
  return balance;
}

// Invalidate cache on state change
export async function invalidateObjectCache(objectId: string) {
  await redis.del(`sui:object:${objectId}`);
}
```

### Step 8: Server Entry Point

```typescript
// src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import transactionRoutes from "./routes/transactions.js";
import authRoutes from "./routes/auth.js";
import { startEventIndexer } from "./workers/eventIndexer.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", network: config.SUI_NETWORK });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tx", transactionRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.PORT, () => {
  console.log(`API server running on port ${config.PORT}`);
  console.log(`Sui network: ${config.SUI_NETWORK}`);

  // Start background event indexer
  startEventIndexer().catch(console.error);
});
```

### Step 9: Frontend Integration

```typescript
// Frontend: how to use the API

// Step 1: Sign in with wallet
async function signIn(wallet) {
  // Get challenge from API
  const { challenge } = await fetch("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ address: wallet.address }),
  }).then((r) => r.json());

  // Sign with wallet
  const { signature } = await wallet.signPersonalMessage({
    message: new TextEncoder().encode(challenge),
  });

  // Exchange for JWT
  const { token } = await fetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message: challenge, signature, address: wallet.address }),
  }).then((r) => r.json());

  return token;
}

// Step 2: Build and execute a sponsored transaction
async function sponsoredSwap(token, params) {
  // Build the transaction
  const { txBytes } = await fetch("/api/tx/build-swap", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

  // Get sponsorship
  const { sponsoredTxBytes, sponsorSignature } = await fetch("/api/tx/sponsor", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txBytes }),
  }).then((r) => r.json());

  // Sign with user wallet
  const { signature: userSignature } = await wallet.signTransaction({
    transaction: Uint8Array.from(atob(sponsoredTxBytes), (c) => c.charCodeAt(0)),
  });

  // Execute
  const { digest } = await fetch("/api/tx/execute-sponsored", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txBytes: sponsoredTxBytes, userSignature, sponsorSignature }),
  }).then((r) => r.json());

  return digest;
}
```

## Non-Negotiables

1. **NEVER expose private keys in API responses** — the server keypair stays server-side; only serialized transaction bytes are sent to clients
2. **ALWAYS validate all inputs with Zod** — never trust client data; validate addresses, amounts, object IDs
3. **ALWAYS use signature-based authentication** — verify Sui wallet signatures; never use address-only auth (anyone can claim an address)
4. **ALWAYS rate-limit sponsored transactions** — without limits, attackers drain your gas budget
5. **ALWAYS use HTTPS in production** — transaction bytes and signatures must not be intercepted
6. **NEVER build transactions with hardcoded gas budgets** — use dry-run to estimate, then add a buffer
7. **ALWAYS cache RPC reads** — the Sui fullnode has rate limits; cache object reads with appropriate TTLs
8. **ALWAYS emit structured logs** — include transaction digests, user addresses, and durations for debugging

## References

- `skills/build/integrate-enoki/SKILL.md` — Enoki-based sponsored transactions
- `skills/build/build-notification/SKILL.md` — Event indexing and alerting
- `skills/build/integrate-dapp-kit/SKILL.md` — Frontend integration with dApp Kit
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
