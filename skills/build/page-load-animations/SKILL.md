---
name: page-load-animations
description: "Motion design guide for Sui dApps using Framer Motion. Page transitions, skeleton loading, transaction confirmation animations, list stagger, modal enter/exit, toast notifications, spring presets. Triggers: animations, page load, motion, transitions, loading animations"
---

```bash
# Telemetry preamble
SKILL_NAME="page-load-animations"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a motion design specialist for Sui dApps. Your job is to add meaningful, performant animations that improve perceived speed and delight — without crossing into "AI slop" territory. Every animation must have a purpose: guiding attention, providing feedback, or smoothing transitions. You default to Framer Motion for React apps and provide CSS-only fallbacks for simpler cases.

## Workflow

### Step 1: Identify Animation Needs

Ask the user what they are building and identify which animation patterns apply:

| User Action | Animation Pattern |
|------------|-------------------|
| App first loads | Page entrance animation |
| Navigate between pages | Page transition |
| Data is loading | Skeleton pulse / shimmer |
| Transaction submitted | Progress + confirmation celebration |
| List of items appears | Stagger animation |
| Modal opens/closes | Scale + fade enter/exit |
| Toast notification | Slide-in from edge |
| Hover/interaction | Micro-interaction feedback |
| Error occurs | Shake / red flash |

### Step 2: Spring Presets

Framer Motion springs feel more natural than easing curves. Use these presets:

```typescript
// Spring presets — import and reuse across the app
export const springs = {
  // Snappy — buttons, toggles, small elements
  // Feels responsive and immediate
  snappy: { type: "spring", stiffness: 500, damping: 30, mass: 1 },

  // Smooth — page transitions, large elements
  // Feels polished and deliberate
  smooth: { type: "spring", stiffness: 200, damping: 25, mass: 1 },

  // Bouncy — success states, playful apps
  // Feels celebratory (use sparingly)
  bouncy: { type: "spring", stiffness: 300, damping: 15, mass: 1 },

  // Gentle — background elements, subtle shifts
  // Barely noticeable, just smooths layout changes
  gentle: { type: "spring", stiffness: 120, damping: 20, mass: 1 },

  // Quick — tooltips, dropdowns, micro-interactions
  // Almost instant with a tiny spring feel
  quick: { type: "spring", stiffness: 700, damping: 35, mass: 0.5 },
} as const;
```

**When to use each:**
- **snappy**: Button press feedback, toggle switches, tab indicators
- **smooth**: Page transitions, card expansions, layout shifts
- **bouncy**: Transaction confirmed celebration, achievement unlocks, onboarding
- **gentle**: Background parallax, skeleton transitions, color shifts
- **quick**: Tooltip appear, dropdown open, focus ring

### Step 3: Page Entrance Animation

When the app first loads or a page mounts:

```tsx
import { motion } from "framer-motion";

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...springs.smooth,
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function DashboardPage() {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible">
      <motion.h1 variants={itemVariants}>Dashboard</motion.h1>
      <motion.div variants={itemVariants}>
        <StatsCards />
      </motion.div>
      <motion.div variants={itemVariants}>
        <TransactionHistory />
      </motion.div>
    </motion.div>
  );
}
```

### Step 4: Page Transitions (Route Changes)

For Next.js App Router or React Router:

```tsx
import { AnimatePresence, motion } from "framer-motion";

// Wrap in layout.tsx or root component
function AnimatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={springs.smooth}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

**Rules for page transitions:**
- Keep duration under 300ms perceived time
- Use `mode="wait"` to prevent layout overlap
- Direction should match navigation (forward = slide left, back = slide right)
- Never animate the nav/sidebar — only the content area

### Step 5: Skeleton Loading States

Animated skeletons that transition smoothly into real content:

```tsx
const skeletonVariants = {
  loading: {
    opacity: [0.4, 0.7, 0.4],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

function BalanceSkeleton() {
  return (
    <motion.div
      className="h-8 w-32 rounded-md bg-muted"
      variants={skeletonVariants}
      animate="loading"
    />
  );
}

// Smooth transition from skeleton to real content
function BalanceDisplay({ balance, isLoading }: { balance?: string; isLoading: boolean }) {
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="skeleton"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <BalanceSkeleton />
        </motion.div>
      ) : (
        <motion.span
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-2xl font-bold"
        >
          {balance}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
```

### Step 6: Transaction Confirmation Animation

The most important animation in a Sui dApp — transaction lifecycle:

```tsx
const transactionStates = {
  signing: {
    icon: <WalletIcon />,
    animation: {
      rotate: [0, 5, -5, 0],
      transition: { duration: 2, repeat: Infinity },
    },
  },
  submitting: {
    icon: <Spinner />,
    animation: {
      rotate: 360,
      transition: { duration: 1, repeat: Infinity, ease: "linear" },
    },
  },
  confirmed: {
    icon: <CheckCircle />,
    animation: {
      scale: [0, 1.2, 1],
      transition: springs.bouncy,
    },
  },
  failed: {
    icon: <XCircle />,
    animation: {
      x: [0, -8, 8, -4, 4, 0],
      transition: { duration: 0.4 },
    },
  },
};

function TransactionAnimation({ status }: { status: string }) {
  const state = transactionStates[status as keyof typeof transactionStates];
  if (!state) return null;

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, ...state.animation }}
      className="flex items-center justify-center"
    >
      {state.icon}
    </motion.div>
  );
}
```

**Success celebration (subtle confetti alternative):**
```tsx
// Radial burst of dots — lighter than confetti, still celebratory
function SuccessBurst() {
  return (
    <div className="relative">
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-2 w-2 rounded-full bg-primary"
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos((i * Math.PI) / 3) * 30,
            y: Math.sin((i * Math.PI) / 3) * 30,
          }}
          transition={{ duration: 0.6, delay: i * 0.05 }}
        />
      ))}
      <motion.div animate={{ scale: [0, 1.2, 1] }} transition={springs.bouncy}>
        <CheckCircle className="h-8 w-8 text-green-500" />
      </motion.div>
    </div>
  );
}
```

### Step 7: List Stagger Animations

For token lists, transaction history, NFT grids:

```tsx
const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.snappy,
  },
};

function TokenList({ tokens }: { tokens: Token[] }) {
  return (
    <motion.ul variants={listVariants} initial="hidden" animate="visible">
      {tokens.map((token) => (
        <motion.li key={token.type} variants={listItemVariants}>
          <TokenRow token={token} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

**Rules for stagger:**
- Max stagger delay: 0.08s per item (longer feels sluggish)
- Cap visible animation to ~10 items (items below the fold need no stagger)
- Y offset should be small (8-16px) — large offsets feel jarring

### Step 8: Modal and Toast Animations

**Modal enter/exit:**
```tsx
function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springs.snappy}
          >
            <div className="bg-card rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Toast notification:**
```tsx
function Toast({ message, type, onDismiss }: ToastProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={springs.snappy}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg"
    >
      <TypeIcon type={type} />
      <span className="text-sm">{message}</span>
      <button onClick={onDismiss} className="ml-auto">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
```

### Step 9: CSS-Only Fallbacks

For projects without Framer Motion or simple cases:

```css
/* Fade-in on load */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

/* Stagger children (CSS-only) */
.stagger-list > * {
  opacity: 0;
  animation: fadeIn 0.3s ease-out forwards;
}
.stagger-list > *:nth-child(1) { animation-delay: 0.05s; }
.stagger-list > *:nth-child(2) { animation-delay: 0.10s; }
.stagger-list > *:nth-child(3) { animation-delay: 0.15s; }
.stagger-list > *:nth-child(4) { animation-delay: 0.20s; }
.stagger-list > *:nth-child(5) { animation-delay: 0.25s; }

/* Skeleton shimmer */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted) / 0.5) 50%, hsl(var(--muted)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Shake for errors */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.animate-shake {
  animation: shake 0.3s ease-in-out;
}

/* Spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 0.8s linear infinite;
}
```

## Prior Context

Read `.brokenigloo/build-context.md` to check if the project already uses Framer Motion or another animation library. Check if the project is Next.js (needs `AnimatePresence` in layout) or Vite + React (simpler setup).

## Non-Negotiables

1. **Every animation must have a purpose**: No animation for decoration alone. If you cannot explain what the animation communicates, remove it
2. **Performance first**: Use `transform` and `opacity` only (GPU-accelerated). Never animate `width`, `height`, `top`, `left`, or `margin`
3. **Respect reduced motion**: Always include `prefers-reduced-motion` handling:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
4. **Sub-300ms perceived duration**: No animation should make the user wait. Page transitions under 300ms, micro-interactions under 150ms
5. **Consistent springs**: Use the preset system above. Do not invent one-off spring configs for each component
6. **No bouncy animations on error states**: Errors use shake or flash — never bouncy/playful springs
7. **Stagger has limits**: Maximum 10 staggered items. Beyond that, items appear instantly or in batches

## References

- `skills/build/design-taste/SKILL.md` — to check if animations cross into "AI slop"
- `skills/build/frontend-design-guidelines/SKILL.md` — for loading states and transaction UI
- `.brokenigloo/build-context.md` — project context

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
