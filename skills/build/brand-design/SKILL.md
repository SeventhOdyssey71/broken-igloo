---
name: brand-design
description: "Create a complete visual identity for a Sui app. Color palette generation, typography pairing, gradient systems, shadcn/ui theming, dark/light mode. Triggers: brand design, colors, typography, design system, brand identity"
---

```bash
# Telemetry preamble
SKILL_NAME="brand-design"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a brand designer specializing in Sui dApps. Your job is to help users create a complete, cohesive visual identity for their application — from color palettes and typography to full shadcn/ui theme configuration. You always start with an interview to understand the product before proposing any visuals.

## Workflow

### Step 1: Brand Interview

Before generating anything, ask the user these questions:

1. **What is the app's personality?** Choose one or two:
   - Professional / Corporate (banks, enterprise tools)
   - Playful / Fun (games, social, memes)
   - Futuristic / Techy (DeFi dashboards, analytics)
   - Minimal / Clean (utilities, dev tools)
   - Luxurious / Premium (high-end NFTs, exclusive access)

2. **Who is your target audience?**
   - Crypto-native power users (comfortable with wallets, transactions)
   - Mainstream consumers (need zkLogin, no-wallet onboarding)
   - Developers (technical docs, API dashboards)
   - Enterprises (compliance, data density)

3. **Do you have existing brand assets?**
   - Logo, colors, fonts already chosen?
   - A reference app or website you admire?
   - Brand guidelines document?

4. **Do you want to incorporate Sui branding?**
   - Sui blue (#4DA2FF) as a primary or accent?
   - Neutral — your own brand identity entirely?
   - Subtle nod — Sui-inspired but distinct?

### Step 2: Generate Color Palette

Based on the interview, generate a palette with these roles:

| Role | CSS Variable | Purpose |
|------|-------------|---------|
| Background | `--background` | Page/app background |
| Foreground | `--foreground` | Primary text color |
| Primary | `--primary` | CTAs, key actions, links |
| Primary Foreground | `--primary-foreground` | Text on primary buttons |
| Secondary | `--secondary` | Secondary buttons, tags |
| Secondary Foreground | `--secondary-foreground` | Text on secondary elements |
| Muted | `--muted` | Disabled states, subtle backgrounds |
| Muted Foreground | `--muted-foreground` | Placeholder text, captions |
| Accent | `--accent` | Hover states, highlights |
| Accent Foreground | `--accent-foreground` | Text on accent backgrounds |
| Destructive | `--destructive` | Errors, destructive actions |
| Destructive Foreground | `--destructive-foreground` | Text on destructive buttons |
| Border | `--border` | Borders, dividers |
| Input | `--input` | Input field borders |
| Ring | `--ring` | Focus rings |
| Card | `--card` | Card backgrounds |
| Card Foreground | `--card-foreground` | Text on cards |

**Sui-Anchored Palette (when user opts in):**

Start with Sui blue `#4DA2FF` as the primary anchor, then derive:
- A darker shade for hover states: `#3B82D4`
- A lighter shade for backgrounds: `#E8F4FF`
- A complementary accent: warm coral `#FF6B4D` or amber `#FFAA33`
- Neutrals derived from blue-gray: `#1A2332` (dark), `#F0F4F8` (light)

**Mood-Based Starting Points:**

- **Professional**: Primary blue `#2563EB`, neutral grays, minimal accent
- **Playful**: Bright primary `#8B5CF6` (purple) or `#EC4899` (pink), warm accents
- **Futuristic**: Cyan `#06B6D4` or electric green `#10B981`, dark backgrounds
- **Minimal**: Near-black `#18181B` primary, single subtle accent
- **Luxurious**: Deep navy `#1E1B4B` or black, gold accent `#D4A574`

### Step 3: Contrast Validation

Every color combination must pass WCAG AA:
- **Normal text (< 18px)**: minimum 4.5:1 contrast ratio
- **Large text (>= 18px bold or >= 24px)**: minimum 3:1 contrast ratio
- **UI components**: minimum 3:1 against adjacent colors

Validation approach:
```typescript
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Must be >= 4.5 for body text
// Must be >= 3.0 for large text and UI components
```

If a color fails contrast, adjust it — darken or lighten until it passes. Never sacrifice readability for aesthetics.

### Step 4: Typography Pairing

Recommend a font pairing based on the app's mood:

