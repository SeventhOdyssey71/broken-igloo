---
name: integrate-shinami
description: "Deep guide for integrating Shinami services (Node RPC, Gas Station, Invisible Wallets) for production Sui apps. Covers sponsored transactions, backend wallets, zkLogin integration. Triggers: shinami, gas station, sponsored transactions, invisible wallet, production rpc"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-shinami"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Shinami integration specialist. Shinami provides three core services for production Sui applications:

1. **Node Service** — Production-grade RPC with higher rate limits than public endpoints
2. **Gas Station** — Sponsor gas fees for users so they never need to hold SUI
3. **Invisible Wallets** — Backend-managed wallets that abstract away key management from users

**When to use Shinami vs Enoki:**
- **Shinami**: Best for backends that need programmatic control over wallets, custom sponsorship logic, high-throughput RPC, or enterprise SLAs. You own the infrastructure integration.
- **Enoki**: Best for frontend-first "Sign in with Google" flows. Managed zkLogin with minimal code. Less control but faster to ship.
- **Both together**: Use Enoki for auth + Shinami for RPC/gas — they complement each other.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @shinami/clients @mysten/sui
```

### Step 2: Get API Keys

1. Sign up at [https://app.shinami.com](https://app.shinami.com)
2. Create a project and get API keys for each service:
   - **Node Service key** — for RPC calls
   - **Gas Station key** — for sponsoring transactions
   - **Wallet Service key** — for invisible wallets
3. Each key is scoped to one service. Use the right key for the right client.

### Step 3: Node Service (Production RPC)

```typescript
import { createSuiClient } from "@shinami/clients";

// Create a Sui client backed by Shinami's Node Service
const suiClient = createSuiClient(process.env.SHINAMI_NODE_KEY!);

// Use it exactly like a normal SuiClient
const balance = await suiClient.getBalance({
  owner: "0x<ADDRESS>",
});

const objects = await suiClient.getOwnedObjects({
  owner: "0x<ADDRESS>",
  options: { showContent: true },
});

// Benefits over public RPC:
// - Higher rate limits (hundreds of RPS)
// - Lower latency (dedicated infrastructure)
// - Uptime SLAs for production apps
// - WebSocket support for real-time subscriptions
```

### Step 4: Gas Station — Sponsoring Transactions

The Gas Station lets your backend pay gas fees on behalf of users.

**Basic sponsored transaction flow:**

```typescript
import {
  createSuiClient,
  GasStationClient,
  buildGaslessTransaction,
} from "@shinami/clients";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = createSuiClient(process.env.SHINAMI_NODE_KEY!);
const gasStation = new GasStationClient(process.env.SHINAMI_GAS_KEY!);

async function sponsoredTransfer(
  senderAddress: string,
  objectId: string,
  recipientAddress: string
) {
  // 1. Build the transaction WITHOUT gas info
  const gaslessTx = await buildGaslessTransaction(suiClient, (tx) => {
    tx.transferObjects(
      [tx.object(objectId)],
      tx.pure.address(recipientAddress)
    );
  }, {
    sender: senderAddress,
  });

  // 2. Request sponsorship from Gas Station
  const sponsoredTx = await gasStation.sponsorTransaction(gaslessTx);

  // sponsoredTx now has gas payment filled in by Shinami
  // It needs TWO signatures: the sponsor (Shinami) and the sender
  return sponsoredTx;
}
```

**Complete dual-sign execution:**

```typescript
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

async function executeSponsored(
  senderKeypair: Ed25519Keypair,
  objectId: string,
  recipientAddress: string
) {
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

  // 1. Build gasless transaction
  const gaslessTx = await buildGaslessTransaction(suiClient, (tx) => {
    tx.transferObjects(
      [tx.object(objectId)],
      tx.pure.address(recipientAddress)
    );
  }, {
    sender: senderAddress,
  });

  // 2. Sponsor it
  const { txBytes, sponsorSignature } = await gasStation.sponsorTransaction(gaslessTx);

  // 3. Sender signs the sponsored transaction bytes
  const senderSignature = (await senderKeypair.signTransaction(txBytes)).signature;

  // 4. Execute with BOTH signatures
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [senderSignature, sponsorSignature],
    options: { showEffects: true },
  });

  console.log("Sponsored tx digest:", result.digest);
  return result;
}
```

**Gas Station budget and policies:**

```typescript
// Check remaining gas budget
const budget = await gasStation.getGasStationBudget();
console.log(`Remaining budget: ${budget.remainingBudget} MIST`);

