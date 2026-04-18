---
name: integrate-enoki
description: "Deep guide for integrating Enoki (managed zkLogin + sponsored transactions) into Sui apps. Covers Google/Apple sign-in, gasless onboarding, React flows. Triggers: enoki, zklogin app, sign in with google sui, gasless onboarding, no wallet app"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-enoki"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are an Enoki integration specialist. Enoki is Mysten Labs' managed zkLogin service that lets users sign in to Sui apps with Google, Apple, or Twitch accounts — no wallet installation needed. Enoki handles the ZK proof generation, ephemeral key management, and optional transaction sponsorship so developers do not have to build the complex zkLogin infrastructure themselves.

**When to use Enoki vs alternatives:**
- **Enoki**: Fastest path to "Sign in with Google" on Sui. Managed service, minimal code. Ideal for consumer apps, games, onboarding non-crypto users.
- **Raw zkLogin**: Full control over the ZK proof pipeline. More complex but no dependency on Mysten's Enoki service. Use when you need custom OAuth flows or self-hosted infrastructure.
- **Shinami**: Enterprise-grade RPC + gas sponsorship + invisible wallets. Better for backends that need managed wallets. Use when you need backend-controlled wallets or high-throughput gas sponsorship.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/enoki @mysten/sui @tanstack/react-query
```

### Step 2: Enoki Portal Setup

1. Go to [https://portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com)
2. Create a new project
3. Configure OAuth providers:
   - **Google**: Add your Google Cloud OAuth 2.0 Client ID
   - **Apple**: Add your Apple Services ID
   - **Twitch**: Add your Twitch App Client ID
4. Get your **Enoki API key** (public key — safe for frontend use)
5. Set your **redirect URI** (e.g., `http://localhost:3000/auth/callback`)
6. Optionally enable **sponsored transactions** and set a budget

### Step 3: React Integration — Provider Setup

```typescript
// src/providers.tsx
import { EnokiFlowProvider } from "@mysten/enoki/react";
import { SuiClientProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
const networks = {
  testnet: { url: getFullnodeUrl("testnet") },
  mainnet: { url: getFullnodeUrl("mainnet") },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <EnokiFlowProvider apiKey={process.env.NEXT_PUBLIC_ENOKI_API_KEY!}>
          {children}
        </EnokiFlowProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

### Step 4: Complete "Sign in with Google" Flow

```typescript
// src/components/AuthButton.tsx
"use client";

