# What is Sui and Why Build on It

## Overview

Sui is a Layer 1 blockchain designed from the ground up for speed, low cost, and developer ergonomics. Built by Mysten Labs (founded by former Meta/Diem engineers), Sui introduces an **object-centric data model** and the **Move programming language** to create a fundamentally different development experience from EVM or Solana chains.

## Performance

| Metric        | Sui                                          |
| ------------- | -------------------------------------------- |
| Finality      | ~390ms (simple txns), ~2-3s (shared objects) |
| Peak TPS      | 300,000+ (demonstrated on mainnet)           |
| Gas cost      | Fractions of a cent (often <$0.01)           |
| Storage model | Low upfront fee, **rebates on deletion**     |

## Why Sui Stands Out

### 1. Object-Centric Model

Unlike account-based chains (Ethereum, Solana), Sui treats every on-chain entity as an **object** with a unique ID. Objects have:

- **Ownership**: owned (single address), shared (anyone), immutable (frozen), wrapped (inside another object)
- **Type safety**: enforced at compile time by the Move type system
- **Natural parallelism**: transactions on different owned objects execute in parallel without conflicts

### 2. Move Language

Move is a resource-oriented language designed for safe asset manipulation:

- **Linear types**: assets cannot be accidentally copied or destroyed
- **Abilities system**: `copy`, `drop`, `store`, `key` — explicit capabilities per type
- **No reentrancy**: Move's design eliminates reentrancy attacks by construction
- **On-chain verification**: the Move bytecode verifier runs at publish time

### 3. Programmable Transaction Blocks (PTBs)

Up to **1,024 operations** in a single atomic transaction. Results flow between operations client-side — no wrapper contracts needed for complex flows like "swap → stake → deposit into vault."

### 4. zkLogin

Protocol-level OAuth-to-wallet mapping. Users sign in with Google, Apple, or Twitch and get a Sui wallet — **no seed phrase, no extension, no gas**. Self-custodial by design.

### 5. Sponsored Transactions

Native gas sponsorship at the protocol level. Apps can pay users' gas fees, enabling true gasless onboarding (via Shinami Gas Station or Enoki).

## Core Architecture

```
┌─────────────────────────────────┐
│          Client (dApp)          │
│   @mysten/sui + dapp-kit        │
│   Build PTBs client-side        │
└──────────┬──────────────────────┘
           │ Submit Transaction
┌──────────▼──────────────────────┐
│       Sui Validators            │
│   Mysticeti Consensus (DAG)     │
│   Parallel execution by object  │
│   ~390ms owned-object finality  │
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│      Object Store               │
│   Every asset = unique object   │
│   Owned | Shared | Immutable    │
│   Dynamic fields for extensible │
│   Storage rebates on deletion   │
└─────────────────────────────────┘
```

## Key Differences from Other Chains

| Concept           | Ethereum/EVM                | Solana                            | Sui                           |
| ----------------- | --------------------------- | --------------------------------- | ----------------------------- |
| Data model        | Account + mapping storage   | Account-based, stateless programs | Object-centric                |
| Smart contracts   | Solidity                    | Rust (BPF)                        | Move                          |
| Composability     | Internal calls              | CPIs (4 levels)                   | PTBs (1024 ops, client-side)  |
| Asset safety      | Runtime checks              | Runtime checks                    | Compile-time (linear types)   |
| Parallelism       | Sequential                  | Declared accounts                 | Natural (by object ownership) |
| Auth              | msg.sender                  | Signer verification               | Capability objects            |
| Wallet onboarding | Seed phrase                 | Seed phrase                       | zkLogin (OAuth)               |
| Gas sponsorship   | Meta-transactions (complex) | Not native                        | Native protocol feature       |

## Who's Building on Sui

- **Mysten Labs** — Core protocol, Walrus (storage), Enoki (auth), DeepBook (CLOB)
- **Cetus Protocol** — Leading concentrated liquidity DEX
- **Scallop** — First Sui Foundation grant recipient, lending protocol
- **NAVI Protocol** — One-stop DeFi liquidity
- **Suilend** — Lending protocol (by Solend team, migrated from Solana)
- **Aftermath Finance** — DEX + LST (afSUI)
- **Haedal Protocol** — Leading liquid staking (haSUI, listed on Binance)
- **7K Aggregator** — Meta-DEX aggregator
- **Shinami** — Infrastructure (RPC, gas station, invisible wallets)
