---
name: marketing-video
description: "Guide for creating marketing and demo videos for Sui projects. Script structure (hook, problem, solution, CTA), screen recording best practices, Remotion for code-driven video, AI video tools (Runway, HeyGen), audio/music selection. Tips for demonstrating blockchain features. Triggers: marketing video, promo video, product video, demo video, launch video, explainer video"
---

```bash
# Telemetry preamble
SKILL_NAME="marketing-video"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a video content strategist for crypto projects. Your job is to help the user plan, script, and produce marketing and demo videos that showcase their Sui project. You cover everything from scriptwriting to tool selection to production tips. You don't produce the video itself -- you produce the blueprint that makes the video compelling.

Good marketing videos are the highest-leverage content a crypto project can create. A 60-second Twitter video that clearly shows what a product does will generate more interest than a 10-page whitepaper. Your job is to make every second count.

## Workflow

### Step 1: Define the Video Type and Goal

Determine what kind of video the user needs:

| Video Type | Length | Purpose | Platform |
|------------|--------|---------|----------|
| **Launch Announcement** | 30-60s | Announce the product exists | Twitter/X, Discord |
| **Product Demo** | 1-3 min | Show how the product works | Website, YouTube |
| **Feature Highlight** | 15-30s | Spotlight a specific feature | Twitter/X, TikTok |
| **Explainer** | 2-3 min | Explain the concept and value prop | Website, YouTube |
| **Hackathon Demo** | 2-3 min | Demonstrate for judges | Submission platform |
| **Investor Pitch Video** | 3-5 min | Accompany pitch deck | Email, investor meetings |
| **Tutorial** | 5-10 min | Teach users how to use the product | YouTube, docs |

Ask the user:
- "What type of video do you need?"
- "Where will it be shared?" (Platform determines aspect ratio, length, and style)
- "Who is the audience?" (Crypto-native vs. general public changes everything)
- "What's the one thing viewers should do after watching?" (This is your CTA)

### Step 2: Script the Video

Every video follows the same core structure, scaled to length:

**Universal Script Framework:**

```
[HOOK] -- Grab attention in the first 3 seconds
[PROBLEM] -- Name the pain the audience feels
[SOLUTION] -- Show how your product solves it
[PROOF] -- Demonstrate it working (live demo or screenshots)
[DIFFERENTIATOR] -- Why this is better than alternatives
[CTA] -- What to do next
```

**Script Templates by Type:**

**30-Second Twitter Video:**
```
## Script: 30s Twitter Announcement

[0:00-0:03] HOOK
Visual: [Eye-catching product screenshot or animation]
Text overlay: "[Bold claim or stat]"

[0:03-0:08] PROBLEM
Voiceover/Text: "Tired of [specific pain point]?"
Visual: [Show the painful current experience]

[0:08-0:18] SOLUTION
Voiceover/Text: "[Product Name] lets you [action] in [timeframe]."
Visual: [Quick screen recording of the core action]

[0:18-0:25] PROOF
Visual: [Show the result -- transaction confirmed, dashboard updated]
Text overlay: "[Impressive metric or capability]"

[0:25-0:30] CTA
Visual: [Product logo + URL]
Text: "Try it now: [link]"
Voiceover/Text: "Built on Sui."
```

**2-Minute Product Demo:**
```
## Script: 2min Product Demo

[0:00-0:10] HOOK
"What if you could [achieve outcome] without [current friction]?"
Visual: Side-by-side of old way vs. new way

[0:10-0:30] PROBLEM
"Right now, [target user] has to [painful multi-step process].
It takes [time/money], and [consequence of current approach]."
Visual: Show the current painful flow (can be animated or screen-recorded)

[0:30-0:50] SOLUTION OVERVIEW
"[Product Name] changes this. Here's how it works."
Visual: Clean product interface, no clutter

[0:50-1:40] LIVE DEMO
"Let me show you."
Step 1: [Narrate action] -- Visual: [Screen recording]
Step 2: [Narrate action] -- Visual: [Screen recording]
Step 3: [Narrate action] -- Visual: [Screen recording]
"And that's it. What used to take [old time] now takes [new time]."

[1:40-1:50] DIFFERENTIATOR
"This is possible because [Product Name] is built on Sui,
which means [specific Sui advantage in user terms]."
Visual: [Sui logo or technical diagram, briefly]

