---
name: integrate-seal
description: "Deep guide for integrating Seal (decentralized secrets management) on Sui. Covers identity-based encryption, Move access policies, token-gated content, encrypted Walrus storage. Triggers: seal, encryption, decentralized secrets, token-gated content, encrypted storage"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-seal"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Seal integration specialist. Seal is a decentralized secrets management protocol on Sui that enables **identity-based encryption (IBE)**. It allows you to encrypt data such that only users who satisfy an on-chain access policy can decrypt it. The access policies are defined in Move smart contracts, so you can gate decryption on NFT ownership, token balance, DAO membership, subscription status, or any arbitrary on-chain condition.

**How Seal works (mental model):**

1. You define an **access policy** in a Move module (e.g., "must own an NFT from collection X")
2. You **encrypt** data client-side using a policy ID — no key exchange needed
3. The encrypted data is stored anywhere (Walrus, your server, IPFS)
4. To **decrypt**, the user proves they satisfy the policy, and a **threshold network of key servers** provides decryption shares
5. The client combines the shares to decrypt locally — no single party ever sees the plaintext

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/seal @mysten/sui @mysten/walrus
```

### Step 2: Understand the Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Client App  │    │  Sui Blockchain  │    │  Key Servers     │
│              │    │                  │    │  (Threshold)     │
│ 1. Encrypt   │───>│ Access Policy    │    │                  │
│    with       │    │ (Move module)   │    │ 4. Verify proof  │
│    policy ID  │    │                  │    │    + return      │
│              │    │ 3. Prove access  │───>│    decryption    │
│ 5. Decrypt   │<───│    on-chain      │    │    share         │
│    locally   │    │                  │    │                  │
└──────────────┘    └──────────────────┘    └──────────────────┘
       │                                            │
       │         ┌──────────────────┐               │
       └────────>│  Walrus / IPFS   │<──────────────┘
                 │  (encrypted blob)│
                 └──────────────────┘
```

### Step 3: Define Access Control Policy in Move

The policy determines WHO can decrypt. Here are common patterns:

**Pattern A: NFT-gated access (must own an NFT from a collection)**

```move
module my_app::nft_policy {
    use sui::event;

    /// Event emitted to prove the caller owns an NFT from this collection
    public struct AccessProof has copy, drop {
        /// The policy ID (used by Seal to match encryption)
        id: address,
        /// The user who proved access
        caller: address,
    }

    /// The access policy object — its ID is used as the encryption identity
    public struct NftAccessPolicy has key {
        id: UID,
        /// The collection type that grants access
        collection_type: std::ascii::String,
    }

    /// Create a new NFT-gated policy
    public fun create_policy(ctx: &mut TxContext): NftAccessPolicy {
        NftAccessPolicy {
            id: object::new(ctx),
            collection_type: std::ascii::string(
                b"0x<PACKAGE>::my_nft::MyNFT"
            ),
        }
    }

    /// Prove you own an NFT and can decrypt — called by Seal key servers
    /// The key servers verify this function executes successfully
    public fun seal_approve(
        policy: &NftAccessPolicy,
        // The user must pass their NFT as proof of ownership
        nft: &my_nft::MyNFT,
        ctx: &TxContext,
    ) {
        // The function succeeding IS the proof — if you don't own the NFT,
        // you can't pass it as an argument, so this call aborts
        event::emit(AccessProof {
            id: object::id_address(policy),
            caller: tx_context::sender(ctx),
        });
    }
}
```

**Pattern B: Token-gated access (must hold minimum balance)**

```move
module my_app::token_policy {
    use sui::coin::Coin;
    use sui::event;

    public struct TokenAccessPolicy has key {
        id: UID,
        min_balance: u64,
    }

    public struct AccessProof has copy, drop {
        id: address,
        caller: address,
    }

    public fun create_policy(min_balance: u64, ctx: &mut TxContext): TokenAccessPolicy {
        TokenAccessPolicy {
            id: object::new(ctx),
            min_balance,
        }
    }

    /// User proves they hold enough tokens
    public fun seal_approve<T>(
        policy: &TokenAccessPolicy,
        coin: &Coin<T>,
        ctx: &TxContext,
    ) {
        assert!(coin::value(coin) >= policy.min_balance, 0);

        event::emit(AccessProof {
            id: object::id_address(policy),
            caller: tx_context::sender(ctx),
        });
    }
}
```

**Pattern C: Subscription/time-gated access**

