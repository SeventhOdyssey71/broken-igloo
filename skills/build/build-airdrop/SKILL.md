---
name: build-airdrop
description: "Execute token airdrops on Sui. Covers batch transfers via PTBs, Merkle tree claims, eligibility verification, gas-efficient multi-send, CSV processing, snapshot tools, claim portals. Triggers: airdrop, token airdrop, batch transfer, multi send, merkle claim, airdrop tokens, distribute tokens"
---

```bash
# Telemetry preamble
SKILL_NAME="build-airdrop"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui airdrop engineer. Your job is to help users distribute tokens to many addresses efficiently on Sui. Sui's Programmable Transaction Blocks (PTBs) make airdrops fundamentally different from EVM — you can send to **hundreds of recipients in a single transaction** by chaining `splitCoins` and `transferObjects` commands within one PTB. No loops, no batching contracts, no multicall wrappers.

Two approaches:
1. **Push airdrop**: The sender builds a PTB that distributes tokens to all recipients in one or more transactions. Simple, immediate, but sender pays all gas.
2. **Pull airdrop (Merkle claim)**: The sender publishes a Merkle root on-chain. Recipients prove eligibility and claim their allocation. Recipients pay gas. Better for large distributions (10K+ addresses).

## Workflow

### Step 1: Prepare the Distribution List

```typescript
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

interface AirdropEntry {
  address: string;
  amount: bigint;
}

// Parse a CSV: address,amount
function loadDistributionList(csvPath: string): AirdropEntry[] {
  const raw = readFileSync(csvPath, "utf-8");
  const records = parse(raw, { columns: true, trim: true });

  return records.map((r: any) => ({
    address: r.address.trim(),
    amount: BigInt(r.amount), // Amount in smallest unit (e.g., MIST)
  }));
}

// Validate addresses
function validateList(entries: AirdropEntry[]): AirdropEntry[] {
  const seen = new Set<string>();
  const valid: AirdropEntry[] = [];

  for (const entry of entries) {
    // Check valid Sui address format
    if (!entry.address.startsWith("0x") || entry.address.length !== 66) {
      console.warn(`Invalid address: ${entry.address}, skipping`);
      continue;
    }
    // Check for duplicates
    if (seen.has(entry.address)) {
      console.warn(`Duplicate address: ${entry.address}, skipping`);
      continue;
    }
    // Check non-zero amount
    if (entry.amount <= 0n) {
      console.warn(`Zero/negative amount for ${entry.address}, skipping`);
      continue;
    }
    seen.add(entry.address);
    valid.push(entry);
  }

  console.log(`Validated ${valid.length}/${entries.length} entries`);
  return valid;
}

const entries = validateList(loadDistributionList("./airdrop-list.csv"));
const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0n);
console.log(`Total distribution: ${totalAmount} tokens to ${entries.length} addresses`);
```

### Step 2: Push Airdrop via PTB (Up to ~256 Recipients per TX)

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
const signer = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!);

const COIN_TYPE = `${PACKAGE_ID}::my_token::MY_TOKEN`;
const TOKEN_OBJECT_ID = "0x..."; // The coin object holding tokens to distribute

// PTB limit: ~256 commands per transaction, so batch in chunks
const BATCH_SIZE = 250;

async function executeAirdrop(entries: AirdropEntry[]) {
  // Split entries into batches
  const batches: AirdropEntry[][] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(entries.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction();

    // Split coins for all recipients in this batch
    const amounts = batch.map((e) => tx.pure.u64(e.amount));
    const coins = tx.splitCoins(tx.object(TOKEN_OBJECT_ID), amounts);

    // Transfer each split coin to its recipient
    batch.forEach((entry, idx) => {
      tx.transferObjects([coins[idx]], tx.pure.address(entry.address));
    });

    // Set appropriate gas budget
    tx.setGasBudget(500_000_000n); // 0.5 SUI gas budget

    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    });

    console.log(
      `Batch ${i + 1}/${batches.length}: ${result.effects.status.status} ` +
      `(${batch.length} recipients, digest: ${result.digest})`
    );

    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

executeAirdrop(entries).catch(console.error);
```

### Step 3: SUI-Native Airdrop (Using Gas Coin)

For distributing SUI itself:

```typescript
async function airdropSUI(entries: AirdropEntry[]) {
  const batches = chunk(entries, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction();

    // Split from gas coin — no separate token object needed
    const amounts = batch.map((e) => tx.pure.u64(e.amount));
    const coins = tx.splitCoins(tx.gas, amounts);

    batch.forEach((entry, idx) => {
      tx.transferObjects([coins[idx]], tx.pure.address(entry.address));
    });

    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
    });

    console.log(`Batch ${i + 1}/${batches.length}: ${result.digest}`);
  }
}
```

### Step 4: Merkle Tree Claim Airdrop (Pull Model)

**4a: Generate the Merkle Tree (off-chain)**

```typescript
import { keccak256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

interface MerkleEntry {
  address: string;
  amount: bigint;
}

function hashLeaf(entry: MerkleEntry): Uint8Array {
  const addressBytes = hexToBytes(entry.address.slice(2));
  const amountBytes = new Uint8Array(8);
  new DataView(amountBytes.buffer).setBigUint64(0, entry.amount, false);
  return keccak256(new Uint8Array([...addressBytes, ...amountBytes]));
}

function buildMerkleTree(entries: MerkleEntry[]): {
  root: string;
  proofs: Map<string, string[]>;
} {
  // Sort entries deterministically
  const sorted = [...entries].sort((a, b) => a.address.localeCompare(b.address));

  // Create leaf hashes
  let leaves = sorted.map(hashLeaf);

  // Build proof map
  const proofs = new Map<string, string[]>();
  sorted.forEach((entry) => proofs.set(entry.address, []));

  // Build tree levels
  let currentLevel = leaves;
  let indexMap = sorted.map((_, i) => i);

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    const nextIndexMap: number[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Pair exists — hash together (sorted)
        const [left, right] = [currentLevel[i], currentLevel[i + 1]].sort(
          (a, b) => bytesToHex(a).localeCompare(bytesToHex(b))
        );
        nextLevel.push(keccak256(new Uint8Array([...left, ...right])));

        // Add sibling to proof for both entries
        const leftIdx = indexMap[i];
        const rightIdx = indexMap[i + 1];
        proofs.get(sorted[leftIdx].address)!.push(bytesToHex(currentLevel[i + 1]));
        proofs.get(sorted[rightIdx].address)!.push(bytesToHex(currentLevel[i]));
      } else {
        // Odd node — promote
        nextLevel.push(currentLevel[i]);
      }
      nextIndexMap.push(indexMap[i]);
    }

    currentLevel = nextLevel;
    indexMap = nextIndexMap;
  }

  return {
    root: bytesToHex(currentLevel[0]),
    proofs,
  };
}

// Generate and save
const tree = buildMerkleTree(entries);
console.log("Merkle root:", tree.root);

// Save proofs for the claim portal
writeFileSync("./merkle-proofs.json", JSON.stringify({
  root: tree.root,
  entries: entries.map((e) => ({
    address: e.address,
    amount: e.amount.toString(),
    proof: tree.proofs.get(e.address),
  })),
}, null, 2));
```

**4b: On-chain Merkle Claim Contract**

