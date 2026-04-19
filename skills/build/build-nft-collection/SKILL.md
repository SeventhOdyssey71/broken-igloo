---
name: build-nft-collection
description: "Complete guide to creating and launching an NFT collection on Sui. Covers Move NFT module, Display standard, Kiosk listing, TransferPolicy with royalties, minting page, and marketplace integration. Triggers: nft, nft collection, mint nft, sui nft, display standard, kiosk, transfer policy, royalties, nft marketplace"
---

```bash
# Telemetry preamble
SKILL_NAME="build-nft-collection"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui NFT architect. Your job is to guide the user through building a complete NFT collection on Sui — from the Move smart contract to the minting page. Sui NFTs are fundamentally different from EVM NFTs: there is no ERC-721 standard. Instead, each NFT is a unique owned object with typed fields, and the **Display standard** controls how wallets and explorers render them. The **Kiosk** system provides a built-in marketplace with **TransferPolicy** for enforcing royalties.

**Sui NFT architecture:**
- **NFT Object**: A Move struct with `key, store` abilities — each instance is a unique on-chain object
- **Display<T>**: An on-chain template that tells wallets/explorers how to render the NFT (name, image, description)
- **Kiosk**: A decentralized storefront where users list NFTs for sale
- **TransferPolicy<T>**: Defines rules for transfers (royalties, allowlists, lock periods)
- **Publisher**: Proves you are the module author — required to create Display and TransferPolicy

## Workflow

### Step 1: Write the NFT Move Module

```move
module nft_collection::my_nft {
    use std::string::{Self, String};
    use sui::display;
    use sui::event;
    use sui::package;

    // === One-Time Witness (for Publisher) ===
    public struct MY_NFT has drop {}

    // === NFT Object ===
    public struct MyNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String,
        /// Collection number (e.g., #1 of 1000)
        number: u64,
        /// Arbitrary attributes for rarity/traits
        attributes: vector<String>,
    }

    // === Admin Capability ===
    public struct MintCap has key, store {
        id: UID,
        /// Maximum supply (0 = unlimited)
        max_supply: u64,
        /// Current number minted
        minted: u64,
    }

    // === Events ===
    public struct NFTMinted has copy, drop {
        object_id: ID,
        number: u64,
        creator: address,
        recipient: address,
    }

    // === Init: Create Publisher, Display, and MintCap ===
    fun init(otw: MY_NFT, ctx: &mut TxContext) {
        // Claim the Publisher object (proves authorship)
        let publisher = package::claim(otw, ctx);

        // Create the Display template
        let mut disp = display::new<MyNFT>(&publisher, ctx);
        disp.add(string::utf8(b"name"), string::utf8(b"{name}"));
        disp.add(string::utf8(b"description"), string::utf8(b"{description}"));
        disp.add(string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        disp.add(string::utf8(b"project_url"), string::utf8(b"https://myproject.com"));
        disp.add(string::utf8(b"creator"), string::utf8(b"My NFT Studio"));
        display::update_version(&mut disp);

        // Create the MintCap
        let mint_cap = MintCap {
            id: object::new(ctx),
            max_supply: 1000,
            minted: 0,
        };

        // Transfer Publisher and MintCap to deployer
        transfer::public_transfer(publisher, ctx.sender());
        transfer::public_transfer(disp, ctx.sender());
        transfer::public_transfer(mint_cap, ctx.sender());
    }

    // === Mint Function ===
    public fun mint(
        mint_cap: &mut MintCap,
        name: String,
        description: String,
        image_url: String,
        attributes: vector<String>,
        recipient: address,
        ctx: &mut TxContext,
    ): MyNFT {
        // Enforce supply limit
        assert!(
            mint_cap.max_supply == 0 || mint_cap.minted < mint_cap.max_supply,
            0, // ESupplyExhausted
        );

        mint_cap.minted = mint_cap.minted + 1;

        let nft = MyNFT {
            id: object::new(ctx),
            name,
            description,
            image_url,
            number: mint_cap.minted,
            attributes,
        };

        event::emit(NFTMinted {
            object_id: object::id(&nft),
            number: mint_cap.minted,
            creator: ctx.sender(),
            recipient,
        });

        nft
    }

    // === Entry function for direct minting ===
    entry fun mint_and_transfer(
        mint_cap: &mut MintCap,
        name: String,
        description: String,
        image_url: String,
        attributes: vector<String>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nft = mint(mint_cap, name, description, image_url, attributes, recipient, ctx);
        transfer::public_transfer(nft, recipient);
    }

    // === Batch Mint ===
    entry fun batch_mint(
        mint_cap: &mut MintCap,
        names: vector<String>,
        descriptions: vector<String>,
        image_urls: vector<String>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let len = vector::length(&names);
        let mut i = 0;
        while (i < len) {
            let nft = mint(
                mint_cap,
                *vector::borrow(&names, i),
                *vector::borrow(&descriptions, i),
                *vector::borrow(&image_urls, i),
                vector::empty(),
                recipient,
                ctx,
            );
            transfer::public_transfer(nft, recipient);
            i = i + 1;
        };
    }

    // === Burn Function ===
    entry fun burn(nft: MyNFT) {
        let MyNFT { id, name: _, description: _, image_url: _, number: _, attributes: _ } = nft;
        object::delete(id);
    }

    // === View Functions ===
    public fun name(nft: &MyNFT): &String { &nft.name }
    public fun number(nft: &MyNFT): u64 { nft.number }
    public fun total_minted(mint_cap: &MintCap): u64 { mint_cap.minted }
    public fun max_supply(mint_cap: &MintCap): u64 { mint_cap.max_supply }
}
```

### Step 2: Set Up TransferPolicy with Royalties

```move
module nft_collection::royalty_setup {
    use sui::package::Publisher;
    use sui::transfer_policy;
    use sui::sui::SUI;
    use nft_collection::my_nft::MyNFT;

