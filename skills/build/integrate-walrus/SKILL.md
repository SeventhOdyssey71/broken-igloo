---
name: integrate-walrus
description: "Deep guide for integrating Walrus decentralized storage on Sui. Covers blob storage, retrieval, Walrus Sites, file uploads, crash recovery, browser/Node.js usage. Triggers: walrus, decentralized storage, blob storage, walrus sites, store files"
---

```bash
# Telemetry preamble
SKILL_NAME="integrate-walrus"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Walrus integration specialist. Walrus is a decentralized storage protocol built on Sui that provides blob storage with erasure coding across a distributed network of storage nodes. It is NOT IPFS — it uses a novel Red Stuff encoding scheme and Sui for coordination/payments.

Key mental model: Walrus stores **blobs** (arbitrary binary data) and returns a **blob ID** that you use to read it back. Blob metadata and ownership are tracked as **Sui objects**. Storage is paid for in **epochs** (not per-request). You can store anything — files, images, JSON, entire static websites.

## Workflow

### Step 1: Install Dependencies

```bash
npm i @mysten/walrus @mysten/sui
```

**WASM requirement**: The Walrus SDK uses WASM internally for erasure coding. In Node.js this works automatically. In bundlers (Vite, Next.js, webpack), you may need WASM support configured:

```typescript
// vite.config.ts — enable WASM
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
});
```

For Next.js, add to `next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};
module.exports = nextConfig;
```

### Step 2: Client Setup

```typescript
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// Create Sui client
const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

// Create Walrus client — connect to testnet aggregator/publisher
const walrusClient = new WalrusClient({
  network: "testnet",
  suiClient,
});

// Your keypair for signing storage transactions
const keypair = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!);
```

**Network options**:
- `"testnet"` — free testnet storage, uses testnet SUI
- `"mainnet"` — production storage, uses real WAL tokens for payment

### Step 3: Store a Blob

**Simple text/JSON storage:**

```typescript
async function storeBlob(data: Uint8Array) {
  // Store the blob — this creates a Sui object tracking the blob
  const { blobId, blobObject } = await walrusClient.writeBlob({
    blob: data,
    deletable: false,       // permanent storage
    epochs: 5,              // store for 5 epochs
    signer: keypair,
  });

  console.log("Blob ID:", blobId);         // use this to read back
  console.log("Blob Object:", blobObject);  // Sui object ID
  return blobId;
}

// Store a string
const encoder = new TextEncoder();
const blobId = await storeBlob(encoder.encode("Hello, Walrus!"));

// Store JSON
const jsonBlob = await storeBlob(
  encoder.encode(JSON.stringify({ name: "NFT #1", traits: ["rare", "blue"] }))
);
```

**File-based storage (Node.js):**

```typescript
import { readFile } from "fs/promises";

async function storeFile(filePath: string) {
  const fileData = await readFile(filePath);

  const { blobId } = await walrusClient.writeBlob({
    blob: new Uint8Array(fileData),
    deletable: false,
    epochs: 10,
    signer: keypair,
  });

  console.log(`File stored. Blob ID: ${blobId}`);
  return blobId;
}

await storeFile("./my-image.png");
```

**Browser file upload:**

```typescript
async function handleFileUpload(file: File) {
  const arrayBuffer = await file.arrayBuffer();

  const { blobId } = await walrusClient.writeBlob({
    blob: new Uint8Array(arrayBuffer),
    deletable: true,
    epochs: 3,
    signer: keypair, // or use dapp-kit wallet signer
  });

  return blobId;
}

// In a React component:
// <input type="file" onChange={(e) => handleFileUpload(e.target.files[0])} />
```

### Step 4: Read a Blob

```typescript
async function readBlob(blobId: string): Promise<Uint8Array> {
  const data = await walrusClient.readBlob({ blobId });
  return data;
}

// Read and decode text
const data = await readBlob(blobId);
const text = new TextDecoder().decode(data);
console.log(text); // "Hello, Walrus!"

// Read and parse JSON
const jsonData = JSON.parse(new TextDecoder().decode(await readBlob(jsonBlob)));

// Read an image and save to file (Node.js)
import { writeFile } from "fs/promises";
const imageData = await readBlob(imageBlobId);
await writeFile("./downloaded-image.png", imageData);
```

**Aggregator URL for direct browser access:**

```typescript
// You can also read blobs via HTTP aggregator (no SDK needed)
const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
// Use in <img src={aggregatorUrl} /> or fetch()
```

### Step 5: Deletable vs Permanent Blobs

```typescript
// PERMANENT — cannot be deleted, stored for the specified epochs
const { blobId: permanentId } = await walrusClient.writeBlob({
  blob: data,
  deletable: false,
  epochs: 10,
  signer: keypair,
});

// DELETABLE — owner can delete before expiry, reclaim storage
const { blobId: deletableId, blobObject } = await walrusClient.writeBlob({
  blob: data,
  deletable: true,
  epochs: 5,
  signer: keypair,
});

// Delete a deletable blob (only the owner can do this)
await walrusClient.deleteBlob({
  blobObjectId: blobObject.id,
  signer: keypair,
});
```

**When to use which:**
- **Permanent**: NFT metadata, published content, legal records
- **Deletable**: User uploads, drafts, temporary data, GDPR-compliant storage

### Step 6: Storage Epochs and Costs

Storage is priced per epoch (not per read/write). An epoch lasts approximately 24 hours on testnet and longer on mainnet.

```typescript
// Check the cost before storing
const cost = await walrusClient.storageCost({
  size: data.byteLength,
  epochs: 10,
});
console.log(`Storage cost: ${cost} MIST`);

