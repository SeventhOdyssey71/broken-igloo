# DeFi Program Patterns for Sui Move

> Reference patterns for building DeFi protocols on Sui. Each pattern includes the Move struct layout, key functions, and critical implementation notes.

---

## 1. AMM Pool Pattern

Constant-product AMM using shared objects for pools and owned objects for LP tokens.

### Object Model

```move
module amm::pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;

    /// Shared object — the liquidity pool
    public struct Pool<phantom X, phantom Y> has key {
        id: UID,
        balance_x: Balance<X>,
        balance_y: Balance<Y>,
        lp_supply: Supply<LP<X, Y>>,
        fee_bps: u64, // e.g., 30 = 0.3%
    }

    /// Owned object — LP token representing liquidity share
    public struct LP<phantom X, phantom Y> has drop {}

    /// One-time witness for LP coin registration
    public struct LP_WITNESS has drop {}
}
```

### Key Functions

```move
/// Create a new pool with initial liquidity
public fun create_pool<X, Y>(
    coin_x: Coin<X>,
    coin_y: Coin<Y>,
    fee_bps: u64,
    ctx: &mut TxContext,
): Coin<LP<X, Y>> {
    let balance_x = coin::into_balance(coin_x);
    let balance_y = coin::into_balance(coin_y);

    let lp_amount = math::sqrt(
        (balance::value(&balance_x) as u128) * (balance::value(&balance_y) as u128)
    );

    let mut lp_supply = balance::create_supply(LP<X, Y> {});
    let lp_balance = balance::increase_supply(&mut lp_supply, (lp_amount as u64));

    let pool = Pool {
        id: object::new(ctx),
        balance_x,
        balance_y,
        lp_supply,
        fee_bps,
    };
    transfer::share_object(pool);

    coin::from_balance(lp_balance, ctx)
}

/// Swap X for Y (constant product: x * y = k)
public fun swap_x_to_y<X, Y>(
    pool: &mut Pool<X, Y>,
    coin_in: Coin<X>,
    min_out: u64,
    ctx: &mut TxContext,
): Coin<Y> {
    let in_amount = coin::value(&coin_in);
    let fee = in_amount * pool.fee_bps / 10000;
    let in_after_fee = in_amount - fee;

    let reserve_x = balance::value(&pool.balance_x);
    let reserve_y = balance::value(&pool.balance_y);

    // dy = (y * dx) / (x + dx)
    let out_amount = (reserve_y * in_after_fee) / (reserve_x + in_after_fee);
    assert!(out_amount >= min_out, E_SLIPPAGE_EXCEEDED);

    balance::join(&mut pool.balance_x, coin::into_balance(coin_in));
    let out_balance = balance::split(&mut pool.balance_y, out_amount);

    event::emit(SwapEvent { /* ... */ });

    coin::from_balance(out_balance, ctx)
}
```

### Critical Notes
- Use `Balance<T>` inside the shared Pool, never `Coin<T>`
- Always enforce `min_out` for slippage protection
- LP supply must be tracked via `Supply<LP<X, Y>>` for correct minting/burning
- Emit events for every swap, add_liquidity, remove_liquidity for indexer support
- Consider TWAP oracle by accumulating price*time in the pool struct

---

## 2. Lending Market Pattern

Multi-asset lending market using dynamic fields for per-asset reserves.

### Object Model

```move
module lending::market {
    use sui::balance::Balance;
    use sui::dynamic_field;

    /// Shared object — the lending market
    public struct Market has key {
        id: UID,
        admin_cap_id: ID, // Track which AdminCap controls this market
    }

    /// Dynamic field value — per-asset reserve data
    public struct Reserve<phantom T> has store {
        total_deposits: Balance<T>,
        total_borrows: u64,
        interest_rate_model: InterestRateModel,
        last_update_epoch: u64,
        cumulative_borrow_rate: u128, // Fixed-point, scaled by 1e18
    }

    /// Owned object — user's borrow position
    public struct Obligation has key {
        id: UID,
        owner: address,
        collateral: vector<CollateralEntry>,
        borrows: vector<BorrowEntry>,
    }

    public struct CollateralEntry has store {
        asset_type: TypeName,
        amount: u64,
    }

    public struct BorrowEntry has store {
        asset_type: TypeName,
        borrowed_amount: u64,
        borrow_rate_snapshot: u128,
    }
}
```