```move
module my_app::subscription_policy {
    use sui::clock::Clock;
    use sui::event;

    public struct Subscription has key, store {
        id: UID,
        owner: address,
        expires_at: u64, // timestamp in ms
    }

    public struct SubAccessPolicy has key {
        id: UID,
    }

    public struct AccessProof has copy, drop {
        id: address,
        caller: address,
    }

    public fun seal_approve(
        policy: &SubAccessPolicy,
        sub: &Subscription,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        // Must be the subscription owner
        assert!(sub.owner == tx_context::sender(ctx), 0);
        // Must not be expired
        assert!(sub.expires_at > clock::timestamp_ms(clock), 1);

        event::emit(AccessProof {
            id: object::id_address(policy),
            caller: tx_context::sender(ctx),
        });
    }
}
```

### Step 4: Client-Side Encryption

```typescript
import { SealClient } from "@mysten/seal";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

// Create a Seal client
const sealClient = new SealClient({
  suiClient,
  serverObjectIds: [
    // Seal key server object IDs (these are published by the Seal team)
    // Testnet key servers:
    "0x<KEY_SERVER_1>",
    "0x<KEY_SERVER_2>",
  ],
  verifyKeyServers: true,
});

// Encrypt data for a specific policy
async function encryptForPolicy(
  policyObjectId: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  // The policyObjectId is used as the identity for encryption
  // Anyone who can call seal_approve on this policy can decrypt
  const { encryptedData } = await sealClient.encrypt({
    policyId: policyObjectId,
    data: plaintext,
  });

  return encryptedData;
}

// Example: encrypt a secret message
const encoder = new TextEncoder();
const secret = encoder.encode("This is only for NFT holders!");
const encrypted = await encryptForPolicy("0x<POLICY_OBJECT_ID>", secret);
```

### Step 5: Store Encrypted Data on Walrus

```typescript
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const walrusClient = new WalrusClient({
  network: "testnet",
  suiClient,
});
const keypair = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!);

async function encryptAndStore(
  policyObjectId: string,
  plaintext: Uint8Array,
): Promise<{ blobId: string; policyId: string }> {
  // 1. Encrypt with Seal
  const { encryptedData } = await sealClient.encrypt({
    policyId: policyObjectId,
    data: plaintext,
  });

  // 2. Store encrypted blob on Walrus
  const { blobId } = await walrusClient.writeBlob({
    blob: encryptedData,
    deletable: false,
    epochs: 10,
    signer: keypair,
  });

  console.log(`Encrypted blob stored. Blob ID: ${blobId}`);
  console.log(`Policy ID: ${policyObjectId}`);

  // Store both IDs — you need both to decrypt later
  return { blobId, policyId: policyObjectId };
}
```

### Step 6: Decrypt with Key Server Threshold

```typescript
async function fetchAndDecrypt(
  blobId: string,
  policyObjectId: string,
  userKeypair: Ed25519Keypair,
): Promise<Uint8Array> {
  // 1. Fetch encrypted data from Walrus
  const encryptedData = await walrusClient.readBlob({ blobId });

  // 2. Build a transaction that proves the user has access
  // This transaction calls seal_approve on the policy
  const tx = new Transaction();
  tx.moveCall({
    target: "0x<PACKAGE>::nft_policy::seal_approve",
    arguments: [
      tx.object(policyObjectId), // the policy object
      tx.object("0x<USER_NFT_OBJECT_ID>"), // the user's NFT (proof)
    ],
  });

  // 3. Decrypt — Seal will execute the proof transaction against key servers
  const decryptedData = await sealClient.decrypt({
    encryptedData,
    transaction: tx,
    signer: userKeypair,
  });

  return decryptedData;
}

// Decrypt and read the secret message
const decrypted = await fetchAndDecrypt(blobId, policyId, userKeypair);
const message = new TextDecoder().decode(decrypted);
console.log(message); // "This is only for NFT holders!"
```

### Step 7: Use Cases — Complete Examples

**Use Case A: NFT with hidden content (reveal on purchase)**

