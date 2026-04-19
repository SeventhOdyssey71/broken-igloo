---
name: build-bridge-app
description: "Build cross-chain features on Sui. Covers Sui Bridge (native), Wormhole integration, bridged asset handling, cross-chain messaging, and multi-chain dApp patterns. Triggers: bridge, cross chain, wormhole, sui bridge, bridged asset, cross-chain messaging, multichain, bridge app, bridged usdc, wrapped"
---

```bash
# Telemetry preamble
SKILL_NAME="build-bridge-app"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui cross-chain integration specialist. Your job is to guide the user through building applications that bridge assets and messages between Sui and other blockchains. Sui supports two primary bridging approaches: the **native Sui Bridge** (for ETH and ERC-20 tokens from Ethereum) and **Wormhole** (for broader multi-chain connectivity).

**Bridging landscape on Sui:**

| Bridge | Chains | Assets | Speed | Best For |
|--------|--------|--------|-------|----------|
| **Sui Bridge** | Ethereum <-> Sui | ETH, WETH, USDC, USDT, WBTC | ~15 min | Official, highest trust |
| **Wormhole** | 20+ chains <-> Sui | Any wrapped token | ~15 min | Multi-chain, messaging |
| **Circle CCTP** | Ethereum <-> Sui | USDC (native) | ~15 min | Native USDC transfers |

**Important distinction:**
- **Native USDC on Sui**: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` — minted by Circle
- **Wormhole Bridged USDC**: Different type — wrapped by Wormhole, not native Circle USDC
- These are DIFFERENT coins with DIFFERENT types. Do not confuse them.

## Workflow

### Step 1: Using the Sui Bridge (Native)

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Sui Bridge contract addresses (mainnet)
const SUI_BRIDGE_PACKAGE = "0x<SUI_BRIDGE_PACKAGE>";
const BRIDGE_OBJECT = "0x<BRIDGE_OBJECT_ID>";

// === Bridge ETH from Ethereum to Sui ===
// Step 1: On Ethereum, approve and deposit to the Sui Bridge contract
// Step 2: Wait for bridge committee attestation (~15 minutes)
// Step 3: Claim the bridged tokens on Sui

