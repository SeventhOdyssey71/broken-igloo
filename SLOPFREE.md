# The Slopfree Workflow

A five-phase engineering workflow where humans own every decision and AI executes under constraint. The core invariant: **every line of shipped code has a human who chose it, read it, and can defend it.**

---

## Principles

1. **Human ownership is non-negotiable.** Every PR has a single human owner who has read the code in its entirety. No exceptions.
2. **Architecture before automation.** AI touches code only after a human has designed the structure and set the patterns.
3. **Small vertical slices over broad AI dumps.** A 200-line PR with clear scope beats a 2,000-line AI-generated sprawl.
4. **Decisions are written by decision-makers.** Cross-domain decisions require short written records authored by the person who made the call, never generated text.
5. **Knowing what to build is the skill.** Prompting is a commodity. System thinking, domain knowledge, and architectural judgment are what matter.

---

## The Five Phases

```
DESIGN ──gate──> SPEC ──gate──> IMPLEMENT ──gate──> REVIEW ──gate──> SHIP
  ^                                                                    |
  └────────────────── feedback loop ───────────────────────────────────┘
```

Each transition requires a **human gate** — an explicit sign-off that the prior phase is complete and correct.

---

### Phase 1: DESIGN (Human Only)

**Who:** Quality Lead + assigned engineer(s)
**AI allowed:** No. This is a human-only phase.

The quality lead who owns the architecture domain identifies the work, defines boundaries, and makes structural decisions. Output is an **Architecture Decision Record (ADR)** for any non-trivial change.

**Entry criteria:** A problem or feature request exists.
**Exit gate:** ADR is written, reviewed, and merged (for non-trivial changes). For trivial changes, a verbal or Slack-level agreement suffices, but the human owner is still identified.

**What happens here:**
- Quality lead identifies which patterns apply or need to be created
- Engineer and lead agree on the shape of the solution (not the implementation details)
- Cross-domain impacts are identified and owners are notified
- The decision-maker writes the ADR — not AI, not a junior, not "whoever has time"

---

### Phase 2: SPEC (Human-Authored, AI-Assisted Research)

**Who:** Assigned engineer (the future PR owner)
**AI allowed:** Research only. AI can answer questions about existing code, find examples, summarize docs. AI does not write the spec.

The engineer writes a short specification that captures what will change and how to verify it. This is the contract between "what we decided" (Phase 1) and "what we'll build" (Phase 3).

**Entry criteria:** ADR approved (or agreement reached for trivial changes).
**Exit gate:** Spec reviewed by at least one other engineer. For cross-domain specs, the relevant quality lead must sign off.

**What the spec contains:**
- What changes (files, APIs, data models)
- What doesn't change (explicit boundaries)
- How to verify (test plan — manual or automated)
- Estimated PR count and scope of each

---

### Phase 3: IMPLEMENT (AI-Assisted, Human-Directed)

**Who:** The PR owner (same engineer from Phase 2)
**AI allowed:** Yes — AI writes code, generates tests, suggests implementations. But the human directs every step.

This is where AI accelerates the work. The engineer uses AI tools to implement against the spec, but remains the author of record. "Author of record" means: you can explain every line, you chose the approach, and you'd catch a regression in review.

**Entry criteria:** Spec is approved.
**Exit gate:** PR is opened, self-reviewed by the owner, and all automated checks pass.

**Rules for AI-assisted implementation:**
- One vertical slice per PR. Each PR should be a coherent, independently deployable unit.
- PR owner must read every line before opening the PR. If you can't explain it, don't ship it.
- AI-generated code that doesn't match the spec or established patterns gets deleted, not patched.
- Target: PRs under 300 lines of meaningful change (excluding generated files, lock files, etc.)

---

### Phase 4: REVIEW (Human Only)

**Who:** At least one reviewer who is not the PR owner. For domain-crossing changes, the relevant quality lead.
**AI allowed:** AI can run automated checks (linting, type checking, test suites, security scans). AI does not approve PRs.

The reviewer's job is architectural alignment, not line-editing. AI already handled formatting and obvious bugs. The human reviewer checks:

**Entry criteria:** PR is opened with passing CI and a self-review by the owner.
**Exit gate:** Human approval from a qualified reviewer.

**The reviewer checks:**
1. Does this match the spec and ADR?
2. Does the PR owner clearly understand what this code does? (Ask them — if they can't explain a section, it goes back.)
3. Are there cross-domain side effects the spec didn't anticipate?
4. Is this the right size? Should it be split further?
5. Would the on-call engineer understand this at 2 AM?

**What the reviewer does NOT do:**
- Nitpick formatting (that's CI's job)
- Rewrite the code in comments (pair instead)
- Approve code they didn't read ("LGTM" with no comments on a 200-line PR is a red flag)

---

### Phase 5: SHIP (Human Decision)

**Who:** PR owner merges. Quality lead monitors.
**AI allowed:** Automated deployment pipelines, monitoring, alerting.

The PR owner merges and owns the change through its first production cycle. If it breaks, they're the first responder — not because of blame, but because they have the most context.

**Entry criteria:** Human approval received, CI green, no unresolved threads.
**Exit gate:** Change is live and stable through its first monitoring window.

**Post-ship:**
- PR owner monitors dashboards/alerts for the agreed window
- If issues arise, PR owner triages first
- Lessons learned feed back into Phase 1 (update patterns, ADRs, or quality lead guidance)

---

## The Gates — Summary

| Gate | From | To | Who Decides | Artifact |
|------|------|----|-------------|----------|
| G1 | Design | Spec | Quality Lead | ADR (or agreement) |
| G2 | Spec | Implement | Peer + Lead (if cross-domain) | Approved spec |
| G3 | Implement | Review | PR Owner (self-review) | Opened PR with green CI |
| G4 | Review | Ship | Reviewer(s) | PR approval |
| G5 | Ship | Done | PR Owner | Stable in production |

---

## When to Skip Phases

Not every change needs a full ADR and spec. Use judgment:

| Change Type | Start At | Example |
|------------|----------|---------|
| Typo / copy fix | Phase 3 (Implement) | Fix a string in the UI |
| Bug fix (isolated) | Phase 2 (Spec — write the test plan) | Fix an off-by-one error |
| New feature | Phase 1 (Design) | Add a new API endpoint |
| Cross-domain change | Phase 1 (Design) with multiple quality leads | Change the auth model |
| Refactor | Phase 1 (Design) | Restructure a module |

The rule: **if you're unsure whether to skip, don't skip.**

---

## Metrics That Matter

Track these. They tell you if the workflow is working or being gamed.

| Metric | Healthy Signal | Slop Signal |
|--------|---------------|-------------|
| PR size (lines changed) | Median under 300 | Median over 500 |
| Time from PR open to first human comment | Under 4 hours | Over 24 hours |
| Spec-to-PR ratio | ~1:1 to 1:3 | 1:10+ (spec is being ignored) |
| ADR frequency | Proportional to new patterns | Zero (decisions are informal) |
| Post-merge reverts | Rare | Frequent (review is rubber-stamping) |
| "Can you explain this?" failures in review | Rare | Frequent (owner didn't read the code) |
| On-call escalations from recent changes | Trending down | Trending up |
