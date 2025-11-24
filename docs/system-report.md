## High-Level Plan

- Clearly define the roles of each token and their flows (tokenomics).
- Design how temples, faith, and lands fit into the current simulation.
- Propose a technical architecture: game layers, backend “ledger”, and contracts.
- Suggest concrete steps to start implementing the mechanics in your current codebase.

## 1. Tokens and Resources Definition

### Weak Token (Token1, in‑game)

- **Main use**: internal currency for almost everything:
  - Advanced construction costs, upgrades, speeding up processes, changing roles, temporary buffs, event lotteries, etc.
- **Emission**:
  - Mainly via **temples**: idle villagers assigned to “prayer” generate **Faith** per tick, which is then converted into Token1.
  - Secondary rewards: achievements, daily quests, global events.
- **Sinks (consumption)**:
  - Building upgrades (including temples), temporary buffs, exploration missions, land rerolls, minor skins, etc.
  - Part of the spending is **burned directly** (to control off‑chain inflation) or marked as “burnable” when bridging on‑chain.
- **On‑chain**:
  - Only tokenized when the player explicitly chooses to “withdraw”:
    - On‑chain mint happens against an off‑chain burn (or lock) of Token1.
  - **Policy**: inflationary, no hard max supply, but regulated through sinks and conversions.

### Strong Token (Token2)

- **Main use**:
  - Buying **lands** (world hexes) and **starter chests** (copper/silver/gold).
  - Potential premium purchases: cosmetics, season passes, governance participation, etc.
- **Emission**:
  - Initially via **direct sale** (store) and possibly very rare on‑chain rewards (staking, tournaments, seasons).
- **Sinks (burn/lock)**:
  - Land and chest purchases: a portion is **burned**, another portion goes to the game treasury.
  - Possible staking to get time‑saving boosts or multipliers for Faith/Token1 production.
- **Conversion from Token1**:
  - The player can **mint Token2 by burning large amounts of Token1**.
  - Very high ratio (concept example: 1 Token2 = 100k Token1), tunable to keep Token2 strong.
  - Mechanism: Token1 is burned off‑chain → backend signs and allows minting Token2 on‑chain.

### Other Resources

- You keep:
  - **Basic resources**: food, wood, stone (and the ones you already have).
  - **Special Land resources**: depend on the world hex biome:
    - e.g. spices, gems, ancient relics, etc.
    - Used as ingredients to craft items or boosts that are sold for Token1 or that improve Faith/Token1 production.

## 2. Temples and Faith System

### New Soft Resource: Faith

- Faith is a **soft resource** tied to the village, not to a single villager:
  - Stored in `SimulationSession` or in a dedicated economy module (`EconomyState`).
- **Generation**:
  - Each temple has a **cap of 3 free villagers** assignable as “devotees”.
  - Base formula per tick:
    - $$
      Fe\_{gain}
      = \sum_{temples} \sum_{assigned\_villagers}
      (baseFe \times modifier\_{temple} \times modifier\_{biomeLand} \times modifier\_{morale})
      $$
  - `modifier_biomeLand`: if the player’s world land is “sacred”, it can grant extra Faith.
- **Conversion Faith → Token1**:
  - Done in discrete **“rituals”**:
    - The player opens the temple panel or economy panel and presses **“Convert Faith”**.
  - Non‑linear conversion to avoid spam:
    - You can apply **diminishing returns** when converting very large amounts at once.
  - Options:
    - **Continuous automatic** conversion (simpler for the first implementation), or
    - **Batch conversion with cooldown** (more strategic gameplay).

### Integration with the Current System

- **New roles/states**:
  - From `CitizenSystem` / `CitizenBehaviorDirector` you can add a “worship” goal:
    - A villager with role `worker` or `farmer` marked as “free” can be reassigned as a **devotee** if there is an available slot.
- **New structure data**:
  - In `structures.ts` define a `temple` type with fields:
    - `devoteeSlots: 3`
    - `faithPerCitizenPerTick: X`
    - `token1ConversionRate: Y` (global or per building level).
- **HUD**:
  - In `HUDController` / `CitizenControlPanel` add:
    - Current **Faith** indicator.
    - **Faith per hour** generation indicator.
    - A **“Convert Faith → Token1”** button.

## 3. Lands System (World Map)

### Concept

- Each player **owns one Land**, which corresponds to:
  - A **hex** in the world map (also hexagonal), with its own biome and rarity.
  - That Land defines:
    - **Base biome** (desert, forest, mountain, coast, volcanic, mystical, etc.).
    - **Special resource bonuses** (spawn probabilities, multipliers).
    - **Global modifiers** for the player’s run:
      - +% Faith production.
      - +% fertility, +% stone, etc.

### Link With Your Current `TerrainGenerator`

- Your `TerrainGenerator` already produces a **local map** for the village.
- For Lands:
  - You introduce a new module (e.g. `WorldMapGenerator`) outside individual runs:
    - Represents the **global hex world** (the Lands).
  - Each Land (world hex) has a `landId` and a `biomeProfile`.
  - When a player starts a run:
    - They select/own a `landId`.
    - `SimulationSession` uses that `biomeProfile` as an extra **seed/config** for `TerrainGenerator`, biasing the map:
      - “Rich mountain” Land → more mountains, more stone, more gem‑type special resources.
      - “Mystic forest” Land → more forests, more Faith, more magical resources, etc.

### Tokens and Lands

- **Buying Lands**:
  - Only with **Token2**.
  - Each Land has rarity (common, rare, epic, legendary).
