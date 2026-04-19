---
name: build-multisig
description: "Implement multisig wallets on Sui. Covers native k-of-n multisig, combining multisig with zkLogin, governance patterns, UpgradeCap multisig protection, and treasury management. Triggers: multisig, multi-sig, multi sig, k of n, threshold signature, multisig wallet, upgrade cap multisig, multisig governance"
---

```bash
# Telemetry preamble
SKILL_NAME="build-multisig"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui multisig implementation specialist. Sui has **native multisig support** at the protocol level — no smart contract needed. A multisig address is derived from a set of public keys, each with a weight, and a threshold. Transactions require signatures whose combined weight meets the threshold (k-of-n). This can be combined with zkLogin for social-login-based multisig.

**Sui multisig model:**
- Each signer has a **public key** and a **weight** (1-256)
- The **threshold** defines the minimum combined weight needed to authorize a transaction
- The multisig **address** is deterministically derived from the keys, weights, and threshold
- Supports Ed25519, Secp256k1, Secp256r1, and zkLogin signers

## Workflow

### Step 1: Create a Multisig Address

```typescript
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// Generate or load keypairs for each signer
const signer1 = Ed25519Keypair.deriveKeypair("signer1 mnemonic phrase...");
const signer2 = Ed25519Keypair.deriveKeypair("signer2 mnemonic phrase...");
const signer3 = Ed25519Keypair.deriveKeypair("signer3 mnemonic phrase...");

// Create a 2-of-3 multisig
const multiSigPublicKey = MultiSigPublicKey.fromPublicKeys({
  threshold: 2,
  publicKeys: [
    { publicKey: signer1.getPublicKey(), weight: 1 },
    { publicKey: signer2.getPublicKey(), weight: 1 },
    { publicKey: signer3.getPublicKey(), weight: 1 },
  ],
});

// The multisig address is deterministic
const multisigAddress = multiSigPublicKey.toSuiAddress();
console.log("Multisig address:", multisigAddress);
// Fund this address to use it
```

### Step 2: Sign and Execute a Multisig Transaction

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Build the transaction (anyone can do this)
const tx = new Transaction();
tx.setSender(multisigAddress);
tx.transferObjects(
  [tx.splitCoins(tx.gas, [tx.pure.u64("500000000")])], // 0.5 SUI
  tx.pure.address("0x<RECIPIENT>"),
);

// Build the transaction bytes
const txBytes = await tx.build({ client });

// Signer 1 signs
const sig1 = await signer1.signTransaction(txBytes);

// Signer 2 signs (can be done independently, even on different machines)
const sig2 = await signer2.signTransaction(txBytes);

// Combine signatures into a multisig signature
const combinedSignature = multiSigPublicKey.combinePartialSignatures([
  sig1.signature,
  sig2.signature,
]);

// Execute the transaction with the combined signature
const result = await client.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: combinedSignature,
  options: { showEffects: true },
});

console.log("Multisig tx digest:", result.digest);
console.log("Status:", result.effects?.status?.status);
```

### Step 3: Weighted Multisig (Non-Equal Signers)

```typescript
// Example: CEO has more weight, needs 3 of 5 total weight
const weightedMultiSig = MultiSigPublicKey.fromPublicKeys({
  threshold: 3, // Need combined weight >= 3
  publicKeys: [
    { publicKey: ceoKey.getPublicKey(), weight: 2 },     // CEO: weight 2
    { publicKey: ctoKey.getPublicKey(), weight: 1 },     // CTO: weight 1
    { publicKey: cfoKey.getPublicKey(), weight: 1 },     // CFO: weight 1
    { publicKey: devKey.getPublicKey(), weight: 1 },     // Dev: weight 1
  ],
});

// CEO alone can't sign (weight 2 < threshold 3)
// CEO + anyone else can sign (weight 2+1 = 3 >= threshold 3)
// Any 3 non-CEO signers can sign (weight 1+1+1 = 3 >= threshold 3)
```

### Step 4: Multisig with zkLogin (Social Login Signers)

