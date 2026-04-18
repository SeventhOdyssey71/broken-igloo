# On-Chain Finance on Sui — Stablecoins, Neobanks, Regulated Tokens, RWAs

This reference covers everything needed to build financial applications on Sui, from stablecoin integration to full neobank architectures to compliance-ready token standards.

---

## 1. Stablecoins on Sui

### Native USDC (Circle)

Circle issues **native USDC** on Sui. This is not a bridged or wrapped token — it is first-party USDC backed 1:1 by Circle reserves.

**Key details:**
- Type: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
- Decimals: **6** (1 USDC = 1_000_000 on-chain units)
- Issuer: Circle
- Standard: Sui `Coin<USDC>` (fungible, freely transferable)

### USDT on Sui

Tether also issues native USDT on Sui:
- Decimals: **6**
- Standard: Sui `Coin<USDT>`

### Working with Stablecoins in TypeScript

```typescript
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });

// Fetch a user's USDC balance
async function getUsdcBalance(address: string): Promise<string> {
  const balance = await suiClient.getBalance({
    owner: address,
    coinType: USDC_TYPE,
  });
  // Convert from micro-units to dollars
  const dollars = Number(balance.totalBalance) / 1_000_000;
  return dollars.toFixed(2);
}

// Transfer USDC to another address
async function transferUsdc(
  signer: any,
  recipientAddress: string,
  amountDollars: number
) {
  const amountMicro = Math.floor(amountDollars * 1_000_000);
  const tx = new Transaction();

  // Get the sender's USDC coins
  const [usdcCoin] = tx.splitCoins(
    tx.object('0xUSER_USDC_COIN_OBJECT_ID'),
    [amountMicro]
  );
  tx.transferObjects([usdcCoin], recipientAddress);

  return await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
  });
}
```

### Accepting USDC Payments in a Move Contract

```move
module payments::store {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // USDC type from the mainnet USDC package
    // In practice, import via the actual dependency
    public struct USDC has drop {}

    /// A merchant's payment receiver
    public struct Merchant has key {
        id: UID,
        owner: address,
        revenue: Balance<USDC>,
        total_sales: u64,
    }

    /// Create a new merchant account
    public fun create_merchant(ctx: &mut TxContext) {
        let merchant = Merchant {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            revenue: balance::zero<USDC>(),
            total_sales: 0,
        };
        transfer::share_object(merchant);
    }

    /// Pay a merchant in USDC
    public fun pay(
        merchant: &mut Merchant,
        payment: Coin<USDC>,
        _ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, 0);

        let payment_balance = coin::into_balance(payment);
        balance::join(&mut merchant.revenue, payment_balance);
        merchant.total_sales = merchant.total_sales + 1;
    }

    /// Merchant withdraws accumulated revenue
    public fun withdraw(
        merchant: &mut Merchant,
        ctx: &mut TxContext
    ): Coin<USDC> {
        assert!(tx_context::sender(ctx) == merchant.owner, 1);
        let amount = balance::value(&merchant.revenue);
        coin::take(&mut merchant.revenue, amount, ctx)
    }
}
```

### Swapping SUI to USDC via 7K Aggregator

The 7K Router aggregates liquidity from Cetus, Turbos, DeepBook, and other DEXes:

```typescript
import { SevenKClient } from '@7kprotocol/sdk';
import { Transaction } from '@mysten/sui/transactions';

const sevenk = new SevenKClient({ network: 'mainnet' });

// Get the best swap route for 10 SUI -> USDC
const quote = await sevenk.getQuote({
  tokenIn: '0x2::sui::SUI',
  tokenOut: USDC_TYPE,
  amountIn: '10000000000', // 10 SUI in MIST
  slippageBps: 50, // 0.5% slippage tolerance
});

console.log(`Expected USDC out: ${Number(quote.amountOut) / 1e6}`);

// Build and execute the swap transaction
const tx = await sevenk.buildSwapTransaction({
  quote,
  accountAddress: userAddress,
});

const result = await suiClient.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
});
```

---

## 2. Building a Neobank on Sui

### Architecture Overview

A Sui-based neobank leverages the unique properties of the chain to deliver a Web2-quality banking experience:

