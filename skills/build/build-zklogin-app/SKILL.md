---
name: build-zklogin-app
description: "Complete guide to building a zkLogin-powered app on Sui from scratch. Covers OAuth provider setup, ephemeral key generation, ZK proof generation, salt management, address derivation, session management, and dApp Kit integration. Triggers: zklogin, zk login, google login, social login, oauth sui, ephemeral key, zklogin app, passwordless"
---

```bash
# Telemetry preamble
SKILL_NAME="build-zklogin-app"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a zkLogin implementation specialist. zkLogin is Sui's native authentication system that allows users to sign in with Google, Facebook, Apple, or Twitch — no wallet extension or seed phrase needed. Under the hood, it uses zero-knowledge proofs to link an OAuth identity to a Sui address without revealing the user's identity on-chain.

**How zkLogin works (mental model):**

1. User signs in with an OAuth provider (Google, Facebook, etc.)
2. App generates an **ephemeral keypair** (short-lived, stored in browser)
3. App requests a **ZK proof** that links the OAuth JWT to the ephemeral key
4. The ZK proof + ephemeral signature together authorize transactions
5. The user's Sui address is **derived deterministically** from their OAuth sub (subject ID) + a salt

**Key insight**: The same Google account + same salt = same Sui address every time. The user's identity is never revealed on-chain — only the ZK proof that they authenticated correctly.

## Workflow

### Step 1: Set Up OAuth Provider

**Google (most common):**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized redirect URI: `http://localhost:3000/auth/callback` (dev) and your production URL
6. Note your **Client ID** — you will need it

```env
# .env.local
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=testnet
```

**Supported providers and their `iss` values:**

| Provider | `iss` (issuer) | Setup URL |
|----------|----------------|-----------|
| Google | `https://accounts.google.com` | console.cloud.google.com |
| Facebook | `https://www.facebook.com` | developers.facebook.com |
| Apple | `https://appleid.apple.com` | developer.apple.com |
| Twitch | `https://id.twitch.tv/oauth2` | dev.twitch.tv |

### Step 2: Install Dependencies

```bash
npm i @mysten/sui @mysten/zklogin @mysten/enoki jose
```

- `@mysten/zklogin` — core zkLogin utilities (address derivation, nonce generation, proof handling)
- `@mysten/enoki` — managed zkLogin service (optional, simplifies proof generation)
- `jose` — JWT decoding

### Step 3: Generate Ephemeral Keypair and Nonce

```typescript
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness } from "@mysten/zklogin";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

// 1. Generate an ephemeral keypair (lives only for this session)
const ephemeralKeyPair = new Ed25519Keypair();

// 2. Get the current epoch from the Sui network
const { epoch } = await suiClient.getLatestSuiSystemState();
const maxEpoch = Number(epoch) + 10; // Key valid for ~10 epochs (~10 days)

// 3. Generate randomness and nonce
const randomness = generateRandomness();
const nonce = generateNonce(
  ephemeralKeyPair.getPublicKey(),
  maxEpoch,
  randomness,
);

// 4. Store these in sessionStorage (browser) — needed after OAuth redirect
sessionStorage.setItem("ephemeralKeyPair", JSON.stringify({
  privateKey: ephemeralKeyPair.export().privateKey,
}));
sessionStorage.setItem("maxEpoch", maxEpoch.toString());
sessionStorage.setItem("randomness", randomness.toString());

console.log("Nonce for OAuth:", nonce);
```

### Step 4: Redirect to OAuth Provider

```typescript
// Build the Google OAuth URL
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const REDIRECT_URI = "http://localhost:3000/auth/callback";

const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
oauthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
oauthUrl.searchParams.set("redirect_uri", REDIRECT_URI);
oauthUrl.searchParams.set("response_type", "id_token");
oauthUrl.searchParams.set("scope", "openid email");
oauthUrl.searchParams.set("nonce", nonce); // Critical: links JWT to ephemeral key

// Redirect the user
window.location.href = oauthUrl.toString();
```

### Step 5: Handle the OAuth Callback

```typescript
// On the callback page, extract the JWT from the URL fragment
import { jwtDecode } from "jose";

function handleCallback() {
  // Google returns the token in the URL hash fragment
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const jwt = params.get("id_token");

  if (!jwt) {
    throw new Error("No JWT token found in callback URL");
  }

  // Decode the JWT to get claims (no verification needed — ZK proof handles that)
  const decoded = JSON.parse(
    atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
  );

  console.log("JWT claims:", {
    iss: decoded.iss,     // "https://accounts.google.com"
    sub: decoded.sub,     // unique user identifier
    aud: decoded.aud,     // your client ID
    nonce: decoded.nonce, // should match the nonce we generated
    email: decoded.email, // optional, for display
  });

  // Store the JWT for ZK proof generation
  sessionStorage.setItem("jwt", jwt);

  return { jwt, decoded };
}
```

### Step 6: Derive the User's Sui Address

