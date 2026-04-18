---
name: build-mobile
description: "Build mobile Sui dApps with React Native. Covers wallet deep linking, zkLogin for mobile, biometric signing, transaction building. Triggers: mobile app, react native, mobile dapp, ios, android"
---

```bash
# Telemetry preamble
SKILL_NAME="build-mobile"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a mobile Sui dApp architect. Your job is to guide the user through building native mobile applications that interact with the Sui blockchain using React Native. The primary recommendation for mobile is zkLogin — it eliminates the need for users to install a separate wallet app, which dramatically reduces onboarding friction.

Mobile Sui development has unique constraints: wallet apps may not be installed, deep linking must be configured per platform, biometric authentication replaces password-based signing, and network requests must handle mobile-specific connectivity issues (cell network drops, background/foreground transitions).

## Workflow

### Step 1: Determine Authentication Strategy

This is the most critical decision for mobile. Interview the user:

| Strategy                  | Best For                            | User Experience                         |
| ------------------------- | ----------------------------------- | --------------------------------------- |
| **zkLogin (recommended)** | Consumer apps, mainstream users     | Sign in with Google/Apple/Twitch — no wallet app needed |
| **Wallet deep linking**   | Crypto-native users                 | Opens Slush/Suiet app for signing       |
| **Embedded wallet**       | Full control, custodial model       | Keys managed server-side (Shinami)      |
| **Local keypair**         | Developer tools, power users        | Keys stored in device Keychain/Keystore |

**Default recommendation: zkLogin.** It removes the single biggest friction point in mobile web3 — requiring users to install and configure a wallet app.

### Step 2: React Native Project Setup

```bash
# Create a new React Native project with Expo
npx create-expo-app@latest my-sui-app --template blank-typescript
cd my-sui-app

# Install Sui SDK dependencies
npx expo install @mysten/sui @mysten/zklogin
npm install @noble/hashes @noble/curves jose

# For wallet deep linking (if not using zkLogin)
npx expo install expo-linking expo-web-browser

# For secure key storage
npx expo install expo-secure-store

# For biometric authentication
npx expo install expo-local-authentication

# Polyfills required for Sui SDK in React Native
npm install react-native-get-random-values @ethersproject/shims buffer
```

**Critical: Polyfill setup.** The Sui SDK expects Node.js globals. Create a polyfill file that imports BEFORE anything else:

```typescript
// polyfills.ts — MUST be imported first in App.tsx
import "react-native-get-random-values";
import { Buffer } from "buffer";
global.Buffer = Buffer;
```

```typescript
// App.tsx
import "./polyfills"; // MUST be first import
import { SuiClient } from "@mysten/sui/client";
// ... rest of app
```

### Step 3: zkLogin Implementation (Recommended Path)

zkLogin lets users authenticate with OAuth providers (Google, Apple, Facebook, Twitch) and maps their identity to a Sui address — no wallet app needed.

**3a. OAuth Flow Setup**

```typescript
// src/auth/zklogin.ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness, getZkLoginSignature } from "@mysten/zklogin";
import { SuiClient } from "@mysten/sui/client";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
const PROVER_URL = "https://prover.mystenlabs.com/v1";

// Step 1: Generate ephemeral keypair (stored on device)
export async function initZkLogin() {
  const ephemeralKeypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const { epoch } = await client.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2; // Valid for ~2 epochs (~48 hours)

  // Generate nonce from ephemeral pubkey
  const nonce = generateNonce(
    ephemeralKeypair.getPublicKey(),
    maxEpoch,
    randomness,
  );

  // Securely store ephemeral key material on device
  await SecureStore.setItemAsync("zklogin_ephemeral_key", ephemeralKeypair.export().privateKey);
  await SecureStore.setItemAsync("zklogin_randomness", randomness);
  await SecureStore.setItemAsync("zklogin_max_epoch", maxEpoch.toString());

  return { nonce, maxEpoch };
}

// Step 2: Open OAuth flow
export async function startOAuthFlow(nonce: string) {
  const GOOGLE_CLIENT_ID = "your-google-client-id.apps.googleusercontent.com";
  const REDIRECT_URI = "your-app-scheme://auth/callback";

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&response_type=id_token` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=openid` +
    `&nonce=${nonce}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
  if (result.type === "success") {
    const jwt = extractJwtFromUrl(result.url);
    await SecureStore.setItemAsync("zklogin_jwt", jwt);
    return jwt;
  }
  throw new Error("OAuth flow cancelled");
}

// Step 3: Get ZK proof from prover
export async function getZkProof(jwt: string) {
  const randomness = await SecureStore.getItemAsync("zklogin_randomness");
  const maxEpoch = await SecureStore.getItemAsync("zklogin_max_epoch");
  const ephKeyRaw = await SecureStore.getItemAsync("zklogin_ephemeral_key");
  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephKeyRaw!);

  const response = await fetch(PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey: ephemeralKeypair.getPublicKey().toBase64(),
      maxEpoch,
      jwtRandomness: randomness,
      salt: "your-user-salt",  // Must be deterministic per user
      keyClaimName: "sub",
    }),
  });

  return response.json();
}
```

**3b. Transaction Signing with zkLogin**

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { getZkLoginSignature } from "@mysten/zklogin";

export async function signAndExecuteWithZkLogin(tx: Transaction) {
  const ephKeyRaw = await SecureStore.getItemAsync("zklogin_ephemeral_key");
  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephKeyRaw!);

  // Build the transaction
  const txBytes = await tx.build({ client });

  // Sign with ephemeral key
  const { signature: ephSignature } = await ephemeralKeypair.signTransaction(txBytes);

  // Combine with ZK proof for final signature
  const zkSignature = getZkLoginSignature({
    inputs: zkProof,          // From getZkProof()
    maxEpoch: maxEpoch,
    userSignature: ephSignature,
  });

  // Execute
  return client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: zkSignature,
  });
}
```

### Step 4: Wallet Deep Linking (Alternative Path)

If the user targets crypto-native audiences who already have Slush or Suiet:

```typescript
// src/auth/wallet-deeplink.ts
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