import { useEnokiFlow, useZkLogin, useZkLoginSession } from "@mysten/enoki/react";
import { useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

export function AuthButton() {
  const flow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const zkLoginSession = useZkLoginSession();
  const suiClient = useSuiClient();
  const [loading, setLoading] = useState(false);

  // STEP 1: Redirect user to Google sign-in
  async function handleSignIn() {
    const url = await flow.createAuthorizationURL({
      provider: "google",
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      redirectUrl: `${window.location.origin}/auth/callback`,
      extraParams: {
        scope: ["openid", "email", "profile"],
      },
    });
    window.location.href = url;
  }

  // STEP 3: After callback, check if user is logged in
  if (zkLogin.address) {
    return (
      <div>
        <p>Logged in as: {zkLogin.address}</p>
        <button onClick={() => executeSponsoredTx(flow, suiClient, zkLogin.address!)}>
          Send Sponsored Transaction
        </button>
        <button onClick={() => flow.logout()}>Sign Out</button>
      </div>
    );
  }

  return (
    <button onClick={handleSignIn} disabled={loading}>
      {loading ? "Signing in..." : "Sign in with Google"}
    </button>
  );
}
```

### Step 5: OAuth Callback Handler

```typescript
// src/app/auth/callback/page.tsx (Next.js App Router)
"use client";

import { useEnokiFlow } from "@mysten/enoki/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const flow = useEnokiFlow();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // STEP 2: Handle the OAuth callback — extract the token from the URL hash
    async function handleCallback() {
      try {
        await flow.handleAuthCallback();
        // Redirect to main app after successful auth
        router.push("/dashboard");
      } catch (err) {
        console.error("Auth callback failed:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    }

    handleCallback();
  }, [flow, router]);

  if (error) {
    return (
      <div>
        <h2>Authentication Failed</h2>
        <p>{error}</p>
        <a href="/">Try again</a>
      </div>
    );
  }

  return <div>Completing sign in...</div>;
}
```

### Step 6: Sponsored Transactions

Enoki can sponsor transactions so users never need to hold SUI for gas.

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { EnokiFlow } from "@mysten/enoki";

async function executeSponsoredTx(
  flow: EnokiFlow,
  suiClient: any,
  senderAddress: string
) {
  // Build the transaction
  const tx = new Transaction();
  tx.setSender(senderAddress);

  // Example: transfer an object
  tx.transferObjects(
    [tx.object("0x<OBJECT_ID>")],
    tx.pure.address("0x<RECIPIENT_ADDRESS>")
  );

  // Sponsor and execute in one call
  // Enoki pays the gas, signs the sponsorship, and you sign with the zkLogin keypair
  const result = await flow.sponsorAndExecuteTransaction({
    transaction: tx,
    client: suiClient,
  });

  console.log("Transaction digest:", result.digest);
  return result;
}
```

**Sponsor-only (sign separately):**

```typescript
async function sponsorOnly(flow: EnokiFlow, tx: Transaction) {
  // Get sponsorship without executing
  const sponsoredTx = await flow.sponsorTransaction({
    transaction: tx,
  });

  // Now you have a sponsored transaction you can sign and execute yourself
  return sponsoredTx;
}
```

### Step 7: Getting the User's Sui Address

```typescript
import { useZkLogin } from "@mysten/enoki/react";

function UserProfile() {
  const zkLogin = useZkLogin();

  if (!zkLogin.address) {
    return <p>Not logged in</p>;
  }

  return (
    <div>
      <p>Address: {zkLogin.address}</p>
      {/* The address is deterministic based on the OAuth provider + user ID */}
      {/* Same Google account always produces the same Sui address */}
    </div>
  );
}
```

### Step 8: Session Management and Token Refresh

```typescript
import { useZkLoginSession } from "@mysten/enoki/react";

function SessionStatus() {
  const session = useZkLoginSession();

  // The session contains the ephemeral keypair and ZK proof
  // It auto-refreshes, but you can check its state:

  if (!session) {
    return <p>No active session</p>;
  }

  return (
    <div>
      <p>Session active</p>
      {/* Sessions are typically valid for ~24 hours */}
      {/* EnokiFlowProvider handles refresh automatically */}
    </div>
  );
}
```

**Manual session handling (non-React):**

```typescript
import { EnokiFlow } from "@mysten/enoki";

const flow = new EnokiFlow({
  apiKey: process.env.ENOKI_API_KEY!,
});

// Check if session is valid
const session = flow.getSession();
if (!session) {
  // Need to re-authenticate
  const url = await flow.createAuthorizationURL({ ... });
}
```

### Step 9: Multiple OAuth Providers

```typescript
function MultiProviderLogin() {
  const flow = useEnokiFlow();

  async function signIn(provider: "google" | "apple" | "twitch") {
    const clientIds: Record<string, string> = {
      google: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      apple: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!,
      twitch: process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID!,
    };

    const url = await flow.createAuthorizationURL({
      provider,
      clientId: clientIds[provider],
      redirectUrl: `${window.location.origin}/auth/callback`,
      extraParams: provider === "google"
        ? { scope: ["openid", "email", "profile"] }
        : undefined,
    });

    window.location.href = url;
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => signIn("google")}>Sign in with Google</button>
      <button onClick={() => signIn("apple")}>Sign in with Apple</button>
      <button onClick={() => signIn("twitch")}>Sign in with Twitch</button>
    </div>
  );
}
```

**Important**: Each OAuth provider generates a DIFFERENT Sui address for the same user. A user who signs in with Google and Apple will have two separate Sui addresses.

### Step 10: Complete Working Next.js App

```typescript
// src/app/layout.tsx
import { Providers } from "@/providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

// src/app/page.tsx
"use client";

import { AuthButton } from "@/components/AuthButton";
import { useZkLogin } from "@mysten/enoki/react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

export default function Home() {
  const zkLogin = useZkLogin();
  const suiClient = useSuiClient();
  const [balance, setBalance] = useState<string>("0");

  useEffect(() => {
    if (zkLogin.address) {
      suiClient.getBalance({ owner: zkLogin.address }).then((b) => {
        setBalance((Number(b.totalBalance) / 1e9).toFixed(4));
      });
    }
  }, [zkLogin.address, suiClient]);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1>My Sui App</h1>
      <AuthButton />
      {zkLogin.address && (
        <div>
          <p>Balance: {balance} SUI</p>
        </div>
      )}
    </main>
  );
}
```

**Environment variables (`.env.local`):**

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_xxx
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

### Error Handling

```typescript
import { EnokiFlowError } from "@mysten/enoki";

try {
  await flow.sponsorAndExecuteTransaction({ transaction: tx, client: suiClient });
} catch (error) {
  if (error instanceof EnokiFlowError) {
    switch (error.code) {
      case "INSUFFICIENT_SPONSOR_BALANCE":
        console.error("Sponsor budget exhausted — top up in Enoki portal");
        break;
      case "SESSION_EXPIRED":
        console.error("Session expired — redirect to re-authenticate");
        break;
      case "INVALID_PROOF":
        console.error("ZK proof invalid — session may be corrupted");
        flow.logout();
        break;
      default:
        console.error("Enoki error:", error.message);
    }
  }
}
```

## Non-Negotiables

1. **NEVER expose the Enoki private/secret API key client-side** — only the public API key goes in the browser. The public key starts with `enoki_public_`
2. **ALWAYS configure the redirect URI** in both the Enoki portal AND your OAuth provider settings — mismatches cause silent failures
3. **ALWAYS handle the auth callback page** — without `flow.handleAuthCallback()`, the OAuth redirect will not complete
4. **ALWAYS set `scope: ["openid"]` minimum** for Google OAuth — without `openid`, zkLogin cannot generate a valid proof
5. **NEVER assume the same address across providers** — Google and Apple produce different Sui addresses for the same human
6. **ALWAYS handle session expiry gracefully** — redirect to re-authenticate, do not show cryptic errors
7. **ALWAYS set a sponsor budget limit** in the Enoki portal — unbounded sponsorship can drain your funds
8. **ALWAYS use `sponsorAndExecuteTransaction`** for the simplest UX — only use separate sponsor/sign when you need custom signing logic

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