```typescript
import { jwtToAddress } from "@mysten/zklogin";

// The salt is critical: same sub + same salt = same address
// Options for salt management:
// 1. Use a fixed salt per user (store in your backend)
// 2. Derive from the user's sub (deterministic but less flexible)
// 3. Use Mysten's salt service (convenient for development)

// Option 1: Fixed salt (recommended for production)
const userSalt = BigInt("12345678901234567890"); // Store this securely per user!

// Option 2: Use Mysten's salt service (development/testing)
async function getSaltFromService(jwt: string): Promise<string> {
  const response = await fetch("https://salt.api.mystenlabs.com/get_salt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: jwt }),
  });
  const data = await response.json();
  return data.salt;
}

// Derive the Sui address from the JWT and salt
const jwt = sessionStorage.getItem("jwt")!;
const suiAddress = jwtToAddress(jwt, userSalt);
console.log("User's Sui address:", suiAddress);
// This address is deterministic — same Google account + same salt = same address
```

### Step 7: Generate the ZK Proof

```typescript
import { getExtendedEphemeralPublicKey } from "@mysten/zklogin";

const ephemeralKeyPair = /* restore from sessionStorage */;
const maxEpoch = Number(sessionStorage.getItem("maxEpoch"));
const randomness = sessionStorage.getItem("randomness")!;
const jwt = sessionStorage.getItem("jwt")!;

// Get extended ephemeral public key
const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
  ephemeralKeyPair.getPublicKey(),
);

// Request ZK proof from the prover service
// Option A: Mysten Labs prover (free, rate-limited)
const proofResponse = await fetch("https://prover-dev.mystenlabs.com/v1", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jwt,
    extendedEphemeralPublicKey,
    maxEpoch,
    jwtRandomness: randomness,
    salt: userSalt.toString(),
    keyClaimName: "sub",
  }),
});

const zkProof = await proofResponse.json();
console.log("ZK proof generated:", zkProof);

// Store the proof — it's valid until maxEpoch
sessionStorage.setItem("zkProof", JSON.stringify(zkProof));
```

### Step 8: Sign and Execute Transactions

```typescript
import { getZkLoginSignature } from "@mysten/zklogin";
import { Transaction } from "@mysten/sui/transactions";

async function executeZkLoginTransaction(tx: Transaction) {
  const ephemeralKeyPair = /* restore from sessionStorage */;
  const zkProof = JSON.parse(sessionStorage.getItem("zkProof")!);
  const maxEpoch = Number(sessionStorage.getItem("maxEpoch"));
  const userSalt = /* your salt */;

  // Set the sender to the zkLogin address
  tx.setSender(suiAddress);

  // Build the transaction bytes
  const { bytes, signature: ephemeralSignature } =
    await tx.sign({ client: suiClient, signer: ephemeralKeyPair });

  // Combine the ephemeral signature with the ZK proof
  const zkLoginSignature = getZkLoginSignature({
    inputs: {
      ...zkProof,
      addressSeed: genAddressSeed(
        userSalt,
        "sub",
        decoded.sub,
        decoded.aud,
      ).toString(),
    },
    maxEpoch,
    userSignature: ephemeralSignature,
  });

  // Execute the transaction
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature: zkLoginSignature,
    options: { showEffects: true },
  });

  return result;
}

// Example: send SUI
const tx = new Transaction();
tx.transferObjects(
  [tx.splitCoins(tx.gas, [tx.pure.u64("100000000")])], // 0.1 SUI
  tx.pure.address("0x<RECIPIENT>"),
);

const result = await executeZkLoginTransaction(tx);
console.log("Transaction digest:", result.digest);
```

### Step 9: Session Management

```typescript
// Check if the current session is still valid
function isSessionValid(): boolean {
  const maxEpoch = Number(sessionStorage.getItem("maxEpoch") || "0");
  const zkProof = sessionStorage.getItem("zkProof");
  const jwt = sessionStorage.getItem("jwt");

  if (!zkProof || !jwt) return false;

  // Check JWT expiration
  const decoded = JSON.parse(atob(jwt.split(".")[1]));
  const jwtExpired = decoded.exp * 1000 < Date.now();

  // Note: Even if JWT expires, the ZK proof is valid until maxEpoch
  // The ZK proof is what matters for transaction signing
  return !jwtExpired && !!zkProof;
}

// Refresh the session (re-authenticate if needed)
async function refreshSession() {
  if (!isSessionValid()) {
    // Clear stored session data
    sessionStorage.removeItem("ephemeralKeyPair");
    sessionStorage.removeItem("maxEpoch");
    sessionStorage.removeItem("randomness");
    sessionStorage.removeItem("jwt");
    sessionStorage.removeItem("zkProof");

    // Redirect to login
    window.location.href = "/login";
  }
}

// Restore ephemeral keypair from sessionStorage
function restoreEphemeralKeyPair(): Ed25519Keypair {
  const stored = JSON.parse(sessionStorage.getItem("ephemeralKeyPair")!);
  return Ed25519Keypair.fromSecretKey(
    Uint8Array.from(atob(stored.privateKey), (c) => c.charCodeAt(0)),
  );
}
```

