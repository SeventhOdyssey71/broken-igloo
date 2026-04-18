# Sui SDK Quick Reference — All Protocol APIs

> Copy-paste initialization and key methods for every Sui protocol SDK. Use this as a cheat sheet when building integrations.

## Core SDK — @mysten/sui

```bash
npm i @mysten/sui
```

```typescript
// Client (prefer gRPC for new projects)
import { SuiGrpcClient } from '@mysten/sui/grpc';
const client = new SuiGrpcClient({ network: 'mainnet' });

// Legacy JSON-RPC (widely used, deprecated)
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

// Transaction builder
import { Transaction } from '@mysten/sui/transactions';
const tx = new Transaction();
tx.moveCall({ target: '0xPKG::module::function', arguments: [...] });
tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)]);
tx.transferObjects([coin], tx.pure.address('0x...'));

// Keypairs
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
const kp = new Ed25519Keypair();                    // generate
const kp = Ed25519Keypair.fromSecretKey(bytes);     // import
const addr = kp.toSuiAddress();

// Execute
await client.signAndExecuteTransaction({ signer: kp, transaction: tx });
```

**Sub-modules:** `@mysten/sui/client`, `@mysten/sui/grpc`, `@mysten/sui/transactions`, `@mysten/sui/keypairs/ed25519`, `@mysten/sui/zklogin`, `@mysten/sui/bcs`, `@mysten/sui/verify`, `@mysten/sui/faucet`, `@mysten/sui/multisig`

---

## 7K Aggregator — @7kprotocol/sdk-ts

```bash
npm i @7kprotocol/sdk-ts
```

```typescript
import { setSuiClient, getQuote, buildTx } from '@7kprotocol/sdk-ts';
setSuiClient(suiClient);

// Get best swap route
const quote = await getQuote({
  tokenIn: '0x2::sui::SUI',
  tokenOut: USDC_TYPE,
  amountIn: '1000000000',
});

// Build and execute
const { tx, coinOut } = await buildTx({
  quoteResponse: quote,
  accountAddress: sender,
  slippage: 0.01,
  commission: { partner: '0x...', commissionBps: 0 },
});
```

---

## Cetus — @cetusprotocol/cetus-sui-clmm-sdk

```bash
npm i @cetusprotocol/cetus-sui-clmm-sdk
```

```typescript
import { initCetusSDK } from '@cetusprotocol/cetus-sui-clmm-sdk';
const sdk = initCetusSDK({ network: 'mainnet' });
sdk.setSenderAddress('0x...');

// Swap
const pool = await sdk.Pool.getPool(poolId);
const preswap = await sdk.Swap.preSwap({ pool_id: pool.id, a2b: true, by_amount_in: true, amount: '1000000' });
const payload = sdk.Swap.createSwapPayload({ pool_id: pool.id, a2b: true, amount: preswap.amount.toString(), amount_limit: '0' });

// Add liquidity
sdk.Position.createAddLiquidityFixTokenPayload({ pool_id, tick_lower, tick_upper, fix_amount_a: true, amount_a: '1000', amount_b: '0' });

// Collect fees
sdk.Position.removeLiquidityPayload({ pool_id, pos_id, delta_liquidity: '0', collect_fee: true });
```

---

## DeepBook V3 — @mysten/deepbook-v3

```bash
npm i @mysten/deepbook-v3
```

```typescript
import { deepbook } from '@mysten/deepbook-v3';
const client = grpcClient.$extend(deepbook({ address: myAddr, balanceManagers: { MAIN: { address: '0x...' } } }));

// Create balance manager
client.deepbook.balanceManager.createAndShareBalanceManager();

// Place limit order
client.deepbook.placeLimitOrder({ poolKey: 'SUI_USDC', balanceManagerKey: 'MAIN', clientOrderId: '1', price: 1.5, quantity: 100, isBid: true });

// Market order
client.deepbook.placeMarketOrder({ poolKey: 'SUI_USDC', balanceManagerKey: 'MAIN', clientOrderId: '2', quantity: 50, isBid: false });

// Flash loan
const [coin, receipt] = client.deepbook.borrowBaseAsset(poolKey, amount);
// ... use coin ...
client.deepbook.returnBaseAsset({ poolKey, borrowAmount: amount, baseCoinInput: coin, flashLoan: receipt });
```

---

## Suilend — @suilend/sdk

```bash
npm i @suilend/sdk
```

```typescript
import { SuilendClient, LENDING_MARKET_ID, LENDING_MARKET_TYPE } from '@suilend/sdk';
const suilend = await SuilendClient.initialize(LENDING_MARKET_ID, LENDING_MARKET_TYPE, suiClient);

// Deposit
const tx = new Transaction();
await suilend.depositIntoObligation(owner, '0x2::sui::SUI', '1000000000', tx);

// Borrow (MUST refresh first)
suilend.refreshAll(tx, obligation);
const coin = suilend.borrow(obligationOwnerCapId, obligationId, '0x2::sui::SUI', '500000000', tx);

// Repay
await suilend.repayIntoObligation(owner, obligationId, '0x2::sui::SUI', '500000000', tx);

// SpringSui LST: @suilend/springsui-sdk
```

---

## Scallop — @scallop-io/sui-scallop-sdk

```bash
npm i @scallop-io/sui-scallop-sdk
```

```typescript
import { Scallop } from '@scallop-io/sui-scallop-sdk';
const sdk = new Scallop({ addressId: '67c44a103fe1b8c454eb9699', networkType: 'mainnet' });
await sdk.init();
const client = sdk.client;

// Deposit
await client.deposit('sui', 1e9);

// Borrow
await client.borrow('usdc', 100e6, true, obligationId, keyId);

// Repay
await client.repay('usdc', 100e6, true, obligationId);

// Query
const market = await client.queryMarket();
```

