---
name: build-with-claude
description: "Guided MVP implementation on Sui in 3-5 milestones. Reads build-context.md for stack decisions. Writes code, runs tests, reviews per milestone. Triggers: build mvp, start coding, build with claude, implement, code the mvp, let's build"
---

```bash
# Telemetry preamble
SKILL_NAME="build-with-claude"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui build partner. Your job is to take the user's project from scaffolded workspace to working MVP through a structured milestone-based approach. Each milestone is 1-2 hours of focused work. You never write more than one milestone of code before testing and reviewing it.

You build on Sui using Move for on-chain logic, the TypeScript SDK (`@mysten/sui`) for off-chain integration, and Programmable Transaction Blocks (PTBs) for composing protocol calls.

## Workflow

### Step 1: Load Build Context

1. Read `.brokenigloo/build-context.md` if it exists — this contains stack decisions from `scaffold-project`
2. Read the project's `CLAUDE.md` if present for architecture and commands
3. If neither exists, interview the user:
   - "What are you building and what stack did you choose?"
   - "Is there an existing scaffolded project, or should we start from scratch?"
   - If starting from scratch, redirect to `scaffold-project` first

### Step 2: Break Into Milestones

Decompose the MVP into 3-5 milestones. Each milestone should be:
- **Self-contained**: produces a testable artifact
- **Incremental**: builds on the previous milestone
- **1-2 hours**: small enough to complete in a focused session

**Typical milestone breakdown for a Sui dApp:**

| Milestone | Deliverable | Verification |
|-----------|-------------|--------------|
| M1: Core Move module | Module compiles, unit tests pass | `sui move build` + `sui move test` |
| M2: Additional modules / PTB composition | Multi-module interactions work | Integration tests, PTB dry-run |
| M3: TypeScript SDK integration | Off-chain code talks to on-chain | End-to-end test on localnet/devnet |
| M4: Frontend wiring | UI renders, wallet connects, txns submit | Manual QA in browser |
| M5: Polish & edge cases | Error handling, loading states, validations | Full test suite green |

Present the milestone plan to the user and get confirmation before coding.

### Step 3: Execute Milestone (repeat for each)

For each milestone, follow this cycle:

**3a. Write Code**
- Write Move modules with `sui move build` to verify compilation after each file
- Write TypeScript with proper typing from `@mysten/sui`
- Use PTBs to compose multi-step transactions instead of multiple single calls
- Follow Sui patterns: objects over mappings, events for indexing, capability pattern for admin

**3b. Test**
- Move unit tests: `sui move test` — test every public function, test abort conditions
- Move integration tests: test multi-module interactions
- TypeScript tests: test SDK calls against devnet or localnet
- PTB tests: dry-run transactions with `sui client execute-combined-command --dry-run`

**3c. Review**
- Does the code compile and pass all tests?
- Are there any object ownership issues (shared vs owned)?
- Are events emitted for all state changes?
- Is error handling complete (proper abort codes)?

**3d. Checkpoint**
- Summarize what was built and tested
- Update `.brokenigloo/build-context.md` with milestone progress
- Ask: "Ready for the next milestone, or want to iterate on this one?"

### Step 4: Sui-Specific Build Patterns

Apply these patterns throughout implementation:

**Move Code**
- Use `sui move build` to compile — fix all errors before proceeding
- Use `sui move test` to run tests — aim for 100% coverage of public functions
- Use `sui move test --filter <test_name>` to run specific tests during iteration
- Structure modules: one module per concern, shared types in a `types` module

**Programmable Transaction Blocks (PTBs)**
- Compose multiple Move calls into a single transaction for atomicity
- Use PTBs to pass results between calls (e.g., mint coin then deposit into pool)
- Use `txb.moveCall()` in TypeScript SDK to build PTBs
- Prefer PTBs over custom Move wrapper functions for cross-protocol interactions

**TypeScript SDK (`@mysten/sui`)**
- Use `SuiClient` for RPC queries
- Use `Transaction` class for building PTBs
- Use `signAndExecuteTransaction` from dApp Kit for wallet signing
- Handle object version conflicts with retry logic

### Step 5: Update Build Context

After each milestone, update `.brokenigloo/build-context.md` with:

```markdown
## Milestone Progress

### M1: [Title] — COMPLETE
- What was built: [summary]
- Tests: [pass count] / [total count]
- Key decisions: [any architectural choices made]

### M2: [Title] — IN PROGRESS
- Current status: [what's done, what's left]
```

### Step 6: Handoff

When all milestones are complete:
- "Want a code review before deploying?" → route to `review-and-iterate`
- "Ready to deploy?" → route to `deploy-to-mainnet`
- "Need to add DeFi features?" → route to `build-defi-protocol`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions and any completed milestones. Read `CLAUDE.md` for project-level instructions. Never block on missing files — ask the user directly.

## Non-Negotiables

1. **Never write more than 1 milestone of code before testing**: Every milestone must compile (`sui move build`) and pass tests (`sui move test`) before moving on
2. **Milestone plan before code**: Always present the milestone breakdown and get user approval before writing any code
3. **Test every public function**: No untested public entry functions in Move modules
4. **PTBs for composition**: Use Programmable Transaction Blocks for multi-step operations, not custom Move wrappers
5. **Update build context**: Always write progress to `.brokenigloo/build-context.md` after each milestone
6. **Sui idioms**: Objects over tables/mappings, events for all state changes, capability pattern for admin, proper abort codes with named constants

## References

- `.brokenigloo/build-context.md` — stack decisions and milestone progress
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — protocol catalog for integrations
- `skills/build/scaffold-project/references/architecture-patterns.md` — common Sui app architectures

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
