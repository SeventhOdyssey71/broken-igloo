---
name: build-depin
description: "Build DePIN (Decentralized Physical Infrastructure) on Sui. Covers device registration objects, data submission with attestation, reward distribution based on contributions, oracle verification, device NFTs, coverage maps, slashing for bad data. Triggers: depin, decentralized physical infrastructure, iot blockchain, device registration, sensor data, depin rewards, hardware network, depin protocol"
---

```bash
# Telemetry preamble
SKILL_NAME="build-depin"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui DePIN (Decentralized Physical Infrastructure Network) architect. Your job is to guide users through building networks where physical devices (sensors, hotspots, cameras, weather stations, GPUs, etc.) contribute data or services and earn token rewards. Sui's object model is exceptionally well-suited for DePIN because each device is naturally represented as an **owned object** with its own state, metadata, and reward history.

Key architecture:
- **Device Object**: Each physical device is registered as an owned Sui object with hardware attestation, location, and operational metadata
- **Data Submission**: Devices submit data (via an off-chain relay or directly) that is verified by oracles or cryptographic proofs
- **Reward Pool**: A shared object distributes rewards based on verified contributions
- **Slashing**: Devices that submit fraudulent or low-quality data lose their stake

```
┌──────────────┐     Data     ┌──────────────┐    Verify    ┌──────────────┐
│  Physical     │─────────────>│  Relay /      │────────────>│  Oracle /     │
│  Device       │              │  Backend      │             │  Verifier     │
│  (IoT sensor) │              │               │             │               │
└──────────────┘              └──────────────┘             └──────┬───────┘
                                                                  │
                                                         Submit proof
                                                                  │
                                                                  ▼
                                                        ┌──────────────┐
                                                        │  Sui Network  │
                                                        │  - Device NFT │
                                                        │  - Reward Pool│
                                                        │  - Data index │
                                                        └──────────────┘
```

## Workflow

### Step 1: Design the DePIN Model

Interview the user to determine their DePIN architecture:

| Parameter             | Question                                          | Options                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------ |
| **Device Type**       | What physical devices are in the network?          | Sensors, hotspots, GPUs, cameras, stations |
| **Data Type**         | What data do devices contribute?                   | Temperature, location, bandwidth, compute  |
| **Verification**      | How is data verified?                              | Oracle, ZKP, consensus, hardware attestation|
| **Reward Model**      | How are rewards distributed?                       | Per-submission, per-epoch, quality-weighted |
| **Staking**           | Do devices need to stake?                          | Yes (slashable), no (reputation only)      |
| **Coverage**          | Is geographic coverage important?                  | Yes (hex-based), no (global pool)          |

### Step 2: Device Registration Module

```move
module depin::device_registry {
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::display;
    use sui::package;
    use std::string::String;

    // === Error Codes ===
    const EDeviceAlreadyRegistered: u64 = 0;
    const EDeviceNotActive: u64 = 1;
    const EInsufficientStake: u64 = 2;
    const EUnstakeCooldown: u64 = 3;
    const ENotDeviceOwner: u64 = 4;
    const EInvalidAttestation: u64 = 5;
    const EDataTooOld: u64 = 6;

    // === Constants ===
    const MIN_STAKE: u64 = 1_000_000_000; // 1 SUI minimum stake
    const UNSTAKE_COOLDOWN_MS: u64 = 604_800_000; // 7 days
    const MAX_DATA_AGE_MS: u64 = 300_000; // 5 minutes

    // === OTW ===
    public struct DEVICE_REGISTRY has drop {}

    // === Objects ===

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Oracle verifier capability
    public struct VerifierCap has key, store {
        id: UID,
        name: String,
    }

    /// Global network state (shared object)
    public struct Network has key {
        id: UID,
        /// Total registered devices
        total_devices: u64,
        /// Total active devices (submitted data recently)
        active_devices: u64,
        /// Total data submissions verified
        total_submissions: u64,
        /// Reward pool balance
        reward_pool: Balance<SUI>,
        /// Rewards per verified submission
        reward_per_submission: u64,
        /// Current epoch for reward calculation
        reward_epoch: u64,
        /// Minimum stake required for device registration
        min_stake: u64,
        /// Network paused flag
        paused: bool,
    }

