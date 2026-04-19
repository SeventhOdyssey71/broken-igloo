---
name: build-neobank
description: "Build a neobank on Sui. Full architecture: zkLogin onboarding, stablecoin base currency, send/receive with contacts, FX via DEX aggregator, savings via lending protocols, transaction history, push notifications, card integration, compliance layer. Triggers: neobank, digital bank, banking app, fintech app, send money, payment app, sui bank, sui fintech, banking dapp, mobile banking"
---

```bash
# Telemetry preamble
SKILL_NAME="build-neobank"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui neobank architect. Your job is to guide users through building a full-featured digital banking application on Sui — where users interact with stablecoins as their primary currency, send/receive money, earn savings yield, exchange currencies, and view their transaction history, all without knowing they are using a blockchain.

The key principle: **the blockchain is invisible**. Users sign up with Google/Apple (zkLogin), see balances in USD/EUR, tap "Send" to a contact, and earn 5% APY in a savings account. Under the hood, Sui handles settlement, DeFi protocols handle yield, and PTBs compose everything in single transactions.

Full architecture:

```
┌──────────────────────────────────────────────────────────────┐
│                     NEOBANK MOBILE APP                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Home /    │  │  Send /   │  │ Savings  │  │ Settings │    │
│  │ Balance   │  │  Receive  │  │ (Yield)  │  │ (KYC)    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │ API calls
┌──────────────────────────▼───────────────────────────────────┐
│                     BACKEND API                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Auth      │  │  TX      │  │ Event    │  │ Compliance│    │
│  │ (zkLogin) │  │ Builder  │  │ Indexer  │  │ (KYC)     │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │ Transactions
┌──────────────────────────▼───────────────────────────────────┐
│                     SUI BLOCKCHAIN                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ USDC     │  │  7K / DEX│  │ Suilend / │  │ Custom   │    │
│  │ Balance  │  │  (FX)    │  │ Scallop   │  │ Contracts│    │
│  └──────────┘  └──────────┘  │ (Savings) │  └──────────┘    │
│                              └──────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

## Workflow

### Step 1: User Onboarding with zkLogin

Users sign up with their Google/Apple account. No seed phrases, no wallet apps, no gas tokens.

```typescript
// src/services/auth.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness, getExtendedEphemeralPublicKey } from "@mysten/zklogin";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Step 1: Generate ephemeral keypair and nonce
async function initiateZkLogin(): Promise<{
  nonce: string;
  ephemeralKeypair: Ed25519Keypair;
  randomness: string;
  maxEpoch: number;
}> {
  const ephemeralKeypair = new Ed25519Keypair();
  const randomness = generateRandomness();

  // Get current epoch from Sui
  const { epoch } = await client.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 10; // Valid for 10 epochs (~10 days)

  const nonce = generateNonce(
    ephemeralKeypair.getPublicKey(),
    maxEpoch,
    randomness,
  );

  return { nonce, ephemeralKeypair, randomness, maxEpoch };
}

// Step 2: Build OAuth URL (Google example)
function buildGoogleAuthUrl(nonce: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/auth/callback`,
    response_type: "id_token",
    scope: "openid email",
    nonce: nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Step 3: Complete zkLogin after OAuth callback
async function completeZkLogin(
  jwtToken: string,
  ephemeralKeypair: Ed25519Keypair,
  randomness: string,
  maxEpoch: number,
): Promise<{ address: string; zkProof: any }> {
  // Get the extended ephemeral public key
  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
    ephemeralKeypair.getPublicKey(),
  );

  // Request ZK proof from the prover service
  const zkProof = await fetch("https://prover.mystenlabs.com/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt: jwtToken,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness: randomness,
      salt: generateUserSalt(jwtToken), // Deterministic salt from JWT sub claim
      keyClaimName: "sub",
    }),
  }).then((r) => r.json());

  // Derive the Sui address
  const address = computeZkLoginAddress({
    claimName: "sub",
    claimValue: extractSubFromJwt(jwtToken),
    iss: extractIssFromJwt(jwtToken),
    userSalt: generateUserSalt(jwtToken),
  });

  return { address, zkProof };
}
```

### Step 2: Account Model

```typescript
// src/services/account.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Database schema for user accounts
// prisma/schema.prisma additions:
/*
model NeoAccount {
  id              String   @id @default(uuid())
  suiAddress      String   @unique
  email           String   @unique
  displayName     String
  kycStatus       String   @default("pending") // pending, basic, verified, accredited
  baseCurrency    String   @default("USD")
  createdAt       DateTime @default(now())
  contacts        Contact[]
  savingsEnabled  Boolean  @default(false)
}

model Contact {
  id          String @id @default(uuid())
  accountId   String
  account     NeoAccount @relation(fields: [accountId], references: [id])
  name        String
  email       String?
  suiAddress  String?
  phone       String?
}
*/

