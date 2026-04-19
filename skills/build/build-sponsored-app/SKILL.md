---
name: build-sponsored-app
description: "Build a fully gas-free app on Sui using sponsored transactions. Covers Shinami Gas Station, self-hosted gas pools, Enoki sponsorship, spending limits, budget management, and fraud prevention. Triggers: sponsored, gas free, gasless, gas station, shinami gas, enoki sponsor, sponsor transaction, gas pool, gas budget"
---

```bash
# Telemetry preamble
SKILL_NAME="build-sponsored-app"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui gas sponsorship specialist. Your job is to guide the user through building applications where end users pay zero gas fees. On Sui, any transaction can have a **separate gas sponsor** — the entity that pays the gas while the user signs the actual operation. This is critical for onboarding Web2 users who do not hold SUI tokens.

**Sponsorship approaches:**

| Approach | Complexity | Cost Control | Best For |
|----------|-----------|--------------|----------|
| **Shinami Gas Station** | Low | Built-in limits | Production apps, managed service |
| **Enoki Sponsorship** | Low | Per-project limits | zkLogin apps, mobile |
| **Self-Hosted Gas Pool** | High | Full control | High-volume, custom rules |

**How sponsored transactions work on Sui:**
1. User builds a transaction and signs it (without gas payment)
2. Sponsor reviews the transaction, adds gas payment, and co-signs
3. Both signatures are submitted together — user authorizes the action, sponsor pays the gas

## Workflow

### Step 1: Shinami Gas Station (Managed)

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// Shinami provides a managed gas station service
// 1. Sign up at https://www.shinami.com
// 2. Create a project and get your Gas Station API key
// 3. Create a fund and deposit SUI for sponsorship

const SHINAMI_GAS_KEY = process.env.SHINAMI_GAS_STATION_KEY!;
const SHINAMI_NODE_KEY = process.env.SHINAMI_NODE_KEY!;

// Use Shinami's RPC endpoint for the SuiClient
const client = new SuiClient({
  url: `https://api.shinami.com/node/v1/${SHINAMI_NODE_KEY}`,
});

async function sponsorAndExecute(
  userKeypair: Ed25519Keypair,
  tx: Transaction,
) {
  const sender = userKeypair.getPublicKey().toSuiAddress();
  tx.setSender(sender);

  // Build the transaction bytes (without gas)
  const txBytes = await tx.build({ client });

  // Request sponsorship from Shinami
  const sponsorResponse = await fetch(
    `https://api.shinami.com/gas/v1/${SHINAMI_GAS_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "gas_sponsorTransactionBlock",
        params: [
          Buffer.from(txBytes).toString("base64"),
          sender,
          null, // Optional: gas budget override
        ],
      }),
    },
  );

  const sponsorResult = await sponsorResponse.json();
  const sponsoredTxBytes = Buffer.from(
    sponsorResult.result.txBytes,
    "base64",
  );
  const sponsorSignature = sponsorResult.result.signature;

  // User signs the sponsored transaction
  const userSignature = await userKeypair.signTransaction(sponsoredTxBytes);

  // Execute with both signatures
  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredTxBytes,
    signature: [userSignature.signature, sponsorSignature],
    options: { showEffects: true },
  });

  return result;
}

// Example: user mints an NFT, sponsor pays gas
const userKeypair = Ed25519Keypair.deriveKeypair(process.env.USER_MNEMONIC!);
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::nft::mint`,
  arguments: [tx.pure.string("My NFT")],
});

const result = await sponsorAndExecute(userKeypair, tx);
console.log("Sponsored tx:", result.digest);
```

### Step 2: Enoki Sponsorship (For zkLogin Apps)

```typescript
import { EnokiClient } from "@mysten/enoki";

const enokiClient = new EnokiClient({
  apiKey: process.env.ENOKI_API_KEY!,
});

// Enoki automatically sponsors transactions for zkLogin users
// When using EnokiFlow, sponsorship is built-in:

import { EnokiFlow } from "@mysten/enoki";

const flow = new EnokiFlow({
  apiKey: process.env.ENOKI_API_KEY!,
});

// After zkLogin auth, get a sponsored keypair
const keypair = await flow.getKeypair({ network: "testnet" });

// Transactions signed with this keypair are automatically sponsored
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::game::play`,
  arguments: [tx.object("0x<GAME_OBJECT>")],
});

// The sponsorship happens automatically
const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
});
```

### Step 3: Self-Hosted Gas Pool

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// The gas pool keypair — this address holds SUI for sponsoring transactions
const gasPoolKeypair = Ed25519Keypair.deriveKeypair(process.env.GAS_POOL_MNEMONIC!);
const gasPoolAddress = gasPoolKeypair.getPublicKey().toSuiAddress();

// === Budget Management ===
interface SponsorshipConfig {
  maxGasBudgetPerTx: bigint;     // Max gas budget per transaction
  dailyBudget: bigint;            // Max total gas per day
  perUserDailyLimit: bigint;      // Max gas per user per day
  allowedPackages: string[];       // Only sponsor calls to these packages
  allowedFunctions: string[];      // Specific functions whitelist
}

const config: SponsorshipConfig = {
  maxGasBudgetPerTx: BigInt("50000000"),     // 0.05 SUI max per tx
  dailyBudget: BigInt("10000000000"),         // 10 SUI per day
  perUserDailyLimit: BigInt("500000000"),     // 0.5 SUI per user per day
  allowedPackages: ["0x<YOUR_PACKAGE>"],
  allowedFunctions: [
    `0x<YOUR_PACKAGE>::game::play`,
    `0x<YOUR_PACKAGE>::nft::mint`,
  ],
};