    /// Device NFT — represents a registered physical device
    public struct Device has key, store {
        id: UID,
        /// Hardware identifier (serial number, MAC, etc.)
        hardware_id: String,
        /// Device type
        device_type: String,
        /// Geographic location (H3 hex index or lat/lon)
        location: String,
        /// Hardware attestation certificate hash
        attestation_hash: vector<u8>,
        /// Staked balance (slashable)
        stake: Balance<SUI>,
        /// Device status: 0=pending, 1=active, 2=suspended, 3=deregistered
        status: u8,
        /// Total verified submissions
        total_submissions: u64,
        /// Total rewards earned (lifetime)
        total_rewards_earned: u64,
        /// Quality score (0-1000, where 1000 = perfect)
        quality_score: u64,
        /// Last data submission timestamp
        last_submission: u64,
        /// Registration timestamp
        registered_at: u64,
        /// Owner address
        owner: address,
    }

    /// Data submission record
    public struct DataSubmission has key {
        id: UID,
        device_id: ID,
        /// Data hash (actual data stored off-chain on Walrus)
        data_hash: vector<u8>,
        /// Walrus blob ID for the full data
        walrus_blob_id: String,
        /// Submission timestamp
        timestamp: u64,
        /// Verified by oracle
        verified: bool,
        /// Reward amount (0 if not yet rewarded)
        reward: u64,
    }

    // === Events ===
    public struct DeviceRegistered has copy, drop {
        device_id: ID,
        hardware_id: String,
        device_type: String,
        location: String,
        owner: address,
        stake: u64,
    }

    public struct DataSubmitted has copy, drop {
        device_id: ID,
        submission_id: ID,
        data_hash: vector<u8>,
        timestamp: u64,
    }

    public struct DataVerified has copy, drop {
        submission_id: ID,
        device_id: ID,
        reward: u64,
        quality_score: u64,
    }

    public struct DeviceSlashed has copy, drop {
        device_id: ID,
        slash_amount: u64,
        reason: String,
    }

    // === Init ===
    fun init(otw: DEVICE_REGISTRY, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        let mut display = display::new<Device>(&publisher, ctx);
        display::add(&mut display, string::utf8(b"name"), string::utf8(b"DePIN Device: {device_type}"));
        display::add(&mut display, string::utf8(b"description"), string::utf8(b"Registered {device_type} at {location}. Quality: {quality_score}/1000"));
        display::add(&mut display, string::utf8(b"image_url"), string::utf8(b"https://depin.example.com/device/{device_type}.png"));
        display::update_version(&mut display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));

