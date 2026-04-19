---
name: build-passkey-auth
description: "Build passkey (WebAuthn) authentication on Sui. Covers secp256r1 keypairs, credential creation, biometric signing, combining with zkLogin multisig, passkey-based wallet creation, browser integration. Triggers: passkey, webauthn, biometric auth, fingerprint login, passkey wallet, secp256r1, passkey authentication, biometric signing"
---

```bash
# Telemetry preamble
SKILL_NAME="build-passkey-auth"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui passkey authentication specialist. Your job is to guide users through implementing WebAuthn passkey-based authentication for Sui dApps. Passkeys allow users to sign Sui transactions using their device's biometric sensor (fingerprint, Face ID) or platform authenticator (Windows Hello, security keys) instead of managing seed phrases or private keys.

Sui natively supports **secp256r1** (P-256) signatures, which is the exact curve used by WebAuthn/FIDO2 passkeys. This means passkey signatures can directly authorize Sui transactions — no bridges, no relayers, no smart contract wallets needed.

Key architecture:
- **WebAuthn** creates a keypair inside the device's secure enclave (TPM, Secure Enclave, etc.)
- The **public key** (secp256r1) is registered as a Sui address
- The **private key** never leaves the device — it signs transactions via the browser's `navigator.credentials` API
- Sui's `PasskeyAuthenticator` validates the signature natively

This gives users a "seedless" wallet experience: no mnemonics, no browser extensions, just a fingerprint.

## Workflow

### Step 1: Understanding the Passkey Flow

```
┌────────────────┐     1. Create credential     ┌──────────────────┐
│   User's Device │<────────────────────────────>│  Browser API      │
│   (Biometric)   │     2. Public key returned   │  (navigator.      │
│                 │                               │   credentials)    │
└────────────────┘                               └────────┬─────────┘
                                                          │
                                                 3. Register pubkey
                                                          │
                                                          ▼
                                                ┌──────────────────┐
                                                │  Sui Blockchain   │
                                                │  (secp256r1 addr) │
                                                └──────────────────┘
```

**Signing flow:**
1. dApp builds a transaction
2. Browser calls `navigator.credentials.get()` → biometric prompt
3. Device secure enclave signs the transaction data with secp256r1
4. Signature is submitted to Sui with `PasskeyAuthenticator` scheme
5. Sui validators verify the secp256r1 signature natively

### Step 2: Create a Passkey Credential

```typescript
// src/lib/passkey.ts

// Step 1: Generate a challenge (random bytes)
function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Step 2: Create a new passkey credential
async function createPasskeyCredential(
  userName: string,
  displayName: string,
): Promise<{
  credentialId: string;
  publicKey: Uint8Array;
  suiAddress: string;
}> {
  const challenge = generateChallenge();

  // Request WebAuthn credential creation
  const credential = (await navigator.credentials.create({
    publicKey: {
      // Relying Party (your app)
      rp: {
        name: "My Sui dApp",
        id: window.location.hostname,
      },

      // User info
      user: {
        id: new TextEncoder().encode(userName),
        name: userName,
        displayName: displayName,
      },

      // Challenge
      challenge: challenge,

      // Key parameters — MUST use secp256r1 (algorithm -7 = ES256)
      pubKeyCredParams: [
        {
          alg: -7, // ES256 = ECDSA with P-256 (secp256r1)
          type: "public-key",
        },
      ],

      // Authenticator selection
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Use device biometrics
        residentKey: "required",             // Discoverable credential
        userVerification: "required",         // Require biometric
      },

      // Timeout
      timeout: 60000,

      // Attestation
      attestation: "none", // We don't need attestation for Sui
    },
  })) as PublicKeyCredential;

  if (!credential) throw new Error("Passkey creation failed");

  // Extract the public key from the attestation response
  const attestationResponse = credential.response as AuthenticatorAttestationResponse;
  const publicKeyBytes = new Uint8Array(attestationResponse.getPublicKey()!);

  // Derive the Sui address from the secp256r1 public key
  const suiAddress = derivePasskeySuiAddress(publicKeyBytes);

  return {
    credentialId: bufferToBase64url(credential.rawId),
    publicKey: publicKeyBytes,
    suiAddress,
  };
}

