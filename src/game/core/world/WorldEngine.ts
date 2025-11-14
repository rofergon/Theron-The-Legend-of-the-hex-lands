import { WORLD_SIZE } from "../constants";
import { clamp, hashNoise, mulberry32 } from "../utils";
import type {
  Citizen,
  ClimateState,
  PriorityMark,
  ResourceNode,
  ResourceType,
  StructureType,
  Terrain,
  Vec2,
  WorldCell,
  WorldView,
} from "../types";

export class WorldEngine {
  readonly size: number;
  readonly cells: WorldCell[][];
  readonly stockpile = {
    food: 40,
    stone: 10,
    water: 20,
    foodCapacity: 80,
    stoneCapacity: 40,
  };

  readonly villageCenter: Vec2;
  private structures: Array<{ type: StructureType; x: number; y: number }> = [];
  private rng: () => number;

  constructor(size = WORLD_SIZE, seed = Date.now()) {
    this.size = size;
    this.rng = mulberry32(seed);
    this.cells = this.generateTerrain(seed);
    this.villageCenter = this.placeVillageCenter();
    this.buildStructure("village", this.villageCenter.x, this.villageCenter.y);
    this.placeInitialStructures();
  }

  citizenLookup?: (id: number) => Citizen | undefined;

  private generateTerrain(seed: number) {
    const rows: WorldCell[][] = [];
    for (let y = 0; y < this.size; y += 1) {
      const row: WorldCell[] = [];
      for (let x = 0; x < this.size; x += 1) {
        const height = this.fractalNoise(x, y, seed);
        const moisture = this.fractalNoise(x + 1000, y + 1000, seed);
        const terrain: Terrain = this.pickTerrain(height, moisture);
        const fertility = terrain === "grass" ? clamp(moisture + 0.2, 0, 1) : terrain === "desert" ? 0.2 : 0.05;
        const resource = this.generateResource(terrain, x, y);

        const cell: WorldCell = {
          x,
          y,
          terrain,
          fertility,
          moisture,
          inhabitants: [],
          priority: "none",
          cropProgress: 0,
        };

        if (resource) {
          cell.resource = resource;
        }

        row.push(cell);
      }
      rows.push(row);
    }
    return rows;
  }

