---
name: build-payment-app
description: "Complete guide to building a payment/checkout app on Sui. Covers stablecoin payments (USDC), Sui Payment Kit, merchant integration, receipt generation, QR code payments, and subscription models. Triggers: payment, checkout, usdc, stablecoin payment, merchant, payment app, qr code payment, subscription, sui pay, payment kit"
---

```bash
# Telemetry preamble
SKILL_NAME="build-payment-app"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui payment systems specialist. Your job is to guide the user through building payment and checkout applications on Sui — from simple USDC transfers to full merchant checkout flows with receipts, QR codes, and subscriptions. Sui is ideal for payments because transactions finalize in under a second, gas fees are fractions of a cent, and USDC is natively available.

**Key concepts:**
- **USDC on Sui**: Native Circle USDC (`0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`) — 6 decimals
- **PTB Payments**: Programmable Transaction Blocks allow split, merge, and multi-recipient payments in a single transaction
- **Sponsored Transactions**: Merchants can sponsor gas so customers pay zero gas fees
- **On-chain Receipts**: Move objects that serve as immutable proof of payment

## Workflow

### Step 1: Set Up USDC Payments

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

// Simple USDC payment
async function sendPayment(
  senderKeypair: Ed25519Keypair,
  recipientAddress: string,
  amountUSDC: number, // e.g., 9.99
) {
  const amountInSmallestUnit = BigInt(Math.round(amountUSDC * 1_000_000)); // 6 decimals

  // Get sender's USDC coins
  const coins = await client.getCoins({
    owner: senderKeypair.getPublicKey().toSuiAddress(),
    coinType: USDC_TYPE,
  });

  const tx = new Transaction();

  // If sender has multiple USDC objects, merge them first
  if (coins.data.length > 1) {
    const primaryCoin = tx.object(coins.data[0].coinObjectId);
    const mergeCoins = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
    tx.mergeCoins(primaryCoin, mergeCoins);
  }

  // Split the exact amount and transfer
  const primaryCoin = tx.object(coins.data[0].coinObjectId);
  const [paymentCoin] = tx.splitCoins(primaryCoin, [
    tx.pure.u64(amountInSmallestUnit),
  ]);
  tx.transferObjects([paymentCoin], tx.pure.address(recipientAddress));

  const result = await client.signAndExecuteTransaction({
    signer: senderKeypair,
    transaction: tx,
    options: { showEffects: true },
  });

  return result.digest;
}
```

### Step 2: Build a Payment Receipt System (Move)

```move
module payments::receipt {
    use std::string::String;
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;

    // === Receipt Object (immutable proof of payment) ===
    public struct PaymentReceipt has key, store {
        id: UID,
        merchant: address,
        payer: address,
        amount: u64,
        currency: String,
        memo: String,
        timestamp: u64,
        order_id: String,
    }

    // === Merchant Configuration ===
    public struct MerchantConfig has key {
        id: UID,
        owner: address,
        business_name: String,
        payment_address: address,
        /// Accepted coin types
        active: bool,
    }

    // === Events ===
    public struct PaymentReceived has copy, drop {
        receipt_id: ID,
        merchant: address,
        payer: address,
        amount: u64,
        order_id: String,
        timestamp: u64,
    }

    // === Register as Merchant ===
    entry fun register_merchant(
        business_name: String,
        payment_address: address,
        ctx: &mut TxContext,
    ) {
        let config = MerchantConfig {
            id: object::new(ctx),
            owner: ctx.sender(),
            business_name,
            payment_address,
            active: true,
        };
        transfer::share_object(config);
    }

    // === Pay with SUI ===
    entry fun pay_sui(
        merchant: &MerchantConfig,
        payment: Coin<SUI>,
        order_id: String,
        memo: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(merchant.active, 0);

        let amount = coin::value(&payment);
        let timestamp = clock::timestamp_ms(clock);

        // Transfer payment to merchant
        transfer::public_transfer(payment, merchant.payment_address);

        // Create receipt for the payer
        let receipt = PaymentReceipt {
            id: object::new(ctx),
            merchant: merchant.payment_address,
            payer: ctx.sender(),
            amount,
            currency: std::string::utf8(b"SUI"),
            memo,
            timestamp,
            order_id,
        };

        event::emit(PaymentReceived {
            receipt_id: object::id(&receipt),
            merchant: merchant.payment_address,
            payer: ctx.sender(),
            amount,
            order_id: receipt.order_id,
            timestamp,
        });

        // Transfer receipt to payer (immutable proof)
        transfer::public_transfer(receipt, ctx.sender());
    }

    // === Pay with any Coin type (generic) ===
    public fun pay_generic<T>(
        merchant: &MerchantConfig,
        payment: Coin<T>,
        order_id: String,
        memo: String,
        currency_name: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(merchant.active, 0);

        let amount = coin::value(&payment);
        let timestamp = clock::timestamp_ms(clock);

        transfer::public_transfer(payment, merchant.payment_address);

        let receipt = PaymentReceipt {
            id: object::new(ctx),
            merchant: merchant.payment_address,
            payer: ctx.sender(),
            amount,
            currency: currency_name,
            memo,
            timestamp,
            order_id,
        };

        event::emit(PaymentReceived {
            receipt_id: object::id(&receipt),
            merchant: merchant.payment_address,
            payer: ctx.sender(),
            amount,
            order_id: receipt.order_id,
            timestamp,
        });

        transfer::public_transfer(receipt, ctx.sender());
    }
}
```

