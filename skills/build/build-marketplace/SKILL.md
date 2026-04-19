---
name: build-marketplace
description: "Build an NFT/asset marketplace on Sui using the Kiosk standard. Covers listing, purchasing, royalty enforcement via TransferPolicy, search/filter UI, collection pages, escrow patterns, auction mechanics. Triggers: marketplace, nft marketplace, kiosk marketplace, buy sell nft, build marketplace, kiosk listing, nft trading"
---

```bash
# Telemetry preamble
SKILL_NAME="build-marketplace"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui marketplace architect. Your job is to guide the user through building a full NFT and digital asset marketplace using Sui's native Kiosk standard. On Sui, marketplaces are NOT built with custom listing/escrow contracts like on EVM. Instead, Sui provides the **Kiosk** primitive — a decentralized storefront owned by each user — and **TransferPolicy** for creator-enforced royalties.

Key architecture: Every seller has their own `Kiosk` object (like a personal shop). Items are "placed" into the Kiosk and "listed" with a price. Buyers call `purchase` on the Kiosk, which returns a `TransferRequest` that must satisfy the creator's `TransferPolicy` (royalties, allowlists, etc.) before the item can be received. The marketplace is the **frontend and indexer** that aggregates all Kiosks — not a monolithic smart contract.

This is fundamentally different from OpenSea/EVM marketplaces. There is no central escrow contract. Each Kiosk is sovereign.

## Workflow

### Step 1: Understand the Kiosk Architecture

```
┌──────────────────────────────────────────────────┐
│                   MARKETPLACE UI                  │
│  (Frontend that indexes and displays all Kiosks)  │
└─────────────────────┬────────────────────────────┘
                      │ queries
┌─────────────────────▼────────────────────────────┐
│                   INDEXER                          │
│  (Listens to Kiosk events, builds search index)   │
└─────────────────────┬────────────────────────────┘
                      │ reads
┌──────┐  ┌──────┐  ┌▼─────┐  ┌──────┐
│Kiosk │  │Kiosk │  │Kiosk │  │Kiosk │  ... (one per seller)
│Alice │  │Bob   │  │Carol │  │Dave  │
└──────┘  └──────┘  └──────┘  └──────┘
     │         │         │         │
     └─────────┴─────────┴─────────┘
                    │
          TransferPolicy<T>
          (Creator-defined rules:
           royalty %, allowlist, etc.)
```

### Step 2: Create an NFT Collection with TransferPolicy

```move
module marketplace::my_nft {
    use sui::display;
    use sui::package;
    use sui::transfer_policy;
    use sui::event;
    use std::string::String;

    public struct MY_NFT has drop {}

    /// The NFT type — MUST have `key` and `store` to work with Kiosk
    public struct MyNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String,
        number: u64,
        attributes: vector<String>,
    }

    /// Admin capability for the collection
    public struct CollectionAdmin has key, store {
        id: UID,
        total_minted: u64,
        max_supply: u64,
    }

    public struct NFTMinted has copy, drop {
        nft_id: ID,
        number: u64,
        minter: address,
    }

    fun init(otw: MY_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        // Setup Display
        let mut display = display::new<MyNFT>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"{name}"));
        display::add(&mut display, string::utf8(b"description"), string::utf8(b"{description}"));
        display::add(&mut display, string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        display::add(&mut display, string::utf8(b"number"), string::utf8(b"{number}"));
        display::update_version(&mut display);

        // Create TransferPolicy — this is where royalties are enforced
        let (policy, policy_cap) = transfer_policy::new<MyNFT>(&publisher, ctx);

        // Transfer everything to deployer
        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
        transfer::public_share_object(policy);
        transfer::public_transfer(policy_cap, tx_context::sender(ctx));

        // Collection admin
        transfer::transfer(CollectionAdmin {
            id: object::new(ctx),
            total_minted: 0,
            max_supply: 10_000,
        }, tx_context::sender(ctx));
    }

    public entry fun mint(
        admin: &mut CollectionAdmin,
        name: String,
        description: String,
        image_url: String,
        attributes: vector<String>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(admin.total_minted < admin.max_supply, 0);
        admin.total_minted = admin.total_minted + 1;

        let nft = MyNFT {
            id: object::new(ctx),
            name,
            description,
            image_url,
            number: admin.total_minted,
            attributes,
        };

        event::emit(NFTMinted {
            nft_id: object::id(&nft),
            number: admin.total_minted,
            minter: recipient,
        });

        transfer::public_transfer(nft, recipient);
    }
}
```

### Step 3: Add Royalty Rules to TransferPolicy

```move
module marketplace::royalty_setup {
    use sui::transfer_policy::{Self, TransferPolicy, TransferPolicyCap};
    use sui::kiosk_royalty_rule;
    use marketplace::my_nft::MyNFT;

