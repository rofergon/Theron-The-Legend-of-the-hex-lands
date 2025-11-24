import { WORLD_SIZE } from "../constants";
import { clamp, mulberry32 } from "../utils";
import type {
  Citizen,
  ClimateState,
  PriorityMark,
  StructureType,
  Terrain,
  Vec2,
  WorldCell,
  WorldView,
} from "../types";
import { PathFinder } from "./modules/PathFinder";
import { StructureManager } from "./modules/StructureManager";
import { TerrainGenerator } from "./modules/TerrainGenerator";

export class WorldEngine {
  readonly size: number;
  readonly cells: WorldCell[][];
  readonly stockpile = {
    food: 40,
    stone: 10,
    wood: 12,
    water: 20,
    foodCapacity: 80,
    stoneCapacity: 40,
    woodCapacity: 30,
  };

  readonly villageCenter: Vec2;

  private terrainGenerator: TerrainGenerator;
  private structureManager: StructureManager;
  private pathFinder: PathFinder;

  private readonly worldSeed: number;
  private rng: () => number;

  constructor(size = WORLD_SIZE, seed = Date.now()) {
    this.size = size;
    this.worldSeed = seed;
    this.rng = mulberry32(seed);

    // Initialize modules
    this.terrainGenerator = new TerrainGenerator(size, seed);
    this.cells = this.terrainGenerator.generateTerrain();

    this.structureManager = new StructureManager(size, this.cells);
    this.pathFinder = new PathFinder(size, (x, y) => this.isWalkable(x, y));

    this.villageCenter = this.structureManager.placeVillageCenter();
    this.structureManager.buildStructure("village", this.villageCenter.x, this.villageCenter.y);
    this.structureManager.placeInitialStructures(this.villageCenter, (x, y) => this.isWalkable(x, y));
  }

  citizenLookup?: (id: number) => Citizen | undefined;

