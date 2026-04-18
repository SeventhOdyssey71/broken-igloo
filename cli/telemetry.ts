// Privacy-first telemetry for brokenigloo
// Three tiers: off | anonymous | community
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { CONVEX_URL, VERSION } from "./branding.js";

const CONFIG_DIR = join(process.env.HOME || "~", ".brokenigloo");
const TIER_FILE = join(CONFIG_DIR, "telemetry-tier");
const JSONL_FILE = join(CONFIG_DIR, "telemetry.jsonl");
const INSTALL_ID_FILE = join(CONFIG_DIR, "installation-id");

export type TelemetryTier = "off" | "anonymous" | "community";

export function getTelemetryTier(): TelemetryTier {
  try {
    if (!existsSync(TIER_FILE)) return "off";
    const tier = readFileSync(TIER_FILE, "utf-8").trim();
    if (tier === "anonymous" || tier === "community") return tier;
    return "off";
  } catch {
    return "off";
  }
}

export function getInstallationId(): string | undefined {
  try {
    if (!existsSync(INSTALL_ID_FILE)) return undefined;
    return readFileSync(INSTALL_ID_FILE, "utf-8").trim();
  } catch {
    return undefined;
  }
}

export interface TelemetryEvent {
  skill_name: string;
  duration_ms?: number;
  tier: TelemetryTier;
  installation_id?: string;
  version: string;
  timestamp: number;
}

export function logEvent(event: Omit<TelemetryEvent, "tier" | "installation_id" | "version" | "timestamp">): void {
  const tier = getTelemetryTier();
  if (tier === "off") return;

  const fullEvent: TelemetryEvent = {
    ...event,
    tier,
    installation_id: tier === "community" ? getInstallationId() : undefined,
    version: VERSION,
    timestamp: Date.now(),
  };

  // Always log locally
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    appendFileSync(JSONL_FILE, JSON.stringify(fullEvent) + "\n");
  } catch {
    // Silently fail — telemetry should never break the CLI
  }

  // Fire-and-forget sync to Convex
  syncToConvex(fullEvent).catch(() => {});
}

async function syncToConvex(event: TelemetryEvent): Promise<void> {
  if (CONVEX_URL === "https://YOUR_DEPLOYMENT.convex.cloud") return;

  try {
    await fetch(`${CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "telemetry:log",
        args: {
          skill_name: event.skill_name,
          duration_ms: event.duration_ms,
          tier: event.tier,
          installation_id: event.installation_id,
          version: event.version,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silently fail
  }
}