// Extend storage for an existing blob
await walrusClient.extendBlob({
  blobObjectId: blobObject.id,
  epochs: 5, // add 5 more epochs
  signer: keypair,
});
```

### Step 7: Walrus Sites — Deploy Static Websites

Walrus Sites let you host entire static websites on decentralized storage, accessed via a gateway or custom domain.

```bash
# Install the Walrus Sites CLI
cargo install walrus-sites

# Build your static site first
npm run build  # outputs to ./dist or ./out

# Deploy to Walrus
walrus-sites publish ./dist --epochs 100

# Output:
# Site published! Object ID: 0xabc123...
# Browse at: https://<blob-id>.walrus.site
```

**Programmatic site deployment:**

```typescript
// After deploying, you get a site object ID
// Link it to a SuiNS name for a human-readable URL
// e.g., myapp.walrus.site instead of <blob-id>.walrus.site
```

**Updating a site:**

```bash
# Update an existing site (pass the object ID from publish)
walrus-sites update ./dist --object-id 0xabc123... --epochs 100
```

### Step 8: Upload Relay for Reduced Requests

For high-throughput scenarios, use write batching:

```typescript
// Batch multiple small blobs into fewer storage operations
async function storeBatch(items: { key: string; data: Uint8Array }[]) {
  const results = [];

  for (const item of items) {
    const { blobId } = await walrusClient.writeBlob({
      blob: item.data,
      deletable: false,
      epochs: 10,
      signer: keypair,
    });
    results.push({ key: item.key, blobId });
  }

  return results;
}

// Store multiple NFT images
const nftImages = [
  { key: "nft-1", data: await readFile("./nft-1.png") },
  { key: "nft-2", data: await readFile("./nft-2.png") },
  { key: "nft-3", data: await readFile("./nft-3.png") },
];
const stored = await storeBatch(nftImages.map(n => ({
  key: n.key,
  data: new Uint8Array(n.data),
})));
```

### Step 9: Crash Recovery with onStep / Resume

For large uploads that might fail mid-way:

```typescript
import { WalrusClient } from "@mysten/walrus";

// Track upload progress
const { blobId } = await walrusClient.writeBlob({
  blob: largeFileData,
  deletable: false,
  epochs: 10,
  signer: keypair,
  onStep: (step) => {
    console.log(`Upload step: ${step.stage} — ${step.progress}%`);
    // Save step to localStorage or DB for resume
    saveProgress(step);
  },
});

// If the upload crashes, resume from saved state
// Re-call writeBlob with the same data — the SDK deduplicates
// Blobs with identical content produce the same blob ID
```

### Step 10: Complete Working Example — File Upload Service

```typescript
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { readFile, writeFile } from "fs/promises";

// --- Setup ---
const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
const walrusClient = new WalrusClient({
  network: "testnet",
  suiClient,
});
const keypair = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!);

// --- Upload ---
async function upload(filePath: string): Promise<string> {
  const data = new Uint8Array(await readFile(filePath));

  const { blobId } = await walrusClient.writeBlob({
    blob: data,
    deletable: false,
    epochs: 10,
    signer: keypair,
  });

  console.log(`Uploaded ${filePath} => blobId: ${blobId}`);
  return blobId;
}

// --- Download ---
async function download(blobId: string, outputPath: string): Promise<void> {
  const data = await walrusClient.readBlob({ blobId });
  await writeFile(outputPath, data);
  console.log(`Downloaded blobId ${blobId} => ${outputPath}`);
}

// --- Main ---
async function main() {
  // Upload a file
  const blobId = await upload("./example.png");

  // Download it back
  await download(blobId, "./example-downloaded.png");

  // Get aggregator URL for browser access
  const url = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
  console.log(`View in browser: ${url}`);
}

main().catch(console.error);
```

### Browser vs Node.js Differences

| Feature | Node.js | Browser |
|---------|---------|---------|
| File reading | `fs.readFile()` | `File.arrayBuffer()` |
| WASM loading | Automatic | Needs bundler config |
| Keypair | From env/file | From dapp-kit wallet |
| Aggregator | SDK or HTTP | SDK or direct `<img>` |
| Large files | Streaming available | Memory limited |

## Non-Negotiables

1. **ALWAYS use `Uint8Array`** for blob data — not strings, not Buffers directly
2. **NEVER store secrets or private keys** in Walrus — all blob data is public and readable by anyone with the blob ID
3. **ALWAYS set appropriate epochs** — storage expires after the epoch count; for permanent content, set high epoch counts
4. **ALWAYS handle WASM setup** in browser environments — the SDK will fail silently without it
5. **ALWAYS store the blob ID** somewhere persistent (database, on-chain) — if you lose it, you lose access to the data
6. **NEVER assume free storage on mainnet** — storage costs WAL tokens; check costs with `storageCost()` before large uploads
7. **Use deletable blobs for user content** when GDPR or right-to-delete requirements apply
8. **Deduplicate before uploading** — identical content produces the same blob ID, so the network handles dedup naturally

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
