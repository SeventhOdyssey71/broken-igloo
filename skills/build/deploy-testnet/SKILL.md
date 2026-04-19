---
name: deploy-testnet
description: "Deploy and test on Sui testnet. Covers environment setup, faucet usage, testnet-specific considerations, integration testing, monitoring deployed contracts, debugging failed transactions, testnet vs mainnet differences. Triggers: deploy testnet, testnet deploy, test on testnet, testnet setup, faucet, testnet testing, deploy to testnet, sui testnet"
---

```bash
# Telemetry preamble
SKILL_NAME="deploy-testnet"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui testnet deployment specialist. Your job is to guide the user through deploying Move packages to Sui testnet, obtaining test tokens, running integration tests against deployed contracts, and preparing for mainnet deployment. Testnet is your staging environment — it mirrors mainnet behavior but with free SUI from the faucet.

Key differences from local development:
- **Real network latency**: Transactions take 400ms-2s instead of instant
- **Shared object contention**: Other testnet users may interact with shared objects concurrently
- **Epoch boundaries**: Testnet has real epochs (~24h), so epoch-dependent logic works correctly
- **Persistent state**: Objects persist across sessions (unlike `sui move test`)
- **Faucet rate limits**: You get limited free SUI per request

## Workflow

### Step 1: Environment Setup

```bash
# Check current Sui CLI version
sui --version

# Switch to testnet environment
sui client switch --env testnet

# If testnet env doesn't exist, add it
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443

# Verify active environment
sui client active-env
# Should output: testnet

# Check your active address
sui client active-address

# If you need a new address
sui client new-address ed25519
sui client switch --address <new_address>
```

### Step 2: Get Testnet SUI from Faucet

```bash
# CLI faucet request
sui client faucet

# Or via curl
curl -X POST https://faucet.testnet.sui.io/v1/gas \
  -H "Content-Type: application/json" \
  -d "{\"FixedAmountRequest\":{\"recipient\":\"$(sui client active-address)\"}}"

# Check balance
sui client gas

# You should see coins with ~1 SUI each
# Request multiple times if you need more (rate limited to ~10 requests/minute)
```

**Programmatic faucet access:**

```typescript
import { requestSuiFromFaucetV1, getFaucetHost } from "@mysten/sui/faucet";

async function fundTestnetAddress(address: string) {
  const result = await requestSuiFromFaucetV1({
    host: getFaucetHost("testnet"),
    recipient: address,
  });
  console.log("Faucet result:", result);
}
```

### Step 3: Deploy Your Package

```bash
# Build first to catch compilation errors
sui move build

# Run unit tests
sui move test

# Publish to testnet
sui client publish --gas-budget 100000000

# Expected output:
# Transaction Digest: <digest>
# ╭──────────────────────────────────────────────╮
# │ Transaction Data                              │
# ├──────────────────────────────────────────────┤
# │ ...                                           │
# ╰──────────────────────────────────────────────╯
# 
# Object Changes:
#   Published Objects:
#     PackageID: 0x<package_id>
#   Created Objects:
#     0x<object_id_1> (AdminCap)
#     0x<object_id_2> (Pool - shared)
#     ...

# SAVE THESE IDs IMMEDIATELY
echo "PACKAGE_ID=0x<package_id>" >> .env.testnet
echo "ADMIN_CAP_ID=0x<admin_cap_id>" >> .env.testnet
echo "POOL_ID=0x<pool_id>" >> .env.testnet
```

### Step 4: Verify Deployment

```bash
# View your published package
sui client object <PACKAGE_ID>

# View on explorer
echo "https://suiscan.xyz/testnet/object/<PACKAGE_ID>"
echo "https://testnet.suivision.xyz/package/<PACKAGE_ID>"

# List all objects owned by your address
sui client objects

# Check a specific shared object
sui client object <POOL_ID> --json
```

```typescript
// Programmatic verification
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// Verify package exists
const pkg = await client.getObject({
  id: PACKAGE_ID,
  options: { showContent: true },
});
console.log("Package found:", pkg.data?.objectId);

// Verify shared objects
const pool = await client.getObject({
  id: POOL_ID,
  options: { showContent: true },
});
console.log("Pool state:", pool.data?.content?.fields);
```

### Step 5: Integration Testing

```typescript
// test/integration/pool.test.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { requestSuiFromFaucetV1, getFaucetHost } from "@mysten/sui/faucet";
import { describe, it, expect, beforeAll } from "vitest";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.TEST_MNEMONIC!);
const address = keypair.toSuiAddress();

const PACKAGE_ID = process.env.PACKAGE_ID!;
const POOL_ID = process.env.POOL_ID!;