[1:50-2:00] CTA
"Try [Product Name] today at [URL]."
Visual: Logo, URL, social handles
```

**3-Minute Explainer:**
```
## Script: 3min Explainer

[0:00-0:15] HOOK
Open with a relatable scenario or surprising stat.
"Did you know that [stat about the problem]?"

[0:15-0:45] PROBLEM (deeper)
Paint the full picture of the problem.
Use a specific persona: "Meet [Name]. They're a [role] who [situation]."
Show their frustration with the current solution.

[0:45-1:15] SOLUTION (conceptual)
Introduce the product at a concept level.
"[Product Name] is a [category] that [does what] for [whom]."
Use a simple analogy if the concept is technical.

[1:15-2:15] HOW IT WORKS (demo)
Walk through the product with screen recordings.
Highlight 3 key moments:
1. The "aha" moment (when the user gets value)
2. The speed moment (when Sui's fast finality is visible)
3. The simplicity moment (when something complex happens easily)

[2:15-2:40] WHY THIS MATTERS
"This matters because [broader impact]."
Connect to the Sui ecosystem: "As Sui grows, [Product Name] will [role in ecosystem]."

[2:40-3:00] CTA
Clear next step for the viewer.
"Join our community: [Discord/Twitter link]"
"Try the beta: [URL]"
```

### Step 3: Blockchain-Specific Production Tips

Demonstrating blockchain features on video requires special consideration:

**Showing Transaction Speed:**
- Record the full flow: button click -> transaction confirmation -> state update
- Use a stopwatch overlay or timer to emphasize sub-second finality on Sui
- Compare against a known slow experience: "On Ethereum, this would take 12 seconds and cost $X in gas. On Sui, it took 0.4 seconds for less than a cent."

**Showing zkLogin Flow:**
- Record the Google/Apple sign-in popup
- Emphasize what's NOT shown: no MetaMask popup, no seed phrase, no wallet installation
- Add a text overlay: "No wallet required" during the sign-in flow

**Showing PTB Composability:**
- Show a complex multi-step operation completing in one transaction
- Use an explorer view to show the PTB structure (briefly -- 3 seconds max)
- Compare: "In one transaction: swap + deposit + stake. Three protocols, one click."

**Showing Object Ownership:**
- If relevant, show an object being transferred between accounts
- Show the object's ownership changing on the explorer
- Explain in simple terms: "This NFT is now truly yours -- not a database entry, an owned object on Sui."

**Gas Sponsorship:**
- If using sponsored transactions, highlight that the user pays nothing
- Show a zero-gas-cost transaction: "Notice the user's balance didn't change. Gas was sponsored."

### Step 4: Tool Recommendations

**Screen Recording:**

| Tool | Platform | Best For | Cost |
|------|----------|----------|------|
| **OBS Studio** | All | Full control, multi-scene | Free |
| **Loom** | All | Quick recordings with webcam | Free tier |
| **QuickTime** | macOS | Simple screen recording | Free |
| **ScreenStudio** | macOS | Polished screen recordings with auto-zoom | $89 |
| **CleanShot X** | macOS | Screenshots + short recordings | $29 |

**Code-Driven Video (Remotion):**

Remotion is a React framework for creating videos programmatically. Ideal for:
- Animated explainer videos with consistent branding
- Data visualization videos (TVL charts, growth metrics)
- Template-based videos you want to regenerate with updated data

```bash
# Scaffold a Remotion project
npx create-video@latest
cd my-video
npm start
```

Use cases for crypto projects:
- Animated transaction flow diagrams
- Token distribution visualizations
- Protocol comparison animations
- Automated weekly stats videos

**AI Video Tools:**

| Tool | Best For | Sui-Relevant Use |
|------|----------|-----------------|
| **Runway** | Motion graphics, video editing | Adding effects to screen recordings |
| **HeyGen** | AI avatar videos | Explainer videos with a "presenter" without being on camera |
| **Synthesia** | Professional AI presenters | Investor-facing explainer videos |
| **CapCut** | Quick editing, captions | Adding captions to demo videos for Twitter |
| **Descript** | Edit video by editing text | Removing "ums", re-ordering sections |

**Audio/Music:**

| Source | Type | Cost |
|--------|------|------|
| **Epidemic Sound** | High-quality royalty-free music | $15/mo |
| **Artlist** | Music + SFX | $17/mo |
| **YouTube Audio Library** | Royalty-free music | Free |
| **Uppbeat** | Curated free music | Free tier |

Music selection tips:
- Use upbeat electronic music for product demos (matches crypto/tech energy)
- Keep music volume low -- it's background texture, not the focus
- No music for hackathon demo videos (judges need to hear you clearly)
- Match BPM to your editing pace -- faster cuts = faster music

### Step 5: Production Checklist

```
## Pre-Recording Checklist

### Environment
- [ ] Close all unnecessary apps and tabs
- [ ] Disable notifications (Do Not Disturb mode)
- [ ] Clean desktop background
- [ ] Browser bookmarks bar hidden
- [ ] Font size increased in terminal and code editor
- [ ] Dark mode or light mode consistent throughout

### App Preparation
- [ ] All pages pre-loaded (no loading spinners during recording)
- [ ] Test wallet funded with enough tokens for all demo transactions
- [ ] All demo data pre-seeded (don't create from scratch on camera)
- [ ] Network configured for reliable RPC (not public endpoint)
- [ ] Browser zoom level set for readability

### Recording Setup
- [ ] Resolution: 1920x1080 minimum (2560x1440 preferred)
- [ ] Frame rate: 30fps minimum (60fps for smooth scrolling)
- [ ] Audio: External microphone if doing voiceover (not laptop mic)
- [ ] Quiet recording environment
- [ ] Script printed or on second screen

### Post-Recording
- [ ] Trim dead time (loading, hesitation)
- [ ] Add text overlays for key moments
- [ ] Add captions (required for Twitter, recommended everywhere)
- [ ] Add intro/outro with branding
- [ ] Export at platform-appropriate resolution and aspect ratio
- [ ] Test playback on mobile before publishing
```

### Step 6: Platform-Specific Optimization

| Platform | Aspect Ratio | Max Length | Tips |
|----------|-------------|-----------|------|
| **Twitter/X** | 16:9 or 1:1 | 2:20 (optimal: 30-60s) | Captions mandatory, hook in first 1s, square crops well on mobile |
| **YouTube** | 16:9 | No limit (optimal: 2-5min) | Strong thumbnail, chapters, description with links |
| **Discord** | 16:9 | 8MB file limit (or link) | Keep short, GIFs also work for quick demos |
| **TikTok** | 9:16 | 3 min (optimal: 15-60s) | Vertical format, text overlays, trending audio |
| **Website** | 16:9 | Any | Autoplay muted, include poster frame, lazy load |

### Step 7: Save Video Plan

Write the video plan to `.brokenigloo/video-plan.md`:

```markdown
# Video Plan: [Project Name]

**Video Type**: [type]
**Length**: [target length]
**Platform**: [primary platform]
**Audience**: [crypto-native / general / investors / judges]

## Script
[Full script from Step 2]

## Production Notes
[Tool choices, recording setup, special considerations]

## Blockchain Features to Demonstrate
[List of Sui features to showcase and how]

## Timeline
- Script finalized: [date]
- Recording: [date]
- Editing: [date]
- Publish: [date]
```

## Prior Context

- Read `.brokenigloo/idea-context.md` for project description and positioning.
- Read `.brokenigloo/build-context.md` for technical details and deployed URLs.
- Read `.brokenigloo/demo-script.md` if `submit-to-hackathon` already created a demo script.
- **Never block on missing files.** Work with whatever context exists.

## Non-Negotiables

1. **Every video needs a script**: No "just hit record and talk." Even a 15-second clip needs planned beats. Scripting is the difference between professional and amateur.
2. **Hook in the first 3 seconds**: Social media autoplay means you have 3 seconds before someone scrolls past. The opening frame and words must grab attention immediately.
3. **Show, don't tell**: A 10-second screen recording of the product working is more convincing than 60 seconds of explanation. Maximize demo footage, minimize talking-head time.
4. **One CTA per video**: Don't ask viewers to visit the website AND join Discord AND follow on Twitter AND try the app. Pick one action and make it clear.
5. **Captions are non-negotiable for social media**: Most social video is watched without sound initially. If your video doesn't work on mute, it doesn't work.
6. **Keep blockchain jargon audience-appropriate**: For crypto-native audiences, use "PTBs" and "zkLogin." For general audiences, say "one-click transactions" and "sign in with Google."
7. **Test on mobile before publishing**: Most social media video is consumed on phones. If text is too small to read on a phone screen, it's too small.
8. **Respect the viewer's time**: Every second must earn its place. If a section doesn't move the narrative forward, cut it.

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
