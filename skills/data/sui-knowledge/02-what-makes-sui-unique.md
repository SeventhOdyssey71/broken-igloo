# What Makes Sui Unique

## 1. Programmable Transaction Blocks (PTBs)

PTBs are Sui's killer feature for developers. A single transaction can contain up to **1,024 commands** that execute atomically. Outputs from one command feed as inputs to the next — all composed **client-side** with no on-chain wrapper contracts.

### Example: Swap + Stake + Deposit in One Transaction
```typescript
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();

// Step 1: Swap SUI for USDC via Cetus
const [usdc] = tx.moveCall({
  target: '0xcetus::router::swap',
  arguments: [tx.object(poolId), tx.splitCoins(tx.gas, [1_000_000_000])],
});

// Step 2: Deposit USDC into Scallop lending
tx.moveCall({
  target: '0xscallop::lending::deposit',
  arguments: [tx.object(marketId), usdc],
});

// All atomic — if step 2 fails, step 1 reverts too
```

### Why This Matters
- **No wrapper contracts**: Complex DeFi flows without deploying additional Move packages
- **Atomic composability**: Everything succeeds or everything reverts
- **Gas efficiency**: One transaction, one gas payment
- **Client-side flexibility**: Change composition without redeploying contracts

## 2. Object Model

Every on-chain entity in Sui is an **object** with a globally unique ID (UID).

### Object Types

| Type | Access | Use Case |
|------|--------|----------|
| **Owned** | Only the owner can use it in transactions | Coins, NFTs, personal data |
| **Shared** | Anyone can read/write (with consensus) | DEX pools, lending markets, registries |
| **Immutable** | Frozen forever, anyone can read | Published packages, config constants |
| **Wrapped** | Inside another object, not directly addressable | Composable NFT components |

### Objects vs Accounts
```
Solana:  Alice's SOL → Token Account (PDA) → Mint Authority (PDA)
Sui:     Alice's SUI → Coin<SUI> object (owned by Alice)
```

On Sui, Alice's coins are **objects she owns**. No associated token accounts, no PDAs. Transfer is just changing the object's owner field.

### Dynamic Fields
Objects can have an arbitrary number of typed key-value fields added at runtime:
```move
dynamic_field::add(&mut obj.id, key, value);
let val = dynamic_field::borrow(&obj.id, key);
```
This replaces Solana's pattern of creating multiple PDAs for storage.

## 3. zkLogin — Protocol-Level OAuth Wallets

zkLogin maps OAuth credentials (Google, Apple, Facebook, Twitch) to Sui addresses using zero-knowledge proofs. The user never sees a seed phrase or installs a wallet extension.

### How It Works
1. User signs in via OAuth (e.g., Google)
2. App generates an ephemeral keypair
3. ZK proof is generated linking the OAuth JWT to the ephemeral key
4. Transaction is signed with the ephemeral key + ZK proof
5. Sui validators verify the proof on-chain

### Key Properties
- **Self-custodial**: No server holds keys. The ZK proof proves the user owns the OAuth identity.
- **No wallet extension**: Works in any browser
- **Deterministic addresses**: Same Google account always maps to the same Sui address
- **Privacy**: Validators verify the proof without seeing the OAuth identity

### SDKs
- `@mysten/sui/zklogin` — Low-level zkLogin utilities
- `@mysten/enoki` — High-level SDK wrapping zkLogin + sponsored transactions
- `@shinami/clients` — Managed zkLogin wallet API

## 4. Sponsored Transactions

Any transaction on Sui can have its gas paid by a **sponsor** instead of the sender. This is a first-class protocol feature, not a workaround.

### Sponsor Flow
```typescript
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
tx.setSender(userAddress);
tx.setGasOwner(sponsorAddress); // Sponsor pays gas
tx.setGasBudget(10_000_000);

// User signs the transaction
const userSig = await userKeypair.signTransaction(txBytes);
// Sponsor signs the gas payment
const sponsorSig = await sponsorKeypair.signTransaction(txBytes);

// Submit with both signatures
await client.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: [userSig, sponsorSig],
});
```

### Managed Services
- **Shinami Gas Station**: API-based gas sponsorship with spending limits per wallet
- **Enoki**: Built-in sponsored transactions with zkLogin

## 5. Mysticeti Consensus

Sui uses a DAG-based consensus protocol called **Mysticeti** (formerly Narwhal/Bullshark):

- **Owned objects**: Skip consensus entirely → ~390ms finality (fast path)
- **Shared objects**: Go through consensus → ~2-3s finality
- **Throughput**: 300,000+ TPS demonstrated on mainnet
- **Deterministic finality**: No probabilistic confirmation — once final, it's final

### Implications for Developers
- Structure your app to use **owned objects** where possible for instant finality
- Use **shared objects** only when multiple users must read/write (e.g., AMM pools)
- Group operations into PTBs to minimize consensus rounds

## 6. Move Language Safety

Move provides compile-time guarantees that prevent entire classes of bugs:

| Safety Property | How Move Enforces It |
|----------------|---------------------|
| No double-spend | Linear types — resources can't be copied |
| No asset destruction | Resources can't be dropped unless explicitly allowed |
| No reentrancy | No dynamic dispatch, no callbacks |
| No unauthorized access | Capability pattern — operations require holding the right object |
| No type confusion | Strong static typing, generics verified at compile time |

### The Abilities System
```move
struct Coin<phantom T> has key, store {
    id: UID,
    balance: Balance<T>,
}
// key   → can be stored as a top-level object with a UID
// store → can be transferred and stored inside other objects
// (no copy → can't duplicate coins)
// (no drop → can't accidentally destroy coins)
```

## 7. Storage Economics

Sui's storage model is unique:
- **Storage fee**: Paid upfront when creating objects (based on object size)
- **Storage rebate**: Refunded when deleting objects
- **No rent**: Objects don't expire or get garbage-collected

This incentivizes developers to clean up unused state and rewards efficient data structures.
