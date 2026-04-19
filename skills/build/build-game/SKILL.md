---
name: build-game
description: "Complete guide to building an on-chain game on Sui. Covers game object design, on-chain randomness (sui::random), turn-based mechanics, asset ownership, leaderboards, and player progression. Triggers: game, on-chain game, sui game, randomness, sui random, game design, turn based, leaderboard, game assets"
---

```bash
# Telemetry preamble
SKILL_NAME="build-game"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
START_TIME=$(date +%s)
TELEMETRY_TIER=$(cat ~/.brokenigloo/telemetry-tier 2>/dev/null || echo "off")
```

> **Skill Router**: If this isn't what the user needs, check the [SKILL_ROUTER.md](../../SKILL_ROUTER.md) for the right skill.

## Overview

You are a Sui game development specialist. Your job is to guide the user through building on-chain games using Sui Move, leveraging Sui's object model for true asset ownership, `sui::random` for verifiable randomness, and Programmable Transaction Blocks for complex game actions. Sui is uniquely suited for gaming because objects are owned (not mapped), transfers are instant, and the parallel execution model enables high throughput.

**Sui game architecture principles:**
- **Game State**: Use shared objects for global state (leaderboards, game worlds), owned objects for player assets (characters, items, cards)
- **Randomness**: Use `sui::random` for verifiable on-chain randomness — loot drops, combat rolls, card draws
- **Asset Ownership**: Players truly own their game items as Sui objects — tradeable, composable, cross-game compatible
- **PTB Composability**: Multi-step game actions (attack + loot + equip) in a single transaction

## Workflow

### Step 1: Design the Game Object Model

Interview the user to determine the game type, then design the object model:

| Game Type | Shared Objects | Owned Objects | Key Patterns |
|-----------|---------------|---------------|--------------|
| **RPG/Adventure** | World, Dungeon, Shop | Character, Weapon, Armor, Potion | Dynamic fields for inventory |
| **Card Game** | GameLobby, CardRegistry | Deck, Hand (hot potato during game) | Randomness for draws |
| **Strategy** | GameBoard, TurnTracker | Army, Territory, Resources | Turn validation, move legality |
| **Casino/Chance** | HousePool, GameHistory | Bet receipt | Randomness, house edge math |
| **Idle/Clicker** | Leaderboard | Farm, Upgrades, Resources | Epoch-based time progression |

### Step 2: Implement Game Objects

```move
module game::hero {
    use std::string::String;
    use sui::event;

    // === Game Objects ===

    /// The player's character — an owned object
    public struct Hero has key, store {
        id: UID,
        name: String,
        level: u64,
        experience: u64,
        health: u64,
        max_health: u64,
        attack: u64,
        defense: u64,
        /// Equipped weapon (optional, stored as dynamic field)
        gold: u64,
    }

    /// A weapon item — owned, transferable, equippable
    public struct Weapon has key, store {
        id: UID,
        name: String,
        damage: u64,
        rarity: u8, // 0=common, 1=uncommon, 2=rare, 3=epic, 4=legendary
    }

    /// A potion — consumable (destroyed on use)
    public struct Potion has key, store {
        id: UID,
        heal_amount: u64,
    }

    // === Events ===
    public struct HeroCreated has copy, drop {
        hero_id: ID,
        name: String,
        owner: address,
    }

    public struct BattleResult has copy, drop {
        hero_id: ID,
        enemy_name: String,
        won: bool,
        exp_gained: u64,
        loot_dropped: bool,
    }

    public struct LevelUp has copy, drop {
        hero_id: ID,
        new_level: u64,
    }

    // === Hero Creation ===
    entry fun create_hero(
        name: String,
        ctx: &mut TxContext,
    ) {
        let hero = Hero {
            id: object::new(ctx),
            name,
            level: 1,
            experience: 0,
            health: 100,
            max_health: 100,
            attack: 10,
            defense: 5,
            gold: 0,
        };

        event::emit(HeroCreated {
            hero_id: object::id(&hero),
            name: hero.name,
            owner: ctx.sender(),
        });

        transfer::public_transfer(hero, ctx.sender());
    }

    // === Use a Potion ===
    entry fun use_potion(hero: &mut Hero, potion: Potion) {
        let Potion { id, heal_amount } = potion;
        object::delete(id);

        hero.health = if (hero.health + heal_amount > hero.max_health) {
            hero.max_health
        } else {
            hero.health + heal_amount
        };
    }

    // === Level Up Logic ===
    fun check_level_up(hero: &mut Hero) {
        let exp_needed = hero.level * 100; // 100 XP per level
        if (hero.experience >= exp_needed) {
            hero.experience = hero.experience - exp_needed;
            hero.level = hero.level + 1;
            hero.max_health = hero.max_health + 10;
            hero.attack = hero.attack + 3;
            hero.defense = hero.defense + 2;
            hero.health = hero.max_health; // Full heal on level up

            event::emit(LevelUp {
                hero_id: object::id(hero),
                new_level: hero.level,
            });
        };
    }

    // === View functions ===
    public fun level(hero: &Hero): u64 { hero.level }
    public fun health(hero: &Hero): u64 { hero.health }
    public fun attack_power(hero: &Hero): u64 { hero.attack }
}
```