```
┌─────────────────────────────────────────────────┐
│                  Frontend (React)                │
│   zkLogin (Google/Apple) + Passkeys for auth     │
│   Enoki for sponsored transactions (gas-free)    │
├─────────────────────────────────────────────────┤
│                  Backend / API                   │
│   KYC provider integration (Persona, Jumio)      │
│   Fiat on/off-ramp (MoonPay, Ramp, Transak)     │
│   Event indexing for transaction history          │
├─────────────────────────────────────────────────┤
│                  Sui Blockchain                  │
│   USDC as base currency                          │
│   Move modules for payments/transfers            │
│   DEX integration for FX (7K Aggregator)         │
│   Lending protocol for savings yield             │
│   PTBs for atomic multi-step operations          │
└─────────────────────────────────────────────────┘
```

### Core Features

**1. Onboarding (zkLogin + Enoki)**
Users sign in with Google or Apple. No seed phrases, no wallet installation. Enoki sponsors the initial transactions so users never need to acquire SUI for gas.

**2. Deposits / On-Ramp**
Integrate MoonPay, Ramp, or Transak to let users buy USDC with a credit card or bank transfer. The USDC lands directly in their zkLogin-derived Sui address.

**3. Send / Receive**
Simple USDC transfers between users. Use SuiNS names for a Venmo-like experience: "Send $50 to alice.sui".

**4. FX Conversion**
Use the 7K aggregator to swap between SUI, USDC, USDT, and other tokens. This replaces traditional FX.

**5. Savings**
Deposit USDC into a lending protocol (Scallop, NAVI, Suilend) to earn yield. The user sees "Savings Account: 4.2% APY".

**6. Transaction History**
Index Sui events using a custom indexer or the Sui RPC `queryEvents` to build a complete transaction history.

### "Swap and Send" — A Single PTB

One of Sui's superpowers for fintech: combine a swap and a transfer in a single atomic transaction using Programmable Transaction Blocks.

```typescript
import { Transaction } from '@mysten/sui/transactions';

async function swapAndSend(
  signer: any,
  recipientAddress: string,
  suiAmountToSwap: bigint,
  minUsdcOut: bigint
) {
  const tx = new Transaction();

  // Step 1: Split SUI from gas for the swap
  const [suiCoin] = tx.splitCoins(tx.gas, [suiAmountToSwap]);

  // Step 2: Swap SUI → USDC via a DEX pool (example with a generic swap call)
  const [usdcCoin] = tx.moveCall({
    target: '0xDEX_PACKAGE::router::swap_exact_input',
    arguments: [
      tx.object('0xPOOL_ID'),
      suiCoin,
      tx.pure.u64(minUsdcOut),
      tx.object('0x6'), // Clock
    ],
    typeArguments: ['0x2::sui::SUI', USDC_TYPE],
  });

  // Step 3: Send the USDC to the recipient
  tx.transferObjects([usdcCoin], recipientAddress);

  // All three steps execute atomically — if any fails, all revert
  return await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
  });
}
```

### Move Module: Payment System

```move
module neobank::payments {
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};

    /// Emitted on every payment for indexing
    public struct PaymentEvent has copy, drop {
        payment_id: ID,
        from: address,
        to: address,
        amount: u64,
        memo: vector<u8>,
        timestamp_ms: u64,
    }

    /// A payment receipt (owned object for the sender's records)
    public struct PaymentReceipt has key, store {
        id: UID,
        from: address,
        to: address,
        amount: u64,
        memo: vector<u8>,
        timestamp_ms: u64,
    }

    /// Send a USDC payment with a memo
    public fun send_payment<T>(
        payment: Coin<T>,
        recipient: address,
        memo: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Create a receipt for the sender
        let receipt = PaymentReceipt {
            id: object::new(ctx),
            from: sender,
            to: recipient,
            amount,
            memo,
            timestamp_ms: timestamp,
        };

        // Emit event for indexing
        event::emit(PaymentEvent {
            payment_id: object::id(&receipt),
            from: sender,
            to: recipient,
            amount,
            memo,
            timestamp_ms: timestamp,
        });

        // Transfer the coin to the recipient
        transfer::public_transfer(payment, recipient);
        // Transfer the receipt to the sender
        transfer::transfer(receipt, sender);
    }
}
```

