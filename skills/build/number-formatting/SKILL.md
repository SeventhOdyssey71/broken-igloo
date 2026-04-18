---
name: number-formatting
description: "Crypto-specific number formatting for Sui apps. MIST-to-SUI conversion, decimal handling, large number abbreviation, price formatting, balance display. Triggers: number formatting, format numbers, decimals, mist, display amounts"
---

```bash
# Telemetry preamble
SKILL_NAME="number-formatting"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a number formatting specialist for Sui applications. Crypto apps have unique display requirements: enormous integers representing tiny fractions, prices with many leading zeros, balances that span from dust to billions. Your job is to provide precise, copy-pasteable TypeScript formatting functions that handle every edge case correctly. SUI has 9 decimals (1 SUI = 1,000,000,000 MIST). Never let a user display raw MIST.

## Workflow

### Step 1: Identify the Formatting Need

Ask the user what they are displaying:
- **Token balance** (SUI, USDC, custom coins)
- **Token price** (USD value of a token)
- **Gas cost** (transaction fee in SUI)
- **Percentage** (APY, price change, allocation)
- **Large aggregate** (TVL, volume, market cap)
- **Input field** (user typing an amount)

### Step 2: Token Decimal Reference

| Token | Decimals | 1 Unit = | Raw to Display |
|-------|----------|----------|---------------|
| SUI | 9 | 1,000,000,000 MIST | Divide by 10^9 |
| USDC (Sui) | 6 | 1,000,000 units | Divide by 10^6 |
| USDT (Sui) | 6 | 1,000,000 units | Divide by 10^6 |
| wETH (Sui) | 8 | 100,000,000 units | Divide by 10^8 |
| wBTC (Sui) | 8 | 100,000,000 units | Divide by 10^8 |

**Always fetch decimals dynamically** from the coin metadata when available:
```typescript
import { SuiClient } from "@mysten/sui/client";

async function getCoinDecimals(client: SuiClient, coinType: string): Promise<number> {
  const metadata = await client.getCoinMetadata({ coinType });
  return metadata?.decimals ?? 9; // Default to 9 (SUI) if unknown
}
```

### Step 3: Core Formatting Functions

**MIST to SUI conversion:**
```typescript
const SUI_DECIMALS = 9;
const MIST_PER_SUI = BigInt(10 ** SUI_DECIMALS);

/**
 * Convert raw MIST (bigint or string) to a human-readable SUI string.
 * Never use floating-point arithmetic on raw token amounts.
 */
