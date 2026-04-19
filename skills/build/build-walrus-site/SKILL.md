---
name: build-walrus-site
description: "Deploy a decentralized website on Walrus Sites. Covers static site deployment, custom domains, CI/CD with Walrus CLI, dynamic content via service workers, SPA routing, asset optimization. Triggers: walrus site, walrus sites, deploy website walrus, decentralized website, walrus hosting, static site walrus, walrus publish"
---

```bash
# Telemetry preamble
SKILL_NAME="build-walrus-site"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Walrus Sites deployment specialist. Walrus Sites is the decentralized web hosting layer built on top of Walrus storage and the Sui blockchain. It allows you to publish entire static websites — HTML, CSS, JS, images, fonts — as blobs on Walrus, with a Sui object acting as the site manifest. The result is a censorship-resistant website accessible via `<site-object-id>.walrus.site` or a custom SuiNS domain.

Key architecture: A Walrus Site is a **Sui object** that contains a manifest mapping URL paths to Walrus blob IDs. When a user visits the site, the Walrus Sites gateway reads the manifest from Sui, fetches the corresponding blobs from Walrus, and serves them as HTTP responses with correct content types. Service workers can enable dynamic behavior, SPA routing, and even API proxying — all from decentralized storage.

This is NOT traditional hosting. There are no servers, no CDNs, no DNS records. The site lives entirely on-chain (manifest) and on Walrus (content).

## Workflow

### Step 1: Prerequisites

```bash
# Install the Walrus Sites CLI (requires Rust toolchain)
cargo install walrus-sites

# Verify installation
walrus-sites --version

# Ensure you have a Sui wallet with testnet SUI for gas
sui client active-address
sui client gas

# If you need testnet tokens
curl -X POST https://faucet.testnet.sui.io/v1/gas \
  -H "Content-Type: application/json" \
  -d "{\"FixedAmountRequest\":{\"recipient\":\"$(sui client active-address)\"}}"
```

Also install Walrus CLI for blob operations:

```bash
# Install Walrus CLI
cargo install walrus

# Configure for testnet
walrus config set --network testnet
```

### Step 2: Prepare Your Static Site

Build your site using any static site generator or framework:

```bash
# React (Vite)
npm create vite@latest my-walrus-site -- --template react-ts
cd my-walrus-site && npm install && npm run build
# Output: ./dist/

# Next.js (static export)
npx create-next-app@latest my-walrus-site --typescript
cd my-walrus-site
# In next.config.js: output: 'export'
npm run build
# Output: ./out/

# Plain HTML
mkdir my-walrus-site && cd my-walrus-site
cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Decentralized Site</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Hello from Walrus Sites!</h1>
  <p>This site is hosted on decentralized storage.</p>
  <script src="app.js"></script>
</body>
</html>
HTMLEOF
```

**Important constraints:**

- All asset references must be **relative paths** (no absolute `/` paths or CDN URLs for local assets)
- No server-side rendering — purely static HTML/CSS/JS
- Total site size is limited by your WAL/SUI budget for storage epochs
- Each file becomes a separate Walrus blob

### Step 3: Configure Walrus Sites

Create a `walrus-sites.yaml` configuration in your project root:

```yaml
# walrus-sites.yaml
site:
  # Directory containing built static files
  root: "./dist"

  # Number of Walrus epochs to store the site (each ~24h on testnet)
  epochs: 200

  # Custom 404 page (optional)
  not_found: "404.html"

  # Headers for specific file patterns (optional)
  headers:
    - pattern: "*.js"
      headers:
        Cache-Control: "public, max-age=31536000, immutable"
    - pattern: "*.css"
      headers:
        Cache-Control: "public, max-age=31536000, immutable"
    - pattern: "*.html"
      headers:
        Cache-Control: "public, max-age=300"
    - pattern: "*.woff2"
      headers:
        Content-Type: "font/woff2"
        Cache-Control: "public, max-age=31536000, immutable"

  # SPA routing — redirect all paths to index.html (for React Router, etc.)
  spa:
    enabled: true
    index: "index.html"