async function createAccount(
  suiAddress: string,
  email: string,
  displayName: string,
) {
  return prisma.neoAccount.create({
    data: {
      suiAddress,
      email,
      displayName,
      baseCurrency: "USD",
    },
  });
}

// Get account balance (aggregates all stablecoin holdings)
async function getAccountBalance(suiAddress: string): Promise<{
  available: number;
  savings: number;
  total: number;
  currency: string;
}> {
  const client = getSuiClient();

  // USDC balance (available spending)
  const usdcBalance = await client.getBalance({
    owner: suiAddress,
    coinType: USDC_TYPE,
  });

  // Savings balance (deposited in lending protocol)
  const savingsBalance = await getSavingsBalance(suiAddress);

  const available = Number(BigInt(usdcBalance.totalBalance)) / 1e6;
  const savings = savingsBalance / 1e6;

  return {
    available,
    savings,
    total: available + savings,
    currency: "USD",
  };
}
```

### Step 3: Send Money

```typescript
// src/services/transfer.ts
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";

const USDC_TYPE = "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN"; // USDC on Sui

// Send stablecoins to another user (by email, phone, or address)
async function sendMoney(
  senderAddress: string,
  recipient: { email?: string; phone?: string; address?: string },
  amountUsd: number,
  note?: string,
): Promise<{ txDigest: string; amount: number }> {
  // Resolve recipient to Sui address
  let recipientAddress: string;
  if (recipient.address) {
    recipientAddress = recipient.address;
  } else if (recipient.email) {
    const account = await prisma.neoAccount.findUnique({
      where: { email: recipient.email },
    });
    if (!account) throw new Error("Recipient not found. Send them an invite!");
    recipientAddress = account.suiAddress;
  } else {
    throw new Error("Recipient address or email required");
  }

  // Convert USD to USDC units (6 decimals)
  const amountInSmallestUnit = BigInt(Math.round(amountUsd * 1e6));

  // Build the transaction
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Get sender's USDC coins
  const coins = await client.getCoins({
    owner: senderAddress,
    coinType: USDC_TYPE,
  });

  if (coins.data.length === 0) {
    throw new Error("Insufficient USDC balance");
  }

  // Merge coins if needed, then split the exact amount
  if (coins.data.length > 1) {
    const primaryCoin = tx.object(coins.data[0].coinObjectId);
    const otherCoins = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
    tx.mergeCoins(primaryCoin, otherCoins);
  }

  const [sendCoin] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [
    tx.pure.u64(amountInSmallestUnit),
  ]);

  tx.transferObjects([sendCoin], tx.pure.address(recipientAddress));

  // Sponsor the transaction (user pays no gas)
  const { sponsoredTxBytes, sponsorSignature } = await sponsorTransaction(
    await tx.build({ client }),
    senderAddress,
  );

  // Return to frontend for user signature (biometric/zkLogin)
  return {
    txBytes: sponsoredTxBytes,
    sponsorSignature,
    amount: amountUsd,
    recipient: recipientAddress,
  };
}

// Request money (generates a payment link)
async function requestMoney(
  requesterAddress: string,
  amountUsd: number,
  note: string,
): Promise<string> {
  const requestId = crypto.randomUUID();

  await prisma.paymentRequest.create({
    data: {
      id: requestId,
      requesterAddress,
      amount: amountUsd,
      note,
      status: "pending",
    },
  });

  return `${APP_URL}/pay/${requestId}`;
}
```

### Step 4: Currency Exchange (FX) via DEX

```typescript
// src/services/exchange.ts
import { Transaction } from "@mysten/sui/transactions";

