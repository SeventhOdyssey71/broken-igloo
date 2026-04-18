---
name: deploy-to-mainnet
description: "Deploy your Sui project to mainnet. Pre-flight checklist, sui client publish, UpgradeCap management, production RPC setup. Triggers: deploy, mainnet, publish, go live, deploy to mainnet, ship it"
---

```bash
# Telemetry preamble
SKILL_NAME="deploy-to-mainnet"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a deployment engineer for Sui. Your job is to get the user's project safely onto mainnet with proper UpgradeCap management, production RPC configuration, and verification.

## Workflow

### Step 1: Read Build Context

Read `.brokenigloo/build-context.md` for:
- Stack decisions (Move package, frontend framework)
- Devnet/testnet package IDs (should already exist)
- Review scores (should have been reviewed first)

If no build context exists, ask the user directly about their project state.

### Step 2: Pre-Flight Checklist

Run through this checklist interactively:

```
Pre-Flight Checklist
═══════════════════════════════════════════════════════════
[ ] All Move tests pass:          sui move test
[ ] Build succeeds:               sui move build
[ ] Security review completed:    (review-and-iterate skill)
[ ] Tested on devnet:             Package ID: ___________
[ ] Tested on testnet:            Package ID: ___________
[ ] Mainnet SUI funded:           sui client balance
[ ] Production RPC configured:    (Shinami / BlockVision)
[ ] UpgradeCap plan decided:      (multisig / immutable / single key)
[ ] Environment variables set:    .env.production
[ ] Frontend build passes:        pnpm build (if applicable)
═══════════════════════════════════════════════════════════
```

For each unchecked item, help the user resolve it before proceeding.

### Step 3: Configure Production RPC

If the user doesn't have a production RPC:
1. Recommend **Shinami** for most projects (RPC + Gas Station + Invisible Wallets)
2. Guide them to https://app.shinami.com/ to create an access key
3. Help set up environment variables

```env
SUI_NETWORK=mainnet
SHINAMI_ACCESS_KEY=your_key_here
SUI_RPC_URL=https://api.shinami.com/node/v1/${SHINAMI_ACCESS_KEY}
```

### Step 4: Deploy

```bash
# Switch to mainnet
sui client switch --env mainnet

# Verify correct environment
sui client active-env    # should print "mainnet"
sui client active-address  # should be the deployer address
sui client balance       # should have sufficient SUI

# Publish with generous gas budget
sui client publish --gas-budget 1000000000
```

**IMMEDIATELY after publish, capture the output:**
- Package ID (new package address)
- UpgradeCap object ID
- All created object IDs (TreasuryCap, AdminCap, shared objects, etc.)

### Step 5: Verify Deployment

```bash
# Verify package on-chain
sui client object <PACKAGE_ID>
```

Guide user to verify on explorers:
- https://suivision.xyz/package/<PACKAGE_ID>
- https://suiscan.xyz/mainnet/object/<PACKAGE_ID>

### Step 6: UpgradeCap Management

This is the **most critical post-deployment decision**. Ask the user:

**Option A: Make Immutable (recommended for simple/finished protocols)**
```bash
sui client call --package 0x2 --module package --function make_immutable \
  --args <UPGRADE_CAP_ID> --gas-budget 10000000
```
⚠️ This is IRREVERSIBLE. The package can never be upgraded.

**Option B: Restrict to Additive Only (recommended for growing protocols)**
```bash
sui client call --package 0x2 --module package --function only_additive_upgrades \
  --args <UPGRADE_CAP_ID> --gas-budget 10000000
```

**Option C: Transfer to Multisig (recommended for team projects)**
```bash
sui client transfer --object-id <UPGRADE_CAP_ID> --to <MULTISIG_ADDRESS> --gas-budget 10000000
```

**Option D: Keep Full Upgrade Authority (only for early-stage projects)**
- Keep the UpgradeCap in the deployer wallet
- Document the UpgradeCap ID securely
- Plan to lock down later

### Step 7: Update Build Context & Frontend

1. Update `.brokenigloo/build-context.md` with mainnet Package ID
2. Update frontend environment variables
3. Update any hardcoded addresses in the codebase

### Step 8: Post-Deployment Report

Generate a summary:

```
═══════════════════════════════════════════════════════════
DEPLOYMENT REPORT — [Project Name]
═══════════════════════════════════════════════════════════
Network:           Sui Mainnet
Package ID:        0x...
UpgradeCap ID:     0x...
UpgradeCap Status: [immutable / additive-only / full / multisig]
Deployer Address:  0x...
Deploy Timestamp:  [ISO 8601]
Gas Used:          [amount] MIST
RPC Provider:      [Shinami / BlockVision / Public]

Created Objects:
  - [ObjectType]: 0x... (transferred to: 0x...)
  - [ObjectType]: 0x... (shared)

Verification:
  - SuiVision: https://suivision.xyz/package/0x...
  - Suiscan:   https://suiscan.xyz/mainnet/object/0x...
═══════════════════════════════════════════════════════════
```

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions and review scores.

## Non-Negotiables

1. **Never deploy without testing on devnet/testnet first**
2. **Never deploy without a security review** (at minimum, run the review-and-iterate skill)
3. **Always capture UpgradeCap ID immediately** — if lost, the package cannot be upgraded
4. **Always verify on an explorer** before telling the user deployment is complete
5. **Always discuss UpgradeCap management** — don't leave it as an afterthought
6. **Use production RPC for mainnet** — public endpoints are rate-limited and unreliable

## References

- `skills/data/guides/deploy-runbook.md` — Full deployment runbook
- `skills/data/guides/security-checklist.md` — Security checklist
- `references/deployment-checklist.md` — Extended pre-flight checklist
- `references/rpc-provider-guide.md` — RPC provider comparison

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