### Compliance: KYC Integration Points

For regulated neobanking, add KYC gates:

1. **Off-chain KYC**: Integrate Persona/Jumio. After KYC, issue an on-chain `KYCVerified` object to the user's address.
2. **On-chain enforcement**: Move functions can require a `KYCVerified` reference:

```move
public struct KYCVerified has key {
    id: UID,
    user: address,
    provider: vector<u8>,
    expiry_ms: u64,
}

/// Only KYC-verified users can perform large transfers
public fun large_transfer<T>(
    kyc: &KYCVerified,
    payment: Coin<T>,
    recipient: address,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(kyc.user == tx_context::sender(ctx), 0);
    assert!(clock::timestamp_ms(clock) < kyc.expiry_ms, 1);
    transfer::public_transfer(payment, recipient);
}
```

---

## 3. Closed-Loop Token Standard

### What Closed-Loop Tokens Are

Sui has a built-in distinction between **Coins** and **Tokens**:

| Property | `Coin<T>` | `Token<T>` |
|---|---|---|
| Transferability | Freely transferable | Restricted by policy |
| Storage | Object (on-chain, owned) | Balance in a `TokenPolicy` scope |
| Use case | Currencies, fungible assets | Loyalty points, in-app currency, regulated assets |
| Standard | `sui::coin` | `sui::token` |

A `Token<T>` can only be spent, transferred, or converted according to rules defined in a `TokenPolicy`. This makes it ideal for restricted-circulation assets.

### Creating a Closed-Loop Token

```move
module loyalty::points {
    use sui::token::{Self, Token, TokenPolicy, TokenPolicyCap, ActionRequest};
    use sui::coin::{Self, TreasuryCap};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// One-Time Witness
    public struct POINTS has drop {}

    /// Initialize the loyalty points token
    fun init(witness: POINTS, ctx: &mut TxContext) {
        let (treasury_cap, coin_metadata) = coin::create_currency(
            witness,
            0, // 0 decimals — points are whole numbers
            b"PTS",
            b"Loyalty Points",
            b"Reward points for our platform",
            option::none(),
            ctx
        );

        // Create a TokenPolicy that restricts how tokens can be used
        let (policy, policy_cap) = token::new_policy(
            &treasury_cap,
            ctx
        );

        // Allow: spend (redeem points), transfer (send to another user)
        // Deny: convert_to_coin (cannot cash out to freely-transferable coin)
        token::allow(&mut policy, &policy_cap, token::spend_action(), ctx);
        token::allow(&mut policy, &policy_cap, token::transfer_action(), ctx);

        // Share the policy so anyone can interact with the token
        token::share_policy(policy);

        // Transfer caps to the admin
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(policy_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(coin_metadata);
    }

    /// Mint loyalty points to a user (admin only)
    public fun mint_points(
        cap: &mut TreasuryCap<POINTS>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let token = token::mint(cap, amount, ctx);
        let action_request = token::transfer(token, recipient, ctx);
        token::confirm_with_treasury_cap(cap, action_request, ctx);
    }

    /// Spend (burn) points to redeem a reward
    public fun redeem_points(
        policy: &TokenPolicy<POINTS>,
        token: Token<POINTS>,
        ctx: &mut TxContext
    ): ActionRequest<POINTS> {
        token::spend(token, ctx)
    }
}
```

### Action-Based Permissions

The Token standard uses an action-request pattern:

1. A user action (spend, transfer, convert_to_coin) creates an `ActionRequest`.
2. The `ActionRequest` must be confirmed by either:
   - A `TokenPolicy` rule (automatic approval)
   - The `TreasuryCap` holder (manual admin approval)
3. If not confirmed, the transaction aborts.

This gives issuers fine-grained control over every token operation.

---

## 4. Regulated Tokens (DenyList)

### What Regulated Tokens Are

For compliance-heavy assets (securities, regulated stablecoins), Sui provides `create_regulated_currency`. This creates a coin with an associated **DenyList** capability — the issuer can freeze/unfreeze specific addresses.

