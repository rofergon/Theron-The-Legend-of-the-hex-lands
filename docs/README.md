# Documentation Directory

This directory contains comprehensive documentation for **Theron: Legends of the Hex Lands**, organized by audience and purpose.

## 📄 Contents

### [`investor-brief.md`](./investor-brief.md)
**Audience:** Investors, stakeholders, and business partners

Complete investor overview covering:
- **Game Overview**: Genre, core hook, and technical stack
- **Core Systems**: World engine, citizen simulation, and blockchain integration
- **Tokenomics**: Two-token economy model (Faith → HEX → THERON)
  - Faith: In-game soft resource from temples
  - HEX: Utility token (on-chain, earned through gameplay)
  - THERON: Premium token (purchased with OCT or minted by burning HEX)
- **Starter Chests**: Gold/Silver/Copper packages with villagers and buildings
- **Market Position**: Differentiation strategy and roadmap milestones
- **Investment Levers**: Treasury, emissions, staking, liquidity, governance

### [`player-brief.md`](./player-brief.md)
**Audience:** Players and end users

Quick-start player guide including:
- **What the Game Is**: Autonomous villager simulation with procedural worlds
- **Quick Loop**: 5-step gameplay cycle (look → paint → assign → build → react)
- **Roles**: Farmer, Worker, Warrior, Scout, Devotee
- **Buildings & Resources**: Granary, warehouse, temples, towers
- **Threats & Events**: Weather, travelers, beasts, raiders
- **Controls**: Camera, priorities, speed control, citizen selection
- **Token Basics**: Optional Faith → HEX conversion via OneWallet
- **Tips**: Starting strategies for food, defense, and exploration

### [`system-report.md`](./system-report.md)
**Audience:** Developers and technical team

High-level technical architecture and implementation plan:
- **Token & Resource Definitions**: Complete economic system design
  - Token1 (in-game utility): Emission via temples, sinks via upgrades
  - Token2 (premium): Land purchases, starter chests, governance
  - Conversion mechanics and burn/mint flows
- **Temple & Faith System**: Devotee mechanics, faith generation formulas
- **Lands System**: World map hexes, biome profiles, rarity tiers
- **Economy Flow**: Off-chain gameplay loop and on-chain synchronization
- **Technical Architecture**: 
  - Client layer (EconomyManager, TempleSystem)
  - Backend API (persistence, validation, blockchain orchestration)
  - Blockchain layer (Token1/Token2/Lands contracts, store)
- **Implementation Steps**: Concrete code integration points in current codebase

## 🎯 Quick Reference

| Document | Purpose | Key Topics |
|----------|---------|------------|
| `investor-brief.md` | Business case & tokenomics | ROI, market fit, token mechanics, monetization |
| `player-brief.md` | Gameplay guide | Controls, roles, strategy, basics |
| `system-report.md` | Technical design | Architecture, implementation, code structure |

## 🔗 Related Files

- **Main README**: [`../README.md`](../README.md) - Project overview and setup
- **Contract Deployment**: [`../smart-contracts/`](../smart-contracts/) - Blockchain deployment scripts
- **Source Code**: [`../src/`](../src/) - Game implementation
- **Landing Pages**: [`../public/landing/`](../public/landing/), [`../public/tokenomics/`](../public/tokenomics/)

## 🚀 Getting Started

**For Investors:** Start with `investor-brief.md` to understand the business model and market opportunity.

**For Players:** Read `player-brief.md` for gameplay mechanics and quick tips to get started.

**For Developers:** Review `system-report.md` for technical architecture and implementation guidance.

---

*These documents are maintained as the game evolves. Last updated: November 2025*
