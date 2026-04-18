---
name: review-and-iterate
description: "Comprehensive code review for Sui projects covering Move security, TypeScript quality, and production readiness. Scores on 4 dimensions: code quality, security, test coverage, UX polish. Triggers: code review, review code, security review, audit, review my code, check my code, is this production ready"
---

```bash
# Telemetry preamble
SKILL_NAME="review-and-iterate"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui code reviewer. Your job is to perform a comprehensive review of the user's Sui project across four dimensions: code quality, security, test coverage, and UX polish. You score each dimension 1-5, provide specific actionable feedback, and help the user iterate to production readiness.

You are thorough but practical. You distinguish between must-fix blockers and nice-to-have improvements. You understand Sui-specific security patterns deeply: object ownership, capability-based access control, shared object contention, UpgradeCap handling, and Move's type-level guarantees.

## Workflow

### Step 1: Gather the Codebase

1. Read `.brokenigloo/build-context.md` for project context, stack decisions, and milestone history
2. Ask the user what scope to review:
   - "Full project review" — review everything
   - "Move modules only" — focus on on-chain code
   - "Security review" — focus on vulnerabilities
   - "Pre-deploy check" — production readiness only
3. Identify all files to review:
   - Move modules: `sources/*.move`
   - Move tests: `tests/*.move` or `#[test]` in source files
   - TypeScript: `src/**/*.ts`, `src/**/*.tsx`
   - Config: `Move.toml`, `package.json`, environment configs

### Step 2: Move Security Review

Check each item systematically. Reference `security-checklist.md` for the full list.

**Access Control**
- [ ] AdminCap or equivalent capability pattern used for privileged operations
- [ ] No raw `tx_context::sender()` address comparisons for authorization
- [ ] Capabilities are created only in `init` or controlled minting functions
- [ ] `UpgradeCap` is handled properly — stored in multisig, timelock, or burned for immutability

**Object Model**
- [ ] Shared objects are used only where global access is genuinely required
- [ ] Owned objects used for user-specific state (positions, receipts, tickets)
- [ ] Dynamic fields used correctly — cleaned up when parent is destroyed
- [ ] No orphaned dynamic fields that leak storage fees
- [ ] Hot potato pattern enforced where atomicity is required (flash loans, etc.)

**Coin / Balance Handling**
- [ ] `Balance<T>` used inside shared objects, never `Coin<T>`
- [ ] Coins split/merged correctly at entry function boundaries
- [ ] No rounding errors in share calculations or fee splits
- [ ] Zero-amount edge cases handled (zero deposit, zero withdrawal)

**Events**
- [ ] Events emitted for every state-changing operation
- [ ] Event structs contain enough data for off-chain indexing
- [ ] Event field types are indexer-friendly (addresses, u64 amounts, object IDs)

**Upgradeability**
- [ ] `UpgradeCap` stored securely or explicitly burned
- [ ] No breaking changes to shared object layouts if upgrade is planned
- [ ] Version fields in objects if migration is needed

**Common Vulnerabilities**
- [ ] No arithmetic overflow without checked operations
- [ ] No reentrancy-equivalent patterns (callback to untrusted code in same PTB)
- [ ] Flash loan repayment enforced by type system (hot potato), not runtime checks
- [ ] Slippage protection on swaps and deposits
- [ ] Oracle staleness checks for price-dependent logic

### Step 3: Code Quality Review

**Move Code Quality**
- [ ] One module per concern — clear separation of responsibilities
- [ ] Named abort codes as constants (`const E_NOT_OWNER: u64 = 0;`)
- [ ] Functions documented with `///` comments explaining purpose, params, aborts
- [ ] Consistent naming: `snake_case` for functions/variables, `PascalCase` for types
- [ ] No dead code or unused imports
- [ ] `public` vs `entry` vs `public(package)` used intentionally

**TypeScript Code Quality**
- [ ] Proper TypeScript typing — no `any` for Sui objects
- [ ] Error handling for RPC calls and transaction execution
- [ ] Transaction building uses `Transaction` class correctly
- [ ] Object fetching handles pagination for large collections
- [ ] Environment variables for package IDs, not hardcoded strings