### Creating a Regulated Currency

```move
module regulated::asset {
    use sui::coin;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// One-Time Witness
    public struct ASSET has drop {}

    fun init(witness: ASSET, ctx: &mut TxContext) {
        let (treasury_cap, deny_cap, coin_metadata) = coin::create_regulated_currency(
            witness,
            6, // 6 decimals
            b"RAST",
            b"Regulated Asset",
            b"A compliance-ready regulated token",
            option::none(),
            ctx
        );

        // treasury_cap: can mint/burn
        // deny_cap: can freeze/unfreeze addresses
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(deny_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(coin_metadata);
    }
}
```

### Freezing and Unfreezing Addresses

```typescript
import { Transaction } from '@mysten/sui/transactions';

// Freeze an address (prevent them from sending/receiving the regulated coin)
const tx = new Transaction();
tx.moveCall({
  target: '0x2::coin::deny_list_v2_add',
  arguments: [
    tx.object('0x403'), // The global DenyList shared object
    tx.object('0xDENY_CAP_OBJECT_ID'),
    tx.pure.address('0xFROZEN_USER_ADDRESS'),
  ],
  typeArguments: ['0xPACKAGE::asset::ASSET'],
});

// Unfreeze an address
const unfreezeTx = new Transaction();
unfreezeTx.moveCall({
  target: '0x2::coin::deny_list_v2_remove',
  arguments: [
    unfreezeTx.object('0x403'),
    unfreezeTx.object('0xDENY_CAP_OBJECT_ID'),
    unfreezeTx.pure.address('0xFROZEN_USER_ADDRESS'),
  ],
  typeArguments: ['0xPACKAGE::asset::ASSET'],
});
```

### When to Use Each Token Type

| Type | Use Case | Freezable? | Transfer Restricted? |
|---|---|---|---|
| `coin::create_currency` | General purpose tokens | No | No |
| `coin::create_regulated_currency` | Compliance assets (securities) | Yes (DenyList) | Only frozen addresses |
| `token::new_policy` | Loyalty points, in-app currency | No | Yes (policy rules) |

---

## 5. Real-World Asset (RWA) Tokenization

### Architecture

Tokenizing real-world assets (real estate, bonds, commodities, invoices) on Sui:

```
┌─────────────────────┐
│   Legal Entity       │  ← Off-chain legal wrapper (SPV, LLC)
│   (Asset Custodian)  │
├─────────────────────┤
│   Oracle/Attestor    │  ← Provides price feeds, audit proofs
├─────────────────────┤
│   Sui Smart Contract │
│   - RWA Object       │  ← Represents the asset with metadata
│   - Transfer Policy  │  ← KYC/whitelist enforcement
│   - Kiosk Listing    │  ← Secondary market trading
│   - Fractional Coins │  ← Optional fractional ownership
└─────────────────────┘
```

### RWA Object with Display Standard

```move
module rwa::real_estate {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::package;
    use sui::display;
    use std::string::{Self, String};

    public struct REAL_ESTATE has drop {}

    public struct PropertyToken has key, store {
        id: UID,
        property_address: String,
        valuation_usd: u64,
        square_feet: u64,
        legal_entity: String,
        audit_blob_id: String, // Walrus blob ID for legal documents
        image_url: String,
    }

    fun init(otw: REAL_ESTATE, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        let mut display = display::new<PropertyToken>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"Property: {property_address}"));
        display::add(&mut display, string::utf8(b"description"), string::utf8(b"Tokenized real estate valued at ${valuation_usd}"));
        display::add(&mut display, string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        display::add(&mut display, string::utf8(b"project_url"), string::utf8(b"https://rwa-platform.com"));
        display::update_version(&mut display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
    }

    public fun mint_property_token(
        property_address: String,
        valuation_usd: u64,
        square_feet: u64,
        legal_entity: String,
        audit_blob_id: String,
        image_url: String,
        ctx: &mut TxContext
    ): PropertyToken {
        PropertyToken {
            id: object::new(ctx),
            property_address,
            valuation_usd,
            square_feet,
            legal_entity,
            audit_blob_id,
            image_url,
        }
    }
}
```

### Transfer Policy for KYC-Gated Trading