```

### Step 4: Publish the Site

```bash
# First-time publish
walrus-sites publish ./dist --epochs 200

# Output:
# Uploading 15 files...
#   index.html -> blob:abc123...
#   assets/index-Dk4f8.js -> blob:def456...
#   assets/index-9xKm2.css -> blob:ghi789...
#   ...
# Site manifest created: 0x<site_object_id>
#
# Browse your site at:
#   https://<site_object_id>.walrus.site

# Save the site object ID — you need it for updates
export WALRUS_SITE_ID="0x<site_object_id>"
echo $WALRUS_SITE_ID > .walrus-site-id
```

### Step 5: Update an Existing Site

When you make changes and rebuild:

```bash
# Rebuild your site
npm run build

# Update the existing site (pass the object ID)
walrus-sites update ./dist --object-id $(cat .walrus-site-id) --epochs 200

# Only changed files are re-uploaded (content-addressed dedup)
# The manifest object on Sui is updated to point to new blobs
```

**Partial updates**: Walrus deduplicates by content hash. If only `index.html` changed but your JS bundle didn't, only the HTML blob is uploaded. This saves storage costs.

### Step 6: Custom Domain via SuiNS

Link your site to a human-readable SuiNS name:

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const SUINS_PACKAGE = "0x..."; // SuiNS package ID
const SITE_OBJECT_ID = "0x<your_site_object_id>";
const SUINS_NAME_OBJECT = "0x<your_suins_nft_id>"; // Your SuiNS name NFT

const tx = new Transaction();

// Set the Walrus Site as the target for your SuiNS name
tx.moveCall({
  target: `${SUINS_PACKAGE}::controller::set_target_address`,
  arguments: [tx.object(SUINS_NAME_OBJECT), tx.pure.address(SITE_OBJECT_ID)],
});

await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });

// Now your site is accessible at: https://myname.walrus.site
```

Alternatively, using the CLI:

```bash
# Link SuiNS name to your Walrus Site
walrus-sites set-name --site-id $WALRUS_SITE_ID --name "myapp"
# Site now accessible at: https://myapp.walrus.site
```

### Step 7: SPA Routing with Service Workers

For single-page applications (React Router, Vue Router), you need client-side routing. Walrus Sites supports this via a service worker that intercepts navigation requests:

```javascript
// public/sw.js — Service Worker for SPA routing
const CACHE_NAME = "walrus-site-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // If the request is for a static asset, let it pass through
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff2|ico)$/)) {
    return;
  }

  // For navigation requests, serve index.html (SPA routing)
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((response) => {
        return response || fetch("/index.html");
      }),
    );
  }
});
```

Register the service worker in your app:

```typescript
// src/main.tsx
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}
```

### Step 8: CI/CD Pipeline

Automate deployments with GitHub Actions:

```yaml
# .github/workflows/deploy-walrus.yml
name: Deploy to Walrus Sites

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Install Walrus CLI
        run: |
          curl -fsSL https://walrus.sui.io/install.sh | sh
          echo "$HOME/.walrus/bin" >> $GITHUB_PATH

      - name: Configure Sui Wallet
        run: |
          echo "${{ secrets.SUI_KEYSTORE }}" > ~/.sui/sui_config/sui.keystore
          echo "${{ secrets.SUI_CONFIG }}" > ~/.sui/sui_config/client.yaml

      - name: Deploy to Walrus Sites
        run: |
          if [ -f .walrus-site-id ]; then
            SITE_ID=$(cat .walrus-site-id)
            walrus-sites update ./dist --object-id $SITE_ID --epochs 200
          else
            walrus-sites publish ./dist --epochs 200 | tee deploy-output.txt
            grep "Site manifest" deploy-output.txt | awk '{print $NF}' > .walrus-site-id
          fi

      - name: Output site URL
        run: |
          SITE_ID=$(cat .walrus-site-id)
          echo "Site deployed at: https://${SITE_ID}.walrus.site"
```

### Step 9: Asset Optimization

Optimize your site for minimal blob storage costs:

```bash
# Compress images before upload
npx sharp-cli --input ./dist/**/*.png --output ./dist/ --webp

# Minify HTML
npx html-minifier-terser --input-dir ./dist --output-dir ./dist \
  --collapse-whitespace --remove-comments --minify-js --minify-css

# Ensure Vite/webpack produces content-hashed filenames
# (This enables dedup on Walrus — unchanged files aren't re-uploaded)
```

```typescript
// vite.config.ts — optimal build config for Walrus Sites
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // CRITICAL: relative paths for Walrus Sites
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        // Content-hashed filenames for cache busting and dedup
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
```

### Step 10: Dynamic Content Patterns

Even though Walrus Sites are static, you can add dynamic behavior:

**Pattern A: Client-side data fetching from Sui**

```typescript
// Fetch on-chain data directly from the browser
import { SuiClient } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

async function loadLeaderboard() {
  const obj = await client.getObject({
    id: LEADERBOARD_OBJECT_ID,
    options: { showContent: true },
  });
  // Render dynamic data client-side
  renderLeaderboard(obj.data.content.fields);
}
```

**Pattern B: Walrus blob as dynamic data store**

```typescript
// Store JSON data as a Walrus blob, update the reference on-chain
import { WalrusClient } from "@mysten/walrus";

// Read the latest data blob ID from a Sui object
const configObj = await suiClient.getObject({
  id: CONFIG_OBJECT_ID,
  options: { showContent: true },
});
const dataBlobId = configObj.data.content.fields.data_blob_id;

// Fetch the data from Walrus
const walrus = new WalrusClient({ network: "mainnet", suiClient });
const data = await walrus.readBlob({ blobId: dataBlobId });
const jsonData = JSON.parse(new TextDecoder().decode(data));
```

**Pattern C: Prerendering with periodic rebuilds**

```bash
# Cron job that rebuilds and redeploys with fresh data
#!/bin/bash
# fetch-and-deploy.sh
node scripts/fetch-data.js          # Fetches on-chain data, writes JSON
npm run build                        # Vite builds with fresh data
walrus-sites update ./dist --object-id $(cat .walrus-site-id) --epochs 200
```

### Step 11: Monitoring and Troubleshooting

```bash
# Check site status
walrus-sites info --object-id $(cat .walrus-site-id)

# Verify a specific blob is retrievable
walrus read <blob-id>

# Check remaining storage epochs
walrus-sites epochs --object-id $(cat .walrus-site-id)

# Extend storage before expiry
walrus-sites extend --object-id $(cat .walrus-site-id) --epochs 100
```

Common issues:

- **Blank page**: Check that `base` is set to `"./"` in Vite/webpack config
- **Missing assets**: Ensure all paths are relative, not absolute
- **CORS errors**: Walrus Sites gateway adds CORS headers; if using external APIs, those APIs must allow the `.walrus.site` origin
- **Service worker not loading**: The SW must be at the root path (`/sw.js`)
- **Large bundle warning**: Split your JS bundle — large single blobs are slower to retrieve

## Non-Negotiables

1. **ALWAYS use relative paths** for all local asset references — absolute paths break on Walrus Sites because the base URL varies
2. **ALWAYS set `base: "./"` in Vite/webpack** — this ensures all generated asset references are relative
3. **NEVER store secrets in static site code** — all blobs are public; use environment variables at build time, not runtime
4. **ALWAYS save the site object ID** after first publish — losing it means you cannot update the site, only publish a new one
5. **ALWAYS test locally first** with `npx serve dist` or similar before deploying to Walrus
6. **NEVER deploy to mainnet without testing on testnet** — storage costs real WAL tokens on mainnet
7. **ALWAYS set appropriate epoch counts** — if your site expires, it goes offline; for production sites use high epoch counts and set up renewal reminders
8. **ALWAYS configure SPA routing** if using client-side routing frameworks — without it, direct URL access returns 404

## References

- `skills/build/integrate-walrus/SKILL.md` — Walrus blob storage fundamentals
- `skills/build/integrate-suins/SKILL.md` — SuiNS name registration for custom domains
- `skills/build/frontend-design-guidelines/SKILL.md` — Frontend best practices
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