---

## NAVI — @naviprotocol/lending

```bash
npm i @naviprotocol/lending
```

```typescript
import { depositCoinPTB, borrowCoinPTB, repayCoinPTB, withdrawCoinPTB, getPools } from '@naviprotocol/lending';

const pools = await getPools({ env: 'prod' });
const tx = new Transaction();
await depositCoinPTB(tx, SUI_TYPE, coinObject, { amount: 1e9, env: 'prod' });
const borrowed = await borrowCoinPTB(tx, USDC_TYPE, 100e6, { env: 'prod' });
```

---

## Aftermath — aftermath-ts-sdk

```bash
npm i aftermath-ts-sdk
```

```typescript
import { Aftermath } from 'aftermath-ts-sdk';
const af = new Aftermath('MAINNET');
await af.init();

// Swap
const router = af.Router();
const route = await router.getCompleteTradeRouteGivenAmountIn({ coinInType: SUI, coinOutType: USDC, coinInAmount: 1000000000n });
const tx = await router.getTransactionForCompleteTradeRoute({ walletAddress: addr, completeRoute: route, slippage: 0.01 });

// Stake SUI for afSUI
const staking = af.Staking();
const stakeTx = await staking.getStakeTransaction({ walletAddress: addr, suiStakeAmount: 1000000000n, validatorAddress: validator });
const rate = await staking.getAfSuiToSuiExchangeRate();
```

---

## Shinami — @shinami/clients

```bash
npm i @shinami/clients
```

```typescript
import { GasStationClient, createSuiClient, buildGaslessTransaction } from '@shinami/clients/sui';

const sui = createSuiClient(ACCESS_KEY);
const gas = new GasStationClient(ACCESS_KEY);

// Sponsor transaction
const gaslessTx = await buildGaslessTransaction((tx) => { tx.moveCall({...}); }, { sui });
gaslessTx.sender = userAddress;
const sponsored = await gas.sponsorTransaction(gaslessTx);

// Dual sign + execute
const userSig = await Transaction.from(sponsored.txBytes).sign({ signer: userKeypair });
await sui.executeTransactionBlock({ transactionBlock: sponsored.txBytes, signature: [userSig.signature, sponsored.signature] });
```

---

## Enoki — @mysten/enoki

```bash
npm i @mysten/enoki
```

```typescript
import { registerEnokiWallets } from '@mysten/enoki';

// Register with dApp Kit
registerEnokiWallets({
  client: suiClient,
  network: 'testnet',
  apiKey: ENOKI_API_KEY,
  providers: { google: { clientId: GOOGLE_CLIENT_ID } },
});

// Low-level: EnokiClient
import { EnokiClient } from '@mysten/enoki';
const enoki = new EnokiClient({ apiKey: '...' });
const sponsored = await enoki.createSponsoredTransaction({ network: 'testnet', sender, transactionBytes });
await enoki.executeSponsoredTransaction({ digest: sponsored.digest, signature: userSig });
```

---

## dApp Kit — @mysten/dapp-kit-react

```bash
npm i @mysten/dapp-kit-react @mysten/sui @tanstack/react-query
```

```tsx
import { DAppKitProvider, SuiClientProvider, ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit-react';

function App() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SuiClientProvider networks={{ mainnet: { url: 'https://fullnode.mainnet.sui.io:443' } }}>
        <DAppKitProvider>
          <ConnectButton />
          <YourApp />
        </DAppKitProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

function YourApp() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  // signAndExecute({ transaction: tx });
}
```

---

## Walrus — @mysten/walrus

```bash
npm i @mysten/walrus @mysten/sui
```

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { walrus } from '@mysten/walrus';

const client = new SuiGrpcClient({ network: 'testnet' }).$extend(walrus());

// Write
const { blobId } = await client.walrus.writeBlob({ blob: new TextEncoder().encode('Hello'), deletable: true, epochs: 3, signer: keypair });

// Read
const data = await client.walrus.readBlob({ blobId });
```

---

## SuiNS — @mysten/suins

```bash
npm i @mysten/suins
```

```typescript
import { SuinsClient } from '@mysten/suins';
const suins = new SuinsClient({ client: suiClient, network: 'mainnet' });

const record = await suins.getNameRecord('alice.sui');
// record.targetAddress, record.data.avatar, record.expirationTimestampMs

// Or via core SDK (no @mysten/suins needed)
const addr = await suiClient.resolveNameServiceAddress({ name: 'alice.sui' });
```

---

## Kiosk — @mysten/kiosk

```bash
npm i @mysten/kiosk
```

```typescript
import { kiosk, KioskTransaction } from '@mysten/kiosk';
const client = jsonRpcClient.$extend(kiosk());

const { kioskOwnerCaps } = await client.kiosk.getOwnedKiosks({ address: myAddr });

const tx = new Transaction();
const kioskTx = new KioskTransaction({ transaction: tx, kioskClient: client.kiosk, cap: kioskOwnerCaps[0] });
kioskTx.place({ itemType: NFT_TYPE, item: tx.object(nftId) });
kioskTx.list({ itemType: NFT_TYPE, itemId: nftId, price: 1000000000n });
kioskTx.finalize(); // MUST call
```

---

## Key On-Chain Addresses

| Object | Address |
|--------|---------|
| Sui Framework | `0x2` |
| Clock | `0x6` |
| Random | `0x8` |
| DenyList | `0x403` |
| Coin Registry | `0xc` |

## Common Coin Types (Mainnet)

| Token | Type |
|-------|------|
| SUI | `0x2::sui::SUI` |
| USDC (Circle) | `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` |
| DEEP | `0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP` |
| WETH | `0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN` |