  isWalkable(x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return false;

    // Unwalkable terrains (only ocean and snow)
    const unwalkable: Terrain[] = ["ocean", "snow"];
    if (unwalkable.includes(cell.terrain)) return false;

    // Mountains and rivers are walkable but with additional fatigue cost
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

  findPath(start: Vec2, goal: Vec2, options?: { cacheKey?: string }): Vec2[] | null {
    return this.pathFinder.findPath(start, goal, options);
  }

  removeCitizen(citizenId: number, position: Vec2) {
    const cell = this.getCell(position.x, position.y);
    if (cell) {
      cell.inhabitants = cell.inhabitants.filter((id) => id !== citizenId);
    }
  }

  setPriorityAt(x: number, y: number, priority: PriorityMark) {
    const cell = this.getCell(x, y);
    if (!cell) {
      return;
    }
    const previous = cell.priority;
    cell.priority = priority;
    if (priority === "farm") {
      if (!cell.farmTask) {
        cell.farmTask = "sow";
      }
      if (cell.cropStage === 0) {
        cell.cropProgress = 0;
      }
    } else if (previous === "farm") {
      cell.cropStage = 0;
      cell.cropProgress = 0;
      cell.farmTask = null;
    }
  }

  planStructure(type: StructureType, anchor: Vec2) {
    return this.structureManager.planStructure(type, anchor, (x, y) => this.isWalkable(x, y));
  }

  getStructureCount(type: StructureType) {
    return this.structureManager.getStructureCount(type);
  }

  getStructures() {
    return this.structureManager.getStructures();
  }

  cancelConstruction(siteId: number, options?: { refundMaterials?: boolean; clearPriority?: boolean }) {
    return this.structureManager.cancelConstruction(siteId, options);
  }

  applyConstructionWork(siteId: number, labor: number, delivered: { stone: number; wood: number }) {
    return this.structureManager.applyConstructionWork(siteId, labor, delivered);
  }

  getConstructionSite(siteId: number) {
    return this.structureManager.getConstructionSite(siteId);
  }

  getActiveConstructionSites() {
    return this.structureManager.getActiveConstructionSites();
  }

  findClosestConstructionCell(origin: Vec2) {
    return this.structureManager.findClosestConstructionCell(origin, (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
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
        const isFarmPlot = cell.priority === "farm" || cell.cropProgress > 0;
        const hasStandingCrop =
          isFarmPlot && cell.resource?.type === "food" && (cell.resource.amount ?? 0) > 0;
        const cropReady = cell.farmTask === "harvest" || hasStandingCrop;
        const viewCell: (typeof cells)[number] = {
          x,
          y,
          priority: cell.priority,
          terrain: cell.terrain,
          cropReady,
          cropStage: cell.cropStage,
          farmTask: cell.farmTask,
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
    const fertileTerrains: Terrain[] = ["grassland", "forest", "swamp", "river"];

    this.cells.forEach((row) => {
      row.forEach((cell) => {
        // Update moisture based on climate
        if (fertileTerrains.includes(cell.terrain)) {
          cell.moisture = clamp(
            cell.moisture + (climate.rainy ? 0.02 : climate.drought ? -0.03 : -0.005),
            0,
            1
          );

        }

        // Renewable resource growth
        if (cell.resource?.type === "food" && cell.resource.renewable) {
          const climateModifier = (climate.rainy ? 0.5 : 0) - (climate.drought ? 0.8 : 0);
          const growth = (cell.fertility + climateModifier) * 0.02;
          const maxAmount = cell.terrain === "forest" ? 8 : 6;
          cell.resource.amount = clamp(cell.resource.amount + growth * tickHours, 0, maxAmount);
        } else if (cell.resource?.type === "wood") {
          const baseGrowth = 0.015 + cell.fertility * 0.03;
          const climateAdjustment = (climate.rainy ? 0.02 : 0) - (climate.drought ? 0.05 : 0);
          const change = (baseGrowth + climateAdjustment) * tickHours;
          const maxWood = 10 + Math.round(cell.fertility * 6);
          const nextAmount = clamp(cell.resource.amount + change, 0, maxWood);
          cell.resource.amount = nextAmount;
        }

        // Crop growth by stages
        if (cell.priority === "farm" && cell.cropStage === 0 && !cell.farmTask) {
          cell.farmTask = "sow";
        }

        if (cell.cropStage === 1 && !cell.farmTask) {
          const cropGrowth = cell.fertility * 0.05 * tickHours;
          const nextProgress = clamp(cell.cropProgress + cropGrowth, 0, 0.5);
          cell.cropProgress = nextProgress;
          if (nextProgress >= 0.45) {
            cell.cropProgress = 0.5;
            cell.farmTask = "fertilize";
          }
        } else if (cell.cropStage === 2 && !cell.farmTask) {
          const cropGrowth = cell.fertility * 0.05 * tickHours;
          const nextProgress = clamp(cell.cropProgress + cropGrowth, 0, 1.2);
          cell.cropProgress = nextProgress;
          if (nextProgress >= 1) {
            cell.cropProgress = 1;
            cell.cropStage = 3;
            cell.farmTask = "harvest";
          }
        }
      });
    });

    this.stockpile.foodCapacity = this.hasStructure("granary") ? 150 : 80;
    const hasWarehouse = this.hasStructure("warehouse");
    this.stockpile.stoneCapacity = hasWarehouse ? 120 : 40;
    this.stockpile.woodCapacity = hasWarehouse ? 90 : 30;
  }

  hasStructure(type: StructureType) {
    return this.structureManager.hasStructure(type);
  }

  buildStructure(type: StructureType, x: number, y: number) {
    return this.structureManager.buildStructure(type, x, y);
  }

  deposit(type: "food" | "stone" | "wood", amount: number) {
    const capacityKey = type === "food" ? "foodCapacity" : type === "stone" ? "stoneCapacity" : "woodCapacity";
    const current = this.stockpile[type];
    const capacity = this.stockpile[capacityKey];
    const accepted = Math.min(amount, Math.max(capacity - current, 0));
    this.stockpile[type] += accepted;
    return accepted;
  }

  consume(type: "food" | "stone" | "wood", amount: number) {
    const available = this.stockpile[type];
    const used = Math.min(amount, available);
    this.stockpile[type] -= used;
    return used;
  }
  findClosestMarkedCell(origin: Vec2, priority: PriorityMark, resourceType?: string): Vec2 | null {
    let best: Vec2 | null = null;
    let minDistance = Infinity;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const cell = this.cells[y]?.[x];
        if (!cell) continue;
        if (cell.priority !== priority) continue;
        if (resourceType && cell.resource?.type !== resourceType) continue;

        const distance = Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y);
        if (distance < minDistance) {
          minDistance = distance;
          best = { x: cell.x, y: cell.y };
        }
      }
    }
    return best;
  }
}