### Key Functions

```move
/// Add a new asset to the market (admin only)
public fun add_reserve<T>(
    market: &mut Market,
    _admin: &AdminCap,
    interest_rate_model: InterestRateModel,
    ctx: &mut TxContext,
) {
    let reserve = Reserve<T> {
        total_deposits: balance::zero<T>(),
        total_borrows: 0,
        interest_rate_model,
        last_update_epoch: tx_context::epoch(ctx),
        cumulative_borrow_rate: SCALE, // 1e18
    };
    dynamic_field::add(&mut market.id, type_name::get<T>(), reserve);
}

/// Deposit asset into the market
public fun deposit<T>(
    market: &mut Market,
    coin: Coin<T>,
    ctx: &mut TxContext,
): DepositReceipt<T> {
    let reserve = dynamic_field::borrow_mut<TypeName, Reserve<T>>(
        &mut market.id,
        type_name::get<T>(),
    );
    accrue_interest(reserve, ctx);

    let amount = coin::value(&coin);
    balance::join(&mut reserve.total_deposits, coin::into_balance(coin));

    event::emit(DepositEvent { /* ... */ });

    DepositReceipt<T> { id: object::new(ctx), amount }
}

/// Borrow against collateral
public fun borrow<T>(
    market: &mut Market,
    obligation: &mut Obligation,
    amount: u64,
    clock: &Clock,
    price_oracle: &PriceOracle, // Pyth price feed
    ctx: &mut TxContext,
): Coin<T> {
    // 1. Accrue interest
    // 2. Check collateral ratio with oracle price
    // 3. Verify health factor > 1.0
    // 4. Transfer borrowed funds
    // 5. Update obligation borrows
    // ...
}
```

### Critical Notes
- Use `dynamic_field` to store per-asset reserves under the Market object, keyed by `TypeName`
- Interest must be accrued before any state-changing operation (deposit, borrow, repay, liquidate)
- Obligation is an owned object so each user controls their own position
- Oracle prices must include staleness checks — reject prices older than N seconds
- Clean up dynamic fields when removing reserves to avoid storage fee leaks

---

## 3. Vault Pattern

Yield vault with share-based accounting.

### Object Model

```move
module vault::vault {
    use sui::balance::{Self, Balance, Supply};
    use sui::coin::{Self, Coin};

    /// Shared object — the vault
    public struct Vault<phantom T> has key {
        id: UID,
        /// Underlying asset balance
        assets: Balance<T>,
        /// Share token supply tracking
        share_supply: Supply<VAULT_SHARE<T>>,
        /// Strategy configuration
        strategy: address, // Strategy package ID
        /// Performance fee in basis points
        fee_bps: u64,
    }

    /// Share token — represents proportional claim on vault assets
    public struct VAULT_SHARE<phantom T> has drop {}

    /// Admin capability
    public struct VaultAdminCap has key, store {
        id: UID,
        vault_id: ID,
    }
}
```

### Key Functions

