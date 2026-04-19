---
name: build-staking
description: "Build staking mechanics on Sui. Covers validator staking, custom staking pools, reward distribution, liquid staking token creation, unstaking with delay periods, time-weighted rewards, epoch tracking. Triggers: staking, stake pool, staking rewards, liquid staking, validator staking, unstake, staking pool, build staking"
---

```bash
# Telemetry preamble
SKILL_NAME="build-staking"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui staking architect. Your job is to guide the user through building staking systems on Sui — from native SUI validator staking to custom token staking pools with reward distribution. Staking on Sui differs from EVM because stakes are **objects**, not balance mappings. Each stake position is an owned object with metadata about when it was staked, reward accrual, and withdrawal conditions.

Sui has two staking domains:
1. **Native SUI staking**: Delegating SUI to validators via the system `sui_system::request_add_stake`. Returns a `StakedSui` object. Rewards are distributed per epoch (~24h).
2. **Custom staking pools**: Application-specific staking where users lock tokens to earn project rewards. Built with Move using shared pool objects and owned receipt objects.

Key patterns:
- **Share-based accounting**: StakePool tracks total shares and total balance; each staker gets shares proportional to their deposit
- **Time-weighted rewards**: Rewards accrue based on staking duration, not just amount
- **Liquid staking tokens (LST)**: Fungible tokens representing staked positions, tradeable on DEXs
- **Unbonding period**: Delayed withdrawal to prevent flash-stake attacks

## Workflow

### Step 1: Choose the Staking Model

| Model                     | Use Case                              | Complexity |
| ------------------------- | ------------------------------------- | ---------- |
| **Native SUI delegation** | Validator staking, simple yield       | Low        |
| **Single-asset pool**     | Stake TOKEN, earn TOKEN               | Medium     |
| **Dual-reward pool**      | Stake TOKEN, earn TOKEN + BONUS       | Medium     |
| **Liquid staking (LST)**  | Stake SUI, receive stSUI (tradeable)  | High       |
| **NFT staking**           | Stake NFTs, earn tokens               | Medium     |
| **Gauge/vote staking**    | Stake to vote on reward allocation    | High       |

### Step 2: Native SUI Validator Staking

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// === Stake SUI with a validator ===
async function stakeSUI(
  signer,
  validatorAddress: string,
  amountMist: bigint,
) {
  const tx = new Transaction();

  // Split the staking amount from gas coin
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  // Request stake delegation
  tx.moveCall({
    target: "0x3::sui_system::request_add_stake",
    arguments: [
      tx.object("0x5"), // SuiSystemState
      stakeCoin,
      tx.pure.address(validatorAddress),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true },
  });

  // Returns a StakedSui object
  return result;
}

// === Get staking rewards info ===
async function getStakingInfo(ownerAddress: string) {
  const stakes = await client.getStakes({ owner: ownerAddress });

  return stakes.map((stake) => ({
    validatorAddress: stake.validatorAddress,
    stakes: stake.stakes.map((s) => ({
      stakedSuiId: s.stakedSuiId,
      stakeRequestEpoch: s.stakeRequestEpoch,
      stakeActiveEpoch: s.stakeActiveEpoch,
      principal: s.principal,
      estimatedReward: s.estimatedReward,
      status: s.status,
    })),
  }));
}

// === Unstake (withdraw delegation) ===
async function unstakeSUI(signer, stakedSuiObjectId: string) {
  const tx = new Transaction();

  tx.moveCall({
    target: "0x3::sui_system::request_withdraw_stake",
    arguments: [
      tx.object("0x5"), // SuiSystemState
      tx.object(stakedSuiObjectId),
    ],
  });

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}

// === Get validator APY ===
async function getValidatorAPYs() {
  const validators = await client.getLatestSuiSystemState();

  return validators.activeValidators.map((v) => ({
    name: v.name,
    address: v.suiAddress,
    stakingPoolSuiBalance: v.stakingPoolSuiBalance,
    commissionRate: v.commissionRate,
    apy: v.apy, // Approximate APY
  }));
}
```

### Step 3: Custom Staking Pool — Move Contract