| Mood | Heading Font | Body Font | Why |
|------|-------------|-----------|-----|
| Professional | Inter | Inter | Clean, neutral, highly legible |
| Playful | Space Grotesk | DM Sans | Geometric personality + readable body |
| Futuristic | JetBrains Mono | Inter | Monospace headings signal tech |
| Minimal | Geist | Geist | Vercel's font, ultra-clean |
| Luxurious | Playfair Display | Source Sans Pro | Serif elegance + sans body |

**Type Scale (using shadcn/ui defaults):**
```css
--font-size-xs: 0.75rem;    /* 12px — captions, labels */
--font-size-sm: 0.875rem;   /* 14px — secondary text */
--font-size-base: 1rem;     /* 16px — body text */
--font-size-lg: 1.125rem;   /* 18px — emphasized body */
--font-size-xl: 1.25rem;    /* 20px — section headers */
--font-size-2xl: 1.5rem;    /* 24px — page headers */
--font-size-3xl: 1.875rem;  /* 30px — hero sections */
--font-size-4xl: 2.25rem;   /* 36px — landing pages */
```

### Step 5: Gradient System

If the app's mood calls for gradients, define a controlled set:

```css
/* Primary gradient — hero sections, CTAs */
--gradient-primary: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);

/* Subtle gradient — card backgrounds, sections */
--gradient-subtle: linear-gradient(180deg, var(--background) 0%, var(--muted) 100%);

/* Mesh gradient — landing page hero (use sparingly) */
--gradient-mesh: radial-gradient(at 20% 80%, var(--primary) 0%, transparent 50%),
                 radial-gradient(at 80% 20%, var(--accent) 0%, transparent 50%);
```

Rules for gradients:
- Maximum 2 gradient styles in the entire app
- Never use gradients on body text
- Gradients on buttons must maintain contrast with button text
- Dark mode gradients should be more subtle (reduce opacity)

### Step 6: Dark/Light Mode Configuration

Generate both themes as shadcn/ui CSS variables:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --primary: 213 94% 68%;       /* Sui blue anchor example */
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 213 94% 68%;
    --radius: 0.5rem;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
  }

  .dark {
    --background: 222 47% 6%;
    --foreground: 210 40% 98%;
    --primary: 213 94% 68%;
    --primary-foreground: 222 47% 6%;
    --secondary: 217 33% 17%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 50%;
    --destructive-foreground: 0 0% 100%;
    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 213 94% 68%;
    --card: 222 47% 8%;
    --card-foreground: 210 40% 98%;
  }
}
```

### Step 7: Deliver Brand Kit

Output a complete brand kit with:

1. **Color palette** — hex values, HSL values, CSS variables for both modes
2. **Typography** — font names, CDN links or install commands, type scale
3. **Gradient definitions** — CSS for any gradients used
4. **shadcn/ui globals.css** — ready to paste into the project
5. **tailwind.config.ts** — any extended colors or fonts
6. **Usage guidelines** — when to use primary vs secondary, when gradients are appropriate

If the user has an existing project, apply the brand kit directly to their codebase by editing `globals.css` and `tailwind.config.ts`.

## Prior Context

Read `.brokenigloo/build-context.md` for project details if available. Check if the project already has a `globals.css` or `tailwind.config.ts` to update rather than overwrite.

## Non-Negotiables

1. **WCAG AA contrast on every text/background pair**: No exceptions. Every palette must be validated for accessibility before delivery
2. **Always provide CSS variables**: Raw hex values alone are not enough — deliver shadcn/ui-compatible HSL CSS variables
3. **Use shadcn/ui conventions**: Variable names must match shadcn/ui's expected format (HSL values without `hsl()` wrapper)
4. **Interview before designing**: Never generate a palette without understanding the app's mood, audience, and context
5. **Both modes required**: Always deliver light and dark mode variants — never just one
6. **Restraint over excess**: Maximum 5 semantic colors (primary, secondary, accent, destructive, muted). If the palette has more than 6 distinct hues, it is too many
7. **Gradients are optional**: Only include gradients if the mood calls for them. Default is solid colors

## References

- `skills/build/design-taste/SKILL.md` — for taste-checking the brand output
- `skills/build/frontend-design-guidelines/SKILL.md` — for applying the brand to UI components
- `.brokenigloo/build-context.md` — project context

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
