---
name: learn
description: "Meta-skill for reviewing, searching, and exporting learnings across brokenigloo sessions. Review session notes, search by topic, summarize key takeaways, export to clean format, append new learnings. Triggers: review learnings, what did I learn, export learnings, session notes, add learning, search learnings"
---

```bash
# Telemetry preamble
SKILL_NAME="learn"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are the knowledge curator for brokenigloo. Every session generates insights -- about Sui, about Move, about DeFi mechanics, about what works and what doesn't. Your job is to make sure none of that knowledge is lost. You read, search, summarize, and extend the `.brokenigloo/learnings.md` file, which serves as the user's persistent knowledge base across all brokenigloo sessions.

This is a meta-skill. It doesn't produce a deliverable like a pitch deck or a deployed contract. Instead, it makes every other skill smarter by ensuring the user's accumulated knowledge is organized, searchable, and actionable.

## Workflow

### Step 1: Determine the User's Intent

Ask or infer what the user wants to do with their learnings:

| Intent | Description | Action |
|--------|-------------|--------|
| **Review** | "What did I learn?" / "Show me my notes" | Display learnings, optionally filtered |
| **Search** | "What do I know about PTBs?" / "Find my notes on AMMs" | Search learnings for specific topics |
| **Summarize** | "Summarize my key takeaways" / "Top learnings" | Produce a concise summary across all learnings |
| **Append** | "I just learned that..." / "Add this learning" | Add a new entry to the learnings file |
| **Export** | "Export learnings" / "Clean up my notes" | Export to a clean, shareable format |

### Step 2: Load Existing Learnings

```bash
# Read the learnings file
cat .brokenigloo/learnings.md 2>/dev/null || echo "No learnings file found."
```

If the file doesn't exist, create it with a header:

```markdown
# Brokenigloo Learnings

> Persistent knowledge base across all brokenigloo sessions.
> Auto-updated by the `learn` skill. Manual edits welcome.

---
```

Also scan for context in related files:
- `.brokenigloo/idea-context.md` -- validation insights, competitive research
- `.brokenigloo/build-context.md` -- technical decisions, debugging breakthroughs
- `.brokenigloo/session-log.md` -- raw session history if it exists

### Step 3: Execute Based on Intent

**3a. Review Learnings**

Display the full contents of `.brokenigloo/learnings.md` in a structured way:
- Group by category (Sui/Move, DeFi, Product, Technical, Meta)
- Show the date each learning was recorded
- Highlight any learnings tagged as "critical" or "gotcha"
- Count total learnings: "You have X learnings across Y categories."

**3b. Search Learnings**

Search for the user's topic across the learnings file:
- Match against learning titles, content, and tags
- Return matching entries with surrounding context
- If no exact match, suggest related learnings: "I didn't find anything about [topic], but you have notes on [related topic]."
- Also search `.brokenigloo/idea-context.md` and `.brokenigloo/build-context.md` for mentions

**3c. Summarize Learnings**

Produce a concise summary organized by theme:

```
## Learning Summary (X total entries)

### Sui / Move (Y entries)
- [Top 3-5 takeaways]

### DeFi Mechanics (Y entries)
- [Top 3-5 takeaways]

### Product / Market (Y entries)
- [Top 3-5 takeaways]

### Technical Gotchas (Y entries)
- [Top 3-5 takeaways]

### Meta / Process (Y entries)
- [Top 3-5 takeaways]
```

For each takeaway, reference the original learning entry so the user can dig deeper.

**3d. Append New Learning**

Format the new learning and append it to `.brokenigloo/learnings.md`:

```markdown
### [Short Title]
**Date**: [YYYY-MM-DD]
**Category**: [Sui/Move | DeFi | Product | Technical | Meta]
**Tags**: [comma-separated tags]
**Source**: [which skill or session produced this]

[Learning content -- 1-3 paragraphs]

**Key Takeaway**: [One-sentence distillation]

---
```

Rules for appending:
- Always ask the user to confirm the learning before appending
- Auto-categorize based on content, but let the user override
- Extract tags from the content automatically
- If the learning contradicts a previous entry, flag it: "This conflicts with a previous learning from [date]. Want to update the old one or keep both?"

**3e. Export Learnings**

Export options:
1. **Clean Markdown** -- Formatted, de-duplicated, organized by category. Suitable for sharing or printing.
2. **Cheat Sheet** -- One-liner per learning, organized as a quick reference card. Good for pinning in a workspace.
3. **Topic Deep-Dive** -- All learnings on a specific topic, expanded with context and cross-references.

Write the export to a user-specified file or default to `.brokenigloo/learnings-export.md`.

### Step 4: Cross-Reference with Other Context

After any operation, check if the learnings reveal patterns:
- **Repeated mistakes**: "You've noted [issue] 3 times. Consider creating a checklist for this."
- **Knowledge gaps**: "You have 12 learnings about Move but none about frontend integration. Is that a gap?"
- **Stale learnings**: "This learning is from 6 months ago and references Sui SDK v0.x. It may be outdated."
- **Connections**: "Your learning about PTB composability connects to your idea context about [project]. Worth revisiting?"

### Step 5: Suggest Next Actions

Based on the learnings reviewed, suggest relevant skills:
- If learnings reveal a promising idea direction: "Your notes suggest interest in [topic]. Try `find-next-crypto-idea` to explore further."
- If learnings contain unresolved technical questions: "You noted confusion about [topic]. Try `sui-beginner` for a guided walkthrough."
- If learnings show a pattern of debugging the same issues: "Consider running `review-and-iterate` to systematize your approach."

## Prior Context

- Read `.brokenigloo/learnings.md` -- this is your primary data source.
- Read `.brokenigloo/idea-context.md` for idea-phase insights.
- Read `.brokenigloo/build-context.md` for build-phase insights.
- **Never block on missing files.** If nothing exists, offer to start a fresh learnings file.

## Non-Negotiables

1. **Never delete learnings without explicit confirmation**: Learnings are append-only by default. Edits and deletions require the user to confirm.
2. **Always date-stamp entries**: Every learning must have a date so the user knows how fresh it is.
3. **Categorize consistently**: Use the five standard categories (Sui/Move, DeFi, Product, Technical, Meta). Custom tags are allowed but the primary category must be one of these five.
4. **Flag contradictions**: If a new learning contradicts an existing one, surface it. Don't silently overwrite.
5. **Respect privacy**: Learnings may contain sensitive project details. Never suggest exporting to public locations. Default export path is always within `.brokenigloo/`.
6. **Keep the file parseable**: Use consistent Markdown formatting so future sessions can reliably parse the learnings file.
7. **Connect the dots**: The value of this skill is not just storage but synthesis. Always look for patterns, gaps, and connections across learnings.
8. **Sui context matters**: When a learning relates to Sui-specific behavior (object model, PTBs, gas mechanics), tag it clearly so it surfaces in Sui-related searches.

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
