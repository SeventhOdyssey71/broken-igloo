# PTB Cookbook — Programmable Transaction Block Recipes

> Copy-paste PTB recipes for common Sui operations. Each recipe is a complete TypeScript code block.

## Setup

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
```

---

## Basic Operations

### Transfer SUI
```typescript
const tx = new Transaction();
tx.transferObjects(
  [tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)])], // 1 SUI
  tx.pure.address('0xRECIPIENT')
);
await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
```

### Transfer Multiple Coins to Multiple Recipients
```typescript
const tx = new Transaction();
const [coin1, coin2, coin3] = tx.splitCoins(tx.gas, [
  tx.pure.u64(1_000_000_000),
  tx.pure.u64(2_000_000_000),
  tx.pure.u64(500_000_000),
]);
tx.transferObjects([coin1], tx.pure.address('0xALICE'));
tx.transferObjects([coin2], tx.pure.address('0xBOB'));
tx.transferObjects([coin3], tx.pure.address('0xCHARLIE'));
```

### Merge All Coins
```typescript
const coins = await client.getCoins({ owner: address, coinType: '0x2::sui::SUI' });
if (coins.data.length > 1) {
  const tx = new Transaction();
  const [primary, ...rest] = coins.data.map(c => tx.object(c.coinObjectId));
  tx.mergeCoins(primary, rest);
  await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
}
```

---

## DeFi Recipes

### Swap via 7K Aggregator
```typescript
import { SevenKSDK } from '@7kprotocol/sdk-ts';

const sdk = new SevenKSDK();
const quote = await sdk.getQuote({
  tokenIn: '0x2::sui::SUI',
  tokenOut: USDC_TYPE,
  amountIn: '1000000000', // 1 SUI in MIST
});
const tx = await sdk.buildSwapTransaction(quote, senderAddress);
await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
```

### Swap + Send in One Transaction
```typescript
const tx = new Transaction();
// Step 1: Swap SUI for USDC
const [usdc] = tx.moveCall({
  target: `${DEX_PACKAGE}::router::swap_exact_input`,
  arguments: [
    tx.object(POOL_ID),
    tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)]),
    tx.pure.u64(0), // min output (set slippage)
    tx.object('0x6'), // Clock
  ],
  typeArguments: [SUI_TYPE, USDC_TYPE],
});
// Step 2: Send USDC to recipient
tx.transferObjects([usdc], tx.pure.address('0xRECIPIENT'));
```

### Deposit into Lending Protocol
```typescript
const tx = new Transaction();
const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(5_000_000_000)]);
tx.moveCall({
  target: `${LENDING_PACKAGE}::lending::deposit`,
  arguments: [
    tx.object(MARKET_ID),
    depositCoin,
    tx.object('0x6'), // Clock
  ],
  typeArguments: ['0x2::sui::SUI'],
});
```

### Flash Loan (Borrow + Use + Repay)
```typescript
const tx = new Transaction();
// Borrow
const [borrowed, receipt] = tx.moveCall({
  target: `${FLASH_PACKAGE}::flash_loan::borrow`,
  arguments: [tx.object(POOL_ID), tx.pure.u64(1_000_000_000)],
  typeArguments: ['0x2::sui::SUI'],
});
// Use the borrowed funds (e.g., arbitrage)
const [profit] = tx.moveCall({
  target: `${ARB_PACKAGE}::arb::execute`,
  arguments: [borrowed],
});
// Repay (MUST happen — receipt is a hot potato)
tx.moveCall({
  target: `${FLASH_PACKAGE}::flash_loan::repay`,
  arguments: [tx.object(POOL_ID), profit, receipt],
  typeArguments: ['0x2::sui::SUI'],
});
```

---

## NFT Operations

### Mint an NFT
```typescript
const tx = new Transaction();
tx.moveCall({
  target: `${NFT_PACKAGE}::collection::mint`,
  arguments: [
    tx.object(MINT_CAP_ID),
    tx.pure.string('My NFT'),
    tx.pure.string('Description'),
    tx.pure.string('https://example.com/image.png'),
  ],
});
```

### Transfer NFT
```typescript
const tx = new Transaction();
tx.transferObjects([tx.object(NFT_ID)], tx.pure.address('0xRECIPIENT'));
```

### List on Kiosk
```typescript
const tx = new Transaction();
// Place item in kiosk
tx.moveCall({
  target: '0x2::kiosk::place',
  arguments: [tx.object(KIOSK_ID), tx.object(KIOSK_CAP_ID), tx.object(ITEM_ID)],
  typeArguments: [ITEM_TYPE],
});
// List at price
tx.moveCall({
  target: '0x2::kiosk::list',
  arguments: [
    tx.object(KIOSK_ID),
    tx.object(KIOSK_CAP_ID),
    tx.pure.id(ITEM_ID),
    tx.pure.u64(PRICE_IN_MIST),
  ],
  typeArguments: [ITEM_TYPE],
});
```

---

## Object Queries

### Get Object Data
```typescript
const obj = await client.getObject({
  id: OBJECT_ID,
  options: { showContent: true, showType: true, showOwner: true },
});
const fields = obj.data?.content?.fields;
```

### Get All Objects Owned by Address
```typescript
let cursor = null;
const allObjects = [];
do {
  const page = await client.getOwnedObjects({
    owner: address,
    cursor,
    options: { showContent: true, showType: true },
  });
  allObjects.push(...page.data);
  cursor = page.hasNextPage ? page.nextCursor : null;
} while (cursor);
```

### Get Coins with Pagination
```typescript
const coins = await client.getCoins({
  owner: address,
  coinType: '0x2::sui::SUI',
});
// coins.data is an array of CoinStruct
// coins.data[0].balance gives the balance as string
```

### Subscribe to Events (WebSocket)
```typescript
const unsubscribe = await client.subscribeEvent({
  filter: { MoveEventType: `${PACKAGE}::module::SwapEvent` },
  onMessage: (event) => {
    console.log('Swap:', event.parsedJson);
  },
});
```

---

## Sponsored Transactions

### Separate Signer and Sponsor
```typescript
const tx = new Transaction();
tx.setSender(userAddress);
tx.setGasOwner(sponsorAddress);
tx.setGasBudget(50_000_000);
// ... add operations ...