    /// Set up royalty rules — call this once after deployment
    public entry fun setup_royalties(
        policy: &mut TransferPolicy<MyNFT>,
        cap: &TransferPolicyCap<MyNFT>,
    ) {
        // 5% royalty on every sale, minimum 100 MIST
        kiosk_royalty_rule::add<MyNFT>(
            policy,
            cap,
            500,        // basis points (500 = 5%)
            100,        // minimum royalty amount in MIST
        );
    }
}
```

Using the TypeScript SDK:

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

// Add royalty rule to transfer policy
const tx = new Transaction();

tx.moveCall({
  target: "0x2::kiosk_royalty_rule::add",
  typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
  arguments: [
    tx.object(TRANSFER_POLICY_ID),
    tx.object(TRANSFER_POLICY_CAP_ID),
    tx.pure.u16(500),  // 5% royalty
    tx.pure.u64(100),  // min royalty
  ],
});

await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
```

### Step 4: Kiosk Operations — Seller Side

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// === Create a Kiosk (one-time per seller) ===
async function createKiosk(signer) {
  const tx = new Transaction();

  const [kiosk, kioskCap] = tx.moveCall({
    target: "0x2::kiosk::new",
  });

  tx.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: ["0x2::kiosk::Kiosk"],
    arguments: [kiosk],
  });

  // Keep the KioskOwnerCap — this proves ownership
  tx.transferObjects([kioskCap], signer.toSuiAddress());

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true },
  });

  // Extract Kiosk ID and KioskOwnerCap ID from result
  return parseKioskCreation(result);
}

// === Place and List an NFT ===
async function listNFT(signer, kioskId, kioskCapId, nftId, priceInMist) {
  const tx = new Transaction();

  // Place the NFT into the Kiosk
  tx.moveCall({
    target: "0x2::kiosk::place",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(kioskId),
      tx.object(kioskCapId),
      tx.object(nftId),
    ],
  });

  // List it for sale
  tx.moveCall({
    target: "0x2::kiosk::list",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(kioskId),
      tx.object(kioskCapId),
      tx.pure.id(nftId),
      tx.pure.u64(priceInMist),
    ],
  });

  await client.signAndExecuteTransaction({ signer, transaction: tx });
}

// === Delist (cancel listing) ===
async function delistNFT(signer, kioskId, kioskCapId, nftId) {
  const tx = new Transaction();

  tx.moveCall({
    target: "0x2::kiosk::delist",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(kioskId),
      tx.object(kioskCapId),
      tx.pure.id(nftId),
    ],
  });

  await client.signAndExecuteTransaction({ signer, transaction: tx });
}