```move
module staking::pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};

    // === Error Codes ===
    const EInsufficientBalance: u64 = 0;
    const EUnbondingNotComplete: u64 = 1;
    const EPoolPaused: u64 = 2;
    const EZeroAmount: u64 = 3;
    const ENoRewardsAvailable: u64 = 4;

    // === Constants ===
    const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward calculation
    const UNBONDING_PERIOD_MS: u64 = 259_200_000; // 3 days

    // === Structs ===

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Global staking pool (shared object)
    public struct StakePool<phantom StakeToken, phantom RewardToken> has key {
        id: UID,
        /// Total staked balance
        total_staked: Balance<StakeToken>,
        /// Reward balance available for distribution
        reward_balance: Balance<RewardToken>,
        /// Accumulated reward per share (scaled by PRECISION)
        acc_reward_per_share: u128,
        /// Last time rewards were updated (ms)
        last_reward_time: u64,
        /// Reward rate: tokens per millisecond
        reward_per_ms: u64,
        /// Total shares outstanding
        total_shares: u64,
        /// Reward end time
        reward_end_time: u64,
        /// Paused state
        paused: bool,
    }

    /// User's staking receipt (owned object)
    public struct StakeReceipt<phantom StakeToken, phantom RewardToken> has key, store {
        id: UID,
        /// Number of shares owned
        shares: u64,
        /// Reward debt (for calculating pending rewards)
        reward_debt: u128,
        /// When the stake was created
        staked_at: u64,
    }

    /// Unbonding receipt — must wait before withdrawal
    public struct UnbondingReceipt<phantom StakeToken> has key {
        id: UID,
        /// Amount being unbonded
        amount: Balance<StakeToken>,
        /// When unbonding completes
        unlock_time: u64,
    }

    // === Events ===
    public struct Staked has copy, drop {
        pool_id: ID,
        staker: address,
        amount: u64,
        shares: u64,
    }

    public struct Unstaked has copy, drop {
        pool_id: ID,
        staker: address,
        amount: u64,
        unlock_time: u64,
    }

    public struct RewardsClaimed has copy, drop {
        pool_id: ID,
        staker: address,
        amount: u64,
    }

    public struct RewardsAdded has copy, drop {
        pool_id: ID,
        amount: u64,
        duration_ms: u64,
    }

    // === Init ===
    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    // === Create Pool ===
    public entry fun create_pool<StakeToken, RewardToken>(
        _admin: &AdminCap,
        ctx: &mut TxContext,
    ) {
        let pool = StakePool<StakeToken, RewardToken> {
            id: object::new(ctx),
            total_staked: balance::zero(),
            reward_balance: balance::zero(),
            acc_reward_per_share: 0,
            last_reward_time: 0,
            reward_per_ms: 0,
            total_shares: 0,
            reward_end_time: 0,
            paused: false,
        };
        transfer::share_object(pool);
    }

    // === Fund Rewards ===
    public entry fun add_rewards<StakeToken, RewardToken>(
        _admin: &AdminCap,
        pool: &mut StakePool<StakeToken, RewardToken>,
        rewards: Coin<RewardToken>,
        duration_ms: u64,
        clock: &Clock,
    ) {
        update_pool(pool, clock);

        let reward_amount = coin::value(&rewards);
        balance::join(&mut pool.reward_balance, coin::into_balance(rewards));

        let now = clock::timestamp_ms(clock);
        pool.reward_per_ms = reward_amount / duration_ms;
        pool.reward_end_time = now + duration_ms;
        pool.last_reward_time = now;

        event::emit(RewardsAdded {
            pool_id: object::id(pool),
            amount: reward_amount,
            duration_ms,
        });
    }

    // === Stake ===
    public entry fun stake<StakeToken, RewardToken>(
        pool: &mut StakePool<StakeToken, RewardToken>,
        stake_coin: Coin<StakeToken>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!pool.paused, EPoolPaused);
        let amount = coin::value(&stake_coin);
        assert!(amount > 0, EZeroAmount);

        update_pool(pool, clock);

        // Calculate shares: if pool is empty, shares = amount; otherwise proportional
        let shares = if (pool.total_shares == 0) {
            amount
        } else {
            (amount as u128) * (pool.total_shares as u128) / (balance::value(&pool.total_staked) as u128) as u64
        };

        balance::join(&mut pool.total_staked, coin::into_balance(stake_coin));
        pool.total_shares = pool.total_shares + shares;

        let reward_debt = (shares as u128) * pool.acc_reward_per_share / PRECISION;

        let receipt = StakeReceipt<StakeToken, RewardToken> {
            id: object::new(ctx),
            shares,
            reward_debt,
            staked_at: clock::timestamp_ms(clock),
        };

        event::emit(Staked {
            pool_id: object::id(pool),
            staker: tx_context::sender(ctx),
            amount,
            shares,
        });

        transfer::transfer(receipt, tx_context::sender(ctx));
    }

    // === Claim Rewards ===
    public entry fun claim_rewards<StakeToken, RewardToken>(
        pool: &mut StakePool<StakeToken, RewardToken>,
        receipt: &mut StakeReceipt<StakeToken, RewardToken>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        update_pool(pool, clock);

        let pending = pending_reward(pool, receipt);
        assert!(pending > 0, ENoRewardsAvailable);

        // Update reward debt
        receipt.reward_debt = (receipt.shares as u128) * pool.acc_reward_per_share / PRECISION;

        // Pay out rewards
        let reward_coin = coin::from_balance(
            balance::split(&mut pool.reward_balance, pending),
            ctx,
        );

        event::emit(RewardsClaimed {
            pool_id: object::id(pool),
            staker: tx_context::sender(ctx),
            amount: pending,
        });

        transfer::public_transfer(reward_coin, tx_context::sender(ctx));
    }

    // === Unstake (with unbonding delay) ===
    public entry fun unstake<StakeToken, RewardToken>(
        pool: &mut StakePool<StakeToken, RewardToken>,
        receipt: StakeReceipt<StakeToken, RewardToken>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        update_pool(pool, clock);

        // Claim pending rewards first
        let pending = pending_reward(pool, &receipt);
        if (pending > 0) {
            let reward_coin = coin::from_balance(
                balance::split(&mut pool.reward_balance, pending),
                ctx,
            );
            transfer::public_transfer(reward_coin, tx_context::sender(ctx));
        };

        // Calculate withdrawal amount from shares
        let StakeReceipt { id, shares, reward_debt: _, staked_at: _ } = receipt;
        object::delete(id);

        let withdraw_amount = (shares as u128) * (balance::value(&pool.total_staked) as u128) / (pool.total_shares as u128) as u64;

        pool.total_shares = pool.total_shares - shares;
        let withdrawn = balance::split(&mut pool.total_staked, withdraw_amount);

        let now = clock::timestamp_ms(clock);
        let unlock_time = now + UNBONDING_PERIOD_MS;

        // Create unbonding receipt
        let unbonding = UnbondingReceipt<StakeToken> {
            id: object::new(ctx),
            amount: withdrawn,
            unlock_time,
        };

        event::emit(Unstaked {
            pool_id: object::id(pool),
            staker: tx_context::sender(ctx),
            amount: withdraw_amount,
            unlock_time,
        });

        transfer::transfer(unbonding, tx_context::sender(ctx));
    }

    // === Withdraw after unbonding ===
    public entry fun withdraw<StakeToken>(
        unbonding: UnbondingReceipt<StakeToken>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(now >= unbonding.unlock_time, EUnbondingNotComplete);

        let UnbondingReceipt { id, amount, unlock_time: _ } = unbonding;
        object::delete(id);

        let coin = coin::from_balance(amount, ctx);
        transfer::public_transfer(coin, tx_context::sender(ctx));
    }

    // === View Functions ===
    public fun pending_reward<StakeToken, RewardToken>(
        pool: &StakePool<StakeToken, RewardToken>,
        receipt: &StakeReceipt<StakeToken, RewardToken>,
    ): u64 {
        let acc = pool.acc_reward_per_share;
        let pending_u128 = (receipt.shares as u128) * acc / PRECISION - receipt.reward_debt;
        (pending_u128 as u64)
    }

    // === Internal ===
    fun update_pool<StakeToken, RewardToken>(
        pool: &mut StakePool<StakeToken, RewardToken>,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock);
        if (now <= pool.last_reward_time) return;
        if (pool.total_shares == 0) {
            pool.last_reward_time = now;
            return
        };

        let end = if (now < pool.reward_end_time) { now } else { pool.reward_end_time };
        if (end <= pool.last_reward_time) {
            pool.last_reward_time = now;
            return
        };

        let elapsed = end - pool.last_reward_time;
        let reward = (elapsed as u128) * (pool.reward_per_ms as u128);

        pool.acc_reward_per_share = pool.acc_reward_per_share +
            reward * PRECISION / (pool.total_shares as u128);
        pool.last_reward_time = now;
    }
}
```