```move
/// Deposit underlying, receive shares
public fun deposit<T>(
    vault: &mut Vault<T>,
    coin: Coin<T>,
    ctx: &mut TxContext,
): Coin<VAULT_SHARE<T>> {
    let deposit_amount = coin::value(&coin);
    let total_assets = balance::value(&vault.assets);
    let total_shares = balance::supply_value(&vault.share_supply);

    // Calculate shares: shares = (deposit * total_shares) / total_assets
    // If first deposit: shares = deposit_amount
    let shares_to_mint = if (total_shares == 0) {
        deposit_amount
    } else {
        (deposit_amount * total_shares) / total_assets
    };

    balance::join(&mut vault.assets, coin::into_balance(coin));
    let share_balance = balance::increase_supply(&mut vault.share_supply, shares_to_mint);

    event::emit(DepositEvent { depositor: tx_context::sender(ctx), amount: deposit_amount, shares: shares_to_mint });

    coin::from_balance(share_balance, ctx)
}

/// Burn shares, receive proportional underlying
public fun withdraw<T>(
    vault: &mut Vault<T>,
    shares: Coin<VAULT_SHARE<T>>,
    ctx: &mut TxContext,
): Coin<T> {
    let share_amount = coin::value(&shares);
    let total_assets = balance::value(&vault.assets);
    let total_shares = balance::supply_value(&vault.share_supply);

    // Calculate underlying: amount = (shares * total_assets) / total_shares
    let withdraw_amount = (share_amount * total_assets) / total_shares;

    balance::decrease_supply(&mut vault.share_supply, coin::into_balance(shares));
    let withdraw_balance = balance::split(&mut vault.assets, withdraw_amount);

    event::emit(WithdrawEvent { /* ... */ });

    coin::from_balance(withdraw_balance, ctx)
}
```

### Critical Notes
- Share-based accounting prevents donation attacks (like ERC-4626 inflation attacks) — consider virtual offset or minimum deposit
- First depositor edge case: if total_shares is 0, use 1:1 ratio and consider locking a minimum amount
- Rounding should always favor the vault (round shares down on deposit, round withdrawal down)
- `Balance<T>` inside shared vault, convert to/from `Coin<T>` at entry boundaries
- Performance fees deducted during harvest, not on deposit/withdraw

---

## 4. Oracle Integration (Pyth on Sui)

### Usage Pattern

```move
module myprotocol::oracle {
    use pyth::price_info::PriceInfoObject;
    use pyth::price;
    use pyth::i64;

    const E_STALE_PRICE: u64 = 100;
    const MAX_PRICE_AGE_SECONDS: u64 = 60;

    /// Get a validated price from Pyth
    public fun get_price(
        price_info: &PriceInfoObject,
        clock: &Clock,
    ): (u64, u64) { // (price, confidence)
        let price_struct = pyth::price_info::get_price_info_from_price_info_object(price_info);
        let current_price = pyth::price_info::get_price(&price_struct);

        // Check staleness
        let price_timestamp = price::get_timestamp(&current_price);
        let current_timestamp = clock::timestamp_ms(clock) / 1000;
        assert!(
            current_timestamp - price_timestamp <= MAX_PRICE_AGE_SECONDS,
            E_STALE_PRICE,
        );

        let price_value = i64::get_magnitude_if_positive(&price::get_price(&current_price));
        let confidence = price::get_conf(&current_price);

        (price_value, confidence)
    }
}
```

### PTB Pattern for Pyth Price Updates

```typescript
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Pyth price update must happen in the same PTB as usage
const tx = new Transaction();

// Step 1: Update Pyth price feed (pays a small fee)
const [priceInfoObject] = tx.moveCall({
  target: `${PYTH_PACKAGE}::pyth::update_single_price_feed`,
  arguments: [
    tx.object(PYTH_STATE),
    tx.pure(priceFeedUpdateData), // VAA from Pyth Hermes API
    tx.object(CLOCK_OBJECT),
  ],
});

// Step 2: Use the price in your protocol
tx.moveCall({
  target: `${MY_PACKAGE}::lending::borrow`,
  arguments: [
    tx.object(MARKET_ID),
    tx.object(obligationId),
    tx.pure(borrowAmount),
    priceInfoObject, // Pass the fresh price
    tx.object(CLOCK_OBJECT),
  ],
});
```

