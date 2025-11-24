# Game Loop, World, and Villager System Report

## Game Loop
- The main loop lives in `src/game/game.ts:844`. It starts with `requestAnimationFrame`, stops delta accumulation when the menu is open, and resumes counting when the menu is closed.
- Each frame converts real time into simulation hours: it adds `deltaSeconds * HOURS_PER_SECOND * speedMultiplier` and processes fixed-size ticks `TICK_HOURS` (0.25 h, about 1 hour in ~4 real seconds). Inside the `while` it calls `runTick`.
- `runTick` delegates to `SimulationSession.runTick`, which applies pending priorities, updates events and weather, advances the world (`WorldEngine.updateEnvironment`), and runs the citizen system. After that it syncs the HUD, citizen panel, and structure selection.
- Rendering happens at the end of each frame with `GameRenderer.render`, receiving the camera view, entities, notifications, and cell hover/selection.
- Real-time input captures priority hotkeys (`PRIORITY_KEYMAP`), planning modes (farm/mine/gather/build), building cycle, zoom, and speed.

## World Generator
- `WorldEngine` (`src/game/core/world/WorldEngine.ts`) builds the map. It uses `TerrainGenerator` to produce grids of `WorldCell` with terrain, fertility, moisture, and initial resources, then places the village center and initial structures via `StructureManager`.
- Navigation and movement use `PathFinder`, with walkable cells except ocean/snow. `addCitizen/moveCitizen` keep track of inhabitants per cell.
- `TerrainGenerator` (`src/game/core/world/modules/TerrainGenerator.ts`):
  - Generates elevation and moisture maps using multi-octave noise and warping.
  - Shapes smoothed biome regions, rivers from peaks, coherent oceans, and beaches adjacent to the sea.
  - Ensures a mountainous core (and relocates resources there) and applies height/moisture biases to resolve the final biome per cell.
- `ResourceGenerator` determines fertility by terrain and distributes resources:
  - Renewable food hotspots in grasslands/forests/swamps depending on fertility; springs on rivers/ocean.
  - Renewable wood clusters in forests and non-renewable stone clusters in mountain/tundra/desert, ensuring at least some stone in the mountainous zone.
- Global stockpile state: food/stone/wood with base capacities; `updateEnvironment` adjusts capacities if there is a granary/warehouse, grows renewable resources, and advances crops by stages depending on weather (drought/rain).
- Cell priorities (`setPriorityAt`) paint farm/mine/gather/explore/defend. Marking farm starts `farmTask = sow` and resets progress if unmarked.

## Villager System, Roles, and Resources
- `SimulationSession` (`src/game/core/SimulationSession.ts`) instantiates `WorldEngine` and `CitizenSystem`, creates the initial tribe according to difficulty, and propagates events/weather each tick.
- `CitizenSystem` (`src/game/systems/CitizenSystem.ts`) orchestrates:
  - `CitizenNeedsSimulator` applies hunger/fatigue/morale and deaths.
  - `CitizenBehaviorDirector` decides actions by role/goal, prioritizing urgent needs (eating, fleeing, resting).
  - `Navigator` moves using pathfinding, `CitizenActionExecutor` applies effects (gathering, building, combat, crop care, rest, storage) and logs actions.
  - `ResourceCollectionEngine` implements the gathering "brain": phases go to resource → gather → go to storage, with per-type carrying capacity. It deposits in cells with `village/granary/warehouse`.
- Key roles:
  - `farmer`: prioritizes farming tasks on farm cells (sow/fertilize/harvest), then uses the food gathering brain as a fallback.
  - `worker`: follows construction directives (carry stone/wood from stockpile, work on the site). If there is no construction or materials are missing, it switches to gathering stone/wood depending on stock/capacity.
  - `warrior`: looks for threats (`threats` from `WorldView`), defends or patrols the center.
  - `scout`: follows `explore` marks or wanders.
  - `child/elder`: passive; a child can mature into a worker, an elder takes age damage.
- Resource flow: gatherers consume nodes (renewables decrease but grow back with weather), carry loads to storages, `deposit/consume` in the world adjusts stock and affects morale/life through hunger; construction consumes stock delivered by workers.

## How This Relates to Player Actions
- Roles: HUD sliders (`Game.handleRoleSliderInput`) rebalance assignable populations by calling `CitizenSystem.rebalanceRoles`; changes are applied on the fly when the villager is not "busy".
- Planning: buttons/hotkeys activate farm/mine/gather/build modes. Dragging over the map calls `WorldEngine.setPriorityAt`, painting cells that AIs use to choose resources or define farming tasks.
- Construction: in build mode the player selects an unlocked structure (depends on population in `SimulationSession.getAvailableStructures`), places a blueprint (`planConstruction`). `StructureManager` creates sites; `workerAI` carries materials from the stockpile and works until completion, which in turn expands capacities (granary/warehouse) and enables defense/faith (tower/temple).
- Time pacing: the player adjusts `speedMultiplier` or pauses; this changes how many ticks run per frame but does not change per-tick AI logic.
- Selection and focus: click/tap selects a villager or shows a cell tooltip; the camera can focus on a villager from the panel, but AI remains autonomous.