### Step 4: Liquid Staking Token (LST)

```move
module staking::liquid_staking {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::Balance;
    use sui::sui::SUI;
    use sui::clock::Clock;

    /// The liquid staking token
    public struct ST_SUI has drop {}

    /// Liquid staking pool
    public struct LiquidStakePool has key {
        id: UID,
        /// Underlying SUI balance (staked with validators)
        total_sui: Balance<SUI>,
        /// Treasury cap for minting/burning stSUI
        treasury: TreasuryCap<ST_SUI>,
        /// Exchange rate: stSUI per SUI (scaled by 1e9)
        exchange_rate: u64,
        /// Last epoch rewards were compounded
        last_compound_epoch: u64,
    }

    /// Deposit SUI, receive stSUI
    public entry fun deposit(
        pool: &mut LiquidStakePool,
        sui_coin: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let sui_amount = coin::value(&sui_coin);

        // Calculate stSUI to mint based on exchange rate
        let st_sui_amount = if (coin::total_supply(&pool.treasury) == 0) {
            sui_amount // 1:1 at start
        } else {
            (sui_amount as u128) * (coin::total_supply(&pool.treasury) as u128)
                / (balance::value(&pool.total_sui) as u128) as u64
        };

        balance::join(&mut pool.total_sui, coin::into_balance(sui_coin));

        // Mint stSUI to depositor
        let st_sui = coin::mint(&mut pool.treasury, st_sui_amount, ctx);
        transfer::public_transfer(st_sui, tx_context::sender(ctx));
    }

    /// Burn stSUI, receive SUI (after unbonding)
    public entry fun withdraw(
        pool: &mut LiquidStakePool,
        st_sui: Coin<ST_SUI>,
        ctx: &mut TxContext,
    ) {
        let st_sui_amount = coin::value(&st_sui);
        let total_st_sui = coin::total_supply(&pool.treasury);
        let total_sui = balance::value(&pool.total_sui);

        // Calculate SUI to return
        let sui_amount = (st_sui_amount as u128) * (total_sui as u128)
            / (total_st_sui as u128) as u64;

        // Burn stSUI
        coin::burn(&mut pool.treasury, st_sui);

        // Return SUI
        let sui_coin = coin::from_balance(
            balance::split(&mut pool.total_sui, sui_amount),
            ctx,
        );
        transfer::public_transfer(sui_coin, tx_context::sender(ctx));
    }
}
```