### Step 3: Build a Checkout API

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import express from "express";
import { v4 as uuidv4 } from "uuid";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const PACKAGE_ID = "0x<YOUR_PACKAGE>";
const MERCHANT_CONFIG_ID = "0x<YOUR_MERCHANT_CONFIG>";
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

const app = express();
app.use(express.json());

// Create a payment intent
app.post("/api/checkout", async (req, res) => {
  const { amount, currency, description } = req.body;
  const orderId = uuidv4();

  // Build the transaction that the customer will sign
  const tx = new Transaction();

  if (currency === "USDC") {
    // Customer needs to provide USDC coins
    // The frontend will handle coin selection and merging
    const amountMicro = BigInt(Math.round(amount * 1_000_000));

    // This serialized transaction is sent to the frontend
    res.json({
      orderId,
      amount,
      currency,
      description,
      merchantAddress: "0x<MERCHANT_ADDRESS>",
      packageId: PACKAGE_ID,
      merchantConfigId: MERCHANT_CONFIG_ID,
      amountInSmallestUnit: amountMicro.toString(),
    });
  }
});

// Verify payment (webhook or polling)
app.get("/api/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;

  // Query payment events for this order
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PACKAGE_ID}::receipt::PaymentReceived`,
    },
    limit: 10,
  });

  const payment = events.data.find(
    (e: any) => e.parsedJson.order_id === orderId,
  );

  if (payment) {
    res.json({ status: "confirmed", receipt: payment.parsedJson });
  } else {
    res.json({ status: "pending" });
  }
});

app.listen(3001);
```

### Step 4: QR Code Payment Flow

```typescript
import QRCode from "qrcode";

// Generate a payment QR code
async function generatePaymentQR(
  merchantAddress: string,
  amount: number,
  orderId: string,
): Promise<string> {
  // Encode payment info as a deeplink or URL
  const paymentData = {
    network: "sui:mainnet",
    action: "pay",
    to: merchantAddress,
    amount: amount.toString(),
    currency: "USDC",
    orderId,
    package: PACKAGE_ID,
  };

  // Option 1: Custom URL scheme
  const paymentUrl = `https://pay.yourapp.com/checkout?${new URLSearchParams({
    to: merchantAddress,
    amount: amount.toString(),
    orderId,
  }).toString()}`;

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(paymentUrl, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  return qrDataUrl;
}

// React component for QR payment
function PaymentQR({ amount, orderId }: { amount: number; orderId: string }) {
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    generatePaymentQR(MERCHANT_ADDRESS, amount, orderId).then(setQrUrl);

    // Poll for payment confirmation
    const interval = setInterval(async () => {
      const res = await fetch(`/api/verify/${orderId}`);
      const data = await res.json();
      if (data.status === "confirmed") {
        setStatus("confirmed");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [amount, orderId]);

  return (
    <div>
      <h2>Pay ${amount.toFixed(2)} USDC</h2>
      {status === "pending" ? (
        <>
          <img src={qrUrl} alt="Payment QR Code" />
          <p>Scan with your Sui wallet</p>
        </>
      ) : (
        <p>Payment confirmed!</p>
      )}
    </div>
  );
}
```

