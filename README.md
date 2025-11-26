<div align="center">
  
![Theron: Legends of the Hex Lands](https://raw.githubusercontent.com/rofergon/carpeta-con-juan/main/.github/cover.png)

# 🌟 Theron: Legends of the Hex Lands

A blockchain-integrated tribal simulation game where you guide and protect a growing civilization as its guardian spirit. Watch your people work, survive, and expand in a procedurally generated hex-based world with autonomous villagers, dynamic events, and blockchain-powered economy.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![Vite](https://img.shields.io/badge/Vite-7.2.2-purple)
![OneChain](https://img.shields.io/badge/OneChain-Testnet-orange)

</div>

## ✨ Features

### 🎮 Core Gameplay
- **Procedural worlds**: Unique biomes, resources, rivers, and terrain each run
- **Autonomous villagers**: Individual needs (hunger, fatigue, morale), roles, inventories, and action history
- **Resource management**: Food, stone, wood, and water with storage caps that grow via buildings
- **Dynamic events**: Droughts, rain, migrants, and roaming beasts that alter pacing and risk
- **Construction system**: Build granaries, warehouses, houses, towers, temples, and campfires
- **Planning tools**: Paint farm/mine/gather priorities; manage roles and control simulation speed
- **Combat & defense**: Warriors protect your settlement from raiders and beasts
- **Citizen lifecycle**: Children grow to adults, adults age to elders, reproduction system

### 🔗 Blockchain Integration (OneChain)
- **HEX Token**: Convert in-game Faith to HEX tokens on OneChain blockchain
- **THERON Token**: Premium currency for purchasing NFTs and special items
- **OneWallet Integration**: Secure wallet connection using Wallet Standard
- **NFT System**: Land NFTs with different rarities and biomes
- **On-chain Economy**: Faith → HEX → THERON conversion pipeline
- **Starter Packs**: Copper, Silver, and Gold chests with villagers and resources
- **Marketplace**: Browse and purchase lands and starter packs with blockchain tokens

## 🎮 Controls

### Movement & Camera
- **WASD** / **Arrow keys**: Pan camera
- **Mouse wheel** / **+/- buttons**: Zoom in/out
- **Middle-click + drag**: Pan camera
- **Left-click**: Select citizen or inspect cell

### Planning & Building
- **1-4 hotkeys**: Set priorities (explore / defend / farm / mine)
- **0**: Clear priority from selected cell
- **B**: Enter build mode (or click a building icon); click map to place blueprint
- **Esc**: Cancel build mode

### Spirit Powers & Time Control
- **E** or **Space**: Bless nearby citizen (boosts morale)
- **T**: Invoke protective totem
- **Enter**: Start game from menu
- **Pause button** (⏸️ in HUD): Toggle pause/resume
- **Speed controls**: 1x, 2x, 4x simulation speed

### UI Interactions
- **Click citizen portrait**: Select and focus camera on citizen
- **Click 🪙 icon**: Open Faith → HEX conversion modal
- **Click resource pills**: View detailed resource information

## 🚀 Installation & Setup

### Prerequisites
- **Node.js** 16+ and npm (or yarn)
- **OneWallet** browser extension (for blockchain features)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/rofergon/carpeta-con-juan.git
cd carpeta-con-juan

# Install dependencies
npm install

# Start development server
npm run dev          # Access at http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
```

### OneWallet Setup (for blockchain features)

1. **Install OneWallet extension**: https://wallet.onelab.cc/
2. **Create or import wallet**: Follow the extension setup wizard
3. **Switch to Testnet**: Required for development/testing
4. **Get test OCT tokens**: Use faucet for gas fees (see Deploy_Contracst/README.md)

### Project Structure
```
├── index.html              # Main game entry point
├── public/
│   ├── landing/           # Marketing landing page
│   ├── store/             # NFT marketplace UI
│   └── assets/            # Game textures, icons, sprites
├── src/
│   ├── main.ts            # Application entry point
│   ├── config/
│   │   └── contracts.ts   # Blockchain contract addresses
│   ├── game/
│   │   ├── game.ts        # Core game loop and orchestration
│   │   ├── core/          # World engine, camera, input handling
│   │   ├── systems/       # Citizen AI, resource management
│   │   ├── ui/            # Renderer, HUD, menus, tooltips
│   │   ├── wallet/        # OneWallet & OneChain integration
│   │   └── data/          # Structure definitions, constants
│   └── style.css          # Global styles
├── Deploy_Contracst/      # Move smart contracts
│   ├── sources/           # .move contract files
│   └── build/             # Compiled bytecode
└── tests/                 # Vitest unit tests
```

## 📖 How to Play

### 1. World Generation
- **Choose seed**: Use random or custom seed for world generation
- **Select size**: Small (60×60), Normal (80×80), Large (100×100)
- **Pick difficulty**: Easy (more resources), Normal, Hard (survival challenge)
- **Preview map**: See your world before starting

### 2. Getting Started
- Review your **starting villagers** and their roles
- Check **initial stockpile** (food, wood, stone)
- Identify nearby **resource nodes** (forests, stone deposits, water)
- Place your first **priorities** (farm on fertile land, mine on mountains)

### 3. Resource Management
- **Food**: Essential for survival; harvest from farms or gather naturally
  - Build **granaries** to increase storage capacity
  - Farm on high-fertility tiles for better yields
- **Wood**: Used for construction; gather from forests
  - Forests regenerate over time with good climate
- **Stone**: Required for advanced buildings; mine from mountains
  - Finite resource, plan carefully
- **Water**: Needed for farms and citizen survival
  - Settle near rivers or build wells

### 4. Citizen Roles
Manage villager assignments via role sliders:
- **Farmers**: Sow, fertilize, and harvest crops on farm-designated tiles
- **Workers**: Construct buildings and gather resources
- **Warriors**: Defend against raiders and beasts
- **Scouts**: Explore map and reveal new areas
- **Devotees**: Generate Faith at temples (unlock via temple construction)
- **Children/Elders**: Non-assignable; children grow into adults

### 5. Planning System
Paint the map to guide villager behavior:
- **Farm (hotkey 3)**: Villagers will plant and tend crops
- **Mine (hotkey 4)**: Workers will extract stone
- **Gather (hotkey 1)**: Quick collection of natural resources
- **Defend (hotkey 2)**: Warriors will patrol this area
- **Clear (hotkey 0)**: Remove priority designation

### 6. Construction
- **Unlock buildings** by reaching population thresholds
- **Place blueprints** with B key or click building icons
- Workers automatically **haul materials** and complete construction
- Buildings provide benefits:
  - **Granary**: +50 food storage
  - **Warehouse**: +100 wood/stone storage
  - **House**: +3 population capacity
  - **Tower**: Defense structure, warriors gain combat bonuses nearby
  - **Temple**: Unlocks devotee role, generates Faith
  - **Campfire**: Boosts morale in radius

### 7. Events & Survival
- **Droughts**: Reduced crop growth, increased hunger
- **Rain**: Faster crop growth, forest regeneration
- **Migrants**: New villagers join (if you have food)
- **Beast attacks**: Defend with warriors or lose citizens
- **Raiders**: Hostile humans attacking for resources

### 8. Blockchain Economy
- **Generate Faith**: Build temples, assign devotees
- **Convert Faith → HEX**: Click 🪙 icon, sign with OneWallet (100 Faith = 1 HEX)
- **Acquire THERON**: Convert 100,000 HEX = 1 THERON
- **Purchase NFTs**: Visit `/store/` to buy lands and starter packs
- **Manage wallet**: Connect/disconnect via header button

### 9. Winning Strategy
- **Early game**: Focus on food production, build granaries
- **Mid game**: Expand population, construct warehouses and houses
- **Late game**: Build temples, generate Faith, defend against threats
- **Endgame**: Convert Faith to HEX, purchase rare Land NFTs

## 🖼️ Assets & Art

All in-game graphical assets, textures, and artwork were generated with the assistance of ChatGPT and GoogleBanana.

## 🌍 World & Biomes

### Terrain Types
- **Ocean**: Impassable water, defines map boundaries
- **Beach**: Coastal transition zone, low resources
- **Grassland**: Balanced fertility, ideal for farming
- **Forest**: High wood yield, renewable resource
- **Desert**: Low fertility, high hunger rate for citizens
- **Tundra**: Cold biome, slower crop growth
- **Mountain**: High stone deposits, difficult movement
- **Snow**: Extreme cold, very challenging terrain
- **Swamp**: High humidity, slows movement, moderate fertility
- **River**: Fresh water source, enables farming

### Terrain Properties
- **Elevation**: Affects temperature and resource types
- **Humidity**: Influences crop growth and forest regeneration
- **Fertility**: Determines crop yield potential
- **Climate**: Dynamic system affecting all resource regeneration

### Resource Nodes
- **Food nodes**: Berry bushes, fruit trees (renewable with climate)
- **Wood nodes**: Forests, tree clusters (regrow over time)
- **Stone deposits**: Mountains, rocky outcrops (finite resource)
- **Water sources**: Rivers, lakes (required for farms)

## ⛓️ Blockchain Integration

### OneChain & OneWallet
**Theron** integrates with [OneChain](https://onelabs.cc), a high-performance Sui-based blockchain:
- **Network**: OneChain Testnet (development) / Mainnet (production)
- **Native token**: OCT (for gas fees)
- **Wallet**: OneWallet browser extension (Wallet Standard compliant)
- **Explorer**: https://onescan.cc/testnet

### Token Economy

#### HEX Token (In-Game Currency)
- **Earn in-game**: Convert Faith (spiritual resource) to HEX tokens
- **Conversion rate**: 100 Faith = 1 HEX
- **How to obtain Faith**:
  1. Build temples in your settlement
  2. Assign villagers as devotees
  3. Wait for Faith to accumulate
  4. Click 🪙 icon to convert

#### THERON Token (Premium Currency)
- **Acquire via**: Burn 100,000 HEX = 1 THERON
- **Use for**: Purchase Land NFTs and premium starter packs
- **Contract**: Deployed on OneChain
- **Token type**: Fungible token with burn mechanism

### Smart Contracts
All contracts deployed on OneChain Testnet:

```typescript
// Contract addresses (src/config/contracts.ts)
HEX_PACKAGE_ID: '0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d'
TREASURY_CAP_ID: '0xa48be070305d5a94144ec13ef71733cbdd9fb2fca1352b492d51a66db28f03d5'
ECONOMY_STATS_ID: '0xf57368221c63529dd792b205f82294b25919e4ef306ba98c4f49a5589d961b3f'
```

**Available functions**:
- `hex_token::mint_from_faith` - Convert Faith to HEX
- `theron_token::burn_hex_for_theron` - Convert HEX to THERON
- `land_nft::mint_land` - Create Land NFTs
- `store::purchase_chest` - Buy starter packs

### NFT System

#### Land NFTs
Unique parcels of land with on-chain attributes:
- **Rarity tiers**: Common, Rare, Epic, Legendary
- **Biome types**: Desert, Mountain, Ocean, Tropical
- **Properties**: Size, fertility, resource richness
- **Pricing**: 10-50 THERON depending on rarity

#### Starter Pack Chests
Pre-configured settlements with villagers and resources:

| Pack | Difficulty | Price | Contents |
|------|-----------|--------|----------|
| **Copper Chest** | Hard | 5 THERON | 3 settlers, minimal resources |
| **Silver Chest** | Normal | 15 THERON | 5 villagers, 1 land plot, balanced resources |
| **Gold Chest** | Easy | 40 THERON | 10 villagers, buildings, abundant resources |

### Using Blockchain Features

#### Connect Wallet
```typescript
// Automatic connection when converting Faith
// Or click "Connect Wallet" in header
```

#### Convert Faith to HEX
1. Accumulate 100+ Faith in-game
2. Click 🪙 icon in header
3. Review conversion details
4. Click "Convert all"
5. Approve transaction in OneWallet
6. Wait for confirmation (~5-10 seconds)
7. HEX tokens appear in your wallet

#### Purchase from Store
1. Visit `/store/index.html`
2. Browse starter packs and lands
3. Ensure you have sufficient THERON
4. Click "Buy" button
5. Confirm transaction in OneWallet
6. NFT transfers to your wallet

### Technical Implementation

#### Wallet Detection
```typescript
// Uses Wallet Standard (@mysten/wallet-standard)
import { findOneWallet } from './wallet/onewalletDetector';
import { connectOneWallet } from './wallet/walletConfig';
```

#### Transaction Signing
```typescript
// OneChain client (@onelabs/sui)
import { Transaction } from '@onelabs/sui/transactions';
import { SuiClient } from '@onelabs/sui/client';
```

#### Conversion Service
```typescript
// src/game/wallet/hexConversionService.ts
export async function convertFaithToHex(
  faithAmount: number,
  walletAddress: string
): Promise<TransactionStatus>
```

### Development & Testing

**Test with Testnet**:
```bash
# Request test OCT from faucet
cd Deploy_Contracst
node request-faucet.mjs

# Deploy contracts (if needed)
node deploy-sdk.mjs

# Check wallet balance
node check-wallet-balance.mjs
```

**Verify on Explorer**:
- View transactions: `https://onescan.cc/testnet/tx/[TX_HASH]`
- View wallet: `https://onescan.cc/testnet/address/[ADDRESS]`
- View contract: `https://onescan.cc/testnet/object/[PACKAGE_ID]`

### Additional Documentation
- **Technical guide**: `src/game/wallet/README.md`
- **Integration guide**: `src/game/wallet/README_HEX_INTEGRATION.md`
- **Quick start**: `QUICK_START.md`
- **Deployment info**: `Deploy_Contracst/DEPLOYMENT_SUCCESS.md`

## 🏗️ Architecture & Systems

### Core Systems

#### World Engine (`src/game/core/world/WorldEngine.ts`)
- Procedural terrain generation using seed-based algorithms
- Resource node placement and regeneration
- Climate simulation affecting crop growth
- Pathfinding with A* algorithm and caching
- Construction site management
- Stockpile tracking and storage limits

#### Citizen System (`src/game/systems/citizen/`)
- **CitizenBehaviorDirector**: High-level decision-making AI
- **CitizenActionExecutor**: Action implementation (gather, build, attack, farm)
- **CitizenNeedsSimulator**: Hunger, fatigue, morale, aging simulation
- **CitizenRepository**: Population management and queries
- **Navigator**: Pathfinding and movement coordination

#### Resource System (`src/game/systems/resource/`)
- **ResourceCollectionEngine**: Gathering logic for food, wood, stone
- Inventory management per citizen
- Storage validation and capacity checks
- Depletion and regeneration mechanics

#### Game Loop (`src/game/game.ts`)
- Tick-based simulation (configurable speed)
- Event processing and notifications
- UI synchronization (HUD, tooltips, panels)
- Input handling and camera control
- Lifecycle management (pause, speed control)

### UI Components

#### Renderer (`src/game/ui/GameRenderer.ts`)
- Canvas-based hex grid rendering
- Sprite system for citizens, buildings, resources
- Fog of war and visibility
- Projectile animations
- Debug overlays

#### Controllers
- **HUDController**: Resource display, population stats
- **CitizenPortraitBarController**: RimWorld-style citizen bar
- **CitizenControlPanelController**: Individual citizen inspection
- **CellTooltipController**: Hover information
- **PlanningController**: Priority painting (farm/mine/gather)
- **RoleController**: Role assignment sliders
- **ThreatController**: Enemy invasion alerts
- **TokenController**: Faith/HEX conversion modal

### Key Features

#### Pathfinding
- **A* with caching**: Common paths (village center, structures) are cached
- **Greedy fallback**: When pathfinding fails, use direct movement
- **Stuck detection**: Retry paths after 3 failed attempts
- **Terrain costs**: Mountains, swamps slow movement

#### AI Behavior
Each role has specialized AI:
- **Farmer AI**: Prioritizes farm tasks (sow, fertilize, harvest) → storage
- **Worker AI**: Constructs buildings → gathers resources
- **Warrior AI**: Hunts threats → patrols defend zones
- **Scout AI**: Explores marked areas → reveals map
- **Devotee AI**: Worships at temples → generates Faith

#### Construction Pipeline
1. Player places blueprint via UI
2. World creates construction site
3. Workers pathfind to site
4. Workers gather required materials
5. Workers haul materials to site
6. Progress accumulates with labor + materials
7. Building completes, benefits activate

#### Event System
- **Drought**: `-30% crop growth, +50% hunger rate`
- **Rain**: `+40% crop growth, faster forest regen`
- **Migrants**: `New citizens if food > threshold`
- **Beasts**: `Attack nearby citizens, 15 base damage`
- **Raiders**: `Human enemies, strategic attacks`

### Performance Optimizations

- **Viewport culling**: Only render visible hex cells
- **Path caching**: Reuse common paths to reduce A* calls
- **Lazy updates**: UI refreshes on change, not every frame
- **Event batching**: Group notifications to avoid spam
- **Resource pooling**: Reuse sprite objects

### Testing

```bash
# Run unit tests
npm run test

# Test specific file
npm run test CitizenSystem.test.ts

# Watch mode
npm run test -- --watch
```

Key test coverage:
- Citizen needs simulation (hunger, fatigue)
- Pathfinding correctness
- Resource collection logic
- Construction progress calculation

## 🛠️ Development Tools

### Debug Features
- **Chronicle/history panel**: Full event log with timestamps
- **Per-citizen action history**: Last 15 actions for each villager
- **Debug export**: Download complete game log as text file
- **Console logging**: Detailed citizen behavior logs (toggle with `debugLogging`)
- **Visual overlays**: Show priorities, paths, construction sites

### Available Scripts

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # TypeScript check + production build
npm run preview   # Preview production build locally
npm run test      # Run Vitest unit tests
```

### Browser DevTools Tips

**Monitor citizen behavior**:
```javascript
// Access game instance (if exposed)
window.gameInstance?.simulation?.citizens
```

**Check world state**:
```javascript
// View stockpile
world.stockpile

// Check construction sites
world.constructionSites
```

**Debug pathfinding**:
```javascript
// Test path calculation
world.findPath({ x: 10, y: 10 }, { x: 20, y: 20 })
```

### Modding & Customization

#### Adjust Game Balance
Edit `src/game/core/constants.ts`:
```typescript
export const GAME_HOURS_PER_YEAR = 24;  // Aging speed
export const REST_START_FATIGUE = 70;   // When citizens rest
export const HUNGER_RATE = 0.864;        // Hunger accumulation
```

#### Add New Structures
Edit `src/game/data/structures.ts`:
```typescript
export const STRUCTURES: Record<StructureType, StructureDefinition> = {
  myCustomBuilding: {
    displayName: "Custom Building",
    laborRequired: 50,
    costs: { wood: 10, stone: 5 },
    // ...
  }
}
```

#### Create Custom Biomes
Modify `src/game/core/world/TerrainGenerator.ts`:
```typescript
// Add new terrain type in generation logic
```

### Common Issues & Solutions

**Game won't start**:
- Check console for errors
- Verify all dependencies installed: `npm install`
- Clear browser cache and reload

**Pathfinding issues**:
- Citizens stuck: Increase `stuckCounter` threshold
- No valid path: Check terrain walkability
- Performance problems: Reduce map size or increase cache

**Blockchain transactions failing**:
- Ensure OneWallet is connected
- Check OCT balance for gas
- Verify network is Testnet
- See console for detailed error messages

**Build errors**:
- Run `npm run build` to see TypeScript errors
- Check import paths are correct
- Ensure all types are properly defined

### Contributing Guidelines

We welcome contributions! Here's how to help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** with clear commit messages
4. **Run tests**: `npm run test`
5. **Check TypeScript**: `npm run build`
6. **Submit a Pull Request** with description

**Code Style**:
- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions focused and testable

**Areas that need help**:
- 🎨 Additional biome textures and sprites
- 🎵 Sound effects and background music
- 🌍 More event types and narratives
- 🏆 Achievement system implementation
- 📊 Analytics and statistics dashboard
- 🔧 Performance optimizations
- 📝 Documentation improvements

## 📝 License

ISC License - See package.json for details

## 🔗 Links

- **Repository**: https://github.com/rofergon/carpeta-con-juan
- **OneChain Docs**: https://docs.onelabs.cc/DevelopmentDocument
- **OneWallet**: https://wallet.onelab.cc/
- **Explorer**: https://onescan.cc/testnet

## 🙏 Acknowledgments

Built with:
- **Vite** - Lightning-fast build tool
- **TypeScript** - Type-safe development
- **OneChain** - High-performance blockchain
- **Canvas API** - Rendering engine
- **Vitest** - Fast unit testing

Special thanks to the OneChain team for blockchain infrastructure support.

## 📊 Project Status

- ✅ Core gameplay systems complete
- ✅ Blockchain integration functional (HEX token)
- ✅ Landing page and store UI implemented
- 🚧 THERON token conversion (in progress)
- 🚧 NFT minting and marketplace (in progress)
- 📋 Save/load system (planned)
- 📋 Multiplayer/diplomacy (planned)
- 📋 Mobile support (planned)

## 🎯 Roadmap

### Version 1.1 (Current)
- [x] HEX token integration
- [x] Faith to HEX conversion
- [x] Store UI design
- [ ] THERON token functionality
- [ ] Land NFT minting
- [ ] Starter pack purchasing

### Version 1.2 (Next)
- [ ] Save/load system with localStorage
- [ ] Achievement tracking
- [ ] Music and sound effects
- [ ] Tutorial system for new players
- [ ] Mobile-responsive UI

### Version 2.0 (Future)
- [ ] Multiple tribes and diplomacy
- [ ] PvP land competitions
- [ ] Seasonal events and rewards
- [ ] Advanced economy stats dashboard
- [ ] Guild/alliance system

## 🐛 Known Issues

- Citizens occasionally get stuck on complex terrain → Use scout to clear fog
- High population (>50) may cause performance drops → Reduce simulation speed
- OneWallet connection requires page refresh if extension just installed
- Some textures may not load on first run → Refresh browser

Report issues on GitHub: https://github.com/rofergon/carpeta-con-juan/issues

## 📚 Additional Documentation

- **Technical docs**: `src/game/wallet/README.md`
- **HEX integration**: `src/game/wallet/README_HEX_INTEGRATION.md`
- **Quick start guide**: `QUICK_START.md`
- **Integration summary**: `INTEGRATION_COMPLETE.md`
- **Contract deployment**: `Deploy_Contracst/DEPLOYMENT_SUCCESS.md`
- **Testing guide**: `GUIA_PRUEBAS.md`
- **System report**: `docs/system-report.md`

---

**Built with ❤️ by the Theron team**

*Guide your tribe. Build your legacy. Survive the hex lands.*
