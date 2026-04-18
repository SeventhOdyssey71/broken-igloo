import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  telemetry: defineTable({
    skill_name: v.string(),
    duration_ms: v.optional(v.number()),
    tier: v.string(), // "anonymous" | "community" | "off"
    installation_id: v.optional(v.string()),
    version: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_skill", ["skill_name"]),

  feedback: defineTable({
    message: v.string(),
    contact: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        skill_name: v.optional(v.string()),
        version: v.optional(v.string()),
        platform: v.optional(v.string()),
      })
    ),
    timestamp: v.number(),
  }),
});