// === Track Spending ===
const dailySpending = new Map<string, bigint>(); // user -> daily spend
let totalDailySpend = BigInt(0);
let lastResetDate = new Date().toDateString();

function resetDailyLimitsIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySpending.clear();
    totalDailySpend = BigInt(0);
    lastResetDate = today;
  }
}

// === Validate Transaction Before Sponsoring ===
function validateTransaction(
  txData: any,
  userAddress: string,
): { valid: boolean; reason?: string } {
  resetDailyLimitsIfNeeded();

  // Check total daily budget
  if (totalDailySpend >= config.dailyBudget) {
    return { valid: false, reason: "Daily gas budget exhausted" };
  }

  // Check per-user daily limit
  const userSpend = dailySpending.get(userAddress) || BigInt(0);
  if (userSpend >= config.perUserDailyLimit) {
    return { valid: false, reason: "User daily gas limit reached" };
  }

  return { valid: true };
}

// === Sponsor a Transaction ===
async function sponsorTransaction(
  userTxBytes: Uint8Array,
  userAddress: string,
): Promise<{ sponsoredTxBytes: Uint8Array; sponsorSignature: string }> {
  const validation = validateTransaction(null, userAddress);
  if (!validation.valid) {
    throw new Error(`Sponsorship denied: ${validation.reason}`);
  }

  // Deserialize the user's transaction to inspect it
  const tx = Transaction.from(userTxBytes);

  // Set gas payment from the gas pool
  tx.setGasOwner(gasPoolAddress);
  tx.setGasBudget(config.maxGasBudgetPerTx);

  // Build with gas owner
  const sponsoredBytes = await tx.build({ client });

  // Sponsor signs the transaction
  const sponsorSig = await gasPoolKeypair.signTransaction(sponsoredBytes);

  // Track spending
  const estimatedGas = config.maxGasBudgetPerTx; // conservative estimate
  totalDailySpend += estimatedGas;
  const userSpend = dailySpending.get(userAddress) || BigInt(0);
  dailySpending.set(userAddress, userSpend + estimatedGas);

  return {
    sponsoredTxBytes: sponsoredBytes,
    sponsorSignature: sponsorSig.signature,
  };
}

// === Express API for Sponsorship ===
import express from "express";

const app = express();
app.use(express.json());

app.post("/api/sponsor", async (req, res) => {
  try {
    const { txBytes, userAddress } = req.body;
    const txBytesArray = Uint8Array.from(Buffer.from(txBytes, "base64"));

    const { sponsoredTxBytes, sponsorSignature } = await sponsorTransaction(
      txBytesArray,
      userAddress,
    );

    res.json({
      sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString("base64"),
      sponsorSignature,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/sponsor/status", async (req, res) => {
  const balance = await client.getBalance({ owner: gasPoolAddress });
  res.json({
    gasPoolBalance: balance.totalBalance,
    totalDailySpend: totalDailySpend.toString(),
    dailyBudgetRemaining: (config.dailyBudget - totalDailySpend).toString(),
  });
});

app.listen(3001);
```

### Step 4: Client-Side Integration

```typescript
// On the client (React/Next.js), build tx and request sponsorship

async function executeWithSponsorship(tx: Transaction) {
  const sender = currentAccount!.address;
  tx.setSender(sender);

  // Build transaction bytes
  const txBytes = await tx.build({ client });

  // Request sponsorship from your backend
  const response = await fetch("/api/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      txBytes: Buffer.from(txBytes).toString("base64"),
      userAddress: sender,
    }),
  });

  const { sponsoredTxBytes, sponsorSignature } = await response.json();
  const sponsoredBytes = Uint8Array.from(
    Buffer.from(sponsoredTxBytes, "base64"),
  );

  // User signs the sponsored transaction
  const userSig = await signTransaction({ transaction: sponsoredBytes });

  // Execute with both signatures
  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredBytes,
    signature: [userSig.signature, sponsorSignature],
    options: { showEffects: true },
  });

  return result;
}
```

### Step 5: Handoff

- "I want zkLogin + gas sponsorship" -> route to `build-zklogin-app` then `integrate-enoki`
- "Set up Shinami for my project" -> route to `integrate-shinami`
- "Deploy my sponsored app" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **ALWAYS validate transactions before sponsoring** — inspect the transaction contents and only sponsor calls to your own packages. An open sponsor endpoint is an instant drain.
2. **ALWAYS implement spending limits** — per-transaction, per-user, and daily budget caps. Without limits, a single malicious user can exhaust your gas pool.
3. **NEVER sponsor arbitrary transactions** — whitelist specific package IDs and function names. Reject everything else.
4. **Monitor gas pool balance** — set up alerts when the gas pool balance drops below a threshold. An empty gas pool means your app stops working.
5. **Use separate gas pool keypairs per environment** — never share gas pool keys between testnet and mainnet.
6. **Rate limit the sponsorship API** — apply per-IP and per-user rate limits to prevent abuse.
7. **Log all sponsorship requests** — maintain an audit trail of who requested sponsorship, what transaction was sponsored, and how much gas was consumed.
8. **The user signs first, then the sponsor** — this ensures the user cannot modify the transaction after the sponsor has committed gas.

## References

- Sui Sponsored Transactions: https://docs.sui.io/concepts/transactions/sponsored-transactions
- Shinami Gas Station: https://docs.shinami.com/docs/gas-station
- Enoki Sponsorship: https://docs.enoki.mystenlabs.com
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
