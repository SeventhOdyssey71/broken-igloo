---
name: build-dao
description: "Complete guide to building a DAO on Sui. Covers proposal creation, voting mechanisms (token-weighted, quadratic), proposal execution, treasury management, capability delegation, and governance UI. Triggers: dao, governance, voting, proposal, treasury, quadratic voting, token weighted, dao sui, on-chain governance"
---

```bash
# Telemetry preamble
SKILL_NAME="build-dao"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui DAO architect. Your job is to guide the user through building a decentralized autonomous organization on Sui using Move. Sui's object model makes DAOs more expressive than EVM DAOs: proposals are owned objects, voting power is tracked via `Balance<T>`, treasury is a shared object with capability-gated access, and execution uses the capability delegation pattern.

**Sui DAO architecture:**
- **DAO Object (shared)**: Global governance state — settings, treasury, active proposals
- **Proposal (shared)**: An individual proposal with description, votes, deadline, and execution payload
- **Vote Receipt (owned)**: Proof that a user voted — prevents double-voting and enables vote delegation
- **Treasury (dynamic field on DAO)**: Holds DAO funds, only accessible through passed proposals
- **GovernanceCap**: Capability for executing passed proposals — held by the DAO object itself

## Workflow

### Step 1: Design the Governance Model

| Model | Description | Best For |
|-------|-------------|----------|
| **Token-Weighted** | 1 token = 1 vote | Simple DAOs, protocol governance |
| **Quadratic** | vote_power = sqrt(tokens) | Fair community voting |
| **NFT-Based** | 1 NFT = 1 vote | Creator/community DAOs |
| **Multisig** | k-of-n signers | Treasury management, small teams |
| **Conviction** | Vote weight increases over time | Long-term alignment |

### Step 2: Implement the DAO Module

```move
module dao::governance {
    use std::string::String;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::sui::SUI;

    // === Error Codes ===
    const EProposalNotActive: u64 = 0;
    const EAlreadyVoted: u64 = 1;
    const EVotingPeriodEnded: u64 = 2;
    const EVotingPeriodNotEnded: u64 = 3;
    const EProposalNotPassed: u64 = 4;
    const EInsufficientTokens: u64 = 5;
    const EProposalAlreadyExecuted: u64 = 6;

    // === DAO Object ===
    public struct DAO has key {
        id: UID,
        name: String,
        /// Governance token type (for type-checking)
        /// Minimum tokens required to create a proposal
        proposal_threshold: u64,
        /// Minimum votes required for a proposal to pass
        quorum: u64,
        /// Voting period in milliseconds
        voting_period_ms: u64,
        /// Treasury balance
        treasury: Balance<SUI>,
        /// Total proposals created
        proposal_count: u64,
    }

    // === Proposal ===
    public struct Proposal has key {
        id: UID,
        dao_id: ID,
        proposer: address,
        title: String,
        description: String,
        /// Proposal type: 0=transfer, 1=parameter_change, 2=custom
        proposal_type: u8,
        /// For transfer proposals
        transfer_recipient: Option<address>,
        transfer_amount: Option<u64>,
        /// Voting state
        votes_for: u64,
        votes_against: u64,
        /// Voters table to prevent double-voting
        voters: Table<address, bool>,
        /// Timestamps
        created_at: u64,
        voting_ends_at: u64,
        /// Status: 0=active, 1=passed, 2=rejected, 3=executed
        status: u8,
    }

    // === Vote Receipt ===
    public struct VoteReceipt has key, store {
        id: UID,
        proposal_id: ID,
        voter: address,
        vote_power: u64,
        in_favor: bool,
    }

    // === Admin Cap ===
    public struct DAOAdminCap has key, store {
        id: UID,
        dao_id: ID,
    }

    // === Events ===
    public struct ProposalCreated has copy, drop {
        proposal_id: ID,
        dao_id: ID,
        proposer: address,
        title: String,
    }

    public struct VoteCast has copy, drop {
        proposal_id: ID,
        voter: address,
        in_favor: bool,
        vote_power: u64,
    }

    public struct ProposalExecuted has copy, drop {
        proposal_id: ID,
        proposal_type: u8,
    }

