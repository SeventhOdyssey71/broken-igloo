import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const submit = mutation({
  args: {
    message: v.string(),
    contact: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        skill_name: v.optional(v.string()),
        version: v.optional(v.string()),
        platform: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("feedback", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
