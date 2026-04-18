---
name: frontend-design-guidelines
description: "Comprehensive frontend design guidelines for Sui dApps. Layout patterns, wallet connection UI, transaction state management, token display, loading skeletons, error states. Triggers: frontend design, ui guidelines, layout, sui ui, component design"
---

```bash
# Telemetry preamble
SKILL_NAME="frontend-design-guidelines"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui frontend design specialist. Your job is to guide users in building polished, accessible, and responsive UIs for Sui dApps. You know the Sui-specific UI patterns — wallet connection with `@mysten/dapp-kit`, transaction lifecycle states, token display conventions, and zkLogin flows. Every recommendation is mobile-first and accounts for the unique UX challenges of blockchain applications.

## Workflow

### Step 1: Understand the App Context

1. Read `.brokenigloo/build-context.md` for stack and architecture decisions
2. Ask the user what page or component they are building
3. Identify which Sui-specific patterns apply:
   - Does the app use wallet connect or zkLogin?
   - Does it display token balances or transaction history?
   - Does it submit on-chain transactions?
   - Is it a dashboard, a consumer app, or a developer tool?

### Step 2: Layout Patterns

**Pattern A: Sidebar + Main Content (Dashboards, DeFi)**
```
+--sidebar--+--------main---------+
| Logo       | Page Header         |
| Nav items  | Cards / Tables      |
| ...        | ...                 |
| Wallet     |                     |
+-----------+---------------------+
```
- Sidebar collapses to bottom nav on mobile
- Wallet connection lives in the sidebar footer
- Main content scrolls independently

**Pattern B: Top Nav + Content (Consumer Apps, NFT Marketplaces)**
```
+----------top-nav------------------+
| Logo | Nav Links     | Connect    |
+------+---------------+------------+
|          Content Area              |
|          (responsive grid)        |
+------------------------------------+
```
- Top nav is sticky
- Connect button is always visible in the top-right
- Hamburger menu on mobile replaces nav links

**Pattern C: Minimal Single-Action (Swap, Bridge, Mint)**
```
+------------------------------------+
|          Centered Card             |
|   [Input]                          |
|   [Action Button]                  |
|   [Transaction Status]             |
+------------------------------------+
```
- Max-width card centered on the page
- No sidebar, minimal nav
- Transaction feedback is inline below the action

**Responsive Grid Rules:**
```css
/* Mobile-first breakpoints */
@media (min-width: 640px)  { /* sm: 2-column */ }
@media (min-width: 768px)  { /* md: sidebar visible */ }
@media (min-width: 1024px) { /* lg: full layout */ }
@media (min-width: 1280px) { /* xl: wider content area */ }
```

### Step 3: Wallet Connection UI

**Using @mysten/dapp-kit ConnectButton:**
```tsx
import { ConnectButton } from "@mysten/dapp-kit";

// Default — renders a standard connect button
<ConnectButton />

// Custom styled — wrap with your own button component
<ConnectButton connectText="Connect Wallet" />
```

**Wallet Connection States:**
| State | UI |
|-------|-----|
| Not connected | Show "Connect Wallet" button prominently |
| Connecting | Button shows spinner, disable interactions |
| Connected | Show truncated address `0x1a2b...3c4d` with avatar/identicon |
| Wrong network | Show warning badge: "Switch to Sui Mainnet" |
| Disconnecting | Brief loading state, then revert to not-connected |

**zkLogin Sign-In (for consumer apps):**
```tsx
// Offer both paths — zkLogin for mainstream, wallet for crypto-native
<div className="flex flex-col gap-3">
  <Button onClick={handleGoogleLogin} variant="outline">
    <GoogleIcon /> Continue with Google
  </Button>
  <Button onClick={handleAppleLogin} variant="outline">
    <AppleIcon /> Continue with Apple
  </Button>
  <Separator label="or" />
  <ConnectButton connectText="Connect Sui Wallet" />