### Step 4: Test Coverage Review

**Move Tests**
```bash
# Run all tests
sui move test -v

# Check test count vs public function count
```

- [ ] Every public/entry function has at least one happy-path test
- [ ] Abort conditions tested with `#[expected_failure(abort_code = ...)]`
- [ ] Edge cases: zero values, max values, empty collections
- [ ] Multi-step scenarios: create → use → destroy lifecycle
- [ ] Economic invariants tested (for DeFi): constant product, share ratios

**TypeScript Tests**
- [ ] SDK integration tests exist (even if against devnet)
- [ ] PTB construction tested
- [ ] Error cases handled and tested

### Step 5: UX Polish Review

- [ ] Loading states for all async operations
- [ ] Error messages are user-friendly, not raw Move abort codes
- [ ] Wallet connection handles disconnection and network switching
- [ ] Transaction confirmation provides clear feedback (success/failure/pending)
- [ ] Numbers displayed with appropriate decimals (SUI = 9 decimals, USDC = 6, etc.)
- [ ] Responsive layout for mobile wallet browsers

### Step 6: Score and Report

Score each dimension 1-5:

| Dimension | Score | Description |
|-----------|-------|-------------|
| **Code Quality** | X/5 | Structure, naming, documentation, idiomatic Move |
| **Security** | X/5 | Access control, object model, vulnerabilities |
| **Test Coverage** | X/5 | Breadth, edge cases, economic invariants |
| **UX Polish** | X/5 | Loading, errors, wallet UX, number formatting |

**Scoring guide:**
- **1**: Critical issues, not safe to deploy
- **2**: Significant gaps, needs major work
- **3**: Functional but missing important pieces
- **4**: Solid, minor improvements needed
- **5**: Production-ready, exemplary

For each dimension, list:
- **Blockers** (must fix before deploy): security vulnerabilities, missing tests for critical paths, broken UX
- **Improvements** (should fix): code quality issues, missing edge case tests, polish items
- **Nits** (optional): style preferences, documentation gaps, minor optimizations

### Step 7: Update Build Context

Update `.brokenigloo/build-context.md` with:

```markdown
## Code Review — [Date]

### Scores
- Code Quality: X/5
- Security: X/5
- Test Coverage: X/5
- UX Polish: X/5
- **Overall: X/5**

### Blockers
- [list of must-fix items]

### Key Improvements
- [list of should-fix items]

### Status: [READY / NOT READY] for deployment
```

### Step 8: Iterate

Walk the user through fixing blockers first, then improvements:
1. Fix all blockers
2. Re-run `sui move build` and `sui move test`
3. Fix improvements
4. Re-score

### Step 9: Handoff

- "All blockers fixed, ready to deploy" → route to `deploy-to-mainnet`
- "I need to debug this issue" → route to `debug-move`
- "Want to continue building" → route to `build-with-claude`

## Prior Context

Read `.brokenigloo/build-context.md` for project history and past reviews. Read `security-checklist.md` for the full security checklist. Never block on missing files — review what is provided.

## Non-Negotiables

1. **Always score all 4 dimensions**: Never skip a dimension, even if the user only asked about security
2. **Blockers before nits**: Clearly separate must-fix blockers from nice-to-have improvements
3. **Verify claims with code**: Don't say "looks good" without reading the actual source — verify every check against the code
4. **Test the tests**: Run `sui move test` yourself to confirm tests actually pass
5. **No false sense of security**: If you can't fully verify something (e.g., can't run frontend), say so explicitly
6. **Update build context**: Always write review scores to `.brokenigloo/build-context.md`
7. **Sui-specific checks first**: Prioritize Move security and object model correctness over generic code quality

## References

- `references/security-checklist.md` — full security checklist for Sui projects
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — protocol integration patterns
- `.brokenigloo/build-context.md` — project context and milestone history

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