```typescript
import { toZkLoginPublicIdentifier } from "@mysten/sui/zklogin";

// Combine traditional keypairs with zkLogin identities
// This enables "sign with Google + hardware key" multisig

const zkLoginPublicIdentifier = toZkLoginPublicIdentifier(
  BigInt(userSalt),
  "https://accounts.google.com", // issuer
);

const hybridMultiSig = MultiSigPublicKey.fromPublicKeys({
  threshold: 2,
  publicKeys: [
    { publicKey: zkLoginPublicIdentifier, weight: 1 },   // Google login
    { publicKey: hardwareKey.getPublicKey(), weight: 1 }, // Hardware key
    { publicKey: backupKey.getPublicKey(), weight: 1 },   // Backup key
  ],
});

// User can sign with: Google + hardware, Google + backup, or hardware + backup
```

### Step 5: Protect UpgradeCap with Multisig

```typescript
// Transfer the UpgradeCap to a multisig address so package upgrades
// require multiple signatures

async function transferUpgradeCapToMultisig(
  currentOwnerKeypair: Ed25519Keypair,
  upgradeCapId: string,
) {
  const tx = new Transaction();
  tx.transferObjects(
    [tx.object(upgradeCapId)],
    tx.pure.address(multisigAddress),
  );

  const result = await client.signAndExecuteTransaction({
    signer: currentOwnerKeypair,
    transaction: tx,
  });

  console.log("UpgradeCap transferred to multisig:", result.digest);
}

// Now package upgrades require 2-of-3 signatures:
async function upgradePackageWithMultisig(
  upgradePolicyId: string,
  upgradeCapId: string,
  compiledModules: Uint8Array[],
) {
  const tx = new Transaction();
  tx.setSender(multisigAddress);

  // Build upgrade transaction
  const upgradeTicket = tx.moveCall({
    target: "0x2::package::authorize_upgrade",
    arguments: [
      tx.object(upgradeCapId),
      tx.pure.u8(0), // compatible policy
      tx.pure.vector("u8", /* digest bytes */[]),
    ],
  });

  // ... complete upgrade flow

  const txBytes = await tx.build({ client });

  // Collect signatures from multisig members
  const sig1 = await signer1.signTransaction(txBytes);
  const sig2 = await signer2.signTransaction(txBytes);

  const combinedSig = multiSigPublicKey.combinePartialSignatures([
    sig1.signature,
    sig2.signature,
  ]);

  return client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: combinedSig,
  });
}
```

### Step 6: Multisig Treasury Pattern

```typescript
// Common pattern: DAO treasury controlled by multisig
// 1. Create multisig address
// 2. Fund the multisig address
// 3. Any spending requires k-of-n signatures

async function proposeTreasurySpend(
  recipient: string,
  amountSui: number,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(multisigAddress);

  const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
  tx.transferObjects(
    [tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)])],
    tx.pure.address(recipient),
  );

  // Build and return bytes for other signers
  const txBytes = await tx.build({ client });
  return txBytes;
}

// Signing flow for distributed teams:
// 1. Proposer builds tx and shares txBytes (base64 encoded)
// 2. Each signer independently signs the txBytes
// 3. Coordinator collects signatures and combines them
// 4. Execute with combined signature

function serializeForSharing(txBytes: Uint8Array): string {
  return Buffer.from(txBytes).toString("base64");
}

function deserializeFromSharing(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}
```

### Step 7: Handoff

- "I want a full DAO with proposals" -> route to `build-dao`
- "I need zkLogin for signers" -> route to `build-zklogin-app`
- "Deploy with multisig protection" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Never change the signer set after creation** — the multisig address is derived from the keys, weights, and threshold. Changing any of these produces a different address. Plan the signer set carefully.
2. **Always verify the multisig address before funding** — compute the address from the public keys and verify it matches what you expect.
3. **Store the multisig configuration** — you need all public keys, weights, and threshold to reconstruct the MultiSigPublicKey for signing. Losing this config means losing access.
4. **All signers must sign the exact same transaction bytes** — any difference in the bytes (even gas budget) invalidates signatures.
5. **Protect the UpgradeCap with multisig for production packages** — a single-signer UpgradeCap is a centralization risk.
6. **Test with testnet first** — verify the signing flow works with your actual key management setup before deploying to mainnet.

## References

- Sui Multisig: https://docs.sui.io/concepts/cryptography/transaction-auth/multisig
- Sui TypeScript SDK Multisig: https://sdk.mystenlabs.com/typescript/cryptography/multisig
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