function mistToSui(mist: bigint | string): string {
  const raw = BigInt(mist);
  const whole = raw / MIST_PER_SUI;
  const fraction = raw % MIST_PER_SUI;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(SUI_DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}
```

**Generic token amount conversion:**
```typescript
function formatTokenAmount(
  rawAmount: bigint | string,
  decimals: number,
  options: {
    maxDecimalPlaces?: number;
    minDecimalPlaces?: number;
    compact?: boolean;
  } = {}
): string {
  const { maxDecimalPlaces = 4, minDecimalPlaces = 2, compact = false } = options;
  const raw = BigInt(rawAmount);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (compact && whole >= 1_000_000_000n) {
    return `${(Number(whole) / 1_000_000_000).toFixed(1)}B`;
  }
  if (compact && whole >= 1_000_000n) {
    return `${(Number(whole) / 1_000_000).toFixed(1)}M`;
  }
  if (compact && whole >= 1_000n) {
    return `${(Number(whole) / 1_000).toFixed(1)}K`;
  }

  const fractionStr = fraction.toString().padStart(decimals, "0");
  const trimmed = fractionStr.slice(0, maxDecimalPlaces);
  const padded = trimmed.padEnd(minDecimalPlaces, "0").replace(/0+$/, "");
  const finalFraction = padded.length < minDecimalPlaces
    ? padded.padEnd(minDecimalPlaces, "0")
    : padded;

  const wholeFormatted = whole.toLocaleString("en-US");
  return finalFraction ? `${wholeFormatted}.${finalFraction}` : wholeFormatted;
}
```

### Step 4: Display Scenarios

**Balance Display:**
```typescript
function formatBalance(mist: bigint | string, symbol = "SUI"): string {
  const raw = BigInt(mist);
  if (raw === 0n) return `0 ${symbol}`;

  // Dust amounts
  const minDisplay = BigInt(10 ** 7); // 0.01 SUI
  if (raw > 0n && raw < minDisplay) return `< 0.01 ${symbol}`;

  return `${formatTokenAmount(raw, 9, { maxDecimalPlaces: 4, minDecimalPlaces: 2 })} ${symbol}`;
}

// Examples:
// formatBalance(0n)                    => "0 SUI"
// formatBalance(500n)                  => "< 0.01 SUI"
// formatBalance(1_000_000_000n)        => "1.00 SUI"
// formatBalance(1_500_000n)            => "< 0.01 SUI"
// formatBalance(15_000_000n)           => "0.015 SUI"
// formatBalance(1_234_567_890_000n)    => "1,234.5678 SUI"
```

**Gas Cost Display:**
```typescript
function formatGasCost(mist: bigint | string): string {
  const raw = BigInt(mist);
  if (raw === 0n) return "Free";
  const sui = formatTokenAmount(raw, 9, { maxDecimalPlaces: 6, minDecimalPlaces: 4 });
  return `${sui} SUI`;
}

// Examples:
// formatGasCost(3_200_000n)   => "0.0032 SUI"
// formatGasCost(150_000n)     => "0.000150 SUI"
// formatGasCost(0n)           => "Free"
```

**Price Formatting (USD):**
```typescript
function formatUsdPrice(price: number): string {
  if (price === 0) return "$0.00";
  if (price >= 1) {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  }
  // For very small prices, show significant digits after leading zeros
  // e.g., $0.0001234 => $0.0001234
  const str = price.toFixed(10);
  const match = str.match(/^0\.(0*[1-9]\d{0,3})/);
  return match ? `$0.${match[1]}` : `$${price.toExponential(2)}`;
}

// Examples:
// formatUsdPrice(1234.56)    => "$1,234.56"
// formatUsdPrice(0.05)       => "$0.0500"
// formatUsdPrice(0.0001234)  => "$0.0001234"
// formatUsdPrice(0)          => "$0.00"
```

**Percentage Formatting:**
```typescript
function formatPercentage(value: number, options: { signed?: boolean } = {}): string {
  const { signed = false } = options;
  const formatted = Math.abs(value).toFixed(2);
  const prefix = signed && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatted}%`;
}

// Examples:
// formatPercentage(12.345)                => "12.35%"
// formatPercentage(-5.1, { signed: true }) => "-5.10%"
// formatPercentage(0.5, { signed: true })  => "+0.50%"
```

**Compact Notation for Dashboards:**
```typescript
function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

// Examples:
// formatCompact(1_234_567_890)  => "1.2B"
// formatCompact(3_456_789)      => "3.5M"
// formatCompact(12_345)         => "12.3K"
// formatCompact(42.5)           => "42.50"
```

### Step 5: Input Formatting

For amount input fields where users type values:

```typescript
/**
 * Sanitize user input for a token amount field.
 * Allows: digits, one decimal point, limits decimal places.
 */
function sanitizeAmountInput(input: string, maxDecimals = 9): string {
  // Remove everything except digits and dots
  let sanitized = input.replace(/[^\d.]/g, "");
  // Only allow one decimal point
  const parts = sanitized.split(".");
  if (parts.length > 2) {
    sanitized = `${parts[0]}.${parts.slice(1).join("")}`;
  }
  // Limit decimal places
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    sanitized = `${parts[0]}.${parts[1].slice(0, maxDecimals)}`;
  }
  return sanitized;
}

/**
 * Convert a user-entered SUI amount to MIST for transaction building.
 */
function suiToMist(suiAmount: string): bigint {
  const parts = suiAmount.split(".");
  const whole = BigInt(parts[0] || "0") * MIST_PER_SUI;
  if (!parts[1]) return whole;
  const fractionStr = parts[1].padEnd(SUI_DECIMALS, "0").slice(0, SUI_DECIMALS);
  return whole + BigInt(fractionStr);
}
```

### Step 6: Integration Helpers

**React hook for formatted balance:**
```typescript
import { useSuiClientQuery } from "@mysten/dapp-kit";

function useFormattedBalance(address: string | undefined) {
  const { data, isLoading, error } = useSuiClientQuery("getBalance", {
    owner: address!,
  }, { enabled: !!address });

  const formatted = data
    ? formatBalance(BigInt(data.totalBalance))
    : undefined;

  return { formatted, raw: data?.totalBalance, isLoading, error };
}
```

## Prior Context

Read `.brokenigloo/build-context.md` for which tokens the app handles. Check if custom coin types are involved that need specific decimal handling.

## Non-Negotiables

1. **Never use floating-point for raw token amounts**: Always use `BigInt` for on-chain values. Floating-point precision loss causes real financial bugs
2. **Never display raw MIST/units to users**: Always convert using the correct number of decimals for the token
3. **Fetch decimals dynamically when possible**: Do not hardcode decimals for arbitrary coins — only hardcode for well-known tokens (SUI, USDC)
4. **Handle zero and dust amounts**: Zero should display as "0", and amounts too small to display should show "< 0.01" rather than "0.00"
5. **Locale-aware thousand separators**: Use `toLocaleString("en-US")` or equivalent for whole number portions
6. **Input sanitization is mandatory**: Any field where users type token amounts must be sanitized to prevent invalid inputs

## References

- `skills/build/frontend-design-guidelines/SKILL.md` — for displaying amounts in UI components
- `skills/data/sui-knowledge/04-protocols-and-sdks.md` — for protocol-specific token types
- `.brokenigloo/build-context.md` — project context

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