// Gas Station policies (configured in Shinami dashboard):
// - Max gas per transaction
// - Allowlisted sender addresses
// - Allowlisted Move packages (only sponsor calls to YOUR contracts)
// - Daily/monthly budget caps
```

### Step 5: Invisible Wallets — Backend-Managed Wallets

Invisible wallets let you create and manage Sui wallets on behalf of users. The private keys are managed by Shinami's secure infrastructure — your backend never sees them.

```typescript
import { WalletClient, KeyClient } from "@shinami/clients";

const walletClient = new WalletClient(process.env.SHINAMI_WALLET_KEY!);
const keyClient = new KeyClient(process.env.SHINAMI_WALLET_KEY!);

// CREATE a new wallet for a user
async function createUserWallet(userId: string) {
  // walletId is YOUR identifier — typically the user's ID in your system
  const wallet = await keyClient.createWallet(userId);

  console.log(`Created wallet for user ${userId}`);
  console.log(`Sui address: ${wallet.address}`);

  // Store the mapping: userId -> wallet.address in your database
  return wallet;
}

// GET an existing wallet's address
async function getWalletAddress(userId: string) {
  const wallet = await keyClient.getWallet(userId);
  return wallet.address;
}
```

**Sign transactions with an invisible wallet:**

```typescript
async function signWithInvisibleWallet(
  userId: string,
  recipientAddress: string,
  amount: bigint
) {
  const walletAddress = await getWalletAddress(userId);

  // 1. Build the transaction
  const gaslessTx = await buildGaslessTransaction(suiClient, (tx) => {
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipientAddress));
  }, {
    sender: walletAddress,
  });

  // 2. Sponsor the transaction (so the invisible wallet doesn't need SUI)
  const { txBytes, sponsorSignature } = await gasStation.sponsorTransaction(gaslessTx);

  // 3. Sign with the invisible wallet (Shinami signs on your behalf)
  const walletSignature = await walletClient.signTransaction(userId, txBytes);

  // 4. Execute with both signatures
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [walletSignature, sponsorSignature],
    options: { showEffects: true },
  });

  return result;
}
```

**Wallet policies and limits:**

```typescript
// Invisible wallets support session tokens for temporary access
async function createSession(userId: string) {
  // Session tokens allow limited signing without the full wallet key
  // Configure policies in Shinami dashboard:
  // - Transaction type restrictions
  // - Spending limits per session
  // - Expiry times
  const session = await walletClient.createSession(userId);
  return session;
}
```

### Step 6: zkLogin Wallet API

Shinami also provides a zkLogin wallet service as an alternative to Enoki:

```typescript
import { ZkLoginClient } from "@shinami/clients";

const zkLoginClient = new ZkLoginClient(process.env.SHINAMI_ZKLOGIN_KEY!);

// Create a zkLogin salt for a user (deterministic address derivation)
async function getZkLoginAddress(jwt: string) {
  const { address, salt } = await zkLoginClient.getOrCreateZkLoginWallet(jwt);

  console.log(`zkLogin address: ${address}`);
  return { address, salt };
}

// Sign a transaction with zkLogin via Shinami
async function signZkLoginTx(jwt: string, txBytes: Uint8Array) {
  const signature = await zkLoginClient.signTransaction(jwt, txBytes);
  return signature;
}
```

### Step 7: Complete Production Example — Game Backend

```typescript
// server.ts — Express backend for a game using Shinami
import express from "express";
import {
  createSuiClient,
  GasStationClient,
  WalletClient,
  KeyClient,
  buildGaslessTransaction,
} from "@shinami/clients";
import { Transaction } from "@mysten/sui/transactions";

