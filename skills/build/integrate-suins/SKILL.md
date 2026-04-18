---
name: integrate-suins
description: "Deep guide for integrating SuiNS (Sui Name Service) into apps. Covers name resolution, reverse lookup, registration, subnames, on-chain resolution in Move. Triggers: suins, sui name service, domain name, .sui name, resolve name"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-suins"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a SuiNS integration specialist. SuiNS is the official name service for the Sui blockchain — it maps human-readable names like `alice.sui` to Sui addresses (`0x1234...`). Think of it as DNS for Sui. SuiNS names are NFTs (owned objects), so they can be transferred, sold, and managed on-chain.

**Key concepts:**
- **Name** — a `.sui` domain (e.g., `alice.sui`)
- **NameRecord** — the on-chain data for a name (target address, avatar, content hash)
- **Subname** — a child name (e.g., `pay.alice.sui`)
- **Default name** — reverse lookup: which name an address wants to be known by

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/suins @mysten/sui
```

### Step 2: SDK Setup

```typescript
import { SuinsClient } from "@mysten/suins";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Create a SuiNS client
const suinsClient = new SuinsClient({
  client: suiClient,
  network: "mainnet",
});
```

### Step 3: Resolve a Name to an Address

The most common operation — convert `alice.sui` to `0x1234...`.

```typescript
async function resolveNameToAddress(name: string): Promise<string | null> {
  const nameRecord = await suinsClient.getNameRecord(name);

  if (!nameRecord) {
    console.log(`${name} is not registered`);
    return null;
  }

  console.log(`${name} => ${nameRecord.targetAddress}`);
  return nameRecord.targetAddress;
}

// Usage
const address = await resolveNameToAddress("alice.sui");
// => "0x1234abcd..."
```

**With full record data:**

```typescript
async function getFullNameRecord(name: string) {
  const record = await suinsClient.getNameRecord(name);

  if (!record) return null;

  return {
    targetAddress: record.targetAddress,
    avatar: record.avatar,           // URL to avatar image
    contentHash: record.contentHash, // IPFS/Walrus content hash
    walrusSiteId: record.data?.["walrusSiteId"], // Walrus Site object ID
    // Any custom key-value data set by the owner
    customData: record.data,
  };
}

const record = await getFullNameRecord("alice.sui");
console.log("Address:", record?.targetAddress);
console.log("Avatar:", record?.avatar);
```

### Step 4: Reverse Lookup (Address to Name)

Find which `.sui` name an address has set as their default.

```typescript
async function getDefaultName(address: string): Promise<string | null> {
  const defaultName = await suinsClient.getDefaultName(address);

  if (!defaultName) {
    console.log(`${address} has no default .sui name`);
    return null;
  }

  console.log(`${address} => ${defaultName}`);
  return defaultName;
}

// Usage
const name = await getDefaultName("0x1234abcd...");
// => "alice.sui"
```

### Step 5: Display Names in UI

Best practice: always try to show the `.sui` name instead of raw addresses.

```typescript
// React component for displaying a Sui address with name resolution
import { useState, useEffect } from "react";

function SuiAddress({ address }: { address: string }) {
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    async function resolve() {
      const name = await suinsClient.getDefaultName(address);
      setDisplayName(name);
    }
    resolve();
  }, [address]);

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <span title={address}>
      {displayName || shortAddress}
    </span>
  );
}

// Usage: <SuiAddress address="0x1234abcdef..." />
// Renders: "alice.sui" (or "0x1234...cdef" if no name set)
```

**With caching for lists (e.g., leaderboard, transaction history):**

```typescript
// Batch resolve names for a list of addresses
async function resolveNames(
  addresses: string[]
): Promise<Map<string, string | null>> {
  const nameMap = new Map<string, string | null>();

  // Resolve in parallel (with concurrency limit)
  const results = await Promise.all(
    addresses.map(async (addr) => {
      const name = await suinsClient.getDefaultName(addr);
      return { addr, name };
    })
  );

  for (const { addr, name } of results) {
    nameMap.set(addr, name);
  }

  return nameMap;
}

// Usage
const addresses = ["0xabc...", "0xdef...", "0x123..."];
const names = await resolveNames(addresses);
// Map { "0xabc..." => "alice.sui", "0xdef..." => null, "0x123..." => "bob.sui" }
```

### Step 6: Check Availability and Pricing

```typescript
async function checkAvailability(name: string): Promise<{
  available: boolean;
  price?: { oneYear: string; threeYears: string; fiveYears: string };
}> {
  const record = await suinsClient.getNameRecord(`${name}.sui`);

  if (record) {
    return { available: false };
  }

  // Pricing depends on name length:
  // 3 chars: most expensive
  // 4 chars: medium
  // 5+ chars: cheapest
  const length = name.length;
  let basePrice: number;

  if (length === 3) basePrice = 500;      // ~500 SUI/year
  else if (length === 4) basePrice = 100;  // ~100 SUI/year
  else basePrice = 20;                     // ~20 SUI/year for 5+

  return {
    available: true,
    price: {
      oneYear: `~${basePrice} SUI`,
      threeYears: `~${basePrice * 3} SUI`,
      fiveYears: `~${basePrice * 5} SUI`,
    },
  };
}

