---
name: integrate-dapp-kit
description: "Deep guide for integrating @mysten/dapp-kit for React wallet connections on Sui. Covers ConnectButton, hooks, signing transactions, network switching, custom modals, Next.js setup. Triggers: dapp kit, wallet connection, connect wallet, sui react, connect button"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-dapp-kit"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a dApp Kit integration specialist. `@mysten/dapp-kit` is the official React library for connecting wallets to Sui dApps. It provides hooks and components for wallet connection, transaction signing, and on-chain data fetching — similar to wagmi/RainbowKit in Ethereum but purpose-built for Sui.

**What dApp Kit gives you:**
- `<ConnectButton />` — one-line wallet connection UI
- `useCurrentAccount()` — get the connected wallet address
- `useSignAndExecuteTransaction()` — sign + execute transactions via the wallet
- `useSuiClient()` — direct SuiClient access for queries
- `useSuiClientQuery()` — React Query-powered cached data fetching
- Network switching, auto-connect, and custom wallet filtering

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/dapp-kit @mysten/sui @tanstack/react-query
```

dApp Kit depends on `@tanstack/react-query` for data caching and `@mysten/sui` for the Sui client.

### Step 2: Provider Setup

Every dApp Kit app needs three providers wrapping your application:

```typescript
// src/providers.tsx
"use client"; // Required for Next.js App Router

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css"; // Default styles for ConnectButton

const queryClient = new QueryClient();

// Define available networks
const networks = {
  mainnet: { url: getFullnodeUrl("mainnet") },
  testnet: { url: getFullnodeUrl("testnet") },
  devnet: { url: getFullnodeUrl("devnet") },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider
          autoConnect={true} // Reconnect on page reload
        >
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

**Add to your layout (Next.js App Router):**

```typescript
// src/app/layout.tsx
import { Providers } from "@/providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Step 3: ConnectButton — One-Line Wallet Connection

```typescript
// src/components/Navbar.tsx
"use client";

import { ConnectButton } from "@mysten/dapp-kit";

export function Navbar() {
  return (
    <nav className="flex justify-between items-center p-4">
      <h1>My Sui dApp</h1>
      <ConnectButton />
    </nav>
  );
}
```

The `<ConnectButton />` handles everything:
- Shows "Connect Wallet" when disconnected
- Opens wallet selection modal (Sui Wallet, Suiet, Ethos, etc.)
- Shows connected address when connected
- Dropdown to disconnect or switch accounts

### Step 4: useCurrentAccount — Get Connected Wallet

```typescript
"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";

export function WalletStatus() {
  const account = useCurrentAccount();

  if (!account) {
    return <p>No wallet connected</p>;
  }

  return (
    <div>
      <p>Connected: {account.address}</p>
      <p>Label: {account.label || "No label"}</p>
      {/* account.address is the full Sui address (0x...) */}
      {/* account.chains lists supported chains */}
      {/* account.features lists wallet capabilities */}
    </div>
  );
}
```

### Step 5: useSignAndExecuteTransaction — Execute Transactions

This is the primary hook for sending transactions through the connected wallet.

```typescript
"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

export function TransferSui() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [digest, setDigest] = useState<string | null>(null);

  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) => {
      // Custom execution — gives you access to the raw result
      return await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showBalanceChanges: true,
        },
      });
    },
  });

  function handleTransfer() {
    if (!account) return;

    const tx = new Transaction();
    const amountMist = BigInt(Math.floor(parseFloat(amount) * 1e9));

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
    tx.transferObjects([coin], tx.pure.address(recipient));

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log("Transaction succeeded:", result.digest);
          setDigest(result.digest);
        },
        onError: (error) => {
          console.error("Transaction failed:", error.message);
        },
      }
    );
  }

  if (!account) return <p>Connect wallet first</p>;

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <input
        placeholder="Recipient address (0x...)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        placeholder="Amount (SUI)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        className="border p-2 rounded"
      />
      <button
        onClick={handleTransfer}
        disabled={isPending || !recipient || !amount}
        className="bg-blue-600 text-white p-2 rounded disabled:opacity-50"
      >
        {isPending ? "Sending..." : "Send SUI"}
      </button>
      {digest && (
        <p className="text-green-600 text-sm">
          Success! Digest: {digest}
        </p>
      )}
    </div>
  );
}
```

### Step 6: useSignTransaction — Sign Without Executing

For cases where you need the signature but want to execute separately (e.g., sponsored transactions):

```typescript
"use client";

import { useSignTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

export function SignOnly() {
  const { mutateAsync: signTransaction } = useSignTransaction();

  async function handleSign() {
    const tx = new Transaction();
    tx.moveCall({
      target: "0x<PACKAGE>::module::function",
      arguments: [],
    });

    // Get the signature without executing
    const { bytes, signature } = await signTransaction({ transaction: tx });

    // Send bytes + signature to your backend for sponsored execution
    const res = await fetch("/api/execute-sponsored", {
      method: "POST",
      body: JSON.stringify({ bytes: Array.from(bytes), signature }),
    });

    const result = await res.json();
    console.log("Sponsored execution result:", result);
  }

  return <button onClick={handleSign}>Sign Transaction</button>;
}
```

### Step 7: useSuiClient — Direct Queries

```typescript
"use client";

import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

export function Balance() {
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const [balance, setBalance] = useState<string>("0");

  useEffect(() => {
    if (!account) return;

    async function fetchBalance() {
      const result = await suiClient.getBalance({
        owner: account!.address,
      });
      setBalance((Number(result.totalBalance) / 1e9).toFixed(4));
    }

    fetchBalance();
  }, [account, suiClient]);

  if (!account) return null;

  return <p>Balance: {balance} SUI</p>;
}
```

### Step 8: useSuiClientQuery — Cached Data Fetching

React Query-powered hooks that handle caching, refetching, and loading states:

```typescript
"use client";

import { useSuiClientQuery, useCurrentAccount } from "@mysten/dapp-kit";

export function OwnedObjects() {
  const account = useCurrentAccount();

  const { data, isPending, error, refetch } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address!,
      options: { showContent: true, showDisplay: true },
    },
    {
      enabled: !!account, // Only fetch when wallet is connected
    }
  );

  if (!account) return <p>Connect wallet to see objects</p>;
  if (isPending) return <p>Loading objects...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h3>Your Objects ({data.data.length})</h3>
      <button onClick={() => refetch()}>Refresh</button>
      <ul>
        {data.data.map((obj) => (
          <li key={obj.data?.objectId}>
            {obj.data?.objectId?.slice(0, 10)}... —{" "}
            {obj.data?.type?.split("::").pop()}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Other available queries:
// useSuiClientQuery("getBalance", { owner: address })
// useSuiClientQuery("getObject", { id: objectId, options: { showContent: true } })
// useSuiClientQuery("getCoins", { owner: address, coinType: "0x2::sui::SUI" })
// useSuiClientQuery("queryTransactionBlocks", { filter: { FromAddress: address } })
```

### Step 9: Network Switching

```typescript
"use client";

import { useSuiClientContext } from "@mysten/dapp-kit";

export function NetworkSwitcher() {
  const ctx = useSuiClientContext();

  return (
    <div className="flex gap-2">
      {Object.keys(ctx.networks).map((network) => (
        <button
          key={network}
          onClick={() => ctx.selectNetwork(network)}
          className={`px-3 py-1 rounded ${
            ctx.network === network
              ? "bg-blue-600 text-white"
              : "bg-gray-200"
          }`}
        >
          {network}
        </button>
      ))}
    </div>
  );
}
```

### Step 10: Custom Connect Modal

Replace the default connect modal with your own UI:

```typescript
"use client";

import { useConnectWallet, useWallets, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { useState } from "react";

export function CustomConnectModal() {
  const wallets = useWallets();
  const { mutate: connect } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const account = useCurrentAccount();
  const [showModal, setShowModal] = useState(false);

  if (account) {
    return (
      <div className="flex items-center gap-2">
        <span>{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
        <button
          onClick={() => disconnect()}
          className="text-red-500 text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Connect Wallet
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-4">Choose a Wallet</h2>

            {wallets.length === 0 && (
              <p className="text-gray-500">No wallets detected. Install a Sui wallet extension.</p>
            )}

            <div className="flex flex-col gap-2">
              {wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => {
                    connect({ wallet });
                    setShowModal(false);
                  }}
                  className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-8 h-8"
                  />
                  <span>{wallet.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="mt-4 text-gray-500 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

### Step 11: Wallet Auto-Connect and Preferred Wallets

```typescript
// In your Providers setup:
<WalletProvider
  autoConnect={true}                    // Reconnect last used wallet on reload
  preferredWallets={["Sui Wallet"]}     // Show Sui Wallet first in the list
  requiredFeatures={[                   // Only show wallets that support:
    "sui:signAndExecuteTransactionBlock",
  ]}
>
  {children}
</WalletProvider>
```

### Step 12: Complete Working Next.js App

```typescript
// src/app/page.tsx
"use client";

import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

export default function Home() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const [mintResult, setMintResult] = useState<string | null>(null);

  // Fetch balance with auto-caching
  const { data: balanceData } = useSuiClientQuery(
    "getBalance",
    { owner: account?.address! },
    { enabled: !!account, refetchInterval: 5000 }
  );

  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      }),
  });

  function handleMint() {
    if (!account) return;

    const tx = new Transaction();
    tx.moveCall({
      target: "0x<PACKAGE>::my_nft::mint",
      arguments: [
        tx.pure.string("My NFT"),
        tx.pure.string("https://example.com/nft.png"),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          const created = result.objectChanges?.find(
            (c) => c.type === "created"
          );
          setMintResult(created?.objectId || result.digest);
        },
        onError: (err) => console.error(err),
      }
    );
  }

  const balance = balanceData
    ? (Number(balanceData.totalBalance) / 1e9).toFixed(4)
    : "0";

  return (
    <main className="flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">My Sui dApp</h1>

      <ConnectButton />

      {account && (
        <div className="flex flex-col items-center gap-4">
          <p>Address: {account.address}</p>
          <p>Balance: {balance} SUI</p>

          <button
            onClick={handleMint}
            disabled={isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Minting..." : "Mint NFT"}
          </button>

          {mintResult && (
            <p className="text-green-600">
              Minted! Object: {mintResult}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
```

### TypeScript Type Safety

```typescript
import { SuiTransactionBlockResponse } from "@mysten/sui/client";

// The execute callback returns a fully typed response
const { mutate: signAndExecute } = useSignAndExecuteTransaction({
  execute: async ({ bytes, signature }) => {
    const result: SuiTransactionBlockResponse =
      await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showBalanceChanges: true,
        },
      });

    // TypeScript knows the shape of result
    if (result.effects?.status.status === "failure") {
      throw new Error(`Transaction failed: ${result.effects.status.error}`);
    }

    return result;
  },
});
```

### Error Handling and Loading States

```typescript
function MintButton() {
  const { mutate, isPending, isError, error, isSuccess, data } =
    useSignAndExecuteTransaction();

  return (
    <div>
      <button onClick={() => mutate({ transaction: buildTx() })} disabled={isPending}>
        {isPending ? "Processing..." : "Mint"}
      </button>

      {isError && (
        <p className="text-red-500">
          {error.message.includes("Rejected")
            ? "You rejected the transaction in your wallet"
            : `Error: ${error.message}`}
        </p>
      )}

      {isSuccess && (
        <p className="text-green-500">Success! Digest: {data.digest}</p>
      )}
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS wrap your app in all three providers** — `QueryClientProvider` > `SuiClientProvider` > `WalletProvider`. Missing any one will cause cryptic errors.
2. **ALWAYS import the dapp-kit CSS** (`@mysten/dapp-kit/dist/index.css`) if using `<ConnectButton />` — without it, the button renders unstyled/broken
3. **ALWAYS add `"use client"` directive** in Next.js App Router for any component using dApp Kit hooks — they use React context and state
4. **ALWAYS check `account` is not null** before building transactions — the wallet may be disconnected
5. **ALWAYS use `useSignAndExecuteTransaction` with an `execute` callback** for full control over response options — the default omits useful fields like `objectChanges`
6. **ALWAYS handle the "Rejected" error case** — users frequently cancel transactions in their wallet popup
7. **NEVER call `useSuiClientQuery` with undefined parameters** — use the `enabled` option to conditionally skip queries
8. **ALWAYS set `autoConnect={true}`** on `WalletProvider` — without it, users must reconnect every page load, which is frustrating

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