const SLUSH_SCHEME = "slush://";
const SUIET_SCHEME = "suiet://";

// Check which wallets are installed
export async function detectWallets(): Promise<string[]> {
  const wallets = [];
  if (await Linking.canOpenURL(SLUSH_SCHEME)) wallets.push("slush");
  if (await Linking.canOpenURL(SUIET_SCHEME)) wallets.push("suiet");
  return wallets;
}

// Initiate a signing request via deep link
export async function requestSignature(txBytes: Uint8Array, walletScheme: string) {
  const encodedTx = Buffer.from(txBytes).toString("base64");
  const callbackUrl = Linking.createURL("sign-callback");
  const deepLink = `${walletScheme}sign?tx=${encodedTx}&callback=${encodeURIComponent(callbackUrl)}`;

  await Linking.openURL(deepLink);

  // Listen for callback
  return new Promise((resolve) => {
    const subscription = Linking.addEventListener("url", (event) => {
      const signature = extractSignatureFromUrl(event.url);
      subscription.remove();
      resolve(signature);
    });
  });
}
```

### Step 5: Biometric Authentication for Key Access

Protect locally stored keys with biometric authentication (Face ID / Touch ID / fingerprint):

```typescript
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

export async function authenticateAndGetKey(): Promise<string | null> {
  // Check biometric availability
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled) {
    console.warn("Biometrics not available, falling back to device passcode");
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Authenticate to sign transaction",
    disableDeviceFallback: false,  // Allow PIN fallback
    cancelLabel: "Cancel",
  });

  if (result.success) {
    return SecureStore.getItemAsync("zklogin_ephemeral_key");
  }

  throw new Error("Biometric authentication failed");
}
```

### Step 6: Transaction Building on Mobile

Build transactions with mobile-friendly patterns:

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// Transfer SUI with mobile-optimized gas handling
export async function transferSui(recipientAddress: string, amountMist: bigint) {
  const tx = new Transaction();

  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin], recipientAddress);

  // Set gas budget conservatively for mobile (avoid failures)
  tx.setGasBudget(10_000_000n);

  return signAndExecuteWithZkLogin(tx);
}

// Move call example
export async function callContract(packageId: string, moduleName: string, fnName: string, args: any[]) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${moduleName}::${fnName}`,
    arguments: args.map(arg => {
      if (typeof arg === "string" && arg.startsWith("0x")) return tx.object(arg);
      if (typeof arg === "number") return tx.pure.u64(arg);
      return tx.pure.string(arg);
    }),
  });

  return signAndExecuteWithZkLogin(tx);
}
```

### Step 7: Mobile-Specific Concerns

**Network resilience:**
```typescript
import NetInfo from "@react-native-community/netinfo";

// Check network before transactions
export async function ensureConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    throw new Error("No network connection. Please check your internet.");
  }
  return true;
}
```

**App lifecycle handling:**
- Refresh zkLogin proofs when app returns from background (epochs may have advanced)
- Cache recent transaction results locally for offline viewing
- Queue failed transactions for retry when connectivity returns

### Step 8: Update Build Context

Update `.brokenigloo/build-context.md` with:
- Auth strategy chosen (zkLogin / deep link / embedded)
- OAuth provider and client IDs
- Deep link schemes configured
- Target platforms (iOS, Android, both)

### Step 9: Handoff

- "Build the backend for my mobile app" -> route to `build-with-claude`
- "Add DeFi features" -> route to `build-defi-protocol`
- "Audit my key storage" -> route to `cso`
- "Deploy to app stores" -> outside brokenigloo scope, recommend Expo EAS Build

## Prior Context

Read `.brokenigloo/build-context.md` for existing stack decisions. Read `skills/data/sui-knowledge/04-protocols-and-sdks.md` for wallet SDKs. Never block on missing files.

## Non-Negotiables

1. **zkLogin should be the default recommendation for mobile**: Unless the user specifically targets crypto-native users, always recommend zkLogin. It removes the wallet app dependency that kills mobile UX.
2. **Test on both iOS and Android**: Deep linking behavior, biometric APIs, and secure storage differ between platforms. Never ship without testing both.
3. **Never store private keys in plain AsyncStorage**: Always use `expo-secure-store` (backed by iOS Keychain / Android Keystore) for any key material. AsyncStorage is not encrypted.
4. **Polyfills must load before Sui SDK**: The `polyfills.ts` import must be the first line in the app entry point. Missing this causes cryptic runtime crashes.
5. **Handle ephemeral key expiration gracefully**: zkLogin ephemeral keys expire after `maxEpoch`. Detect expiration and re-authenticate silently when possible.
6. **Set conservative gas budgets on mobile**: Mobile users cannot easily debug failed transactions. Set gas budgets 2-3x above estimate to avoid out-of-gas errors.
7. **Never hardcode OAuth secrets in client code**: Client IDs are public, but client secrets must never be in the mobile bundle. Use a backend relay for any secret-bearing OAuth flows.

## References

- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — wallet SDKs and zkLogin docs
- `.brokenigloo/build-context.md` — stack decisions and progress
- Expo docs: https://docs.expo.dev
- Sui zkLogin docs: https://docs.sui.io/concepts/cryptography/zklogin

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