### Step 10: Complete React Component Example

```tsx
"use client";
import { useState, useEffect } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  jwtToAddress,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  genAddressSeed,
} from "@mysten/zklogin";

const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

export function ZkLoginButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);

    // Generate ephemeral keypair
    const ephemeralKeyPair = new Ed25519Keypair();
    const { epoch } = await suiClient.getLatestSuiSystemState();
    const maxEpoch = Number(epoch) + 10;
    const randomness = generateRandomness();
    const nonce = generateNonce(
      ephemeralKeyPair.getPublicKey(),
      maxEpoch,
      randomness,
    );

    // Store session data
    sessionStorage.setItem("ephemeralKeyPair", JSON.stringify({
      privateKey: Buffer.from(ephemeralKeyPair.export().privateKey).toString("base64"),
    }));
    sessionStorage.setItem("maxEpoch", maxEpoch.toString());
    sessionStorage.setItem("randomness", randomness.toString());

    // Redirect to Google
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", window.location.origin + "/auth/callback");
    url.searchParams.set("response_type", "id_token");
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("nonce", nonce);

    window.location.href = url.toString();
  }

  return (
    <div>
      {address ? (
        <p>Connected: {address.slice(0, 8)}...{address.slice(-6)}</p>
      ) : (
        <button onClick={handleLogin} disabled={loading}>
          {loading ? "Connecting..." : "Sign in with Google"}
        </button>
      )}
    </div>
  );
}
```

### Step 11: Using Enoki for Managed zkLogin (Simpler Alternative)

```typescript
import { EnokiClient, EnokiFlow } from "@mysten/enoki";

// Enoki handles salt management, proof generation, and key management
const enokiClient = new EnokiClient({
  apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
});

const enokiFlow = new EnokiFlow({
  apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
});

// Start the login flow — much simpler!
async function loginWithEnoki() {
  const url = await enokiFlow.createAuthorizationURL({
    provider: "google",
    clientId: GOOGLE_CLIENT_ID,
    redirectUrl: window.location.origin + "/auth/callback",
    network: "testnet",
  });

  window.location.href = url;
}

// Handle callback — Enoki handles proof generation automatically
async function handleEnokiCallback() {
  await enokiFlow.handleAuthCallback();
  const keypair = await enokiFlow.getKeypair({ network: "testnet" });
  const address = keypair.toSuiAddress();
  console.log("Logged in as:", address);
}

// Sign transactions with Enoki
async function signWithEnoki(tx: Transaction) {
  const keypair = await enokiFlow.getKeypair({ network: "testnet" });
  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  return result;
}
```

### Step 12: Handoff

- "I want gas sponsorship for my zkLogin users" -> route to `build-sponsored-app`
- "Help me set up Enoki" -> route to `integrate-enoki`
- "I need multisig with zkLogin" -> route to `build-multisig`
- "Build a dApp frontend" -> route to `integrate-dapp-kit`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/03-zklogin-enoki.md` for zkLogin reference. Never block on missing files.

## Non-Negotiables

1. **NEVER store the JWT in localStorage** — use sessionStorage only. JWTs contain identity information and should not persist across browser sessions.
2. **ALWAYS manage salts securely** — the salt determines the user's address. If the salt is lost, the user loses access to their account. Store salts in your backend database, never client-side only.
3. **ALWAYS validate the nonce matches** — after OAuth callback, verify the JWT's nonce matches what you generated. A mismatch means the JWT was not created for this session.
4. **NEVER expose the ephemeral private key** — it is equivalent to a session token. If leaked, an attacker can sign transactions until maxEpoch.
5. **ALWAYS set a reasonable maxEpoch** — too short (1-2 epochs) forces frequent re-authentication; too long (100+ epochs) means a compromised session stays valid for months. 10 epochs (~10 days) is a good default.
6. **ALWAYS use HTTPS in production** — OAuth redirects and JWTs must be transmitted over TLS.
7. **NEVER skip the ZK proof step** — the ephemeral signature alone cannot authorize transactions. The ZK proof is required.
8. **Handle proof generation latency** — ZK proof generation takes 5-15 seconds. Show a loading state to the user.
9. **Use Enoki for production apps** — unless you have specific reasons to manage the full flow yourself, Enoki handles salt management, proof caching, and gas sponsorship.

## References

- Sui zkLogin Docs: https://docs.sui.io/concepts/cryptography/zklogin
- Mysten zkLogin SDK: https://sdk.mystenlabs.com/zklogin
- Enoki Docs: https://docs.enoki.mystenlabs.com
- ZK Prover: https://prover-dev.mystenlabs.com
- `skills/data/sui-knowledge/03-zklogin-enoki.md` — zkLogin reference
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