// === Withdraw profits from Kiosk ===
async function withdrawProfits(signer, kioskId, kioskCapId) {
  const tx = new Transaction();

  const [profits] = tx.moveCall({
    target: "0x2::kiosk::withdraw",
    arguments: [
      tx.object(kioskId),
      tx.object(kioskCapId),
      tx.pure.option("u64", null), // null = withdraw all
    ],
  });

  tx.transferObjects([profits], signer.toSuiAddress());
  await client.signAndExecuteTransaction({ signer, transaction: tx });
}
```

### Step 5: Purchase Flow — Buyer Side

```typescript
// === Purchase an NFT from a Kiosk (with royalty payment) ===
async function purchaseNFT(
  signer,
  sellerKioskId: string,
  nftId: string,
  price: bigint,
  buyerKioskId: string,
  buyerKioskCapId: string,
) {
  const tx = new Transaction();

  // Step 1: Split payment coin
  const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);

  // Step 2: Purchase from seller's Kiosk — returns (NFT, TransferRequest)
  const [nft, transferRequest] = tx.moveCall({
    target: "0x2::kiosk::purchase",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(sellerKioskId),
      tx.pure.id(nftId),
      paymentCoin,
    ],
  });

  // Step 3: Pay royalty (satisfies the TransferPolicy rule)
  const [royaltyPayment] = tx.splitCoins(tx.gas, [
    tx.pure.u64(Number(price) * 5 / 100), // 5% royalty
  ]);

  tx.moveCall({
    target: "0x2::kiosk_royalty_rule::pay",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(TRANSFER_POLICY_ID),
      transferRequest,
      royaltyPayment,
    ],
  });

  // Step 4: Confirm the transfer (validates all rules are satisfied)
  tx.moveCall({
    target: "0x2::transfer_policy::confirm_request",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(TRANSFER_POLICY_ID),
      transferRequest,
    ],
  });

  // Step 5: Place NFT into buyer's Kiosk (or transfer directly)
  tx.moveCall({
    target: "0x2::kiosk::place",
    typeArguments: [`${PACKAGE_ID}::my_nft::MyNFT`],
    arguments: [
      tx.object(buyerKioskId),
      tx.object(buyerKioskCapId),
      nft,
    ],
  });

  await client.signAndExecuteTransaction({ signer, transaction: tx });
}
```

### Step 6: Indexer for Marketplace Search

```typescript
import { SuiClient } from "@mysten/sui/client";
import { EventId } from "@mysten/sui/client";

// Listen to Kiosk events for real-time listing updates
async function indexMarketplaceEvents(client: SuiClient) {
  let cursor: EventId | null = null;

  while (true) {
    // Query listing events
    const events = await client.queryEvents({
      query: {
        MoveEventType: "0x2::kiosk::ItemListed",
      },
      cursor,
      limit: 100,
    });

    for (const event of events.data) {
      const { kiosk, id, type: itemType, price } = event.parsedJson;

      // Index in your database
      await db.listings.upsert({
        kioskId: kiosk,
        itemId: id,
        itemType,
        price: BigInt(price),
        listedAt: event.timestampMs,
        status: "active",
      });
    }

    // Query purchase events (to mark listings as sold)
    const purchases = await client.queryEvents({
      query: {
        MoveEventType: "0x2::kiosk::ItemPurchased",
      },
      cursor,
      limit: 100,
    });

    for (const event of purchases.data) {
      await db.listings.update({
        itemId: event.parsedJson.id,
        status: "sold",
        soldAt: event.timestampMs,
        buyer: event.parsedJson.buyer,
      });
    }

    cursor = events.nextCursor;
    if (!events.hasNextPage) {
      await new Promise((r) => setTimeout(r, 2000)); // Poll interval
      continue;
    }
  }
}
```

### Step 7: Collection Page with GraphQL

```typescript
// Fetch all NFTs of a specific type with their listing status
const COLLECTION_QUERY = `
  query CollectionItems($type: String!, $first: Int, $after: String) {
    objects(
      filter: { type: $type }
      first: $first
      after: $after
    ) {
      nodes {
        objectId
        display {
          key
          value
        }
        owner {
          ... on ObjectOwner {
            owner {
              objectId
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function fetchCollection(nftType: string, limit = 50) {
  const response = await fetch("https://sui-mainnet.mystenlabs.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: COLLECTION_QUERY,
      variables: { type: nftType, first: limit },
    }),
  });

  const { data } = await response.json();
  return data.objects.nodes.map((node) => ({
    id: node.objectId,
    display: Object.fromEntries(
      node.display.map((d) => [d.key, d.value])
    ),
    ownerKiosk: node.owner?.owner?.objectId,
  }));
}
```

### Step 8: Auction Extension