### Step 5: Subscription Payments

```move
module payments::subscription {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;

    public struct Subscription has key, store {
        id: UID,
        subscriber: address,
        merchant: address,
        amount_per_period: u64,
        period_ms: u64,
        last_payment: u64,
        active: bool,
    }

    public struct SubscriptionPayment has copy, drop {
        subscription_id: ID,
        amount: u64,
        timestamp: u64,
    }

    entry fun create_subscription(
        merchant: address,
        amount_per_period: u64,
        period_ms: u64,
        first_payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(coin::value(&first_payment) >= amount_per_period, 0);

        let now = clock::timestamp_ms(clock);

        // Process first payment
        transfer::public_transfer(first_payment, merchant);

        let sub = Subscription {
            id: object::new(ctx),
            subscriber: ctx.sender(),
            merchant,
            amount_per_period,
            period_ms,
            last_payment: now,
            active: true,
        };

        event::emit(SubscriptionPayment {
            subscription_id: object::id(&sub),
            amount: amount_per_period,
            timestamp: now,
        });

        transfer::public_transfer(sub, ctx.sender());
    }

    /// Process recurring payment (called by subscriber or automation)
    entry fun process_payment(
        sub: &mut Subscription,
        payment: Coin<SUI>,
        clock: &Clock,
    ) {
        assert!(sub.active, 0);
        let now = clock::timestamp_ms(clock);
        assert!(now >= sub.last_payment + sub.period_ms, 1); // Period elapsed
        assert!(coin::value(&payment) >= sub.amount_per_period, 2);

        sub.last_payment = now;
        transfer::public_transfer(payment, sub.merchant);

        event::emit(SubscriptionPayment {
            subscription_id: object::id(sub),
            amount: sub.amount_per_period,
            timestamp: now,
        });
    }

    entry fun cancel_subscription(sub: &mut Subscription, ctx: &TxContext) {
        assert!(sub.subscriber == ctx.sender(), 0);
        sub.active = false;
    }
}
```

### Step 6: Handoff

- "I want gas-free payments for customers" -> route to `build-sponsored-app`
- "I need stablecoin swaps" -> route to `integrate-cetus` or `integrate-7k`
- "Deploy payment system" -> route to `deploy-to-mainnet`
- "I need zkLogin for customer auth" -> route to `build-zklogin-app`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Always use exact coin amounts** — use `splitCoins` to create exact payment amounts. Never send entire coin objects unless the amount matches exactly.
2. **Merge coins before payment** — users often have USDC split across multiple objects. Merge first, then split the exact amount.
3. **Generate receipts on-chain** — payment receipts should be Move objects (not just events) so they serve as permanent proof of payment.
4. **Validate amounts in Move, not TypeScript** — always assert payment amount in the smart contract, never trust client-provided values.
5. **Use 6 decimals for USDC, 9 for SUI** — decimal mismatch is the #1 cause of payment bugs. $1 USDC = 1,000,000 units. 1 SUI = 1,000,000,000 MIST.
6. **Handle payment confirmation asynchronously** — poll for events or use WebSocket subscriptions. Never assume a transaction succeeded without verifying.
7. **Never store payment secrets on-chain** — order details, customer info, and API keys must stay off-chain. Only amounts, addresses, and order IDs go on-chain.
8. **Test with testnet USDC first** — use faucet USDC on testnet before deploying to mainnet.

## References

- USDC on Sui: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
- Sui Coin Standard: https://docs.sui.io/standards/coin
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