const app = express();
app.use(express.json());

// --- Shinami clients ---
const suiClient = createSuiClient(process.env.SHINAMI_NODE_KEY!);
const gasStation = new GasStationClient(process.env.SHINAMI_GAS_KEY!);
const walletClient = new WalletClient(process.env.SHINAMI_WALLET_KEY!);
const keyClient = new KeyClient(process.env.SHINAMI_WALLET_KEY!);

const GAME_PACKAGE = "0x<YOUR_GAME_PACKAGE_ID>";

// --- Create wallet on user signup ---
app.post("/api/users", async (req, res) => {
  const { userId } = req.body;

  try {
    const wallet = await keyClient.createWallet(userId);
    res.json({ address: wallet.address });
  } catch (error) {
    // Wallet may already exist
    const wallet = await keyClient.getWallet(userId);
    res.json({ address: wallet.address });
  }
});

// --- Mint game item (sponsored + invisible wallet) ---
app.post("/api/mint-item", async (req, res) => {
  const { userId, itemType } = req.body;

  const walletAddress = (await keyClient.getWallet(userId)).address;

  // Build a gasless transaction that calls your game contract
  const gaslessTx = await buildGaslessTransaction(suiClient, (tx) => {
    tx.moveCall({
      target: `${GAME_PACKAGE}::game::mint_item`,
      arguments: [
        tx.pure.string(itemType),
        tx.pure.address(walletAddress), // mint to the user's invisible wallet
      ],
    });
  }, {
    sender: walletAddress,
  });

  // Sponsor it
  const { txBytes, sponsorSignature } = await gasStation.sponsorTransaction(gaslessTx);

  // Sign with invisible wallet
  const walletSignature = await walletClient.signTransaction(userId, txBytes);

  // Execute
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [walletSignature, sponsorSignature],
    options: { showEffects: true, showObjectChanges: true },
  });

  res.json({
    digest: result.digest,
    objects: result.objectChanges,
  });
});

// --- Get user inventory ---
app.get("/api/inventory/:userId", async (req, res) => {
  const walletAddress = (await keyClient.getWallet(req.params.userId)).address;

  const objects = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { Package: GAME_PACKAGE },
    options: { showContent: true, showDisplay: true },
  });

  res.json(objects.data);
});

// --- Check Gas Station budget ---
app.get("/api/admin/gas-budget", async (req, res) => {
  const budget = await gasStation.getGasStationBudget();
  res.json(budget);
});

app.listen(3001, () => console.log("Game server on :3001"));
```

### Rate Limits and Pricing

| Service | Free Tier | Growth | Enterprise |
|---------|-----------|--------|------------|
| Node RPC | 50 req/s | 200 req/s | Custom |
| Gas Station | 100 sponsored tx/day | 10,000/day | Custom |
| Invisible Wallets | 100 wallets | 10,000 wallets | Custom |

- Gas Station requires a funded gas budget (you deposit SUI)
- Node Service is billed by request volume
- Check [shinami.com/pricing](https://shinami.com/pricing) for current rates

## Non-Negotiables

1. **NEVER expose Shinami API keys client-side** — ALL Shinami API calls must happen on your backend. Every key is a secret key.
2. **ALWAYS use the correct key for each service** — Node key for RPC, Gas key for sponsorship, Wallet key for wallets. They are NOT interchangeable.
3. **ALWAYS use `buildGaslessTransaction`** to construct transactions for sponsorship — do NOT manually set gas fields
4. **ALWAYS include BOTH signatures** when executing sponsored transactions — the sponsor signature from Shinami AND the sender signature
5. **ALWAYS set Gas Station policies** — allowlist your package IDs and set budget caps to prevent abuse
6. **ALWAYS store the userId-to-walletAddress mapping** in your database — the walletId in Shinami is your userId, but you need the address for on-chain lookups
7. **NEVER let users directly call Shinami APIs** — your backend is the gatekeeper that validates user actions before signing/sponsoring
8. **ALWAYS monitor your Gas Station budget** — set up alerts before it runs dry, or your users' transactions will start failing

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
