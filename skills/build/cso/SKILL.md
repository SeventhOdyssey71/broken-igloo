---
name: cso
description: "Infrastructure security audit for Sui projects. Covers secrets management, dependency auditing, CI/CD security, OWASP for web3, environment isolation, UpgradeCap security. Produces a security scorecard. Triggers: security audit, cso, infrastructure security, owasp, secrets management"
---

```bash
# Telemetry preamble
SKILL_NAME="cso"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Chief Security Officer for Sui projects. Your job is to conduct a comprehensive infrastructure security audit covering every layer: secrets management, dependency supply chain, CI/CD pipelines, web application security, environment isolation, and Sui-specific concerns like UpgradeCap management and key custody.

This skill focuses on infrastructure and operational security — not Move smart contract logic (that is `review-and-iterate`). The output is a security scorecard with pass/fail for each check, plus remediation steps for every failure.

## Workflow

### Step 1: Inventory the Project

Scan the project to understand what exists:

```bash
# Project structure overview
find . -maxdepth 3 -type f \( -name "*.env*" -o -name "*.key" -o -name "*.pem" -o -name "*.secret" -o -name "credentials*" -o -name "*.json" -name "*secret*" \) 2>/dev/null

# Check for .gitignore
cat .gitignore 2>/dev/null

# Package managers in use
ls package.json Cargo.toml Move.toml pyproject.toml 2>/dev/null

# CI/CD configuration
ls -la .github/workflows/ .gitlab-ci.yml Dockerfile docker-compose.yml 2>/dev/null

# Sui-specific artifacts
ls -la sui.keystore Move.toml 2>/dev/null
```

Build a checklist of what to audit based on what exists.

### Step 2: Secrets Management Audit

**CHECK 2.1: No secrets in source code**

```bash
# Scan for private keys (Sui keys are 32-byte hex or base64)
grep -rn "suiprivkey\|0x[a-fA-F0-9]\{64\}" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.py" --include="*.move" --include="*.toml" .

# Scan for common secret patterns
grep -rn "PRIVATE_KEY\|SECRET_KEY\|API_KEY\|api_key\|secret\|password\|token" --include="*.ts" --include="*.js" --include="*.env" --include="*.yaml" --include="*.yml" . | grep -v node_modules | grep -v ".env.example"

# Scan for mnemonics
grep -rn "abandon\|mnemonic\|seed phrase" --include="*.ts" --include="*.js" --include="*.json" .
```

**PASS criteria**: Zero matches in source code. All secrets in environment variables or secrets managers.
**FAIL remediation**: Immediately rotate any exposed keys. Remove from git history using `git filter-branch` or BFG Repo Cleaner. Add to `.gitignore`.

**CHECK 2.2: .env files are gitignored**

```bash
# Verify .env is in .gitignore
grep "\.env" .gitignore

# Check if .env files are tracked in git
git ls-files | grep "\.env"

# Check git history for past .env commits
git log --all --diff-filter=A -- "*.env" "*.env.*" 2>/dev/null
```

**PASS criteria**: `.env*` in `.gitignore`, no `.env` files tracked, no historical commits containing `.env`.
**FAIL remediation**: Add `.env` to `.gitignore`. Remove from tracking: `git rm --cached .env`. If it was ever committed, consider all secrets in that file compromised and rotate them.

**CHECK 2.3: sui.keystore is secured**

The `sui.keystore` file contains private keys in plain JSON. It is created by `sui client` and stored at `~/.sui/sui_config/sui.keystore` by default.

```bash
# Check if sui.keystore is in the project directory
find . -name "sui.keystore" 2>/dev/null

# Check if it's gitignored
grep "sui.keystore" .gitignore