```move
module marketplace::auction {
    use sui::clock::Clock;
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::event;

    const EAuctionNotStarted: u64 = 0;
    const EAuctionEnded: u64 = 1;
    const EBidTooLow: u64 = 2;
    const EAuctionNotEnded: u64 = 3;

    public struct Auction<phantom T: key + store> has key {
        id: UID,
        item_id: ID,
        kiosk_id: ID,
        seller: address,
        start_time: u64,
        end_time: u64,
        min_bid: u64,
        highest_bid: u64,
        highest_bidder: address,
        bid_escrow: Balance<SUI>,
    }

    public struct AuctionBid has copy, drop {
        auction_id: ID,
        bidder: address,
        amount: u64,
    }

    public entry fun place_bid<T: key + store>(
        auction: &mut Auction<T>,
        mut bid: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(now >= auction.start_time, EAuctionNotStarted);
        assert!(now < auction.end_time, EAuctionEnded);

        let bid_amount = coin::value(&bid);
        assert!(bid_amount > auction.highest_bid, EBidTooLow);
        assert!(bid_amount >= auction.min_bid, EBidTooLow);

        // Refund previous highest bidder
        if (auction.highest_bid > 0) {
            let refund = coin::from_balance(
                balance::split(&mut auction.bid_escrow, auction.highest_bid),
                ctx,
            );
            transfer::public_transfer(refund, auction.highest_bidder);
        };

        // Accept new bid
        balance::join(&mut auction.bid_escrow, coin::into_balance(bid));
        auction.highest_bid = bid_amount;
        auction.highest_bidder = tx_context::sender(ctx);

        event::emit(AuctionBid {
            auction_id: object::id(auction),
            bidder: tx_context::sender(ctx),
            amount: bid_amount,
        });
    }
}
```

### Step 9: Frontend Marketplace Component

```typescript
import React, { useEffect, useState } from "react";
import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";

interface Listing {
  nftId: string;
  name: string;
  imageUrl: string;
  price: bigint;
  kioskId: string;
  collection: string;
}

function MarketplacePage() {
  const client = useSuiClient();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState({ collection: "all", sortBy: "price_asc" });

  useEffect(() => {
    fetchActiveListings(client, filter).then(setListings);
  }, [filter]);

  const sortedListings = [...listings].sort((a, b) => {
    if (filter.sortBy === "price_asc") return Number(a.price - b.price);
    if (filter.sortBy === "price_desc") return Number(b.price - a.price);
    return 0;
  });

  return (
    <div className="marketplace">
      <div className="filters">
        <select onChange={(e) => setFilter({ ...filter, collection: e.target.value })}>
          <option value="all">All Collections</option>
          <option value="my_nft">My NFT Collection</option>
        </select>
        <select onChange={(e) => setFilter({ ...filter, sortBy: e.target.value })}>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>
      </div>
      <div className="grid">
        {sortedListings.map((listing) => (
          <NFTCard key={listing.nftId} listing={listing} />
        ))}
      </div>
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS use the Kiosk standard** — never build custom escrow contracts for NFT trading on Sui; Kiosk is the native primitive
2. **ALWAYS respect TransferPolicy** — every purchase must satisfy the creator's royalty and rule requirements; skipping rules makes the transfer fail at the Move level
3. **NFTs MUST have `key + store`** to be placed in Kiosks — objects with only `key` cannot be traded
4. **NEVER hold buyer funds in a marketplace contract** — payments go directly through Kiosk::purchase; the marketplace is a UI, not a custodian
5. **ALWAYS index Kiosk events** for search and filtering — Kiosks are distributed across the network; you need an indexer to aggregate listings
6. **ALWAYS implement Display** for NFTs — without Display, wallets and explorers cannot render NFT metadata
7. **ALWAYS handle KioskOwnerCap securely** — losing the cap means losing control of the Kiosk; never expose it in public functions
8. **Emit events for all marketplace actions** — listing, delisting, purchase, price change; your indexer and analytics depend on these

## References

- `skills/build/integrate-seal/SKILL.md` — Access-controlled content with Seal for gated NFTs
- `skills/build/build-defi-protocol/SKILL.md` — DeFi patterns for payment handling
- `skills/build/integrate-suins/SKILL.md` — SuiNS for collection verification
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