    // === Create DAO ===
    public fun create_dao(
        name: String,
        proposal_threshold: u64,
        quorum: u64,
        voting_period_ms: u64,
        ctx: &mut TxContext,
    ) {
        let dao = DAO {
            id: object::new(ctx),
            name,
            proposal_threshold,
            quorum,
            voting_period_ms,
            treasury: balance::zero(),
            proposal_count: 0,
        };

        let admin_cap = DAOAdminCap {
            id: object::new(ctx),
            dao_id: object::id(&dao),
        };

        transfer::share_object(dao);
        transfer::public_transfer(admin_cap, ctx.sender());
    }

    // === Fund Treasury ===
    entry fun fund_treasury(
        dao: &mut DAO,
        payment: Coin<SUI>,
    ) {
        let bal = coin::into_balance(payment);
        balance::join(&mut dao.treasury, bal);
    }

    // === Create Proposal ===
    entry fun create_proposal(
        dao: &mut DAO,
        title: String,
        description: String,
        proposal_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        dao.proposal_count = dao.proposal_count + 1;

        let now = clock::timestamp_ms(clock);

        let proposal = Proposal {
            id: object::new(ctx),
            dao_id: object::id(dao),
            proposer: ctx.sender(),
            title,
            description,
            proposal_type,
            transfer_recipient: option::none(),
            transfer_amount: option::none(),
            votes_for: 0,
            votes_against: 0,
            voters: table::new(ctx),
            created_at: now,
            voting_ends_at: now + dao.voting_period_ms,
            status: 0,
        };

        event::emit(ProposalCreated {
            proposal_id: object::id(&proposal),
            dao_id: object::id(dao),
            proposer: ctx.sender(),
            title: proposal.title,
        });

        transfer::share_object(proposal);
    }

    // === Cast Vote (Token-Weighted) ===
    /// Vote power equals the number of tokens staked in the vote
    entry fun cast_vote<GOV_TOKEN>(
        proposal: &mut Proposal,
        stake: &Coin<GOV_TOKEN>,
        in_favor: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(proposal.status == 0, EProposalNotActive);
        assert!(now < proposal.voting_ends_at, EVotingPeriodEnded);
        assert!(!table::contains(&proposal.voters, ctx.sender()), EAlreadyVoted);

        let vote_power = coin::value(stake);
        assert!(vote_power > 0, EInsufficientTokens);

        // Record vote
        if (in_favor) {
            proposal.votes_for = proposal.votes_for + vote_power;
        } else {
            proposal.votes_against = proposal.votes_against + vote_power;
        };

        table::add(&mut proposal.voters, ctx.sender(), in_favor);

        // Issue receipt
        let receipt = VoteReceipt {
            id: object::new(ctx),
            proposal_id: object::id(proposal),
            voter: ctx.sender(),
            vote_power,
            in_favor,
        };

        event::emit(VoteCast {
            proposal_id: object::id(proposal),
            voter: ctx.sender(),
            in_favor,
            vote_power,
        });

        transfer::public_transfer(receipt, ctx.sender());
    }

    // === Quadratic Voting Variant ===
    entry fun cast_vote_quadratic<GOV_TOKEN>(
        proposal: &mut Proposal,
        stake: &Coin<GOV_TOKEN>,
        in_favor: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(proposal.status == 0, EProposalNotActive);
        assert!(now < proposal.voting_ends_at, EVotingPeriodEnded);
        assert!(!table::contains(&proposal.voters, ctx.sender()), EAlreadyVoted);

        let tokens = coin::value(stake);
        // Quadratic: vote power = integer sqrt of tokens
        let vote_power = integer_sqrt(tokens);

        if (in_favor) {
            proposal.votes_for = proposal.votes_for + vote_power;
        } else {
            proposal.votes_against = proposal.votes_against + vote_power;
        };

        table::add(&mut proposal.voters, ctx.sender(), in_favor);

        let receipt = VoteReceipt {
            id: object::new(ctx),
            proposal_id: object::id(proposal),
            voter: ctx.sender(),
            vote_power,
            in_favor,
        };

        event::emit(VoteCast {
            proposal_id: object::id(proposal),
            voter: ctx.sender(),
            in_favor,
            vote_power,
        });

        transfer::public_transfer(receipt, ctx.sender());
    }