```typescript
// Creator side: encrypt artwork, store on Walrus, mint NFT with blobId
async function mintNftWithSecret(
  artworkPath: string,
  policyObjectId: string,
  creatorKeypair: Ed25519Keypair,
) {
  const artwork = new Uint8Array(await readFile(artworkPath));

  // Encrypt the high-res artwork
  const { blobId } = await encryptAndStore(policyObjectId, artwork);

  // Mint the NFT with the encrypted blob reference
  const tx = new Transaction();
  tx.moveCall({
    target: "0x<PACKAGE>::my_nft::mint",
    arguments: [
      tx.pure.string("Secret Art #1"),
      tx.pure.string(blobId), // encrypted content reference
      tx.pure.string(policyObjectId), // policy for decryption
    ],
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: creatorKeypair,
  });

  return result;
}

// Buyer side: after purchasing the NFT, decrypt the hidden content
async function revealNftContent(
  blobId: string,
  policyObjectId: string,
  nftObjectId: string,
  buyerKeypair: Ed25519Keypair,
) {
  const encryptedData = await walrusClient.readBlob({ blobId });

  const tx = new Transaction();
  tx.moveCall({
    target: "0x<PACKAGE>::nft_policy::seal_approve",
    arguments: [
      tx.object(policyObjectId),
      tx.object(nftObjectId), // buyer now owns this NFT
    ],
  });

  const artwork = await sealClient.decrypt({
    encryptedData,
    transaction: tx,
    signer: buyerKeypair,
  });

  // Save the decrypted artwork
  await writeFile("./revealed-artwork.png", artwork);
}
```

**Use Case B: Token-gated article/content**

```typescript
// Publisher: encrypt article for token holders
async function publishGatedArticle(
  articleContent: string,
  policyObjectId: string,
) {
  const encrypted = await encryptForPolicy(
    policyObjectId,
    new TextEncoder().encode(articleContent),
  );

  const { blobId } = await walrusClient.writeBlob({
    blob: encrypted,
    deletable: true, // can remove if needed
    epochs: 30,
    signer: keypair,
  });

  // Store in your database: { articleId, blobId, policyId }
  return { blobId, policyId: policyObjectId };
}

// Reader: decrypt if they hold enough tokens
async function readGatedArticle(
  blobId: string,
  policyObjectId: string,
  tokenCoinObjectId: string,
  readerKeypair: Ed25519Keypair,
): Promise<string> {
  const encryptedData = await walrusClient.readBlob({ blobId });

  const tx = new Transaction();
  tx.moveCall({
    target: "0x<PACKAGE>::token_policy::seal_approve",
    typeArguments: ["0x<TOKEN_PACKAGE>::my_token::MY_TOKEN"],
    arguments: [
      tx.object(policyObjectId),
      tx.object(tokenCoinObjectId), // reader's token balance
    ],
  });

  const decrypted = await sealClient.decrypt({
    encryptedData,
    transaction: tx,
    signer: readerKeypair,
  });

  return new TextDecoder().decode(decrypted);
}
```

### Step 8: Key Server Configuration

Seal uses a **threshold** of key servers — you need responses from a minimum number (e.g., 2 of 3) to decrypt. This ensures:

- No single server can decrypt your data alone
- The system is resilient to individual server failures
- Collusion resistance through distributed trust

```typescript
// The SealClient handles threshold logic automatically
// You just provide the key server object IDs
const sealClient = new SealClient({
  suiClient,
  serverObjectIds: ["0x<KEY_SERVER_1>", "0x<KEY_SERVER_2>", "0x<KEY_SERVER_3>"],
  // Threshold is determined by the key server configuration
  // Typically 2-of-3 or 3-of-5
  verifyKeyServers: true, // verify servers are legitimate
});
```

## Non-Negotiables

1. **NEVER encrypt with a policy you haven't tested** — always verify that `seal_approve` works for intended users before encrypting real data
2. **ALWAYS store the policy ID alongside the encrypted data** — without it, decryption is impossible even if you have access
3. **NEVER store plaintext alongside ciphertext** — defeats the entire purpose
4. **ALWAYS use `verifyKeyServers: true`** in production — prevents man-in-the-middle attacks on the key server network
5. **ALWAYS name your seal_approve function exactly `seal_approve`** — the key servers look for this specific function name to verify access
6. **NEVER assume encryption means permanent secrecy** — if the access policy changes (e.g., NFT is transferred), new owners gain access
7. **ALWAYS handle decryption failures gracefully** — users may not satisfy the policy; show "access denied" not a crash
8. **ALWAYS test with testnet key servers first** — mainnet key servers may have different object IDs and configurations
9. **NEVER skip the Move policy** — the policy IS the security; without a well-audited policy, encryption provides no meaningful access control

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
