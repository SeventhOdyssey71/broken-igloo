# Sui Stack Components — Seal, Walrus, Enoki, DeepBook, SuiNS, Passkeys

This reference covers the major infrastructure components built on and around Sui. Each section is a deep technical guide with architecture details, SDK usage, and working code examples.

---

## 1. Seal — Decentralized Secrets Management

### What Seal Is

Seal is Sui's protocol for **on-chain access control of off-chain secrets**. It lets you encrypt data (encryption keys, API keys, private content, files) and define who can decrypt it using Move smart contracts. The access policy lives on-chain; the encrypted data lives off-chain (typically on Walrus).

### Architecture

Seal uses a threshold encryption scheme combined with Move-based access policies:

1. **Client encrypts** data locally using a symmetric key.
2. **Symmetric key is encrypted** under a policy-bound public key derived from a set of Seal key servers.
3. **Encrypted blob** is stored on Walrus (or any storage layer).
4. **Access policy** is a Move module on Sui that defines who can decrypt.
5. When a user wants to decrypt, they prove to Seal key servers that they satisfy the on-chain policy. Each server contributes a decryption share, and the client reconstructs the decryption key.

Key servers never see the plaintext. The Move policy is the single source of truth for access control.

### Defining Access Policies in Move

A Seal policy is a Move module that exposes a `seal_approve` function. The Seal key servers call this function (via a dry-run) to verify the caller satisfies the policy before releasing decryption shares.

```move
module example::nft_gated_access {
    use sui::object::{Self, UID};
    use sui::tx_context::TxContext;

    /// An NFT that grants access to encrypted content
    public struct ContentNFT has key, store {
        id: UID,
        collection_id: u64,
    }

    /// Seal calls this function to check if the caller can decrypt.
    /// The caller must present a ContentNFT with the matching collection_id.
    /// `id` is the policy object ID (used as the encryption namespace).
    public fun seal_approve(nft: &ContentNFT, id: vector<u8>, _ctx: &TxContext) {
        // Validate that the NFT's collection_id matches the expected one
        // encoded in the `id` parameter. This ensures the NFT holder
        // can only decrypt content for their specific collection.
        let expected_collection = sui::bcs::to_bytes(&nft.collection_id);
        assert!(id == expected_collection, 0);
    }
}
```

### Common Seal Use Cases

| Use Case | Policy Logic |
|---|---|
| NFTs with hidden content | Holder of a specific NFT type can decrypt |
| Token-gated access | User holds >= N tokens of type T |
| Private messaging | Sender or recipient address matches |
| Subscription content | User has an active subscription object |
| DAO-gated docs | User holds a governance token |
| Time-locked reveals | Current epoch >= unlock epoch |

### Client-Side Encryption Flow (TypeScript)

```typescript
import { SealClient } from '@aspect-build/seal-sdk';
import { SuiClient } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
const sealClient = new SealClient({
  suiClient,
  serverObjectIds: [
    '0xSEAL_SERVER_1',
    '0xSEAL_SERVER_2',
    '0xSEAL_SERVER_3',
  ],
  verifyKeyServers: true,
});

// Encrypt data under a policy
const policyObjectId = '0xYOUR_POLICY_OBJECT_ID';
const plaintext = new TextEncoder().encode('Secret content for NFT holders');

const { encryptedData, key } = await sealClient.encrypt({
  policyId: policyObjectId,
  threshold: 2, // 2-of-3 key servers needed
  plaintext,
});

// Store encryptedData on Walrus (see Walrus section)

// Later: decrypt if user satisfies the policy
const decrypted = await sealClient.decrypt({
  encryptedData,
  txBytes: /* PTB that calls seal_approve with the user's proof object */,
  sessionKey: /* ephemeral session key */,
});
```

### Integration with Walrus

The typical Seal + Walrus flow:

1. Encrypt content with Seal (client-side).
2. Upload encrypted blob to Walrus, get a `blobId`.
3. Store `blobId` on-chain (e.g., in an NFT's dynamic field).
4. To access: read `blobId` from chain, fetch blob from Walrus, decrypt via Seal.

---

## 2. Walrus — Decentralized Blob Storage

### What Walrus Is

Walrus is a **decentralized storage protocol** purpose-built for Sui. It stores arbitrary binary blobs (images, videos, HTML, JSON, any file) using erasure coding across a network of storage nodes. Blob metadata and certificates live on Sui as objects.

### Architecture

- **Red Stuff Erasure Coding**: data is split into shards using a 2D erasure code. Only a fraction of shards are needed to reconstruct the blob, providing high availability and fault tolerance.
- **Storage Nodes**: independent operators that store shards.
- **Blob Certification**: when enough shards are stored, a certificate is created on Sui proving the blob is available.
- **Epochs**: storage is purchased in epochs. Blobs persist as long as their storage is funded.

### CLI Usage

```bash
# Install the Walrus CLI
# (Comes with the Walrus package or via cargo install)

# Store a file
walrus store my-image.png
# Output: Blob ID: 0xabc123...

# Store with specific number of epochs
walrus store --epochs 10 my-image.png

# Read a blob by ID
walrus read 0xabc123... --output downloaded-image.png

# Get blob metadata
walrus info 0xabc123...
```

### TypeScript SDK

```typescript
import { WalrusClient } from '@mysten/walrus';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
const keypair = Ed25519Keypair.deriveKeypair('your mnemonic phrase here');

const walrus = new WalrusClient({
  network: 'mainnet',
  suiClient,
});

// Store a blob
const file = new Uint8Array(/* your data */);
const { blobId, certificate } = await walrus.store({
  blob: file,
  epochs: 5,
  signer: keypair,
  deletable: true, // allows future deletion
});

console.log(`Stored blob: ${blobId}`);

// Read a blob
const data = await walrus.read({ blobId });

// Delete a deletable blob
await walrus.delete({
  blobId,
  signer: keypair,
});
```

### Walrus HTTP API / Aggregator

For simple read access without the SDK:

```bash
# Read via HTTP aggregator (no auth required for public blobs)
curl https://aggregator.walrus.site/v1/blobs/0xabc123...

# Store via publisher endpoint (requires auth)
curl -X PUT \
  https://publisher.walrus.site/v1/blobs \
  --data-binary @my-file.png \
  -H "Content-Type: application/octet-stream"
```

### Walrus Sites

Walrus Sites let you host **static websites** (HTML, CSS, JS) entirely on Walrus with a Sui object as the site pointer.

```bash
# Publish a site from a directory
walrus site publish ./my-site-dist

# Update an existing site
walrus site update --site-object 0xSITE_OBJECT_ID ./my-site-dist
```

The site is accessible via `https://<site-object-id>.walrus.site` or a custom domain. This means your entire dApp frontend can be fully decentralized — code on Walrus, state on Sui.

### Cost Model

- Storage cost is based on **blob size** and **number of epochs**.
- Larger blobs cost proportionally more.
- Storage is paid in SUI tokens.
- Deletable blobs cost slightly more but let you reclaim storage.

### Use Cases

- NFT media (images, video, 3D models)
- dApp frontends (fully decentralized hosting)
- User-generated content (social media platforms)
- Encrypted data vaults (combined with Seal)
- Backups and archives
- AI model weights and datasets

---

## 3. Enoki — Managed zkLogin + Sponsored Transactions

### What Enoki Is

Enoki is a **managed service by Mysten Labs** that simplifies zkLogin integration and transaction sponsorship. It abstracts away the complexity of ZK proof generation and gas management, letting you build apps where users sign in with Google/Apple/Twitch and never need to hold SUI for gas.

### The zkLogin Flow via Enoki

```
User clicks "Sign in with Google"
        |
        v
OAuth redirect → Google login → JWT returned
        |
        v
Enoki API receives JWT → generates ZK proof
        |
        v
ZK proof + ephemeral keypair → deterministic Sui address
        |
        v
User can now sign transactions from that address
```

Each OAuth provider + user ID + app salt = a unique, deterministic Sui address. The same Google user always gets the same Sui address for your app.

### Enoki React Integration

```typescript
// Setup: wrap your app with EnokiFlowProvider
import { EnokiFlowProvider, useEnokiFlow } from '@mysten/enoki/react';
import { createNetworkConfig, SuiClientProvider } from '@mysten/dapp-kit';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
});

function App() {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
      <EnokiFlowProvider apiKey="YOUR_ENOKI_API_KEY">
        <MyApp />
      </EnokiFlowProvider>
    </SuiClientProvider>
  );
}
```

### Sign In with Google — Complete Flow

```typescript
import { useEnokiFlow } from '@mysten/enoki/react';
import { useSuiClient } from '@mysten/dapp-kit';

function LoginPage() {
  const enokiFlow = useEnokiFlow();

  const handleLogin = async () => {
    // This redirects the user to Google OAuth
    const authUrl = await enokiFlow.createAuthorizationURL({
      provider: 'google',
      clientId: 'YOUR_GOOGLE_CLIENT_ID',
      redirectUrl: 'http://localhost:3000/callback',
      extraParams: { scope: ['openid', 'email', 'profile'] },
    });
    window.location.href = authUrl;
  };

  return <button onClick={handleLogin}>Sign in with Google</button>;
}

// Callback page: handle the redirect
function CallbackPage() {
  const enokiFlow = useEnokiFlow();

  useEffect(() => {
    // Completes the flow: exchanges JWT for ZK proof
    enokiFlow.handleAuthCallback().then(() => {
      // User is now authenticated
      const address = enokiFlow.getCurrentAddress();
      console.log('User Sui address:', address);
    });
  }, []);

  return <div>Completing sign-in...</div>;
}
```

### Sponsored Transactions

Enoki can sponsor transactions so users never need SUI for gas:

```typescript
import { useEnokiFlow } from '@mysten/enoki/react';
import { Transaction } from '@mysten/sui/transactions';

function MintButton() {
  const enokiFlow = useEnokiFlow();

  const handleMint = async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: '0xPACKAGE::nft::mint',
      arguments: [tx.pure.string('My NFT'), tx.pure.string('Description')],
    });

    // Enoki sponsors the gas AND executes the transaction
    const result = await enokiFlow.sponsorAndExecuteTransaction({
      transaction: tx,
      client: suiClient,
    });

    console.log('Transaction digest:', result.digest);
  };

  return <button onClick={handleMint}>Mint (gas-free!)</button>;
}
```

### Enoki Dashboard Configuration

1. Create a project at https://enoki.mystenlabs.com
2. Add OAuth providers (Google, Apple, Twitch, Facebook)
3. Configure redirect URLs
4. Set sponsorship budget and rate limits
5. Get your API key

### Rate Limits and Pricing

- Free tier: limited sponsored transactions per day
- Paid tiers: higher throughput, custom gas budgets
- Sponsorship: you fund a gas pool; Enoki draws from it per transaction
- ZK proof generation: included in the API call

---

## 4. DeepBook V3 — On-Chain Central Limit Order Book

### What DeepBook Is

DeepBook is a **fully on-chain central limit order book (CLOB)** built and maintained by Mysten Labs. It is a shared liquidity layer that any Sui dApp can integrate with. Unlike AMM-based DEXes, DeepBook uses a traditional order book model with bids, asks, and price-time priority matching.

### Key Concepts

- **Pool**: a trading pair (e.g., SUI/USDC). Each pool is a shared object on-chain.
- **Limit Order**: an order to buy/sell at a specific price. Sits on the book until filled or cancelled.
- **Market Order**: an order that fills immediately at the best available price.
- **Account**: DeepBook uses an account abstraction layer — users create a `BalanceManager` to deposit funds and trade.
- **Taker/Maker Fees**: configurable per pool. Makers (who add liquidity) typically pay lower fees.

### TypeScript SDK

```typescript
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
const keypair = Ed25519Keypair.deriveKeypair('your mnemonic');

const deepbook = new DeepBookClient({
  client: suiClient,
  address: keypair.toSuiAddress(),
  env: 'mainnet',
});

// Create a BalanceManager (one-time setup)
const createManagerTx = deepbook.balanceManager.createBalanceManager();
// Sign and execute createManagerTx...

// Deposit funds into the BalanceManager
const depositTx = deepbook.balanceManager.deposit({
  coinType: '0x2::sui::SUI',
  amount: 1_000_000_000n, // 1 SUI (9 decimals)
  managerKey: 'primary',
});

// Place a limit order: Buy 10 SUI at 1.50 USDC each
const limitOrderTx = deepbook.placeLimitOrder({
  poolKey: 'SUI_USDC',
  balanceManagerKey: 'primary',
  clientOrderId: 1,
  price: 1.5,
  quantity: 10,
  isBid: true, // true = buy, false = sell
  expiration: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  orderType: 'GTC', // Good-Til-Cancelled
  selfMatchingOption: 'CANCEL_TAKER',
});
// Sign and execute limitOrderTx...

// Place a market order: Sell 5 SUI at market price
const marketOrderTx = deepbook.placeMarketOrder({
  poolKey: 'SUI_USDC',
  balanceManagerKey: 'primary',
  clientOrderId: 2,
  quantity: 5,
  isBid: false,
  selfMatchingOption: 'CANCEL_TAKER',
});
// Sign and execute marketOrderTx...

// Cancel an open order
const cancelTx = deepbook.cancelOrder({
  poolKey: 'SUI_USDC',
  balanceManagerKey: 'primary',
  clientOrderId: 1,
});
```

### Flash Loans from DeepBook

DeepBook pools hold deep liquidity. You can take flash loans from them (borrow and return within the same PTB):

```typescript
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();

// Borrow 1000 USDC from the DeepBook pool
const [flashLoanCoin, flashLoanReceipt] = tx.moveCall({
  target: '0xDEEPBOOK_PKG::pool::borrow_flashloan',
  arguments: [tx.object('0xPOOL_ID'), tx.pure.u64(1_000_000_000)],
  typeArguments: ['0xUSDC_TYPE', '0xSUI_TYPE'],
});

// ... use the borrowed funds (arbitrage, liquidation, etc.) ...

// Return the flash loan (must happen in the same PTB)
tx.moveCall({
  target: '0xDEEPBOOK_PKG::pool::return_flashloan',
  arguments: [tx.object('0xPOOL_ID'), flashLoanCoin, flashLoanReceipt],
  typeArguments: ['0xUSDC_TYPE', '0xSUI_TYPE'],
});
```

### When to Use DeepBook vs AMMs

| Feature | DeepBook (CLOB) | AMM (Cetus, Turbos) |
|---|---|---|
| Order types | Limit, market, GTC, IOC, FOK | Swap only |
| Price control | Exact price specification | Slippage tolerance |
| Best for | Trading bots, market makers | Simple swaps, casual users |
| Liquidity | Professional LPs | Passive LPs |
| Integration | Direct SDK or via 7K aggregator | Direct SDK or via 7K aggregator |

---

## 5. SuiNS — Sui Name Service

### What SuiNS Is

SuiNS maps **human-readable names** (like `alice.sui`) to Sui addresses and vice versa. It is the ENS equivalent for Sui.

### SDK Usage

```typescript
import { SuinsClient } from '@mysten/suins';
import { SuiClient } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
const suinsClient = new SuinsClient({
  client: suiClient,
  network: 'mainnet',
});

// Resolve a name to an address
const address = await suinsClient.getAddress({ name: 'alice.sui' });
console.log(address); // 0x1234...

// Reverse lookup: address to name
const name = await suinsClient.getDefaultName({ address: '0x1234...' });
console.log(name); // alice.sui

// Get the SuiNS NFT object for a name
const nameObject = await suinsClient.getNameObject({
  name: 'alice.sui',
  showOwner: true,
  showAvatar: true,
});
```

### Registration

```typescript
import { Transaction } from '@mysten/sui/transactions';

// Register a new name via the SuiNS SDK
const tx = new Transaction();
const registrationTx = suinsClient.register({
  tx,
  name: 'myname.sui',
  years: 1,
  coinType: '0x2::sui::SUI',
});
// Sign and execute the transaction
```

### Displaying Names in dApps

Best practice: always show the SuiNS name when available, with the address as fallback.

```typescript
async function getDisplayName(address: string): Promise<string> {
  try {
    const name = await suinsClient.getDefaultName({ address });
    return name || formatAddress(address);
  } catch {
    return formatAddress(address);
  }
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
```

### Subnames

SuiNS supports subnames (e.g., `payments.alice.sui`), useful for organizations:

```typescript
const subnameTx = suinsClient.createSubname({
  tx,
  parentName: 'alice.sui',
  subname: 'payments.alice.sui',
  expirationMs: Date.now() + 365 * 24 * 60 * 60 * 1000,
  targetAddress: '0xRECIPIENT_ADDRESS',
});
```

---

## 6. Passkeys on Sui — WebAuthn/FIDO2 Authentication

### What Passkeys Are

Passkeys allow users to **sign Sui transactions using biometric authentication** — Face ID, fingerprint, Windows Hello, or a hardware security key. This is possible because Sui supports the **secp256r1** elliptic curve, which is the curve used by WebAuthn/FIDO2.

This means: no seed phrases, no browser extensions, no wallet apps. Just biometrics.

### How It Works

1. User creates a passkey (WebAuthn credential) on their device.
2. The passkey's public key (secp256r1) becomes the user's Sui address.
3. To sign a transaction, the browser calls `navigator.credentials.get()`, which triggers biometric auth.
4. The device signs the transaction data with the passkey's private key (which never leaves the secure enclave).
5. The signature is submitted to Sui, which natively verifies secp256r1 signatures.

### Creating a Passkey-Based Sui Account

```typescript
import { PasskeyKeypair } from '@mysten/sui/keypairs/passkey';

// Step 1: Register a new passkey (triggers biometric prompt)
const credential = await navigator.credentials.create({
  publicKey: {
    rp: { name: 'My Sui dApp', id: window.location.hostname },
    user: {
      id: crypto.getRandomValues(new Uint8Array(32)),
      name: 'user@example.com',
      displayName: 'User',
    },
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256 = secp256r1
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Use device biometrics
      residentKey: 'required',
      userVerification: 'required',
    },
  },
});

// Step 2: Extract the public key and create a Sui keypair
const passkeyKeypair = PasskeyKeypair.fromCredential(credential);
const suiAddress = passkeyKeypair.toSuiAddress();
console.log('Passkey Sui address:', suiAddress);

// Store the credential ID for future signing
const credentialId = credential.id;
localStorage.setItem('passkeyCredentialId', credentialId);
```

### Signing Transactions with Passkeys

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { PasskeyKeypair } from '@mysten/sui/keypairs/passkey';

// Build a transaction
const tx = new Transaction();
tx.transferObjects(
  [tx.splitCoins(tx.gas, [1_000_000_000])],
  '0xRECIPIENT'
);

// Sign with passkey (triggers biometric prompt)
const passkeyKeypair = PasskeyKeypair.fromCredentialId(
  localStorage.getItem('passkeyCredentialId')
);

const { bytes, signature } = await tx.sign({
  client: suiClient,
  signer: passkeyKeypair,
});

// Execute the signed transaction
const result = await suiClient.executeTransactionBlock({
  transactionBlock: bytes,
  signature,
});
```

### Combining Passkeys with zkLogin

For maximum flexibility, let users choose their auth method:

```typescript
// Option A: Passkey (biometric)
const passkeyKeypair = PasskeyKeypair.fromCredentialId(credentialId);
const addressA = passkeyKeypair.toSuiAddress();

// Option B: zkLogin (social login via Enoki)
const enokiAddress = enokiFlow.getCurrentAddress();

// Option C: Multisig — require both passkey AND zkLogin
import { MultiSigPublicKey } from '@mysten/sui/multisig';

const multiSigPk = MultiSigPublicKey.fromPublicKeys({
  threshold: 1,
  publicKeys: [
    { publicKey: passkeyKeypair.getPublicKey(), weight: 1 },
    { publicKey: zkLoginPublicKey, weight: 1 },
  ],
});
const multiSigAddress = multiSigPk.toSuiAddress();
// User can sign with EITHER passkey or social login
```

### Browser Support

| Browser | Passkey Support |
|---|---|
| Chrome 108+ | Full support |
| Safari 16+ | Full support (Face ID / Touch ID) |
| Firefox 122+ | Full support |
| Mobile Safari | Full support (Face ID) |
| Chrome Android | Full support (fingerprint) |

Passkeys sync across devices via iCloud Keychain (Apple) or Google Password Manager (Android/Chrome), so users don't lose access when switching devices.

---

## Summary: Choosing the Right Components

| Need | Component |
|---|---|
| Encrypt data with on-chain access control | Seal |
| Store files/media/sites decentralized | Walrus |
| Social login + gas-free UX | Enoki (zkLogin) |
| Professional trading / order book | DeepBook V3 |
| Human-readable addresses | SuiNS |
| Passwordless biometric auth | Passkeys |
| Encrypted storage with access control | Seal + Walrus |
| Full consumer app UX | Enoki + Passkeys + sponsored tx |