### Step 5: Frontend Staking Dashboard

```typescript
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

function StakingDashboard() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [stakingInfo, setStakingInfo] = useState(null);

  useEffect(() => {
    if (account) {
      fetchStakingInfo(client, account.address).then(setStakingInfo);
    }
  }, [account]);

  const handleStake = async (amount: bigint) => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::pool::stake`,
      typeArguments: [SUI_TYPE, REWARD_TOKEN_TYPE],
      arguments: [
        tx.object(POOL_ID),
        coin,
        tx.object("0x6"), // Clock
      ],
    });

    signAndExecute({ transaction: tx });
  };

  return (
    <div>
      <h2>Staking Pool</h2>
      <div>Total Staked: {stakingInfo?.totalStaked} SUI</div>
      <div>APY: {stakingInfo?.apy}%</div>
      <div>Your Stake: {stakingInfo?.userStake} SUI</div>
      <div>Pending Rewards: {stakingInfo?.pendingRewards} REWARD</div>
      <button onClick={() => handleStake(1_000_000_000n)}>Stake 1 SUI</button>
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS use share-based accounting** for staking pools — never track raw balances per user; shares handle reward accrual automatically
2. **ALWAYS implement unbonding delays** — instant unstaking enables flash-loan attacks on reward distribution
3. **Staking pool MUST be a shared object** — owned objects cannot accept deposits from multiple users
4. **StakeReceipt MUST be an owned object** — each user gets their own receipt; never store user data in the shared pool
5. **ALWAYS use `Clock` for time calculations** — never rely on epoch alone for sub-epoch precision
6. **ALWAYS use u128 for intermediate reward calculations** — u64 overflows with large stake amounts and high precision
7. **ALWAYS emit events** for stake, unstake, claim, and reward additions — indexers and dashboards depend on these
8. **NEVER allow zero-amount stakes** — they can manipulate share ratios

## References

- `skills/build/build-defi-protocol/SKILL.md` — DeFi patterns and composability
- `skills/build/launch-token/SKILL.md` — Creating the reward/staking token
- `skills/build/integrate-suilend/SKILL.md` — Composing with lending for yield strategies
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