Using the Kiosk standard for compliant secondary markets:

```move
module rwa::transfer_rules {
    use sui::transfer_policy::{Self, TransferPolicy, TransferPolicyCap, TransferRequest};
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};

    /// A rule that requires the buyer to be on a KYC whitelist
    public struct KycRule has drop {}

    /// The whitelist config attached to the transfer policy
    public struct KycWhitelist has key, store {
        id: UID,
        approved_addresses: vector<address>,
    }

    /// Add the KYC rule to a transfer policy
    public fun add_kyc_rule<T>(
        policy: &mut TransferPolicy<T>,
        cap: &TransferPolicyCap<T>,
        whitelist: KycWhitelist,
    ) {
        transfer_policy::add_rule(KycRule {}, policy, cap, whitelist);
    }

    /// Buyer must call this to prove they're on the whitelist
    public fun verify_kyc<T>(
        policy: &TransferPolicy<T>,
        request: &mut TransferRequest<T>,
        buyer: address,
    ) {
        let whitelist: &KycWhitelist = transfer_policy::get_rule(KycRule {}, policy);
        let (found, _) = vector::index_of(&whitelist.approved_addresses, &buyer);
        assert!(found, 0); // Buyer must be on the whitelist
        transfer_policy::add_receipt(KycRule {}, request);
    }
}
```

### Fractional Ownership via Coin Standard

For fractional ownership, create a `Coin<T>` representing shares:

```move
module rwa::fractional {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// Represents fractional ownership of a specific property
    public struct PROPERTY_SHARES has drop {}

    fun init(witness: PROPERTY_SHARES, ctx: &mut TxContext) {
        let (treasury_cap, coin_metadata) = coin::create_currency(
            witness,
            4, // 4 decimals — 10,000 shares = 1 full ownership
            b"PROP1",
            b"123 Main St Shares",
            b"Fractional ownership of 123 Main Street",
            option::none(),
            ctx
        );

        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_freeze_object(coin_metadata);
    }

    /// Mint shares to investors after KYC
    public fun issue_shares(
        cap: &mut TreasuryCap<PROPERTY_SHARES>,
        amount: u64,
        investor: address,
        ctx: &mut TxContext
    ) {
        let shares = coin::mint(cap, amount, ctx);
        transfer::public_transfer(shares, investor);
    }

    /// Burn shares (buyback / property sale)
    public fun burn_shares(
        cap: &mut TreasuryCap<PROPERTY_SHARES>,
        shares: Coin<PROPERTY_SHARES>,
    ) {
        coin::burn(cap, shares);
    }
}
```

### Complete RWA Compliance Checklist

1. **Legal wrapper**: SPV or LLC that holds the real asset and issues on-chain tokens.
2. **KYC gate**: Whitelist-based transfer policy (Kiosk standard) or regulated currency (DenyList).
3. **Audit trail**: Store legal documents on Walrus, reference blob IDs on-chain.
4. **Oracle integration**: Periodic valuation updates via a trusted oracle.
5. **Transfer restrictions**: Use Transfer Policy rules or regulated coin DenyList.
6. **Dividend distribution**: Use PTBs to batch-distribute yield to all token holders.
7. **Redemption mechanism**: Burn tokens in exchange for underlying value.

---

## Summary: Financial Building Blocks on Sui

| Building Block | Sui Primitive | Example |
|---|---|---|
| Stablecoin payments | `Coin<USDC>` | Accept USDC in a dApp |
| Gas-free UX | Enoki sponsored transactions | User never holds SUI |
| Social login | zkLogin (Enoki) | Sign in with Google |
| Token swap | 7K Aggregator / DeepBook | SUI-to-USDC conversion |
| Loyalty points | `Token<T>` (closed-loop) | Non-transferable rewards |
| Compliance freeze | `create_regulated_currency` | Freeze sanctioned addresses |
| KYC-gated trading | Transfer Policy (Kiosk) | Whitelist-only secondary market |
| Fractional ownership | `Coin<T>` | 10,000 shares of a property |
| Atomic operations | PTBs | Swap + send in one transaction |
| Encrypted documents | Seal + Walrus | Store legal docs with access control |