        transfer::share_object(Network {
            id: object::new(ctx),
            total_devices: 0,
            active_devices: 0,
            total_submissions: 0,
            reward_pool: balance::zero(),
            reward_per_submission: 10_000_000, // 0.01 SUI per verified submission
            reward_epoch: 0,
            min_stake: MIN_STAKE,
            paused: false,
        });
    }

    // === Register Device ===
    public entry fun register_device(
        network: &mut Network,
        hardware_id: String,
        device_type: String,
        location: String,
        attestation_hash: vector<u8>,
        mut stake_coin: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!network.paused, EDeviceNotActive);
        let stake_amount = coin::value(&stake_coin);
        assert!(stake_amount >= network.min_stake, EInsufficientStake);

        let now = clock::timestamp_ms(clock);
        let owner = tx_context::sender(ctx);

        let device = Device {
            id: object::new(ctx),
            hardware_id,
            device_type,
            location,
            attestation_hash,
            stake: coin::into_balance(stake_coin),
            status: 1, // Active
            total_submissions: 0,
            total_rewards_earned: 0,
            quality_score: 500, // Start at 50%
            last_submission: 0,
            registered_at: now,
            owner,
        };

        network.total_devices = network.total_devices + 1;
        network.active_devices = network.active_devices + 1;

        event::emit(DeviceRegistered {
            device_id: object::id(&device),
            hardware_id: device.hardware_id,
            device_type: device.device_type,
            location: device.location,
            owner,
            stake: stake_amount,
        });

        transfer::transfer(device, owner);
    }

    // === Submit Data ===
    public entry fun submit_data(
        network: &mut Network,
        device: &mut Device,
        data_hash: vector<u8>,
        walrus_blob_id: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(device.status == 1, EDeviceNotActive);
        assert!(tx_context::sender(ctx) == device.owner, ENotDeviceOwner);

        let now = clock::timestamp_ms(clock);

        let submission = DataSubmission {
            id: object::new(ctx),
            device_id: object::id(device),
            data_hash,
            walrus_blob_id,
            timestamp: now,
            verified: false,
            reward: 0,
        };

        device.last_submission = now;

        event::emit(DataSubmitted {
            device_id: object::id(device),
            submission_id: object::id(&submission),
            data_hash: submission.data_hash,
            timestamp: now,
        });

        // Submission is a shared object so verifier can access it
        transfer::share_object(submission);
    }

    // === Verify Data (Oracle) ===
    public entry fun verify_submission(
        _verifier: &VerifierCap,
        network: &mut Network,
        device: &mut Device,
        submission: &mut DataSubmission,
        quality_score: u64, // 0-1000
        ctx: &mut TxContext,
    ) {
        assert!(!submission.verified, EDeviceNotActive);

        submission.verified = true;

        // Calculate reward based on quality
        let base_reward = network.reward_per_submission;
        let reward = base_reward * quality_score / 1000;

        submission.reward = reward;

        // Update device stats
        device.total_submissions = device.total_submissions + 1;
        device.total_rewards_earned = device.total_rewards_earned + reward;

        // Update quality score (exponential moving average)
        device.quality_score = (device.quality_score * 9 + quality_score) / 10;

        network.total_submissions = network.total_submissions + 1;

        // Pay reward from pool
        if (reward > 0 && balance::value(&network.reward_pool) >= reward) {
            let reward_coin = coin::from_balance(
                balance::split(&mut network.reward_pool, reward),
                ctx,
            );
            transfer::public_transfer(reward_coin, device.owner);
        };

        event::emit(DataVerified {
            submission_id: object::id(submission),
            device_id: object::id(device),
            reward,
            quality_score,
        });
    }

    // === Slash Device for Bad Data ===
    public entry fun slash_device(
        _verifier: &VerifierCap,
        network: &mut Network,
        device: &mut Device,
        slash_pct: u64, // Percentage of stake to slash (0-100)
        reason: String,
        ctx: &mut TxContext,
    ) {
        let stake_value = balance::value(&device.stake);
        let slash_amount = stake_value * slash_pct / 100;

        if (slash_amount > 0) {
            // Transfer slashed stake to network reward pool
            let slashed = balance::split(&mut device.stake, slash_amount);
            balance::join(&mut network.reward_pool, slashed);
        };

        // Suspend device if stake drops below minimum
        if (balance::value(&device.stake) < network.min_stake) {
            device.status = 2; // Suspended
            network.active_devices = network.active_devices - 1;
        };

        // Reduce quality score
        device.quality_score = device.quality_score / 2;

        event::emit(DeviceSlashed {
            device_id: object::id(device),
            slash_amount,
            reason,
        });
    }

    // === Fund Reward Pool ===
    public entry fun fund_rewards(
        _admin: &AdminCap,
        network: &mut Network,
        funds: Coin<SUI>,
    ) {
        balance::join(&mut network.reward_pool, coin::into_balance(funds));
    }

    // === Add Verifier ===
    public entry fun add_verifier(
        _admin: &AdminCap,
        name: String,
        verifier_address: address,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(VerifierCap {
            id: object::new(ctx),
            name,
        }, verifier_address);
    }

    // === View Functions ===
    public fun device_quality(device: &Device): u64 { device.quality_score }
    public fun device_stake(device: &Device): u64 { balance::value(&device.stake) }
    public fun is_device_active(device: &Device): bool { device.status == 1 }
}
```

### Step 3: Data Relay Service (Off-chain to On-chain)

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { WalrusClient } from "@mysten/walrus";
import { createHash } from "crypto";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
const walrus = new WalrusClient({ network: "mainnet", suiClient: client });

interface DeviceData {
  deviceId: string;       // Sui object ID of the Device NFT
  timestamp: number;      // Unix timestamp
  readings: Record<string, number>; // sensor readings
  signature: string;      // Device-signed attestation
}

async function relayDeviceData(data: DeviceData, signer) {
  // Step 1: Store full data on Walrus
  const dataBytes = new TextEncoder().encode(JSON.stringify(data));
  const { blobId } = await walrus.writeBlob({
    blob: new Uint8Array(dataBytes),
    deletable: false,
    epochs: 30,
    signer,
  });

  // Step 2: Compute data hash
  const dataHash = createHash("sha256").update(dataBytes).digest();

  // Step 3: Submit on-chain
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::device_registry::submit_data`,
    arguments: [
      tx.object(NETWORK_ID),
      tx.object(data.deviceId),
      tx.pure(Array.from(dataHash), "vector<u8>"),
      tx.pure.string(blobId),
      tx.object("0x6"), // Clock
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  console.log(`Data relayed: ${result.digest}, Walrus blob: ${blobId}`);
  return result;
}