// Exchange between stablecoins or fiat-pegged tokens
// Uses 7K aggregator for best rates
async function exchangeCurrency(
  senderAddress: string,
  fromCurrency: string, // "USD", "EUR", "SUI"
  toCurrency: string,
  amount: number,
): Promise<{ rate: number; outputAmount: number; txBytes: Uint8Array }> {
  const fromCoinType = getCoinTypeForCurrency(fromCurrency);
  const toCoinType = getCoinTypeForCurrency(toCurrency);
  const fromDecimals = getDecimalsForCurrency(fromCurrency);

  const inputAmount = BigInt(Math.round(amount * Math.pow(10, fromDecimals)));

  // Get quote from 7K aggregator
  const quote = await fetch("https://api.7k.ag/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenIn: fromCoinType,
      tokenOut: toCoinType,
      amountIn: inputAmount.toString(),
      slippage: 0.5, // 0.5% max slippage
    }),
  }).then((r) => r.json());

  const outputAmount = Number(quote.amountOut) / Math.pow(10, getDecimalsForCurrency(toCurrency));
  const rate = outputAmount / amount;

  // Build swap transaction
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Get input coins
  const coins = await client.getCoins({ owner: senderAddress, coinType: fromCoinType });
  const [inputCoin] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [
    tx.pure.u64(inputAmount),
  ]);

  // Execute swap via 7K
  // (Actual 7K SDK integration would go here)
  tx.moveCall({
    target: quote.moveCallTarget,
    arguments: quote.moveCallArguments.map((arg) => {
      if (arg.type === "object") return tx.object(arg.value);
      if (arg.type === "pure") return tx.pure(arg.value, arg.valueType);
      return inputCoin; // for the input coin argument
    }),
  });

  return {
    rate,
    outputAmount,
    txBytes: await tx.build({ client }),
  };
}

function getCoinTypeForCurrency(currency: string): string {
  const map: Record<string, string> = {
    USD: USDC_TYPE,
    EUR: EURC_TYPE, // If available on Sui
    SUI: "0x2::sui::SUI",
  };
  return map[currency] || USDC_TYPE;
}
```

### Step 5: Savings Account (Lending Protocol Integration)

```typescript
// src/services/savings.ts
import { Transaction } from "@mysten/sui/transactions";

// Suilend integration for savings yield
const SUILEND_PACKAGE = "0x..."; // Suilend package ID
const SUILEND_MARKET = "0x..."; // Suilend USDC market object

// Deposit into savings (Suilend USDC supply)
async function depositToSavings(
  senderAddress: string,
  amountUsd: number,
): Promise<Uint8Array> {
  const amountSmallest = BigInt(Math.round(amountUsd * 1e6));

  const tx = new Transaction();
  tx.setSender(senderAddress);

  const coins = await client.getCoins({ owner: senderAddress, coinType: USDC_TYPE });
  const [depositCoin] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [
    tx.pure.u64(amountSmallest),
  ]);

  // Deposit into Suilend
  tx.moveCall({
    target: `${SUILEND_PACKAGE}::lending::deposit`,
    arguments: [
      tx.object(SUILEND_MARKET),
      depositCoin,
      tx.object("0x6"), // Clock
    ],
  });

  return tx.build({ client });
}

// Withdraw from savings
async function withdrawFromSavings(
  senderAddress: string,
  amountUsd: number,
): Promise<Uint8Array> {
  const amountSmallest = BigInt(Math.round(amountUsd * 1e6));

  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Get the user's supply receipt/share token from Suilend
  const supplyTokens = await client.getCoins({
    owner: senderAddress,
    coinType: SUILEND_USDC_SUPPLY_TYPE,
  });

  // Withdraw from Suilend — returns USDC
  tx.moveCall({
    target: `${SUILEND_PACKAGE}::lending::withdraw`,
    arguments: [
      tx.object(SUILEND_MARKET),
      tx.object(supplyTokens.data[0].coinObjectId),
      tx.pure.u64(amountSmallest),
      tx.object("0x6"),
    ],
  });

  return tx.build({ client });
}