### Critical Notes
- Always check price staleness — never use a price without verifying its age
- Confidence interval matters for lending: use price - confidence for collateral valuation, price + confidence for debt valuation
- Price updates must happen in the same PTB as the operation that uses them
- Pyth prices have an exponent — normalize to your protocol's decimal precision
- Fetch price update VAAs from Pyth Hermes API: `https://hermes.pyth.network/`

---

## 5. Flash Loan Pattern (Hot Potato)

The hot potato pattern enforces atomic repayment at the Move type level. The receipt struct has no `drop` or `store` ability, so it MUST be consumed in the same transaction.

### Object Model

```move
module flashloan::lender {
    use sui::balance::Balance;
    use sui::coin::{Self, Coin};

    /// Shared object — the lending pool
    public struct FlashLendPool<phantom T> has key {
        id: UID,
        balance: Balance<T>,
        fee_bps: u64,
    }

    /// Hot potato — NO drop, NO store, NO copy, NO key
    /// Must be consumed by `repay()` in the same transaction
    public struct FlashLoanReceipt<phantom T> {
        pool_id: ID,
        borrow_amount: u64,
        fee_amount: u64,
    }
}
```

### Key Functions

```move
/// Borrow funds — returns coins AND a hot potato receipt
public fun borrow<T>(
    pool: &mut FlashLendPool<T>,
    amount: u64,
    ctx: &mut TxContext,
): (Coin<T>, FlashLoanReceipt<T>) {
    assert!(balance::value(&pool.balance) >= amount, E_INSUFFICIENT_LIQUIDITY);

    let fee_amount = (amount * pool.fee_bps) / 10000;

    let loan_balance = balance::split(&mut pool.balance, amount);
    let receipt = FlashLoanReceipt<T> {
        pool_id: object::id(pool),
        borrow_amount: amount,
        fee_amount,
    };

    event::emit(FlashLoanBorrowEvent { amount, fee: fee_amount });

    (coin::from_balance(loan_balance, ctx), receipt)
}

/// Repay funds — consumes the hot potato receipt
public fun repay<T>(
    pool: &mut FlashLendPool<T>,
    payment: Coin<T>,
    receipt: FlashLoanReceipt<T>,
) {
    let FlashLoanReceipt { pool_id, borrow_amount, fee_amount } = receipt;
    assert!(pool_id == object::id(pool), E_WRONG_POOL);

    let repay_amount = borrow_amount + fee_amount;
    assert!(coin::value(&payment) >= repay_amount, E_INSUFFICIENT_REPAYMENT);

    balance::join(&mut pool.balance, coin::into_balance(payment));

    event::emit(FlashLoanRepayEvent { amount: repay_amount });
}
```

### PTB Usage

```typescript
const tx = new Transaction();

// Step 1: Borrow
const [coin, receipt] = tx.moveCall({
  target: `${PACKAGE}::lender::borrow`,
  arguments: [tx.object(POOL_ID), tx.pure(borrowAmount)],
  typeArguments: ['0x2::sui::SUI'],
});

// Step 2: Use the borrowed funds (arbitrage, liquidation, etc.)
const profit = tx.moveCall({
  target: `${ARBITRAGE_PACKAGE}::arb::execute`,
  arguments: [coin, /* ... */],
});

// Step 3: Repay (MUST happen — receipt has no drop ability)
tx.moveCall({
  target: `${PACKAGE}::lender::repay`,
  arguments: [tx.object(POOL_ID), profit, receipt],
  typeArguments: ['0x2::sui::SUI'],
});
```

### Critical Notes
- `FlashLoanReceipt` has NO abilities — this is the enforcement mechanism. If the borrower does not call `repay()`, the transaction cannot complete because the receipt cannot be dropped or stored
- The receipt must reference the pool ID to prevent cross-pool repayment exploits
- Fee calculation must happen in `borrow()`, not `repay()` — the fee amount is locked in the receipt
- This pattern is superior to callback-based flash loans because enforcement is at the type level, not the runtime level
- Always verify `repay()` receives at least `borrow_amount + fee_amount`