// Helper: Derive Sui address from secp256r1 public key
function derivePasskeySuiAddress(publicKey: Uint8Array): string {
  // Sui address = BLAKE2b-256(0x06 || compressed_pubkey)[0..32]
  // 0x06 is the flag for secp256r1
  const FLAG_SECP256R1 = 0x06;

  // Compress the public key if uncompressed
  const compressedKey = compressPublicKey(publicKey);

  const preimage = new Uint8Array(1 + compressedKey.length);
  preimage[0] = FLAG_SECP256R1;
  preimage.set(compressedKey, 1);

  // BLAKE2b-256 hash
  const hash = blake2b(preimage, { dkLen: 32 });
  return "0x" + bytesToHex(hash);
}
```

### Step 3: Sign Transactions with Passkey

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { toBase64 } from "@mysten/sui/utils";

const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

async function signTransactionWithPasskey(
  tx: Transaction,
  credentialId: string,
  suiAddress: string,
): Promise<{
  bytes: string;
  signature: string;
}> {
  // Build the transaction
  tx.setSender(suiAddress);
  const txBytes = await tx.build({ client });

  // Create the signing payload
  // Sui expects: BLAKE2b-256(IntentMessage || txBytes)
  const intentMessage = createIntentMessage(txBytes);
  const signingPayload = blake2b(intentMessage, { dkLen: 32 });

  // Sign with passkey (triggers biometric prompt)
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: signingPayload,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          id: base64urlToBuffer(credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential;

  if (!assertion) throw new Error("Passkey signing failed or was cancelled");

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

  // Construct the PasskeyAuthenticator signature
  const signature = constructPasskeySignature(
    assertionResponse.authenticatorData,
    assertionResponse.clientDataJSON,
    assertionResponse.signature,
  );

  return {
    bytes: toBase64(txBytes),
    signature,
  };
}

// Construct PasskeyAuthenticator envelope
function constructPasskeySignature(
  authenticatorData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
  signature: ArrayBuffer,
): string {
  // The PasskeyAuthenticator format expected by Sui:
  // flag (1 byte: 0x06 for secp256r1) ||
  // authenticatorData || clientDataJSON || signature (DER encoded)

  const authData = new Uint8Array(authenticatorData);
  const clientData = new Uint8Array(clientDataJSON);
  const sig = new Uint8Array(signature);

  // Encode as Sui PasskeyAuthenticator
  // This format includes all WebAuthn artifacts needed for verification
  const encoded = encodePasskeyAuthenticator(authData, clientData, sig);
  return toBase64(encoded);
}

// Execute the signed transaction
async function executePasskeyTransaction(
  bytes: string,
  signature: string,
) {
  const result = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [signature],
    options: { showEffects: true },
  });

  return result;
}
```

### Step 4: Full Integration with @mysten/sui SDK

```typescript
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

// The SDK provides a higher-level PasskeyKeypair class
async function createPasskeyWallet() {
  // Create a new passkey credential and derive a Sui keypair
  const keypair = await PasskeyKeypair.create({
    name: "My Wallet",
    rpId: window.location.hostname,
    rpName: "My Sui dApp",
  });

  const address = keypair.toSuiAddress();
  console.log("Passkey wallet address:", address);

  // Store the credential ID for future signing
  localStorage.setItem("passkey_credential_id", keypair.getCredentialId());
  localStorage.setItem("passkey_address", address);

  return keypair;
}

// Reconnect to an existing passkey
async function reconnectPasskeyWallet() {
  const credentialId = localStorage.getItem("passkey_credential_id");
  if (!credentialId) throw new Error("No passkey found");

  // Reconstruct the keypair from stored credential ID
  const keypair = await PasskeyKeypair.fromCredentialId(credentialId);
  return keypair;
}

// Sign and execute a transaction
async function sendSuiWithPasskey(
  recipientAddress: string,
  amountMist: bigint,
) {
  const keypair = await reconnectPasskeyWallet();
  const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.transferObjects([coin], tx.pure.address(recipientAddress));

  // This triggers the biometric prompt automatically
  const result = await client.signAndExecuteTransaction({
    signer: keypair, // PasskeyKeypair implements Signer
    transaction: tx,
    options: { showEffects: true },
  });

  console.log("Transaction sent:", result.digest);
  return result;
}
```

### Step 5: Passkey + Multisig for Recovery

Combine passkey with another authentication method for account recovery:

```typescript
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { MultiSigPublicKey } from "@mysten/sui/multisig";

// Create a 1-of-2 multisig: passkey (primary) + recovery key (backup)
async function createRecoverablePasskeyWallet() {
  // Primary: passkey (biometric)
  const passkeyKeypair = await PasskeyKeypair.create({
    name: "Primary Auth",
    rpId: window.location.hostname,
    rpName: "My App",
  });

  // Backup: Ed25519 recovery key (stored securely offline)
  const recoveryKeypair = Ed25519Keypair.generate();

  // Create 1-of-2 multisig
  const multiSigPublicKey = MultiSigPublicKey.fromPublicKeys({
    threshold: 1, // Only 1 signature needed
    publicKeys: [
      { publicKey: passkeyKeypair.getPublicKey(), weight: 1 },
      { publicKey: recoveryKeypair.getPublicKey(), weight: 1 },
    ],
  });

  const multiSigAddress = multiSigPublicKey.toSuiAddress();

  console.log("Multisig wallet address:", multiSigAddress);
  console.log("Recovery key mnemonic: STORE THIS SECURELY");

  return {
    address: multiSigAddress,
    passkeyKeypair,
    recoveryKeypair,
    multiSigPublicKey,
  };
}

// Normal signing with passkey
async function signWithPasskey(tx: Transaction, wallet) {
  const { signature } = await wallet.passkeyKeypair.signTransaction(
    await tx.build({ client }),
  );

  // Combine into multisig signature
  const multiSigSignature = wallet.multiSigPublicKey.combinePartialSignatures([
    signature,
  ]);

  return multiSigSignature;
}

// Recovery signing with backup key (no biometric needed)
async function signWithRecoveryKey(tx: Transaction, wallet) {
  const { signature } = await wallet.recoveryKeypair.signTransaction(
    await tx.build({ client }),
  );

  const multiSigSignature = wallet.multiSigPublicKey.combinePartialSignatures([
    signature,
  ]);

  return multiSigSignature;
}
```

### Step 6: React Component for Passkey Auth

```typescript
import { useState, useCallback } from "react";

function PasskeyAuth({ onAuthenticated }: { onAuthenticated: (address: string) => void }) {
  const [status, setStatus] = useState<"idle" | "creating" | "signing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setStatus("creating");
    setError(null);

    try {
      const keypair = await PasskeyKeypair.create({
        name: `User-${Date.now()}`,
        rpId: window.location.hostname,
        rpName: "My Sui dApp",
      });

      const address = keypair.toSuiAddress();
      localStorage.setItem("passkey_credential_id", keypair.getCredentialId());
      localStorage.setItem("passkey_address", address);

      onAuthenticated(address);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Passkey creation was cancelled");
      } else if (err.name === "SecurityError") {
        setError("Passkeys require HTTPS");
      } else {
        setError(err.message);
      }
      setStatus("error");
    }
  }, [onAuthenticated]);

  const handleSignIn = useCallback(async () => {
    setStatus("signing");
    setError(null);

    try {
      const credentialId = localStorage.getItem("passkey_credential_id");
      if (!credentialId) {
        setError("No passkey found. Create one first.");
        setStatus("error");
        return;
      }

      const keypair = await PasskeyKeypair.fromCredentialId(credentialId);
      onAuthenticated(keypair.toSuiAddress());
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }, [onAuthenticated]);

  const hasExistingPasskey = !!localStorage.getItem("passkey_credential_id");

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto">
      <h2 className="text-xl font-bold">Sign in with Passkey</h2>

      {hasExistingPasskey ? (
        <button
          onClick={handleSignIn}
          disabled={status === "signing"}
          className="py-3 px-6 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          {status === "signing" ? "Verifying..." : "Sign in with Fingerprint"}
        </button>
      ) : null}

      <button
        onClick={handleCreate}
        disabled={status === "creating"}
        className="py-3 px-6 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
      >
        {status === "creating" ? "Creating..." : "Create New Passkey Wallet"}
      </button>

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
}
```

## Non-Negotiables

1. **ALWAYS use algorithm `-7` (ES256/P-256)** when creating credentials — Sui only supports secp256r1 for passkeys; other algorithms will not work
2. **ALWAYS require `userVerification: "required"`** — without it, the passkey may not prompt biometrics, weakening security
3. **ALWAYS use `residentKey: "required"`** for discoverable credentials — this enables "usernameless" sign-in
4. **Passkeys require HTTPS** — they will NOT work on `http://` (except `localhost` for development)
5. **ALWAYS store credential IDs** — you need the credential ID to request signatures later; store it in localStorage or your backend
6. **ALWAYS implement a recovery mechanism** — if the user loses their device, the passkey is gone; use multisig with a recovery key
7. **NEVER assume all browsers support passkeys** — check `PublicKeyCredential` availability and provide fallback auth
8. **The `rpId` MUST match your domain** — passkeys are bound to the relying party domain; they cannot be used on a different domain

## References

- `skills/build/integrate-enoki/SKILL.md` — zkLogin for alternative seedless auth
- `skills/build/build-api/SKILL.md` — Backend auth integration
- `skills/build/integrate-dapp-kit/SKILL.md` — dApp Kit wallet integration
- `.brokenigloo/build-context.md` — stack decisions and progress

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