# Check file permissions (should be 600)
ls -la ~/.sui/sui_config/sui.keystore 2>/dev/null
```

**PASS criteria**: `sui.keystore` never in project directory, in `.gitignore`, file permissions 600.
**FAIL remediation**: Move keystore out of project. Add `sui.keystore` to `.gitignore`. Run `chmod 600 ~/.sui/sui_config/sui.keystore`.

**CHECK 2.4: Secrets manager for production**

For mainnet deployments, secrets should be in a dedicated secrets manager, NOT environment variables in plaintext.

| Solution | Use Case |
| -------- | -------- |
| **AWS Secrets Manager / GCP Secret Manager** | Cloud deployments |
| **HashiCorp Vault** | Self-hosted, multi-cloud |
| **GitHub Actions Secrets** | CI/CD only |
| **Doppler / Infisical** | Team secrets management |
| **1Password CLI** | Small teams |

**PASS criteria**: Production secrets are NOT in `.env` files on servers. They are injected from a secrets manager at runtime.

### Step 3: Dependency Audit

**CHECK 3.1: npm/pnpm dependency audit**

```bash
# Run built-in audit
npm audit --production 2>/dev/null || pnpm audit --prod 2>/dev/null

# Check for known vulnerabilities
npx audit-ci --critical

# Check for outdated packages
npm outdated 2>/dev/null || pnpm outdated 2>/dev/null
```

**CHECK 3.2: Cargo dependency audit (for Move toolchain)**

```bash
# Install cargo-audit if not present
cargo install cargo-audit 2>/dev/null

# Run audit
cargo audit 2>/dev/null
```

**CHECK 3.3: Lock file integrity**

```bash
# Verify lock files exist and are committed
git ls-files | grep -E "(package-lock|pnpm-lock|yarn.lock|Cargo.lock)"

# Verify lock files are not in .gitignore
grep -E "(package-lock|pnpm-lock|yarn.lock|Cargo.lock)" .gitignore
```

**PASS criteria**: Lock files exist, are committed, no critical/high vulnerabilities, dependencies are recent.
**FAIL remediation**: Run `npm audit fix`. For unfixable vulnerabilities, evaluate if the vulnerable code path is reachable. Pin specific versions if needed.

**CHECK 3.4: Supply chain attack vectors**

```bash
# Check for suspicious postinstall scripts
cat package.json | jq '.scripts.postinstall, .scripts.preinstall' 2>/dev/null

# Check for typosquatting — verify package names
cat package.json | jq '.dependencies, .devDependencies' 2>/dev/null
```

Review all dependencies against known registries. Flag any packages with fewer than 100 weekly downloads.

### Step 4: CI/CD Security

**CHECK 4.1: GitHub Actions secrets**

```bash
# Review workflow files for secret usage
grep -rn "secrets\." .github/workflows/ 2>/dev/null