describe("Pool Integration Tests", () => {
  beforeAll(async () => {
    // Ensure test wallet has SUI
    const balance = await client.getBalance({ owner: address });
    if (BigInt(balance.totalBalance) < 1_000_000_000n) {
      await requestSuiFromFaucetV1({
        host: getFaucetHost("testnet"),
        recipient: address,
      });
      // Wait for faucet tx to finalize
      await new Promise((r) => setTimeout(r, 3000));
    }
  });

  it("should deposit into pool", async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000)]); // 0.1 SUI

    tx.moveCall({
      target: `${PACKAGE_ID}::pool::deposit`,
      arguments: [tx.object(POOL_ID), coin, tx.object("0x6")],
    });

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });

    expect(result.effects?.status.status).toBe("success");
    console.log("Deposit TX:", result.digest);

    // Verify event was emitted
    const depositEvent = result.events?.find((e) =>
      e.type.includes("DepositEvent"),
    );
    expect(depositEvent).toBeDefined();
    expect(depositEvent?.parsedJson?.amount).toBe("100000000");
  });

  it("should swap tokens", async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::pool::swap`,
      arguments: [
        tx.object(POOL_ID),
        coin,
        tx.pure.u64(0), // min out (0 for testing)
        tx.object("0x6"),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showBalanceChanges: true },
    });

    expect(result.effects?.status.status).toBe("success");

    // Verify balance changes
    const balanceChanges = result.balanceChanges;
    console.log("Balance changes:", balanceChanges);
  });

  it("should handle insufficient balance gracefully", async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(999_999_999_999_999n)]); // Way too much

    tx.moveCall({
      target: `${PACKAGE_ID}::pool::deposit`,
      arguments: [tx.object(POOL_ID), coin, tx.object("0x6")],
    });

    // Dry run to check for errors without spending gas
    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    expect(dryRun.effects.status.status).toBe("failure");
  });
});
```

Run integration tests:

```bash
# Run integration tests
npx vitest run test/integration/ --env-file .env.testnet

# Run a specific test
npx vitest run test/integration/pool.test.ts -t "should deposit"
```

### Step 6: Debugging Failed Transactions

```bash
# Check a failed transaction
sui client tx-block <TX_DIGEST> --json

# Common error codes and what they mean:
# MoveAbort(_, 0) -> Check your module's error constants
# InsufficientGas -> Increase --gas-budget
# ObjectNotFound -> Object ID is wrong or on a different network
# SharedObjectLockingFailure -> Retry; shared object was contested

# Debug with dry-run
sui client call --package <PACKAGE_ID> --module pool --function swap \
  --args <POOL_ID> <COIN_ID> 0 0x6 \
  --gas-budget 50000000 --dry-run
```

```typescript
// Programmatic debugging
async function debugTransaction(digest: string) {
  const tx = await client.getTransactionBlock({
    digest,
    options: {
      showEffects: true,
      showEvents: true,
      showInput: true,
      showBalanceChanges: true,
      showObjectChanges: true,
    },
  });

  console.log("Status:", tx.effects?.status);
  console.log("Gas used:", tx.effects?.gasUsed);
  console.log("Events:", tx.events);
  console.log("Object changes:", tx.objectChanges);

  if (tx.effects?.status.status === "failure") {
    console.error("Error:", tx.effects.status.error);
    // Parse MoveAbort error
    const match = tx.effects.status.error?.match(/MoveAbort.*?(\d+)/);
    if (match) {
      console.error("Abort code:", match[1]);
    }
  }
}
```

### Step 7: Testnet vs Mainnet Checklist

| Aspect              | Testnet                          | Mainnet                            |
| ------------------- | -------------------------------- | ---------------------------------- |
| **RPC URL**         | `fullnode.testnet.sui.io:443`    | `fullnode.mainnet.sui.io:443`      |
| **Faucet**          | Free SUI available               | No faucet; use real SUI            |
| **Explorer**        | suiscan.xyz/testnet              | suiscan.xyz/mainnet                |
| **Epoch duration**  | ~24 hours                        | ~24 hours                          |
| **Object IDs**      | Different from mainnet           | Unique to mainnet deployment       |
| **Package IDs**     | Re-deploy needed on mainnet      | Final deployment                   |
| **Gas costs**       | Free (faucet)                    | Real SUI cost                      |
| **Resets**          | Occasional network resets        | Never resets                       |
| **Protocols**       | May have different addresses     | Production addresses               |

### Step 8: Pre-Mainnet Deployment Checklist

```bash
# 1. All unit tests pass
sui move test

# 2. Integration tests pass on testnet
npx vitest run test/integration/

# 3. Security review completed
# - AdminCap secured
# - No hardcoded addresses
# - All abort codes documented
# - Events emitted for all state changes

# 4. Gas budget estimates documented
# Run each entry function with --dry-run to get gas costs

# 5. UpgradeCap plan documented
# Who holds it? Multisig? Burn for immutability?

# 6. Frontend tested against testnet deployment
# npm run build && npm run preview

# 7. Environment variables prepared for mainnet
cp .env.testnet .env.mainnet
# Edit .env.mainnet with mainnet values
```

## Non-Negotiables

1. **ALWAYS deploy to testnet before mainnet** — no exceptions; testnet catches issues that unit tests miss
2. **ALWAYS save object IDs immediately after publishing** — they appear once in the output; if you lose them, you must search the explorer
3. **ALWAYS use `--dry-run` before expensive operations** — it catches errors without spending gas
4. **NEVER use testnet object IDs on mainnet** — every object ID is network-specific; redeploy and save new IDs
5. **ALWAYS fund test wallets from faucet, not personal wallets** — keep test funds separate from real funds
6. **ALWAYS test with the exact same code** you will deploy to mainnet — never deploy untested changes
7. **Testnet may reset periodically** — do not rely on testnet state for permanent storage; keep deployment scripts reproducible

## References

- `skills/build/upgrade-package/SKILL.md` — Package upgrade workflow
- `skills/build/debug-move/SKILL.md` — Debugging Move errors
- `skills/build/build-api/SKILL.md` — Backend testing against testnet
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