### Step 3: Implement On-Chain Randomness

```move
module game::battle {
    use sui::random::{Self, Random};
    use sui::event;
    use game::hero::{Self, Hero, Weapon};

    // === Enemy Definitions ===
    public struct EnemyConfig has store, drop {
        name: vector<u8>,
        health: u64,
        attack: u64,
        defense: u64,
        exp_reward: u64,
        gold_reward: u64,
        drop_chance: u64, // percentage (0-100)
    }

    /// Battle an enemy using on-chain randomness
    /// IMPORTANT: randomness functions must be `entry` (not `public`),
    /// and Random must be the FIRST parameter
    entry fun battle_enemy(
        r: &Random,
        hero: &mut Hero,
        enemy_type: u8,
        ctx: &mut TxContext,
    ) {
        let enemy = get_enemy(enemy_type);

        // Generate random values for this battle
        let mut rng = random::new_generator(r, ctx);

        // Roll for hit (attack vs defense comparison + randomness)
        let hero_roll = random::generate_u64_in_range(&mut rng, 1, 20);
        let enemy_roll = random::generate_u64_in_range(&mut rng, 1, 20);

        let hero_total = hero::attack_power(hero) + hero_roll;
        let enemy_total = enemy.attack + enemy_roll;

        let won = hero_total > enemy_total;

        if (won) {
            // Hero wins — award experience and gold
            hero.experience = hero.experience + enemy.exp_reward;
            hero.gold = hero.gold + enemy.gold_reward;

            // Check for loot drop
            let loot_roll = random::generate_u64_in_range(&mut rng, 1, 100);
            let loot_dropped = loot_roll <= enemy.drop_chance;

            if (loot_dropped) {
                // Generate random weapon
                let rarity_roll = random::generate_u64_in_range(&mut rng, 1, 100);
                let rarity = if (rarity_roll <= 1) { 4 }      // 1% legendary
                    else if (rarity_roll <= 5) { 3 }           // 4% epic
                    else if (rarity_roll <= 15) { 2 }          // 10% rare
                    else if (rarity_roll <= 35) { 1 }          // 20% uncommon
                    else { 0 };                                 // 65% common

                let damage = random::generate_u64_in_range(&mut rng, 5, 10 + (rarity as u64) * 5);
                let weapon = Weapon {
                    id: object::new(ctx),
                    name: std::string::utf8(b"Dropped Weapon"),
                    damage,
                    rarity,
                };
                transfer::public_transfer(weapon, ctx.sender());
            };

            // Check for level up
            hero::check_level_up(hero);

            event::emit(BattleResult {
                hero_id: object::id(hero),
                enemy_name: std::string::utf8(enemy.name),
                won: true,
                exp_gained: enemy.exp_reward,
                loot_dropped,
            });
        } else {
            // Hero loses — take damage
            let damage = if (enemy.attack > hero::defense(hero)) {
                enemy.attack - hero::defense(hero)
            } else { 1 };

            // Reduce health (but don't go below 0)
            if (hero.health > damage) {
                hero.health = hero.health - damage;
            } else {
                hero.health = 0;
            };

            event::emit(BattleResult {
                hero_id: object::id(hero),
                enemy_name: std::string::utf8(enemy.name),
                won: false,
                exp_gained: 0,
                loot_dropped: false,
            });
        };
    }

    fun get_enemy(enemy_type: u8): EnemyConfig {
        if (enemy_type == 0) {
            EnemyConfig { name: b"Goblin", health: 30, attack: 5, defense: 2, exp_reward: 20, gold_reward: 5, drop_chance: 20 }
        } else if (enemy_type == 1) {
            EnemyConfig { name: b"Skeleton", health: 50, attack: 8, defense: 4, exp_reward: 40, gold_reward: 10, drop_chance: 30 }
        } else {
            EnemyConfig { name: b"Dragon", health: 200, attack: 25, defense: 15, exp_reward: 200, gold_reward: 100, drop_chance: 80 }
        }
    }
}
```

### Step 4: Implement a Leaderboard