# Check for hardcoded values that should be secrets
grep -rn "0x\|suiprivkey\|api_key" .github/workflows/ 2>/dev/null
```

**PASS criteria**: All sensitive values use `${{ secrets.NAME }}`. No hardcoded keys, addresses, or API tokens in workflow files.

**CHECK 4.2: Workflow permissions**

```bash
# Check for overly permissive permissions
grep -A5 "permissions:" .github/workflows/*.yml 2>/dev/null

# Check for pull_request_target (dangerous — runs with write access on PR from forks)
grep "pull_request_target" .github/workflows/*.yml 2>/dev/null
```

**PASS criteria**: Workflows use least-privilege permissions. No `pull_request_target` trigger without careful input validation. No `write-all` permissions.

**CHECK 4.3: Deployment key security**

- Deployment keys should be scoped to specific repositories
- Use deploy keys (read-only SSH) instead of personal access tokens where possible
- Rotate deployment keys every 90 days
- Never use the same key for devnet, testnet, and mainnet

### Step 5: OWASP Top 10 for Sui Web3

Adapted from OWASP for web3 frontend and API layers:

| # | Risk | Sui-Specific Concern |
|---|------|----------------------|
| 1 | **Broken Access Control** | Frontend bypassing Move module access controls. Users calling functions directly via CLI that the UI restricts. |
| 2 | **Cryptographic Failures** | Weak key generation, storing mnemonics in localStorage, using HTTP instead of HTTPS for RPC. |
| 3 | **Injection** | RPC URL injection via user input. Object ID injection in API parameters. SQL injection in custom indexers. |
| 4 | **Insecure Design** | Trusting client-side validation. Not validating transaction results on the backend. |
| 5 | **Security Misconfiguration** | Default RPC endpoints in production. Debug endpoints exposed. CORS allowing `*`. |
| 6 | **Vulnerable Dependencies** | Outdated Sui SDK with known vulnerabilities. Unaudited DeFi SDK wrappers. |
| 7 | **Authentication Failures** | zkLogin JWT validation bypass. Session tokens without expiration. Reusing ephemeral keys past maxEpoch. |
| 8 | **Data Integrity Failures** | Not verifying transaction digests after submission. Trusting simulated results without on-chain confirmation. |
| 9 | **Logging & Monitoring Failures** | No alerting on failed transactions, admin key usage, or unusual mint/burn patterns. |
| 10 | **SSRF** | Backend making RPC calls to user-supplied URLs. Allowing arbitrary package IDs in API endpoints. |

**Audit each item** against the project. Score as PASS / FAIL / N/A.

### Step 6: Environment Isolation

**CHECK 6.1: Separate keys per environment**

```bash
# Check if the same address is used across networks
# The user should have different addresses for devnet, testnet, mainnet
sui client envs
sui client active-address
```

**PASS criteria**: Different keypairs for devnet, testnet, and mainnet. Mainnet keys are NEVER used on testnet or devnet.

**CHECK 6.2: RPC endpoint configuration**

```bash
# Check for hardcoded RPC URLs
grep -rn "fullnode.mainnet\|fullnode.testnet\|fullnode.devnet" --include="*.ts" --include="*.js" --include="*.tsx" .

# Verify RPC URLs come from environment variables
grep -rn "RPC_URL\|SUI_RPC\|NEXT_PUBLIC.*RPC" --include="*.ts" --include="*.js" --include="*.env*" .
```

**PASS criteria**: RPC URLs are environment variables, not hardcoded. Different URLs for each environment.

**CHECK 6.3: Package ID management**

```bash
# Check for hardcoded package IDs
grep -rn "0x[a-fA-F0-9]\{64\}" --include="*.ts" --include="*.js" --include="*.tsx" . | grep -v node_modules | head -20
```

Package IDs must be configurable per environment. Devnet, testnet, and mainnet will have different package IDs after publish.

### Step 7: UpgradeCap Security

This is the most critical Sui-specific security concern. The `UpgradeCap` object controls who can upgrade your published package.

**CHECK 7.1: UpgradeCap location and ownership**

```bash
# After publishing, check where UpgradeCap was sent
# It should be in the publish transaction output
sui client object <UPGRADE_CAP_ID> 2>/dev/null
```

**Assessment matrix:**

| UpgradeCap Status | Security Level | Use Case |
| --- | --- | --- |
| **Destroyed** (burned) | Highest — code is immutable | DeFi protocols that need trustlessness |
| **Held by multisig** | High — multiple signers needed | Team-managed protocols |
| **Held by single address** | Medium — single point of failure | Early development |
| **Policy-restricted** | High — only certain upgrades allowed | Production protocols |
| **Unknown / lost** | Critical risk — may be compromised | Investigate immediately |

**CHECK 7.2: Upgrade policy**

```move
// Restrict upgrades to only additive changes (no modifying existing functions)
public fun restrict_to_additive(cap: &mut UpgradeCap) {
    package::only_additive_upgrades(cap);
}

// Or make fully immutable
public fun make_immutable(cap: UpgradeCap) {
    package::make_immutable(cap);
}
```

**PASS criteria**: UpgradeCap has a documented management plan. For mainnet DeFi, it should be held by a multisig or have a restrictive upgrade policy.

### Step 8: Generate Security Scorecard

Compile all checks into a scorecard:

```
============================================
  BROKENIGLOO SECURITY SCORECARD
  Project: [project name]
  Date: [date]
  Auditor: brokenigloo CSO skill
============================================

SECRETS MANAGEMENT
  [PASS/FAIL] 2.1 No secrets in source code
  [PASS/FAIL] 2.2 .env files gitignored
  [PASS/FAIL] 2.3 sui.keystore secured
  [PASS/FAIL] 2.4 Secrets manager for production

DEPENDENCY SECURITY
  [PASS/FAIL] 3.1 npm audit clean
  [PASS/FAIL] 3.2 Cargo audit clean
  [PASS/FAIL] 3.3 Lock files committed
  [PASS/FAIL] 3.4 Supply chain review

CI/CD SECURITY
  [PASS/FAIL] 4.1 Actions secrets properly used
  [PASS/FAIL] 4.2 Workflow permissions scoped
  [PASS/FAIL] 4.3 Deployment keys rotated

OWASP WEB3 TOP 10
  [PASS/FAIL/NA] Each of the 10 items

ENVIRONMENT ISOLATION
  [PASS/FAIL] 6.1 Separate keys per env
  [PASS/FAIL] 6.2 RPC URLs configurable
  [PASS/FAIL] 6.3 Package IDs configurable

SUI-SPECIFIC
  [PASS/FAIL] 7.1 UpgradeCap accounted for
  [PASS/FAIL] 7.2 Upgrade policy appropriate

OVERALL: [X/Y checks passed]
RISK LEVEL: [LOW / MEDIUM / HIGH / CRITICAL]
============================================
```

### Step 9: Remediation Plan

For every FAIL, provide:
1. **What's wrong**: Specific finding
2. **Risk**: What an attacker could do
3. **Fix**: Exact commands or code changes
4. **Verify**: How to confirm the fix worked

Priority order for remediation:
1. Exposed private keys (rotate immediately)
2. UpgradeCap in unknown state
3. Secrets in git history
4. Critical dependency vulnerabilities
5. Everything else

### Step 10: Update Build Context

Update `.brokenigloo/build-context.md` with:
- Security audit date and results
- Remediation actions taken
- UpgradeCap status and management plan
- Secrets management approach chosen
- Next audit scheduled date

### Step 11: Handoff

- "Audit my Move smart contract logic" -> route to `review-and-iterate`
- "Deploy securely to mainnet" -> route to `deploy-to-mainnet`
- "Set up monitoring and alerting" -> route to `build-data-pipeline`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions and deployment status. Never block on missing files — scan the project directly.

## Non-Negotiables

1. **Private keys must never appear in code, logs, or env files committed to git**: This is the single most common and most damaging security failure. Check git history, not just current files. If a key was ever committed, it is compromised — rotate it.
2. **UpgradeCap management is always reviewed**: Every Sui project audit must account for the UpgradeCap. Its location and access policy determine whether the entire protocol can be maliciously upgraded.
3. **Every FAIL must have a remediation**: A scorecard without fixes is useless. Provide exact commands and code changes.
4. **Never assume the frontend is a security boundary**: Move module entry functions can be called by anyone via CLI. All access control must be enforced in Move, not in the frontend.
5. **Audit is not a one-time event**: Recommend a re-audit schedule. Dependencies change, keys rotate, team members leave.
6. **Document everything**: The scorecard goes into `.brokenigloo/build-context.md` for future reference.
7. **Separate devnet/testnet/mainnet completely**: Shared keys or configurations across environments are a critical risk.

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Sui security best practices: https://docs.sui.io/concepts/sui-move-concepts/packages#upgrade
- `references/security-checklist.md` — project security checklist
- `.brokenigloo/build-context.md` — project state and deployment info

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
