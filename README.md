# 🌟 Guardian Spirit – Tribal Simulation

A tribal simulation where you guide and protect a growing village as its guardian spirit. Watch your people work, survive, and expand in a procedurally generated world with autonomous villagers, dynamic events, and buildable structures.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![Vite](https://img.shields.io/badge/Vite-7.2.2-purple)

## Overview
- Procedural worlds: unique biomes, resources, rivers, and terrain each run.
- Autonomous villagers: individual needs, roles, inventories, and action history.
- Resources: food, stone, wood, and water with storage caps that grow via buildings.
- Events: droughts, rain, migrants, and roaming beasts that alter pacing and risk.
- Construction: place blueprints for granaries, warehouses, houses, towers, temples, and campfires.
- Planning tools: paint farm/mine/gather priorities; manage roles and speed/ pause from the HUD.

## Controls
### Movement & Camera
- WASD / Arrow keys: pan.
- Mouse wheel or +/- buttons: zoom.
- Middle-click + drag: pan.
- Left-click: select citizen or cell.

### Planning & build
- 1–4 (hotkeys): explore / defend / farm / mine.
- 0: clear priority.
- B: enter build mode (or click a building hex); click map to place a blueprint.

### Spirit & time
- E or Space: bless a nearby citizen.
- T: invoke a protective totem.
- Enter: start from menu. Pause button in HUD toggles pause.

## Install & Run
Prerequisites: Node.js 16+, npm or yarn.

```bash
git clone https://github.com/rofergon/carpeta-con-juan.git
cd carpeta-con-juan
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
npm run preview      # preview production
```

## How to Play
1) World setup: pick or generate a seed; choose size (Small/Normal/Large) and difficulty (Easy/Normal/Hard); preview the map.  
2) First steps: review starting villagers and roles, check initial stockpile, and place your first priorities.  
3) Manage roles with sliders (farmer, worker, warrior, scout; devotees unlock with temples).  
4) Paint priorities: farm for crops, mine for stone, gather for quick naturals.  
5) Build: unlock structures by population thresholds, place blueprints, and let workers haul materials and finish construction.  
6) Stay ahead of events: stock food, expand storage, and defend during droughts or beast attacks.

## Project Layout (src/)
```
main.ts           Entry point
style.css         Global styles and HUD
game/
  game.ts         Core loop, input, planning, HUD sync
  core/           Constants, types, utils, world engine, camera, input
  systems/        Citizen simulation, behaviors, needs, resource flow
  ui/             Renderer, HUD, menus, tooltips, citizen portraits/panel
  data/           Structure definitions
```

## World & Resources
- Biomes: ocean, beach, grassland, forest, desert, tundra, mountain, snow, swamp, river.
- Terrain traits: elevation, humidity, fertility influence crops and resource richness.
- Renewable nodes (food, wood) regrow with climate; stone is finite. Granaries/warehouses raise storage caps.

## Debug & Dev Aids
- Chronicle/history panel of events.
- Per-citizen action history.
- Debug export button to download a full event log.

## Planned Features
- Save/load
- Advanced settings
- Music/SFX
- Achievements and deeper stats
- Multiple tribes and diplomacy

## Contributing
PRs and feedback welcome. Run `npm run lint` / `npm run test` if available before submitting.