const result = await checkAvailability("alice");
// { available: false } — already taken
const result2 = await checkAvailability("mynewname");
// { available: true, price: { oneYear: "~20 SUI", ... } }
```

### Step 7: Register a Name

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

async function registerName(
  name: string,
  years: number,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  // Use the SuiNS SDK to build the registration transaction
  const registrationTx = suinsClient.buildRegisterTransaction({
    name: `${name}.sui`,
    years,
    transaction: tx,
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showObjectChanges: true },
  });

  console.log(`Registered ${name}.sui for ${years} year(s)`);
  console.log("Digest:", result.digest);

  // Find the SuiNS NFT in the created objects
  const nftObject = result.objectChanges?.find(
    (obj) => obj.type === "created" && obj.objectType?.includes("SuinsRegistration")
  );
  console.log("SuiNS NFT ID:", nftObject?.objectId);

  return result;
}

// Register "mynewname.sui" for 1 year
await registerName("mynewname", 1, keypair);
```

### Step 8: Set Target Address and Records

```typescript
async function setTargetAddress(
  name: string,
  targetAddress: string,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  suinsClient.buildSetTargetAddressTransaction({
    name,
    address: targetAddress,
    transaction: tx,
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  console.log(`Set ${name} => ${targetAddress}`);
  return result;
}

// Set the default (reverse) name for an address
async function setDefaultName(
  name: string,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  suinsClient.buildSetDefaultNameTransaction({
    name,
    transaction: tx,
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  console.log(`Set default name to ${name}`);
  return result;
}

// Set avatar and other records
async function setAvatar(
  name: string,
  avatarUrl: string,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  suinsClient.buildSetAvatarTransaction({
    name,
    avatar: avatarUrl,
    transaction: tx,
  });

  return await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });
}
```

### Step 9: Subnames (Child Names)

Subnames let you create names under your domain: `pay.alice.sui`, `nft.alice.sui`.

```typescript
// Create a subname
async function createSubname(
  parentName: string,
  label: string,
  targetAddress: string,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  suinsClient.buildCreateSubnameTransaction({
    parentName,
    name: label,        // e.g., "pay" for "pay.alice.sui"
    targetAddress,
    transaction: tx,
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  console.log(`Created ${label}.${parentName}`);
  return result;
}

// Create "pay.alice.sui" pointing to a specific address
await createSubname("alice.sui", "pay", "0x<PAYMENT_ADDRESS>", keypair);

// Resolve the subname
const payAddress = await resolveNameToAddress("pay.alice.sui");
```

### Step 10: Renewal

```typescript
async function renewName(
  name: string,
  years: number,
  keypair: Ed25519Keypair
) {
  const tx = new Transaction();

  suinsClient.buildRenewTransaction({
    name,
    years,
    transaction: tx,
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  console.log(`Renewed ${name} for ${years} more year(s)`);
  return result;
}
```

### Step 11: On-Chain Resolution in Move

You can resolve SuiNS names directly in Move contracts:

```move
module my_app::payments {
    use suins::suins::{SuiNS};
    use suins::registry::Registry;
    use suins::domain;

    /// Accept a SuiNS name instead of a raw address for payment
    public fun pay_by_name(
        suins: &SuiNS,
        name_string: vector<u8>,
        payment: Coin<SUI>,
    ) {
        // Parse the domain
        let domain = domain::new(
            std::string::utf8(name_string)
        );

        // Look up the registry to get the target address
        let registry = suins::registry<Registry>(suins);
        let record = registry::lookup(registry, domain);

        // Get the target address from the record
        let target = name_record::target_address(
            option::borrow(&record)
        );

        // Transfer payment to the resolved address
        transfer::public_transfer(payment, *target);
    }
}
```

### Step 12: Complete Working Example

```typescript
import { SuinsClient } from "@mysten/suins";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// --- Setup ---
const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
const suinsClient = new SuinsClient({ client: suiClient, network: "mainnet" });
const keypair = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!);

// --- Resolve name for a transfer ---
async function transferToName(
  recipientName: string,
  amountMist: bigint
) {
  // Resolve the name
  const record = await suinsClient.getNameRecord(recipientName);
  if (!record?.targetAddress) {
    throw new Error(`Could not resolve ${recipientName}`);
  }

  // Build transfer transaction
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.transferObjects([coin], tx.pure.address(record.targetAddress));

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  console.log(
    `Sent ${Number(amountMist) / 1e9} SUI to ${recipientName} (${record.targetAddress})`
  );
  console.log("Digest:", result.digest);
  return result;
}

// Send 1 SUI to alice.sui
await transferToName("alice.sui", 1_000_000_000n);
```

## Non-Negotiables

1. **ALWAYS handle the case where a name does not resolve** — names expire, may not have a target set, or may not exist. Never assume resolution succeeds.
2. **ALWAYS include the `.sui` suffix** when calling SDK methods that expect a full name
3. **NEVER cache name resolutions permanently** — names can change target addresses. Cache for at most a few minutes.
4. **ALWAYS show the full address as a tooltip/fallback** even when displaying the `.sui` name — users may need to verify
5. **ALWAYS use mainnet SuinsClient for production** — testnet names are separate and do not carry over
6. **NEVER register names speculatively in code** — registration costs SUI and is a user-initiated action
7. **ALWAYS validate names before resolution** — names must be 3+ characters, alphanumeric and hyphens only
8. **ALWAYS set a default name after registration** — without it, reverse lookup will not work for the address

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