```move
module game::leaderboard {
    use std::string::String;
    use sui::table::{Self, Table};
    use sui::event;

    /// Global leaderboard — shared object
    public struct Leaderboard has key {
        id: UID,
        /// Top scores: address -> score
        scores: Table<address, u64>,
        /// Sorted top 10 addresses
        top_players: vector<address>,
        max_entries: u64,
    }

    public struct ScoreUpdated has copy, drop {
        player: address,
        new_score: u64,
        rank: u64,
    }

    /// Create the leaderboard (called once at deploy)
    fun init(ctx: &mut TxContext) {
        let leaderboard = Leaderboard {
            id: object::new(ctx),
            scores: table::new(ctx),
            top_players: vector::empty(),
            max_entries: 100,
        };
        transfer::share_object(leaderboard);
    }

    /// Submit a score (called by the game module)
    public fun submit_score(
        board: &mut Leaderboard,
        player: address,
        score: u64,
    ) {
        if (table::contains(&board.scores, player)) {
            let existing = table::borrow_mut(&mut board.scores, player);
            if (score > *existing) {
                *existing = score;
            } else {
                return // Not a new high score
            };
        } else {
            table::add(&mut board.scores, player, score);
        };

        update_top_players(board, player, score);
    }

    fun update_top_players(board: &mut Leaderboard, player: address, score: u64) {
        // Remove player if already in top list
        let mut i = 0;
        let len = vector::length(&board.top_players);
        while (i < len) {
            if (*vector::borrow(&board.top_players, i) == player) {
                vector::remove(&mut board.top_players, i);
                break
            };
            i = i + 1;
        };

        // Insert in sorted position
        let len = vector::length(&board.top_players);
        let mut insert_at = len;
        i = 0;
        while (i < len) {
            let addr = *vector::borrow(&board.top_players, i);
            let other_score = *table::borrow(&board.scores, addr);
            if (score > other_score) {
                insert_at = i;
                break
            };
            i = i + 1;
        };

        vector::insert(&mut board.top_players, player, insert_at);

        // Trim to max entries
        while (vector::length(&board.top_players) > (board.max_entries as u64)) {
            vector::pop_back(&mut board.top_players);
        };

        event::emit(ScoreUpdated {
            player,
            new_score: score,
            rank: insert_at + 1,
        });
    }
}
```

### Step 5: TypeScript Game Client

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const PACKAGE_ID = "0x<YOUR_PACKAGE>";
const RANDOM_OBJECT = "0x8"; // sui::random::Random singleton

// Create a hero
async function createHero(keypair: Ed25519Keypair, name: string) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::hero::create_hero`,
    arguments: [tx.pure.string(name)],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
}

// Battle an enemy
async function battleEnemy(
  keypair: Ed25519Keypair,
  heroId: string,
  enemyType: number,
) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::battle::battle_enemy`,
    arguments: [
      tx.object(RANDOM_OBJECT), // Random MUST be first argument
      tx.object(heroId),
      tx.pure.u8(enemyType),
    ],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
}

// Multi-action PTB: battle + use potion + battle again
async function dungeonRun(
  keypair: Ed25519Keypair,
  heroId: string,
  potionId: string,
) {
  const tx = new Transaction();

  // Battle goblin
  tx.moveCall({
    target: `${PACKAGE_ID}::battle::battle_enemy`,
    arguments: [tx.object(RANDOM_OBJECT), tx.object(heroId), tx.pure.u8(0)],
  });

  // Use potion to heal
  tx.moveCall({
    target: `${PACKAGE_ID}::hero::use_potion`,
    arguments: [tx.object(heroId), tx.object(potionId)],
  });

  // Battle skeleton
  tx.moveCall({
    target: `${PACKAGE_ID}::battle::battle_enemy`,
    arguments: [tx.object(RANDOM_OBJECT), tx.object(heroId), tx.pure.u8(1)],
  });

  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
}
```

### Step 6: Handoff

- "I want to sell game items on a marketplace" -> route to `build-nft-collection`
- "I want token-gated game access" -> route to `build-token-gated`
- "Deploy to mainnet" -> route to `deploy-to-mainnet`
- "Debug my game logic" -> route to `debug-move`

## Prior Context

Read `.brokenigloo/build-context.md` for stack decisions. Read `skills/data/sui-knowledge/02-objects-ownership-standards.md` for object model reference. Never block on missing files.

## Non-Negotiables

1. **Use `sui::random` for all randomness** — never use `tx_context::epoch()`, object IDs, or timestamps as randomness sources. They are predictable and exploitable.
2. **Random must be the first parameter** — functions using `Random` must be `entry` functions with `r: &Random` as the first argument. This is enforced by the runtime.
3. **Game assets must have `key, store`** — players need to own, trade, and transfer their items. Without `store`, assets are locked to the original owner.
4. **Use shared objects sparingly** — only leaderboards and global game state should be shared. Player inventories and characters should be owned objects for parallel execution.
5. **Emit events for every game action** — battles, level ups, loot drops, trades. The frontend and indexers depend on events for game state updates.
6. **Validate all game logic on-chain** — never trust client-side game state. All combat math, loot tables, and progression must be in Move.
7. **Consumable items must be destroyed** — potions, scrolls, and one-use items should be deconstructed (destroyed) in Move, not just flagged as used.
8. **Test randomness distributions** — verify that loot tables and combat math produce fair distributions using `#[test]` with known random seeds.

## References

- Sui Randomness: https://docs.sui.io/guides/developer/app-examples/coin-flip
- Sui Object Model: https://docs.sui.io/concepts/object-model
- `skills/data/sui-knowledge/02-objects-ownership-standards.md` — object model
- `.brokenigloo/build-context.md` — stack decisions

```bash
# Telemetry postamble
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if [ "$TELEMETRY_TIER" != "off" ]; then
  echo "{\"skill\":\"$SKILL_NAME\",\"duration\":$DURATION,\"session\":\"$SESSION_ID\",\"tier\":\"$TELEMETRY_TIER\"}" >> ~/.brokenigloo/telemetry.jsonl 2>/dev/null
fi
```