// Get current savings balance and APY
async function getSavingsInfo(suiAddress: string): Promise<{
  balance: number;
  apy: number;
  earnedThisMonth: number;
}> {
  // Fetch supply token balance from Suilend
  const supplyTokens = await client.getBalance({
    owner: suiAddress,
    coinType: SUILEND_USDC_SUPPLY_TYPE,
  });

  // Get current exchange rate (supply token -> USDC)
  const market = await client.getObject({
    id: SUILEND_MARKET,
    options: { showContent: true },
  });
  const exchangeRate = Number(market.data?.content?.fields?.exchange_rate) || 1;

  const balance = Number(BigInt(supplyTokens.totalBalance)) * exchangeRate / 1e6;
  const apy = 5.2; // Fetch from Suilend API

  return {
    balance,
    apy,
    earnedThisMonth: balance * (apy / 100 / 12), // Simplified
  };
}
```

### Step 6: Transaction History

```typescript
// src/services/history.ts

interface TransactionRecord {
  id: string;
  type: "send" | "receive" | "exchange" | "deposit" | "withdraw";
  amount: number;
  currency: string;
  counterparty?: string;
  note?: string;
  timestamp: number;
  txDigest: string;
  status: "confirmed" | "pending";
}

async function getTransactionHistory(
  suiAddress: string,
  limit = 50,
  offset = 0,
): Promise<TransactionRecord[]> {
  // Query from indexed database (not directly from chain — too slow)
  const records = await prisma.transactionRecord.findMany({
    where: { OR: [{ senderAddress: suiAddress }, { recipientAddress: suiAddress }] },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

  return records.map((r) => ({
    id: r.id,
    type: r.senderAddress === suiAddress ? "send" : "receive",
    amount: r.amount,
    currency: r.currency,
    counterparty: r.senderAddress === suiAddress
      ? r.recipientName || r.recipientAddress
      : r.senderName || r.senderAddress,
    note: r.note,
    timestamp: r.timestamp.getTime(),
    txDigest: r.txDigest,
    status: "confirmed",
  }));
}

// Event indexer that builds the transaction history
async function indexTransferEvents() {
  const poller = new EventPoller(client, 2000);

  poller.on("0x2::coin::CoinBalanceChange", async (event) => {
    const { owner, coinType, amount } = event.parsedJson;

    // Only index USDC transfers for our users
    if (coinType !== USDC_TYPE) return;

    const user = await prisma.neoAccount.findUnique({
      where: { suiAddress: owner },
    });
    if (!user) return; // Not our user

    await prisma.transactionRecord.create({
      data: {
        txDigest: event.id.txDigest,
        senderAddress: event.parsedJson.sender,
        recipientAddress: owner,
        amount: Math.abs(Number(amount)) / 1e6,
        currency: "USD",
        timestamp: new Date(Number(event.timestampMs)),
      },
    });
  });

  poller.start("0x2");
}
```

### Step 7: Mobile App Screens (React Native)

```typescript
// screens/HomeScreen.tsx
function HomeScreen() {
  const { account } = useAuth();
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.getBalance(account.address).then(setBalance);
    api.getTransactionHistory(account.address, 10).then(setHistory);
  }, [account]);

  return (
    <View style={styles.container}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>
          ${balance?.available.toFixed(2)}
        </Text>
        <View style={styles.savingsRow}>
          <Text style={styles.savingsLabel}>Savings</Text>
          <Text style={styles.savingsAmount}>
            ${balance?.savings.toFixed(2)} ({balance?.savingsApy}% APY)
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actions}>
        <ActionButton icon="send" label="Send" onPress={() => navigate("Send")} />
        <ActionButton icon="request" label="Request" onPress={() => navigate("Request")} />
        <ActionButton icon="savings" label="Savings" onPress={() => navigate("Savings")} />
        <ActionButton icon="exchange" label="Exchange" onPress={() => navigate("Exchange")} />
      </View>

      {/* Recent Transactions */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <FlatList
        data={history}
        renderItem={({ item }) => (
          <TransactionRow
            type={item.type}
            amount={item.amount}
            counterparty={item.counterparty}
            timestamp={item.timestamp}
          />
        )}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}
```

### Step 8: Compliance Layer

```typescript
// src/services/compliance.ts

// KYC tiers determine what users can do
const KYC_LIMITS = {
  none: { dailySend: 0, dailyExchange: 0, savings: false },
  basic: { dailySend: 1000, dailyExchange: 500, savings: true },
  verified: { dailySend: 50000, dailyExchange: 25000, savings: true },
  accredited: { dailySend: Infinity, dailyExchange: Infinity, savings: true },
};

async function checkTransactionCompliance(
  senderAddress: string,
  amount: number,
  type: "send" | "exchange",
): Promise<{ allowed: boolean; reason?: string }> {
  const account = await prisma.neoAccount.findUnique({
    where: { suiAddress: senderAddress },
  });

  if (!account) return { allowed: false, reason: "Account not found" };

  const limits = KYC_LIMITS[account.kycStatus];
  const limitKey = type === "send" ? "dailySend" : "dailyExchange";

  // Check daily limits
  const todayTotal = await prisma.transactionRecord.aggregate({
    where: {
      senderAddress,
      timestamp: { gte: startOfDay() },
      type,
    },
    _sum: { amount: true },
  });

  const currentTotal = (todayTotal._sum.amount || 0) + amount;

  if (currentTotal > limits[limitKey]) {
    return {
      allowed: false,
      reason: `Daily ${type} limit exceeded. Upgrade KYC to increase limits.`,
    };
  }

  return { allowed: true };
}
```

### Step 9: Push Notifications

```typescript
// src/services/notifications.ts
import * as admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Notify user on incoming payment
async function notifyIncomingPayment(
  recipientAddress: string,
  amount: number,
  senderName: string,
) {
  const account = await prisma.neoAccount.findUnique({
    where: { suiAddress: recipientAddress },
    include: { pushTokens: true },
  });

  if (!account?.pushTokens.length) return;

  const message = {
    notification: {
      title: "Money Received!",
      body: `${senderName} sent you $${amount.toFixed(2)}`,
    },
    data: {
      type: "incoming_payment",
      amount: amount.toString(),
      sender: senderName,
    },
  };

  for (const token of account.pushTokens) {
    await admin.messaging().send({
      ...message,
      token: token.fcmToken,
    });
  }
}
```

## Non-Negotiables

1. **zkLogin MUST be the primary auth** — no seed phrases, no wallet extensions; users sign up with Google/Apple and never see a blockchain address
2. **ALL transactions MUST be gas-sponsored** — users should never need to hold SUI; the backend pays gas
3. **Stablecoins (USDC) are the base currency** — users see USD amounts, not SUI or MIST; all conversions happen transparently
4. **Transaction history MUST be indexed in a database** — querying the chain directly is too slow for a banking UX; index events into PostgreSQL
5. **KYC/AML compliance is MANDATORY** — implement tiered limits based on KYC status; partner with a KYC provider (Sumsub, Onfido)
6. **NEVER expose blockchain details** in the UI — no object IDs, no transaction digests, no gas costs visible to the user (keep them in developer/debug mode)
7. **ALWAYS implement transaction limits** — daily/weekly limits per KYC tier; this is both a compliance and security requirement
8. **Savings MUST be clearly disclosed** — show the yield source (Suilend, Scallop), current APY, and risk disclosures; never misrepresent DeFi yield as a "savings account" without disclosure
9. **ALWAYS handle edge cases** — insufficient balance, network errors, stale prices, failed transactions; a banking app must NEVER show incorrect balances

## References

- `skills/build/integrate-enoki/SKILL.md` — zkLogin and sponsored transactions
- `skills/build/integrate-suilend/SKILL.md` — Lending protocol for savings
- `skills/build/integrate-7k/SKILL.md` — DEX aggregation for currency exchange
- `skills/build/build-api/SKILL.md` — Backend API architecture
- `skills/build/build-regulated-token/SKILL.md` — Compliance token patterns
- `skills/build/build-notification/SKILL.md` — Push notification system
- `skills/build/build-mobile/SKILL.md` — Mobile app development
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
