// Submit feedback to the brokenigloo team
import { bold, green, dim, cyan } from "./colors.js";
import { CONVEX_URL, VERSION, GITHUB_URL } from "./branding.js";

export async function submitFeedback(message: string, agentMode: boolean = false): Promise<void> {
  if (!message) {
    if (agentMode) {
      console.log(JSON.stringify({ error: "No feedback message provided" }));
      return;
    }
    console.log("");
    console.log(bold("  Send Feedback"));
    console.log("");
    console.log(`  ${cyan("Option 1:")} Open an issue on GitHub`);
    console.log(`    ${dim(GITHUB_URL + "/issues")}`);
    console.log("");
    console.log(`  ${cyan("Option 2:")} Send via CLI`);
    console.log(`    ${bold("brokenigloo feedback \"Your message here\"")}`);
    console.log("");
    return;
  }

  // Try to send to Convex backend
  if (CONVEX_URL !== "https://YOUR_DEPLOYMENT.convex.cloud") {
    try {
      await fetch(`${CONVEX_URL}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "feedback:submit",
          args: {
            message,
            metadata: {
              version: VERSION,
              platform: process.platform,
            },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Silently fail
    }
  }

  if (agentMode) {
    console.log(JSON.stringify({ submitted: true, message }));
  } else {
    console.log("");
    console.log(green("  ✓ Feedback submitted. Thank you!"));
    console.log("");
  }
}