// Batch relay for multiple devices
async function batchRelay(deviceDataList: DeviceData[], signer) {
  const tx = new Transaction();

  for (const data of deviceDataList) {
    const dataBytes = new TextEncoder().encode(JSON.stringify(data));
    const dataHash = createHash("sha256").update(dataBytes).digest();

    // Store on Walrus (outside PTB)
    const { blobId } = await walrus.writeBlob({
      blob: new Uint8Array(dataBytes),
      deletable: false,
      epochs: 30,
      signer,
    });

    tx.moveCall({
      target: `${PACKAGE_ID}::device_registry::submit_data`,
      arguments: [
        tx.object(NETWORK_ID),
        tx.object(data.deviceId),
        tx.pure(Array.from(dataHash), "vector<u8>"),
        tx.pure.string(blobId),
        tx.object("0x6"),
      ],
    });
  }

  return client.signAndExecuteTransaction({ signer, transaction: tx });
}
```

### Step 4: Coverage Map and Device Dashboard

```typescript
// Fetch all devices in the network
async function getNetworkDevices(): Promise<Device[]> {
  const objects = await client.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::device_registry::DeviceRegistered` },
    limit: 1000,
  });

  return objects.data.map((event) => ({
    deviceId: event.parsedJson.device_id,
    hardwareId: event.parsedJson.hardware_id,
    type: event.parsedJson.device_type,
    location: event.parsedJson.location,
    owner: event.parsedJson.owner,
  }));
}

// Network stats
async function getNetworkStats() {
  const network = await client.getObject({
    id: NETWORK_ID,
    options: { showContent: true },
  });

  const fields = network.data.content.fields;
  return {
    totalDevices: Number(fields.total_devices),
    activeDevices: Number(fields.active_devices),
    totalSubmissions: Number(fields.total_submissions),
    rewardPoolBalance: Number(fields.reward_pool) / 1e9,
    rewardPerSubmission: Number(fields.reward_per_submission) / 1e9,
  };
}
```

### Step 5: Oracle Verification Service

```typescript
// Automated verification service (runs as a backend worker)
class DataVerifier {
  private client: SuiClient;
  private verifierSigner: any; // VerifierCap holder

  async processUnverifiedSubmissions() {
    // Query unverified DataSubmission events
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${PACKAGE_ID}::device_registry::DataSubmitted`,
      },
      limit: 50,
    });

    for (const event of events.data) {
      const submissionId = event.parsedJson.submission_id;
      const deviceId = event.parsedJson.device_id;
      const dataHash = event.parsedJson.data_hash;

      // Fetch and validate the data from Walrus
      const submission = await this.client.getObject({
        id: submissionId,
        options: { showContent: true },
      });

      if (submission.data.content.fields.verified) continue;

      const blobId = submission.data.content.fields.walrus_blob_id;
      const rawData = await walrus.readBlob({ blobId });
      const data = JSON.parse(new TextDecoder().decode(rawData));

      // Quality checks
      const qualityScore = this.assessQuality(data);

      // Submit verification on-chain
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::device_registry::verify_submission`,
        arguments: [
          tx.object(VERIFIER_CAP_ID),
          tx.object(NETWORK_ID),
          tx.object(deviceId),
          tx.object(submissionId),
          tx.pure.u64(qualityScore),
        ],
      });

      await this.client.signAndExecuteTransaction({
        signer: this.verifierSigner,
        transaction: tx,
      });
    }
  }

  assessQuality(data: any): number {
    let score = 1000;

    // Check data freshness
    if (Date.now() - data.timestamp > 300_000) score -= 200;

    // Check reading ranges
    for (const [key, value] of Object.entries(data.readings)) {
      if (typeof value !== "number" || isNaN(value)) score -= 100;
      // Add domain-specific validation here
    }

    // Check signature validity
    if (!this.verifyDeviceSignature(data)) score -= 500;

    return Math.max(0, Math.min(1000, score));
  }
}
```

## Non-Negotiables

1. **Each device MUST be a distinct owned object** — never store device state in a shared Table; owned objects give per-device parallelism
2. **ALWAYS require staking for device registration** — stake creates economic incentive against fraud; no stake = no skin in the game
3. **ALWAYS store raw data off-chain (Walrus)** — on-chain storage is expensive; store hashes on Sui, full data on Walrus
4. **ALWAYS implement slashing** — without penalties, devices will submit garbage data to farm rewards
5. **Verifier (oracle) MUST be independent from device operators** — the entity verifying data quality must not profit from approving bad data
6. **ALWAYS emit events** for registration, submission, verification, and slashing — indexers build coverage maps and analytics from these
7. **Quality scores MUST use exponential moving averages** — a single bad reading should not destroy a device's reputation permanently
8. **NEVER allow the device owner to verify their own submissions** — self-verification defeats the purpose of the oracle layer

## References

- `skills/build/integrate-walrus/SKILL.md` — Walrus storage for device data
- `skills/build/build-staking/SKILL.md` — Staking mechanics for device bonds
- `skills/build/integrate-pyth/SKILL.md` — Oracle patterns for data verification
- `skills/build/build-notification/SKILL.md` — Alerting on device anomalies
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