  private fractalNoise(x: number, y: number, seed: number) {
    let total = 0;
    let amplitude = 1;
    let frequency = 0.05;
    for (let i = 0; i < 3; i += 1) {
      total += hashNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return clamp(total, 0, 1);
  }

  private pickTerrain(height: number, moisture: number): Terrain {
    if (height < 0.35) return "water";
    if (height > 0.8) return "mountain";
    if (moisture < 0.3) return "desert";
    return "grass";
  }

  private generateResource(terrain: Terrain, x: number, y: number): ResourceNode | undefined {
    const roll = this.rng();
    if (terrain === "grass" && roll > 0.7) {
      return { type: "food", amount: 2 + Math.floor(roll * 4), renewable: true, richness: 1 };
    }
    if (terrain === "mountain" && roll > 0.55) {
      return { type: "stone", amount: 4 + Math.floor(roll * 6), renewable: false, richness: 1 };
    }
    if (terrain === "water" && roll > 0.65) {
      return { type: "waterSpring", amount: 5, renewable: true, richness: 1 };
    }
    if (terrain === "desert" && roll > 0.85) {
      return { type: "stone", amount: 2, renewable: false, richness: 0.4 };
    }
    return undefined;
  }

  private placeVillageCenter(): Vec2 {
    let best = { x: Math.floor(this.size / 2), y: Math.floor(this.size / 2), score: -Infinity };
    for (let y = 8; y < this.size - 8; y += 1) {
      for (let x = 8; x < this.size - 8; x += 1) {
        const cell = this.cells[y]?.[x];
        if (!cell || cell.terrain !== "grass") continue;
        const score = cell.fertility + cell.moisture - Math.abs(x - this.size / 2) * 0.01 - Math.abs(y - this.size / 2) * 0.01;
        if (score > best.score) {
          best = { x, y, score };
        }
      }
    }
    return { x: best.x, y: best.y };
  }

  private placeInitialStructures() {
    const offsets = [
      { type: "granary" as StructureType, dx: 1, dy: 0 },
      { type: "house" as StructureType, dx: -2, dy: 1 },
      { type: "house" as StructureType, dx: 2, dy: 1 },
      { type: "temple" as StructureType, dx: 0, dy: -2 },
      { type: "tower" as StructureType, dx: -3, dy: -1 },
      { type: "campfire" as StructureType, dx: 3, dy: -1 },
    ];
    offsets.forEach(({ type, dx, dy }) => {
      const x = clamp(this.villageCenter.x + dx, 0, this.size - 1);
      const y = clamp(this.villageCenter.y + dy, 0, this.size - 1);
      if (this.isWalkable(x, y)) {
        this.buildStructure(type, x, y);
      }
    });
  }

  isWalkable(x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return false;
    if (cell.terrain === "water") return false;
    if (cell.terrain === "mountain") return false;
    return true;
  }

  getCell(x: number, y: number) {
    return this.cells[y]?.[x];
  }

  addCitizen(citizenId: number, x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return;
    cell.inhabitants.push(citizenId);
  }

  moveCitizen(citizenId: number, from: Vec2, to: Vec2) {
    const fromCell = this.getCell(from.x, from.y);
    const toCell = this.getCell(to.x, to.y);
    if (!toCell || !this.isWalkable(to.x, to.y)) {
      return false;
    }
    if (fromCell) {
      fromCell.inhabitants = fromCell.inhabitants.filter((id) => id !== citizenId);
    }
    toCell.inhabitants.push(citizenId);
    return true;
  }

  removeCitizen(citizenId: number, position: Vec2) {
    const cell = this.getCell(position.x, position.y);
    if (cell) {
      cell.inhabitants = cell.inhabitants.filter((id) => id !== citizenId);
    }
  }

  setPriorityAt(x: number, y: number, priority: PriorityMark) {
    const cell = this.getCell(x, y);
    if (cell) {
      cell.priority = priority;
    }
  }

  getCitizenIdsNear(cells: Vec2[]) {
    const ids = new Set<number>();
    cells.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.inhabitants.forEach((id) => ids.add(id));
      }
    });
    return Array.from(ids);
  }

  getView(origin: Citizen, radius: number): WorldView {
    const cells: WorldView["cells"] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const cell = this.getCell(x, y);
        if (!cell) continue;
        const viewCell: (typeof cells)[number] = {
          x,
          y,
          priority: cell.priority,
          terrain: cell.terrain,
          cropReady: cell.cropProgress >= 1,
        };
        if (cell.resource) {
          viewCell.resource = cell.resource;
        }
        if (cell.structure) {
          viewCell.structure = cell.structure;
        }
        cells.push(viewCell);
      }
    }

    const nearbyIds = this.getCitizenIdsNear([{ x: origin.x, y: origin.y }]);
    const nearbyCitizens = nearbyIds
      .map((id) => this.citizenLookup?.(id))
      .filter((cit): cit is Citizen => {
        if (!cit) return false;
        return true;
      });

    const threats = nearbyCitizens.filter((citizen) => citizen.tribeId !== origin.tribeId && citizen.role === "warrior");

    return {
      cells,
      nearbyCitizens,
      threats,
      villageCenter: this.villageCenter,
    };
  }

  updateEnvironment(climate: ClimateState, tickHours: number) {
    this.cells.forEach((row) => {
      row.forEach((cell) => {
        if (cell.terrain === "grass") {
          cell.moisture = clamp(cell.moisture + (climate.rainy ? 0.02 : climate.drought ? -0.03 : -0.005), 0, 1);
          if (!cell.resource && Math.random() < cell.fertility * 0.001) {
            cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
          }
        }

        if (cell.resource?.type === "food" && cell.resource.renewable) {
          const growth = (cell.fertility + (climate.rainy ? 0.5 : 0) - (climate.drought ? 0.8 : 0)) * 0.02;
          cell.resource.amount = clamp(cell.resource.amount + growth * tickHours, 0, 6);
        }

        if (cell.cropProgress > 0) {
          cell.cropProgress = clamp(cell.cropProgress + cell.fertility * 0.05 * tickHours, 0, 1.5);
        }
      });
    });

    if (this.hasStructure("granary")) {
      this.stockpile.foodCapacity = 150;
    }
  }

  hasStructure(type: StructureType) {
    return this.structures.some((structure) => structure.type === type);
  }

  buildStructure(type: StructureType, x: number, y: number) {
    const cell = this.getCell(x, y);
    if (!cell) return false;
    cell.structure = type;
    this.structures.push({ type, x, y });
    return true;
  }

  deposit(type: "food" | "stone", amount: number) {
    const capacityKey = type === "food" ? "foodCapacity" : "stoneCapacity";
    const current = this.stockpile[type];
    const capacity = this.stockpile[capacityKey];
    const accepted = Math.min(amount, Math.max(capacity - current, 0));
    this.stockpile[type] += accepted;
    return accepted;
  }

  consume(type: "food" | "stone", amount: number) {
    const available = this.stockpile[type];
    const used = Math.min(amount, available);
    this.stockpile[type] -= used;
    return used;
  }
}