```move
module airdrop::merkle_claim {
    use sui::coin::{Self, Coin};
    use sui::balance::Balance;
    use sui::table::{Self, Table};
    use sui::hash::keccak256;
    use sui::event;
    use sui::bcs;

    const EAlreadyClaimed: u64 = 0;
    const EInvalidProof: u64 = 1;
    const EAirdropEnded: u64 = 2;

    public struct AdminCap has key, store { id: UID }

    public struct MerkleAirdrop<phantom T> has key {
        id: UID,
        /// Merkle root hash
        merkle_root: vector<u8>,
        /// Token balance for distribution
        balance: Balance<T>,
        /// Track claimed addresses
        claimed: Table<address, bool>,
        /// Total claimed amount
        total_claimed: u64,
        /// Whether airdrop is active
        active: bool,
    }

    public struct Claimed has copy, drop {
        airdrop_id: ID,
        claimer: address,
        amount: u64,
    }

    public entry fun create_airdrop<T>(
        _admin: &AdminCap,
        merkle_root: vector<u8>,
        tokens: Coin<T>,
        ctx: &mut TxContext,
    ) {
        let airdrop = MerkleAirdrop<T> {
            id: object::new(ctx),
            merkle_root,
            balance: coin::into_balance(tokens),
            claimed: table::new(ctx),
            total_claimed: 0,
            active: true,
        };
        transfer::share_object(airdrop);
    }

    public entry fun claim<T>(
        airdrop: &mut MerkleAirdrop<T>,
        amount: u64,
        proof: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        assert!(airdrop.active, EAirdropEnded);
        let sender = tx_context::sender(ctx);
        assert!(!table::contains(&airdrop.claimed, sender), EAlreadyClaimed);

        // Verify Merkle proof
        let leaf = compute_leaf(sender, amount);
        assert!(verify_proof(leaf, &proof, &airdrop.merkle_root), EInvalidProof);

        // Mark as claimed
        table::add(&mut airdrop.claimed, sender, true);
        airdrop.total_claimed = airdrop.total_claimed + amount;

        // Transfer tokens
        let claim_coin = coin::from_balance(
            balance::split(&mut airdrop.balance, amount),
            ctx,
        );

        event::emit(Claimed {
            airdrop_id: object::id(airdrop),
            claimer: sender,
            amount,
        });

        transfer::public_transfer(claim_coin, sender);
    }

    fun compute_leaf(addr: address, amount: u64): vector<u8> {
        let mut data = bcs::to_bytes(&addr);
        vector::append(&mut data, bcs::to_bytes(&amount));
        keccak256(&data)
    }

    fun verify_proof(
        mut leaf: vector<u8>,
        proof: &vector<vector<u8>>,
        root: &vector<u8>,
    ): bool {
        let len = vector::length(proof);
        let mut i = 0;
        while (i < len) {
            let sibling = vector::borrow(proof, i);
            // Sort and hash pair
            if (leaf < *sibling) {
                let mut combined = leaf;
                vector::append(&mut combined, *sibling);
                leaf = keccak256(&combined);
            } else {
                let mut combined = *sibling;
                vector::append(&mut combined, leaf);
                leaf = keccak256(&combined);
            };
            i = i + 1;
        };
        leaf == *root
    }
}
```

### Step 5: Claim Portal Frontend

```typescript
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

function ClaimPortal() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [claimData, setClaimData] = useState(null);

  useEffect(() => {
    if (account) {
      // Look up this address in the Merkle proof file
      fetch("/api/airdrop/check?address=" + account.address)
        .then((r) => r.json())
        .then(setClaimData);
    }
  }, [account]);

  const handleClaim = () => {
    if (!claimData) return;

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::merkle_claim::claim`,
      typeArguments: [TOKEN_TYPE],
      arguments: [
        tx.object(AIRDROP_OBJECT_ID),
        tx.pure.u64(claimData.amount),
        tx.pure(claimData.proof, "vector<vector<u8>>"),
      ],
    });

    signAndExecute({ transaction: tx });
  };

  if (!claimData) return <p>Checking eligibility...</p>;
  if (claimData.claimed) return <p>Already claimed!</p>;
  if (!claimData.eligible) return <p>Not eligible for this airdrop.</p>;

  return (
    <div>
      <h2>You are eligible for {claimData.amount} tokens!</h2>
      <button onClick={handleClaim}>Claim Airdrop</button>
    </div>
  );
}
```

### Step 6: Monitoring and Analytics

```typescript
// Track airdrop progress
async function getAirdropStatus(airdropObjectId: string) {
  const obj = await client.getObject({
    id: airdropObjectId,
    options: { showContent: true },
  });

  const fields = obj.data.content.fields;
  return {
    totalBalance: fields.balance,
    totalClaimed: fields.total_claimed,
    claimedCount: fields.claimed.fields.size,
    active: fields.active,
    percentClaimed: (Number(fields.total_claimed) / Number(fields.balance + fields.total_claimed) * 100).toFixed(2),
  };
}
```

## Non-Negotiables

1. **ALWAYS validate addresses before sending** — invalid addresses waste gas and the transaction fails for the whole batch
2. **ALWAYS deduplicate the distribution list** — sending to the same address twice wastes tokens
3. **PTB limit is ~256 commands per transaction** — batch larger airdrops into multiple transactions
4. **ALWAYS dry-run before executing** — use `client.dryRunTransaction()` to verify gas costs and catch errors
5. **NEVER store the Merkle proof file on-chain** — only the root goes on-chain; proofs are served via API or static file
6. **ALWAYS mark claims in a Table** — prevents double-claiming; use address as the key
7. **ALWAYS emit events for claims** — indexers and dashboards need to track distribution progress
8. **For large airdrops (10K+), use Merkle claims** — push airdrops at that scale are expensive and slow

## References

- `skills/build/launch-token/SKILL.md` — Creating the airdrop token
- `skills/build/build-data-pipeline/SKILL.md` — Snapshot and eligibility data
- `skills/build/integrate-enoki/SKILL.md` — Sponsored claims for gasless UX
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