- **Starter packs (chests)**:
  - **Copper chest (easy)**:
    - 4–5 starting villagers.
    - Good initial stock of food and wood.
    - Lower long‑term rewards (lower Faith/Token1 multipliers).
  - **Silver chest (medium)**:
    - Tuned to your current “medium” difficulty.
  - **Gold chest (hard)**:
    - Fewer initial resources, but better drop or production multipliers.
  - All chests are **purchased with Token2**.

## 4. Full Economy Flow (Game Loop + Tokens)

### In‑Game Cycle (Off‑Chain)

1. The player enters with their chosen **Land** and starter pack.
2. Simulation:
   - Villagers produce basic resources.
   - The player builds **temples**.
   - The player assigns devotees → generates Faith → converts it into Token1.
3. Token1 is used to:
   - Upgrade buildings, activate boosters, unlock research, etc.
   - Part of the spending is **burned** or sent to a **conversion pool** (depending on design).
4. Long‑term:
   - **Burning Token1 to mint Token2 (expensive)**:
     - From the economy panel, the player can choose **“Convert Token1 → Token2”**.
     - Off‑chain, a burn operation is recorded and a **mint order** is created.

### On‑Chain Cycle (Future Summary)

- **Exporting Token1**:
  - The player has X Token1 off‑chain → requests withdrawal.
  - The backend burns those internal Token1 units and signs a transaction to mint them on‑chain.
- **Minting Token2 by burning Token1**:
  - Similar flow, but the off‑chain burn entitles the player to a calculated amount of Token2.
- **Buying Lands/Chests**:
  - The player uses Token2 **on‑chain** in a **store contract**.
  - The backend syncs the transaction and assigns the Land and the starter pack to the player’s game account.

## 5. Proposed Technical Architecture

### 5.1 Main Layers

#### Client (your TS/Vite game)

- Continues doing all **local simulation**:
  - `SimulationSession`, `WorldEngine`, `CitizenSystem`, `TerrainGenerator`.
- New modules/state:
  - `EconomyManager` or `TokenEconomy` in `core`:
    - Tracks Faith, off‑chain Token1, ratios, cooldowns.
    - Exposes methods: `addFaith(amount)`, `convertFaithToToken1()`, `spendToken1(cost)`, etc.
  - `TempleSystem` or an extension of `StructureManager`:
    - Manages devotee assignments.
- UI:
  - New HUD panels for Faith, Token1, Token2 (view‑only at first), Lands, and chests.

#### Lightweight Backend (API + State Server)

- Tech of your choice (Node, Python, etc.), but key roles:
  - **Persist** progress (Faith, Token1, special resources, lands).
  - Basic validation so the client cannot freely fake economic state.
  - Orchestrate blockchain operations:
    - Generate signatures for mint/burn.
    - Verify on‑chain purchases of Lands/chests.
- Likely data model:
  - `Players`, `Lands`, `EconomyState`, `Sessions`.

#### Blockchain Layer (Future)

- **Token1 contract**:
  - Inflationary ERC‑20, mint controlled by the backend (or a “bridge” contract).
- **Token2 contract**:
  - ERC‑20 with limited or governed supply.
- **Lands contract**:
  - ERC‑721 (or ERC‑1155) where each token is a `landId` with biome metadata.
- **Store contract**:
  - Accepts Token2 to:
    - Mint Lands.
    - Grant access to chests (chests could be ERC‑1155 as well).

## 6. How to Start Implementing This in Your Repo

### Internal Economy Model

- Create something like `EconomyManager.ts` in `core`:
  - **State**:
    - `faith: number`
    - `token1: number`
    - `token1Spent: number`
    - Ratios: `faithToToken1Rate`, `token1ToToken2Rate` (Token2 initially is only displayed).
  - **Methods**:
    - `addFaith(amount)`
    - `convertFaithToToken1(maxAmount?)`
    - `spendToken1(cost): boolean`
    - `getStats()`.
- Integrate into `SimulationSession`:
  - Instantiate `EconomyManager`.
  - Each tick, add Faith coming from temples.

### Extend Structures With Temple Info

- In `structures.ts`:
  - Ensure `temple` has new fields:
    - `maxDevotees`, `faithPerDevoteePerHour`, etc.
- In `StructureManager`:
  - Track the number of devotees per temple.
  - Provide APIs:
    - `assignDevotee(citizenId, templeId)`
    - `unassignDevotee`.

### Integrate With `CitizenSystem`

- In `CitizenBehaviorDirector`:
  - Add a “devotee” behavior/role that:
    - Keeps the villager at the temple (similar to resting, with minimal movement).
    - Notifies `EconomyManager` (or is counted by a central temple loop) every tick.
- UI:
  - In `CitizenControlPanel`:
    - A button/slot per temple to assign/unassign devotees.
  - In `HUDController`:
    - Show current Faith, Token1, and a conversion button.

### Simulate Lands Without Blockchain

- Create a `LandProfile` structure (for now in `config/game` or in a new `lands` module):
  - `id`, `biomeType`, `faithMultiplier`, `resourceSpecialMultipliers`, `difficultyPack`.
- Add to `SimulationSession`:
  - Field `activeLand: LandProfile`.
- Adapt `TerrainGenerator`:
  - Accept a `landProfile` or at least a set of modifiers (initially, `faithMultiplier` and one biome bias are enough).
- In `MainMenu`:
  - Add a simple Land selection (mock) for testing.

### Prepare Future Backend/Blockchain Integration

- Design a small interface on `EconomyManager` for synchronization:
  - `exportEconomySnapshot()` returning Faith, Token1, Token1Spent, etc.
  - `applyServerDelta()` so the backend can correct/close the session.
- In `wallet/onechainClient.ts`, add stubs for future calls:
  - `mintToken1OnChain(amount)`
  - `mintToken2FromBurn(amountToken1)`
  - `buyLandWithToken2(landId)`
  - For now they can just log and simulate responses.