# Sui Deployment Runbook

## Pre-Flight Checklist

- [ ] All tests pass: `sui move test`
- [ ] Build succeeds: `sui move build`
- [ ] No compiler warnings
- [ ] Security review complete (see `security-checklist.md`)
- [ ] Tested on devnet/testnet first
- [ ] Gas budget estimated (publish is expensive — 500M+ MIST typical)
- [ ] Mainnet SUI funded in deployer wallet
- [ ] Production RPC configured (Shinami recommended)
- [ ] UpgradeCap custody plan decided

## Step 1: Build

```bash
sui move build
```

Verify no errors. Check `build/` directory for compiled bytecode.

## Step 2: Test on Devnet

```bash
# Switch to devnet
sui client switch --env devnet

# Fund wallet
sui client faucet

# Publish
sui client publish --gas-budget 500000000

# Save the output:
# - Package ID (the new package address)
# - UpgradeCap object ID
# - Any created objects (TreasuryCap, AdminCap, etc.)
```

## Step 3: Test on Testnet

```bash
sui client switch --env testnet
sui client faucet
sui client publish --gas-budget 500000000
```

Run integration tests against testnet deployment. Verify all functions work with real transactions.

## Step 4: Deploy to Mainnet

```bash
# Switch to mainnet
sui client switch --env mainnet

# Verify balance
sui client balance

# Publish (use a higher gas budget for safety)
sui client publish --gas-budget 1000000000
```

**CRITICAL: Save the output immediately.** Record:
1. **Package ID** — the on-chain address of your package
2. **UpgradeCap ID** — needed for future upgrades
3. **All created object IDs** — TreasuryCap, AdminCap, shared objects, etc.

## Step 5: Verify Deployment

```bash
# Verify package exists
sui client object <PACKAGE_ID>

# Check on explorer
# https://suivision.xyz/package/<PACKAGE_ID>
# https://suiscan.xyz/mainnet/object/<PACKAGE_ID>
```

## UpgradeCap Management

The `UpgradeCap` object controls who can upgrade your package. This is the **most security-critical object** after deployment.

### Upgrade Policies

| Policy | What It Means |
|--------|---------------|
| `compatible` (default) | Can add new functions, modules. Cannot change existing function signatures or struct layouts. |
| `additive` | Can only add new modules. Cannot modify existing modules at all. |
| `dep_only` | Can only change dependencies. Cannot modify any code. |
| `immutable` | Package is frozen forever. No upgrades possible. |

### Lock Down Upgrades (Recommended for Production)

```bash
# Make package immutable (irreversible!)
sui client call \
  --package 0x2 \
  --module package \
  --function make_immutable \
  --args <UPGRADE_CAP_ID> \
  --gas-budget 10000000
```

### Restrict Upgrade Policy

```bash
# Restrict to additive-only upgrades
sui client call \
  --package 0x2 \
  --module package \
  --function only_additive_upgrades \
  --args <UPGRADE_CAP_ID> \
  --gas-budget 10000000
```

### Transfer UpgradeCap to Multisig

For production protocols, transfer the UpgradeCap to a multisig address:

```bash
sui client transfer --object-id <UPGRADE_CAP_ID> --to <MULTISIG_ADDRESS> --gas-budget 10000000
```

## Performing an Upgrade

```bash
# Build the new version
sui move build

# Upgrade (requires holding UpgradeCap)
sui client upgrade --gas-budget 1000000000 --upgrade-capability <UPGRADE_CAP_ID>
```

The upgrade creates a **new package version** at a new address. The original package ID still works for existing references. Clients should use the latest package ID.

## Production RPC Configuration

### Shinami (Recommended)
1. Create account at https://app.shinami.com/
2. Create a Sui Mainnet access key
3. Use in your app:
```typescript
import { createSuiClient } from '@shinami/clients';
const client = createSuiClient(process.env.SHINAMI_ACCESS_KEY!);
```

### Environment Variables
```env
SUI_NETWORK=mainnet
SUI_RPC_URL=https://api.shinami.com/node/v1/YOUR_KEY
SHINAMI_ACCESS_KEY=your_key_here
PACKAGE_ID=0x...
UPGRADE_CAP_ID=0x...
```

## Post-Deployment Checklist

- [ ] Package verified on SuiVision/Suiscan
- [ ] All created objects recorded and secured
- [ ] UpgradeCap secured (multisig or made immutable)
- [ ] Production RPC configured and rate limits adequate
- [ ] Monitoring set up (transaction success rate, gas usage)
- [ ] Frontend updated with mainnet package ID
- [ ] Environment variables set in production deployment