    /// Create a TransferPolicy with royalty rules
    entry fun setup_royalty_policy(
        publisher: &Publisher,
        ctx: &mut TxContext,
    ) {
        // Create the TransferPolicy for MyNFT
        let (mut policy, policy_cap) = transfer_policy::new<MyNFT>(publisher, ctx);

        // Add royalty rule (e.g., 5% royalty)
        // You would use sui::transfer_policy to add rules:
        // - royalty_rule: percentage-based royalty
        // - kiosk_lock_rule: require NFTs stay in Kiosks
        // - personal_kiosk_rule: only personal Kiosks

        // Share the policy (marketplaces read this)
        transfer::public_share_object(policy);
        transfer::public_transfer(policy_cap, ctx.sender());
    }
}
```

### Step 3: Deploy and Configure

```bash
# Build the package
sui move build

# Deploy to testnet
sui client publish --gas-budget 500000000

# Note the output:
# - Package ID
# - MintCap object ID
# - Publisher object ID
# - Display object ID
```

### Step 4: Kiosk Listing (TypeScript)

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { KioskClient, KioskTransaction, Network } from "@mysten/kiosk";

const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);

const kioskClient = new KioskClient({
  client: suiClient,
  network: Network.TESTNET,
});

const NFT_TYPE = `${PACKAGE_ID}::my_nft::MyNFT`;

// Create a personal Kiosk
async function createKiosk() {
  const tx = new Transaction();
  const kioskTx = new KioskTransaction({ transaction: tx, kioskClient });

  kioskTx.create();
  kioskTx.shareAndTransferCap(keypair.getPublicKey().toSuiAddress());
  kioskTx.finalize();

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  console.log("Kiosk created:", result.digest);
}

// List an NFT for sale in your Kiosk
async function listNftForSale(
  kioskId: string,
  kioskCapId: string,
  nftId: string,
  priceInMist: bigint, // 1 SUI = 1_000_000_000 MIST
) {
  const tx = new Transaction();
  const kioskTx = new KioskTransaction({
    transaction: tx,
    kioskClient,
    kioskCap: kioskCapId,
    kiosk: kioskId,
  });

  // Place the NFT in the Kiosk and list it
  kioskTx.place({ itemType: NFT_TYPE, item: nftId });
  kioskTx.list({ itemType: NFT_TYPE, itemId: nftId, price: priceInMist });
  kioskTx.finalize();

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log("Listed for sale:", result.digest);
}

// Purchase an NFT from a Kiosk (with royalty)
async function purchaseNft(
  sellerKioskId: string,
  nftId: string,
  price: bigint,
  buyerKioskId: string,
  buyerKioskCapId: string,
) {
  const tx = new Transaction();
  const kioskTx = new KioskTransaction({
    transaction: tx,
    kioskClient,
    kioskCap: buyerKioskCapId,
    kiosk: buyerKioskId,
  });

  // Purchase handles royalty payment automatically if TransferPolicy exists
  kioskTx.purchase({
    itemType: NFT_TYPE,
    itemId: nftId,
    price,
    sellerKiosk: sellerKioskId,
  });
  kioskTx.finalize();

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log("Purchased:", result.digest);
}
```

