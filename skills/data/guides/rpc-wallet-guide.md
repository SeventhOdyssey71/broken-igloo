# RPC & Wallet Setup Guide for Sui

## RPC Endpoints

### Development (Free)
```
Devnet:  https://fullnode.devnet.sui.io:443
Testnet: https://fullnode.testnet.sui.io:443
Mainnet: https://fullnode.mainnet.sui.io:443
```

Rate-limited. Fine for development, not for production.

### Production (Recommended)

**Shinami** (most comprehensive):
```typescript
import { createSuiClient } from '@shinami/clients';
const client = createSuiClient(SHINAMI_ACCESS_KEY);
```
- Includes Gas Station + Invisible Wallets + zkLogin API
- Dashboard: https://app.shinami.com/

**BlockVision**:
- RPC + gRPC + indexing APIs
- Dashboard: https://dashboard.blockvision.org/

**QuickNode**:
- Multi-chain including Sui
- Dashboard: https://quicknode.com/

### GraphQL API (Official)
```
https://sui-mainnet.mystenlabs.com/graphql
https://sui-testnet.mystenlabs.com/graphql
```
Richer queries than JSON-RPC. Supports complex filtering, pagination.

## Sui CLI Setup

### Install
```bash
# Via Homebrew (macOS)
brew install sui

# Via Cargo (any platform)
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui
```

### Configure Environment
```bash
# Check current environment
sui client active-env

# Add environments
sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443

# Switch environment
sui client switch --env devnet
```

### Create / Import Wallet
```bash
# Generate a new keypair
sui keytool generate ed25519

# Import an existing key
sui keytool import "your mnemonic phrase here" ed25519

# List addresses
sui client addresses

# Check active address
sui client active-address

# Switch active address
sui client switch --address 0x...
```

### Fund Wallet (Devnet/Testnet)
```bash
# Request devnet SUI from faucet
sui client faucet

# Or via curl
curl -X POST https://faucet.devnet.sui.io/v2/gas \
  -H 'Content-Type: application/json' \
  -d '{"FixedAmountRequest":{"recipient":"0xYOUR_ADDRESS"}}'
```

### Check Balance
```bash
sui client balance
sui client gas  # Shows individual gas coin objects
```

## TypeScript SDK Client Setup

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// Development
const client = new SuiClient({ url: getFullnodeUrl('devnet') });

// Production (Shinami)
import { createSuiClient } from '@shinami/clients';
const client = createSuiClient(process.env.SHINAMI_ACCESS_KEY!);

// Common operations
const balance = await client.getBalance({ owner: address });
const coins = await client.getCoins({ owner: address });
const object = await client.getObject({ id: objectId, options: { showContent: true } });
const txn = await client.getTransactionBlock({ digest, options: { showEffects: true } });
```

## Keypair Management in TypeScript

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Generate new keypair
const keypair = new Ed25519Keypair();

// From private key (base64)
const keypair = Ed25519Keypair.fromSecretKey(base64PrivateKey);

// From mnemonic
const keypair = Ed25519Keypair.deriveKeypair("your mnemonic phrase");

// Get address
const address = keypair.getPublicKey().toSuiAddress();
```

## dApp Wallet Connection (React)

```bash
npm i @mysten/dapp-kit @mysten/sui @tanstack/react-query
```

```tsx
import { SuiClientProvider, WalletProvider, ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const networks = { devnet: { url: getFullnodeUrl('devnet') } };

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="devnet">
        <WalletProvider>
          <ConnectButton />
          <YourApp />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```
