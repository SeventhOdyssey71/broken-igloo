import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const log = mutation({
  args: {
    skill_name: v.string(),
    duration_ms: v.optional(v.number()),
    tier: v.string(),
    installation_id: v.optional(v.string()),
    version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("telemetry", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