// === Bridge Tokens from Sui back to Ethereum ===
async function bridgeToEthereum(
  keypair: any,
  coinObjectId: string,
  coinType: string,
  ethRecipient: string, // Ethereum address (0x...)
  amount: bigint,
) {
  const tx = new Transaction();

  // Call the bridge's send_token function
  tx.moveCall({
    target: `${SUI_BRIDGE_PACKAGE}::bridge::send_token`,
    arguments: [
      tx.object(BRIDGE_OBJECT),
      tx.pure.u8(1),              // target chain: 1 = Ethereum
      tx.pure.vector("u8",        // Ethereum recipient address bytes
        Array.from(Buffer.from(ethRecipient.slice(2), "hex"))
      ),
      tx.object(coinObjectId),    // The coin to bridge
    ],
    typeArguments: [coinType],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
}
```

### Step 2: Wormhole Integration

```typescript
// Wormhole enables cross-chain token transfers and messaging
// Install: npm i @wormhole-foundation/sdk

import {
  Wormhole,
  wormhole,
  amount,
  signSendWait,
} from "@wormhole-foundation/sdk";

// Import platform-specific modules
import sui from "@wormhole-foundation/sdk/sui";
import evm from "@wormhole-foundation/sdk/evm";

// Initialize Wormhole
const wh = await wormhole("Mainnet", [sui, evm]);

// Get chain contexts
const suiChain = wh.getChain("Sui");
const ethChain = wh.getChain("Ethereum");

// === Token Transfer: Ethereum -> Sui ===
async function bridgeFromEth(
  ethSigner: any,
  suiRecipient: string,
  tokenAddress: string, // ERC-20 address on Ethereum
  transferAmount: string,
) {
  // Create a token bridge transfer
  const xfer = await wh.tokenTransfer(
    amount.units(amount.parse(transferAmount, 18)), // amount with decimals
    {
      chain: "Ethereum",
      address: ethSigner.address,
    },
    {
      chain: "Sui",
      address: suiRecipient,
    },
    false, // not automatic relay
  );

  // Step 1: Send on source chain (Ethereum)
  const srcTxIds = await xfer.initiateTransfer(ethSigner);
  console.log("Source tx:", srcTxIds);

  // Step 2: Wait for attestation (VAA)
  const attestation = await xfer.fetchAttestation(60_000 * 20); // 20 min timeout
  console.log("Attestation received");

  // Step 3: Complete on destination chain (Sui)
  const dstTxIds = await xfer.completeTransfer(suiSigner);
  console.log("Destination tx:", dstTxIds);
}

// === Token Transfer: Sui -> Ethereum ===
async function bridgeFromSui(
  suiSigner: any,
  ethRecipient: string,
  coinType: string,
  transferAmount: string,
) {
  const xfer = await wh.tokenTransfer(
    amount.units(amount.parse(transferAmount, 9)), // SUI has 9 decimals
    {
      chain: "Sui",
      address: suiSigner.address(),
    },
    {
      chain: "Ethereum",
      address: ethRecipient,
    },
    false,
  );

  const srcTxIds = await xfer.initiateTransfer(suiSigner);
  console.log("Source tx:", srcTxIds);

  // Wait for guardian attestation
  const attestation = await xfer.fetchAttestation(60_000 * 20);

  // Complete on Ethereum
  const dstTxIds = await xfer.completeTransfer(ethSigner);
  console.log("Completed on Ethereum:", dstTxIds);
}
```

### Step 3: Handle Bridged Assets in Your dApp

```typescript
// Important: know the difference between native and bridged tokens

// Native USDC (Circle-minted on Sui)
const NATIVE_USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

// Wormhole-bridged USDC (wrapped)
const WORMHOLE_USDC = "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

// Check what bridged tokens a user holds
async function getBridgedTokenBalances(userAddress: string) {
  const allBalances = await client.getAllBalances({ owner: userAddress });

  const bridgedTokens = allBalances.filter((b) => {
    // Wormhole-wrapped tokens typically have a specific package prefix
    return b.coinType.includes("5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf");
  });

  return bridgedTokens;
}

// Swap bridged USDC for native USDC using DEX
async function swapBridgedToNative(
  keypair: any,
  bridgedUsdcObjectId: string,
  amount: bigint,
) {
  // Use 7K or Cetus aggregator to swap wormhole USDC -> native USDC
  // The aggregator handles routing through the best pools
  const tx = new Transaction();

  // ... aggregator swap call (see integrate-7k or integrate-cetus skills)

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
}
```

### Step 4: Cross-Chain Messaging with Wormhole

```typescript
// Wormhole also supports arbitrary message passing
// Send a message from Sui that can be verified on another chain

import { encoding } from "@wormhole-foundation/sdk";

// Send a cross-chain message from Sui
async function sendCrossChainMessage(
  suiSigner: any,
  targetChain: string,
  message: Uint8Array,
) {
  // Publish the message through Wormhole
  // The message gets attested by Wormhole guardians
  // Then can be verified and processed on the target chain

  const published = await wh.publishMessage(
    suiSigner,
    message,
    0, // nonce
    1, // consistency level (finality)
  );

  console.log("Message published, sequence:", published.sequence);

  // Fetch the VAA (Verified Action Approval)
  const vaa = await wh.getVaa(
    published.emitterAddress,
    published.sequence,
    "Sui",
    60_000 * 5,
  );

  return vaa;
}
```

### Step 5: Handoff

- "I need to integrate USDC payments" -> route to `build-payment-app`
- "I want to swap bridged tokens" -> route to `integrate-7k`
- "Deploy my bridge integration" -> route to `deploy-to-mainnet`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Distinguish native vs bridged tokens** — native USDC and Wormhole USDC are DIFFERENT coin types. Using the wrong type causes transaction failures. Always verify the full coin type.
2. **Bridge transactions are NOT instant** — expect 10-20 minutes for cross-chain transfers. Build your UX around this latency (progress indicators, notifications).
3. **Always handle attestation timeouts** — if the bridge attestation fails or times out, the user's funds are stuck until attestation completes. Implement retry logic.
4. **Verify bridge contract addresses** — always verify the official bridge package IDs from Sui or Wormhole documentation. Using fake bridge contracts leads to fund loss.
5. **Test on testnet with test tokens** — bridge operations involve real funds on multiple chains. Always test the full flow on testnet first.
6. **Monitor bridge health** — bridge committee liveness, guardian set, and relayer status can all affect your app. Set up monitoring for bridge status.

## References

- Sui Bridge: https://docs.sui.io/concepts/sui-bridge
- Wormhole SDK: https://docs.wormhole.com
- Wormhole Sui: https://docs.wormhole.com/wormhole/blockchain-environments/sui
- Native USDC: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