    // === Finalize Proposal ===
    entry fun finalize_proposal(
        dao: &DAO,
        proposal: &mut Proposal,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(proposal.status == 0, EProposalNotActive);
        assert!(now >= proposal.voting_ends_at, EVotingPeriodNotEnded);

        let total_votes = proposal.votes_for + proposal.votes_against;

        if (total_votes >= dao.quorum && proposal.votes_for > proposal.votes_against) {
            proposal.status = 1; // Passed
        } else {
            proposal.status = 2; // Rejected
        };
    }

    // === Execute Treasury Transfer ===
    entry fun execute_transfer(
        dao: &mut DAO,
        proposal: &mut Proposal,
        recipient: address,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(proposal.status == 1, EProposalNotPassed);
        assert!(proposal.proposal_type == 0, 100); // Must be transfer type

        proposal.status = 3; // Executed

        let payment = coin::from_balance(
            balance::split(&mut dao.treasury, amount),
            ctx,
        );
        transfer::public_transfer(payment, recipient);

        event::emit(ProposalExecuted {
            proposal_id: object::id(proposal),
            proposal_type: 0,
        });
    }

    // === Helpers ===
    fun integer_sqrt(n: u64): u64 {
        if (n == 0) return 0;
        let mut x = n;
        let mut y = (x + 1) / 2;
        while (y < x) {
            x = y;
            y = (x + n / x) / 2;
        };
        x
    }
}
```

### Step 3: TypeScript DAO Interface

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const PACKAGE_ID = "0x<YOUR_PACKAGE>";
const DAO_OBJECT_ID = "0x<YOUR_DAO>";
const GOV_TOKEN_TYPE = "0x<TOKEN_PACKAGE>::gov_token::GOV_TOKEN";

// Create a proposal
async function createProposal(
  keypair: any,
  title: string,
  description: string,
  proposalType: number,
) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::create_proposal`,
    arguments: [
      tx.object(DAO_OBJECT_ID),
      tx.pure.string(title),
      tx.pure.string(description),
      tx.pure.u8(proposalType),
      tx.object("0x6"), // Clock
    ],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true, showObjectChanges: true },
  });
}

// Cast a vote
async function castVote(
  keypair: any,
  proposalId: string,
  tokenCoinId: string,
  inFavor: boolean,
) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::cast_vote`,
    typeArguments: [GOV_TOKEN_TYPE],
    arguments: [
      tx.object(proposalId),
      tx.object(tokenCoinId),
      tx.pure.bool(inFavor),
      tx.object("0x6"), // Clock
    ],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
}

// Query active proposals
async function getActiveProposals() {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PACKAGE_ID}::governance::ProposalCreated`,
    },
    limit: 50,
  });

  return events.data.map((e) => e.parsedJson);
}
```

### Step 4: Handoff

- "I need multisig instead of DAO voting" -> route to `build-multisig`
- "I need a governance token" -> route to `launch-token`
- "Deploy my DAO" -> route to `deploy-to-mainnet`
- "Debug DAO logic" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Never block on missing files.

## Non-Negotiables

1. **Proposals must be shared objects** — all voters need access to the same proposal object.
2. **Prevent double-voting with a voter table** — use `Table<address, bool>` to track who has voted. Never rely on client-side checks.
3. **Use Clock for time-based deadlines** — never use epoch as a time proxy. `clock::timestamp_ms` gives real-time milliseconds.
4. **Emit events for every governance action** — proposal creation, votes, finalization, execution. The governance UI depends on events.
5. **Separate finalization from execution** — anyone can finalize (check if voting period ended and tally), but execution should have additional checks.
6. **Treasury operations must require a passed proposal** — never allow direct treasury access via AdminCap alone.
7. **Test quorum and threshold edge cases** — verify behavior at exactly quorum, one vote short, tie votes.
8. **Use Balance<T> inside shared DAO object** — never store `Coin<T>` directly in shared objects.

## References

- Sui Clock: https://docs.sui.io/guides/developer/sui-101/access-time
- Sui Object Model: https://docs.sui.io/concepts/object-model
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