const txBytes = await tx.build({ client });

// User signs
const userSig = await userKeypair.signTransaction(txBytes);
// Sponsor signs
const sponsorSig = await sponsorKeypair.signTransaction(txBytes);

// Execute with both signatures
await client.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: [userSig.signature, sponsorSig.signature],
});
```

### With Shinami Gas Station
```typescript
import { GasStationClient, createSuiClient, buildGaslessTransaction } from '@shinami/clients/sui';

const gas = new GasStationClient(SHINAMI_KEY);
const sui = createSuiClient(SHINAMI_KEY);

const gaslessTx = await buildGaslessTransaction((tx) => {
  tx.moveCall({ target: '...', arguments: [...] });
}, { sui });

gaslessTx.sender = userAddress;
const { txBytes, signature: sponsorSig } = await gas.sponsorTransaction(gaslessTx);

const userSig = await userKeypair.signTransaction(fromBase64(txBytes));
await sui.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: [userSig.signature, sponsorSig],
});
```

---

## zkLogin

### Build zkLogin Transaction
```typescript
import { getZkLoginSignature } from '@mysten/sui/zklogin';

const tx = new Transaction();
tx.setSender(zkLoginAddress);
// ... add operations ...

const { bytes, signature: userSig } = await tx.sign({ signer: ephemeralKeypair });

const zkLoginSig = getZkLoginSignature({
  inputs: zkProof,
  maxEpoch: maxEpoch,
  userSignature: userSig,
});

await client.executeTransactionBlock({
  transactionBlock: bytes,
  signature: zkLoginSig,
});
```

---

## Publishing and Upgrading

### Publish a Package
```typescript
const { modules, dependencies } = JSON.parse(
  execSync(`sui move build --dump-bytecode-as-base64 --path ${projectPath}`, { encoding: 'utf-8' })
);
const tx = new Transaction();
const [upgradeCap] = tx.publish({ modules, dependencies });
tx.transferObjects([upgradeCap], tx.pure.address(senderAddress));
```

### Upgrade a Package
```typescript
const { modules, dependencies, digest } = JSON.parse(
  execSync(`sui move build --dump-bytecode-as-base64 --path ${projectPath}`, { encoding: 'utf-8' })
);
const tx = new Transaction();
const ticket = tx.moveCall({
  target: '0x2::package::authorize_upgrade',
  arguments: [tx.object(UPGRADE_CAP_ID), tx.pure.u8(0), tx.pure(digest)],
});
const receipt = tx.upgrade({ modules, dependencies, package: PACKAGE_ID, ticket });
tx.moveCall({
  target: '0x2::package::commit_upgrade',
  arguments: [tx.object(UPGRADE_CAP_ID), receipt],
});
```

---

## Utility

### Get Current Epoch
```typescript
const epoch = await client.getLatestSuiSystemState();
console.log('Current epoch:', epoch.epoch);
```

### Dry Run Transaction
```typescript
const txBytes = await tx.build({ client });
const dryRun = await client.dryRunTransactionBlock({ transactionBlock: txBytes });
console.log('Gas cost:', dryRun.effects.gasUsed);
console.log('Status:', dryRun.effects.status);
```

### Wait for Transaction
```typescript
const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showEvents: true },
});
await client.waitForTransaction({ digest: result.digest });
```