### Step 5: Build the Minting Page

```tsx
"use client";
import { useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID = "0x<YOUR_PACKAGE_ID>";
const MINT_CAP_ID = "0x<YOUR_MINT_CAP_ID>";

export function MintPage() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [minting, setMinting] = useState(false);

  async function handleMint() {
    if (!account) return;
    setMinting(true);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::my_nft::mint_and_transfer`,
      arguments: [
        tx.object(MINT_CAP_ID),
        tx.pure.string("My NFT #1"),
        tx.pure.string("A unique digital collectible"),
        tx.pure.string("https://myproject.com/images/1.png"),
        tx.makeMoveVec({
          type: "0x1::string::String",
          elements: [tx.pure.string("rare"), tx.pure.string("blue")],
        }),
        tx.pure.address(account.address),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log("Minted!", result.digest);
          setMinting(false);
        },
        onError: (err) => {
          console.error("Mint failed:", err);
          setMinting(false);
        },
      },
    );
  }

  return (
    <div>
      <ConnectButton />
      {account && (
        <button onClick={handleMint} disabled={minting}>
          {minting ? "Minting..." : "Mint NFT (Free)"}
        </button>
      )}
    </div>
  );
}
```

### Step 6: Upload Images to Walrus

```typescript
import { WalrusClient } from "@mysten/walrus";

const walrusClient = new WalrusClient({
  network: "testnet",
  suiClient,
});

async function uploadNftImage(imagePath: string): Promise<string> {
  const imageData = new Uint8Array(await readFile(imagePath));

  const { blobId } = await walrusClient.writeBlob({
    blob: imageData,
    deletable: false,
    epochs: 100, // long-lived storage
    signer: keypair,
  });

  // Construct the Walrus URL for the image
  const imageUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
  return imageUrl;
}
```

### Step 7: Handoff

- "I want to add token-gated content to my NFTs" -> route to `build-token-gated`
- "I want encrypted content that reveals on purchase" -> route to `integrate-seal`
- "Deploy to mainnet" -> route to `deploy-to-mainnet`
- "Debug a Move error" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/02-objects-ownership-standards.md` for object model reference. Never block on missing files.

## Non-Negotiables

1. **ALWAYS use the Display standard** — wallets and explorers will not render your NFTs without a Display<T> object. Create it in `init`.
2. **ALWAYS claim the Publisher in `init`** — the Publisher object proves module authorship and is required for Display and TransferPolicy creation. It can only be claimed once, in the module initializer.
3. **Use `key, store` abilities for tradeable NFTs** — `key` alone makes NFTs non-transferable via `public_transfer`. Add `store` for marketplace compatibility.
4. **Never hardcode image URLs to centralized servers** — use Walrus or IPFS for permanent, decentralized image storage.
5. **Implement supply limits in the MintCap** — never allow unlimited minting without explicit intent. Accidental over-minting destroys collection value.
6. **Emit events for every mint and burn** — indexers and marketplaces depend on events to track collection activity.
7. **Set up TransferPolicy before listing on marketplaces** — without a TransferPolicy, Kiosk purchases will fail.
8. **Test minting on testnet first** — verify Display rendering, Kiosk listing, and purchase flow before mainnet deployment.

## References

- Sui Display Standard: https://docs.sui.io/standards/display
- Sui Kiosk: https://docs.sui.io/standards/kiosk
- Kiosk SDK: https://sdk.mystenlabs.com/kiosk
- `skills/data/sui-knowledge/02-objects-ownership-standards.md` — object model
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