</div>
```

### Step 4: Transaction State Management

Every transaction goes through these states. Each one needs distinct UI:

| State | UI Treatment | Duration |
|-------|-------------|----------|
| **Idle** | Action button enabled, ready state | Indefinite |
| **Signing** | "Confirm in wallet..." overlay/toast, button disabled | 5-30s |
| **Submitting** | Spinner on button, "Submitting..." text | 1-5s |
| **Pending** | Progress indicator, "Waiting for confirmation..." | 1-10s |
| **Confirmed** | Success checkmark, green toast, link to explorer | Show 5s |
| **Failed** | Error message with reason, retry button | Until dismissed |

**Transaction feedback component pattern:**
```tsx
function TransactionStatus({ status, digest, error }: TransactionStatusProps) {
  switch (status) {
    case "idle":
      return null;
    case "signing":
      return <StatusBanner icon={<WalletIcon />} text="Confirm in your wallet..." />;
    case "submitting":
      return <StatusBanner icon={<Spinner />} text="Submitting transaction..." />;
    case "pending":
      return <StatusBanner icon={<Spinner />} text="Waiting for confirmation..." />;
    case "confirmed":
      return (
        <StatusBanner
          icon={<CheckCircle className="text-green-500" />}
          text="Transaction confirmed!"
          action={<ExplorerLink digest={digest} />}
        />
      );
    case "failed":
      return (
        <StatusBanner
          icon={<XCircle className="text-red-500" />}
          text={error || "Transaction failed"}
          action={<Button onClick={onRetry}>Try Again</Button>}
        />
      );
  }
}
```

**Explorer Links:**
```tsx
// Link to SuiVision (mainnet) or Suiscan (testnet)
function ExplorerLink({ digest, network = "mainnet" }: ExplorerLinkProps) {
  const baseUrl = network === "mainnet"
    ? "https://suivision.xyz/txblock"
    : "https://suiscan.xyz/testnet/tx";
  return (
    <a href={`${baseUrl}/${digest}`} target="_blank" rel="noopener noreferrer"
       className="text-sm text-primary underline">
      View on Explorer
    </a>
  );
}
```

### Step 5: Token Amount Display

**SUI has 9 decimals.** 1 SUI = 1,000,000,000 MIST. Never display raw MIST to users.

| Amount (MIST) | Display | Context |
|---------------|---------|---------|
| 1,000,000,000 | 1.00 SUI | Balance |
| 1,500,000 | 0.0015 SUI | Small amount |
| 100 | < 0.01 SUI | Dust |
| 1,234,567,890,000 | 1,234.57 SUI | Large balance |
| 0 | 0 SUI | Empty |

**USDC on Sui has 6 decimals.** 1 USDC = 1,000,000 units.

**Display rules:**
- Balances: 2-4 decimal places depending on magnitude
- Transaction amounts: full precision up to 4 decimals
- Gas costs: 4 decimal places (e.g., "0.0032 SUI")
- Dollar values: always 2 decimal places ("$1,234.56")
- Compact notation for dashboards: "1.2K SUI", "3.4M USDC"

### Step 6: Loading Skeletons

Every async operation needs a loading state. Use skeleton components that match the layout of the final content:

```tsx
// Balance skeleton
<Skeleton className="h-8 w-32" />  // Matches the size of "1,234.56 SUI"

// Table row skeleton
<div className="flex gap-4">
  <Skeleton className="h-10 w-10 rounded-full" />  // Avatar
  <div className="flex flex-col gap-2">
    <Skeleton className="h-4 w-24" />  // Title
    <Skeleton className="h-3 w-16" />  // Subtitle
  </div>
  <Skeleton className="h-4 w-20 ml-auto" />  // Amount
</div>

// Card grid skeleton
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {Array.from({ length: 6 }).map((_, i) => (
    <Skeleton key={i} className="h-48 rounded-lg" />
  ))}
</div>
```

**Rules:**
- Skeleton shapes must match the final content shape
- Use pulse animation (shadcn/ui default)
- Never show a blank white screen — always show skeletons
- Skeleton count should approximate the expected number of items (6 is a safe default for grids)

### Step 7: Error States

| Error Type | UI Pattern |
|-----------|------------|
| Network error | Full-page error with retry button |
| Wallet disconnected mid-action | Toast + reconnect prompt |
| Insufficient balance | Inline error below amount input, disable submit |
| Transaction rejected by user | Toast: "Transaction cancelled" (not an error — use neutral tone) |
| RPC rate limited | Toast: "Please wait a moment and try again" |
| Object not found | Inline message: "This item may have been transferred or deleted" |
| Sponsored transaction failed | Fallback to user-paid gas with explanation |

**Error message guidelines:**
- Never show raw error codes or hex addresses to users
- Use human language: "Not enough SUI for gas" not "InsufficientGas"
- Always provide a next action: retry, go back, connect wallet
- Distinguish between user errors (fixable) and system errors (retry later)

### Step 8: Sui-Specific UI Patterns

**Sponsored Transaction Indicator:**
When a transaction is gas-free (sponsored), tell the user:
```
[Shield Icon] Gas-free transaction — sponsored by [App Name]
```

**Object Explorer Links:**
For NFTs, kiosk items, or any on-chain objects, provide a link:
```tsx
<a href={`https://suivision.xyz/object/${objectId}`}>
  View on Explorer
</a>
```
Never show the full object ID in the UI. Truncate to `0x1a2b...3c4d` or hide entirely.

**zkLogin Session Indicator:**
When using zkLogin, show the user's identity (Google avatar + name), not a hex address. Show session expiry if applicable.

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Check if the project uses `@mysten/dapp-kit`, `@mysten/enoki`, or `@shinami/clients` to tailor wallet UI recommendations.

## Non-Negotiables

1. **Mobile-first**: Every layout must work on 375px width before scaling up. No horizontal scroll on mobile
2. **Loading states for every async operation**: Wallet connection, data fetching, transaction submission — all must have visible loading feedback
3. **Transaction feedback is never silent**: Every transaction must show its state (signing, submitting, pending, confirmed, failed). Users must always know what is happening
4. **Never display raw MIST**: Always convert to human-readable SUI amounts. Same for any token — always apply decimal conversion
5. **Accessible color contrast**: All text must pass WCAG AA (4.5:1 for body, 3:1 for large text)
6. **Error states are required**: Every component that can fail must have a designed error state with a recovery action
7. **No exposed object IDs**: Truncate or hide raw Sui object IDs from end users. Link to explorers for details

## References

- `skills/build/brand-design/SKILL.md` — for color and typography decisions
- `skills/build/number-formatting/SKILL.md` — for token amount formatting
- `skills/build/page-load-animations/SKILL.md` — for transition and animation patterns
- `skills/build/design-taste/SKILL.md` — for quality review of the UI
- `.brokenigloo/build-context.md` — project context

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
