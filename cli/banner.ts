// ASCII art banner for brokenigloo CLI
import { suiGradient, bold, dim, cyan } from "./colors.js";
import { PRODUCT_TAGLINE, VERSION } from "./branding.js";

const BANNER_ART = `
  ██████╗ ██████╗  ██████╗ ██╗  ██╗███████╗███╗   ██╗
  ██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║
  ██████╔╝██████╔╝██║   ██║█████╔╝ █████╗  ██╔██╗ ██║
  ██╔══██╗██╔══██╗██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║
  ██████╔╝██║  ██║╚██████╔╝██║  ██╗███████╗██║ ╚████║
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝

  ██╗ ██████╗ ██╗      ██████╗  ██████╗
  ██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗
  ██║██║  ███╗██║     ██║   ██║██║   ██║
  ██║██║   ██║██║     ██║   ██║██║   ██║
  ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝
  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝
`;

export function printBanner(): void {
  const lines = BANNER_ART.split("\n");
  for (const line of lines) {
    console.log(suiGradient(line));
  }
  console.log("");
  console.log(`  ${bold(PRODUCT_TAGLINE)}`);
  console.log(`  ${dim(`v${VERSION}`)}`);
  console.log("");
}

export function printCompactBanner(): void {
  console.log("");
  console.log(suiGradient("  ╔══════════════════════════════════════╗"));
  console.log(suiGradient("  ║") + bold("  brokenigloo") + dim(` v${VERSION}`) + "          " + suiGradient("║"));
  console.log(suiGradient("  ║") + `  ${PRODUCT_TAGLINE}  ` + suiGradient("║"));
  console.log(suiGradient("  ╚══════════════════════════════════════╝"));
  console.log("");
}

export function printWelcome(): void {
  printBanner();
  console.log(cyan("  Get started:"));
  console.log("");
  console.log(`  ${bold("brokenigloo ship")}        Launch the interactive journey`);
  console.log(`  ${bold("brokenigloo init")}        Install skills to your AI assistant`);
  console.log(`  ${bold("brokenigloo search")}      Search repos, skills, and MCPs`);
  console.log(`  ${bold("brokenigloo repos")}       Browse Sui starter repos`);
  console.log(`  ${bold("brokenigloo skills")}      Browse installed skills`);
  console.log(`  ${bold("brokenigloo doctor")}      Check your environment`);
  console.log("");
  console.log(dim("  Docs: https://github.com/SeventhOdyssey71/broken-igloo"));
  console.log("");
}
