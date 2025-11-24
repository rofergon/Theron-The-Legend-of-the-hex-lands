import { clamp } from "../../core/utils";
import type { Citizen, CitizenAction, GathererBrain, Vec2, WorldCell, WorldView } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";

export type GatherableResourceType = "food" | "stone" | "wood";

const MAX_CARRY: Record<GatherableResourceType, number> = {
  food: 3,
  stone: 3,
  wood: 4,
};
const MIN_FOOD_NODE_AMOUNT = 0.95;

export class ResourceCollectionEngine {
  constructor(private world: WorldEngine) { }

  runGathererBrain(citizen: Citizen, view: WorldView, resourceType: GatherableResourceType): CitizenAction {
    const brain = this.ensureGathererBrain(citizen, resourceType);
    const carryAmount = citizen.carrying[resourceType];
    const hasCargo = carryAmount > 0;

    // Set currentGoal based on resource type for proper icon display
    if (resourceType === "stone") {
      citizen.currentGoal = "mining";
    } else if (resourceType === "wood") {
      citizen.currentGoal = "gather";
    } else if (resourceType === "food") {
      citizen.currentGoal = "gather";
    }
    const sendToStorage = (): CitizenAction => {
      const storageTarget = this.findStorageTarget(citizen, view);
      brain.phase = "goingToStorage";
      brain.target = storageTarget;
      return { type: "move", x: storageTarget.x, y: storageTarget.y };
    };
    const redirectToNewResource = (): CitizenAction => {
      const nextCell = this.findClosestResourceCell(citizen, view, resourceType);
      if (nextCell) {
        brain.phase = "goingToResource";
        brain.target = { x: nextCell.x, y: nextCell.y };
        return { type: "move", x: nextCell.x, y: nextCell.y };
      }
      brain.phase = "idle";
      brain.target = null;
      if (hasCargo) {
        return sendToStorage();
      }
      return { type: "move", x: citizen.x + Math.round(Math.random() * 2 - 1), y: citizen.y + Math.round(Math.random() * 2 - 1) };
    };

    switch (brain.phase) {
      case "idle": {
        if (hasCargo) {
          return sendToStorage();
        }
        return redirectToNewResource();
      }
      case "goingToResource": {
        if (!brain.target) {
          return redirectToNewResource();
        }
        if (citizen.x === brain.target.x && citizen.y === brain.target.y) {
          brain.phase = "gathering";
          return { type: "gather", resourceType };
        }
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }
      case "gathering": {
        if (this.isInventoryFull(citizen, resourceType)) {
          return sendToStorage();
        }
        return { type: "gather", resourceType };
      }
      case "goingToStorage": {
        if (!brain.target) {
          return sendToStorage();
        }
        if (citizen.x === brain.target.x && citizen.y === brain.target.y) {
          brain.phase = "idle";
          brain.target = null;
          // Clear currentGoal when task is complete
          if (citizen.currentGoal === "mining" || citizen.currentGoal === "gather") {
            delete citizen.currentGoal;
          }
          return { type: "storeResources" };
        }
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }
      default: {
        brain.phase = "idle";
        brain.target = null;
        return { type: "idle" };
      }
    }
  }

  shouldHarvestWood(citizen: Citizen, view: WorldView) {
    if (citizen.carrying.wood > 0) {
      return true;
    }
    const hasWoodCell = view.cells.some((cell) => cell.resource?.type === "wood" && (cell.resource.amount ?? 0) > 0);
    if (!hasWoodCell) {
      return false;
    }
    const markedWood = view.cells.some((cell) => cell.priority === "gather" && cell.resource?.type === "wood");
    if (markedWood) {
      return true;
    }

    const needsWoodForSites = this.world
      .getActiveConstructionSites()
      .some((site) => site.woodDelivered < site.woodRequired);

    if (needsWoodForSites) {
      return true;
    }

    // Check if stone is critically low compared to wood
    const stoneRatio = this.world.stockpile.stone / this.world.stockpile.stoneCapacity;
    const woodRatio = this.world.stockpile.wood / this.world.stockpile.woodCapacity;

    // If stone is much lower than wood, prefer stone (return false here so AI checks stone next)
    if (stoneRatio < 0.2 && woodRatio > 0.5) {
      return false;
    }

    const hasCapacity = this.world.stockpile.wood < this.world.stockpile.woodCapacity - 1;
    return hasCapacity && this.world.stockpile.wood < this.world.stockpile.woodCapacity * 0.9;
  }

  shouldHarvestStone(citizen: Citizen, view: WorldView) {
    if (citizen.carrying.stone > 0) {
      return true;
    }
    const hasStoneCell = view.cells.some((cell) => cell.resource?.type === "stone" && (cell.resource.amount ?? 0) > 0);
    if (!hasStoneCell) {
      return false;
    }
    const markedStone = view.cells.some((cell) => cell.priority === "mine" && cell.resource?.type === "stone");
    if (markedStone) {
      return true;
    }

    const needsStoneForSites = this.world
      .getActiveConstructionSites()
      .some((site) => site.stoneDelivered < site.stoneRequired);

    if (needsStoneForSites) {
      return true;
    }

    const hasCapacity = this.world.stockpile.stone < this.world.stockpile.stoneCapacity - 1;
    return hasCapacity && this.world.stockpile.stone < this.world.stockpile.stoneCapacity * 0.9;
  }

  gather(citizen: Citizen, type: GatherableResourceType) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!cell || !cell.resource || cell.resource.type !== type) {
      return;
    }
    if (type === "food") {
      this.harvestFood(citizen, cell);
    } else if (type === "stone") {
      this.harvestStone(citizen, cell);
    } else if (type === "wood") {
      this.harvestWood(citizen, cell);
    }
  }

  storeAtCurrentCell(citizen: Citizen) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!this.isStorageCell(cell)) {
      return false;
    }
    let deposited = false;
    if (citizen.carrying.food > 0) {
      const stored = this.world.deposit("food", citizen.carrying.food);
      citizen.carrying.food -= stored;
      deposited = stored > 0 || deposited;
    }
    if (citizen.carrying.stone > 0) {
      const stored = this.world.deposit("stone", citizen.carrying.stone);
      citizen.carrying.stone -= stored;
      deposited = stored > 0 || deposited;
    }
    if (citizen.carrying.wood > 0) {
      const stored = this.world.deposit("wood", citizen.carrying.wood);
      citizen.carrying.wood -= stored;
      deposited = stored > 0 || deposited;
    }
    return deposited;
  }

  isStorageCell(cell?: WorldCell | null) {
    if (!cell?.structure) {
      return false;
    }
    return cell.structure === "village" || cell.structure === "granary" || cell.structure === "warehouse";
  }

  findStorageTarget(citizen: Citizen, view: WorldView): Vec2 {
    const storageCell = view.cells.find(
      (cell) => cell.structure === "warehouse" || cell.structure === "granary" || cell.structure === "village",
    );
    if (storageCell) {
      return { x: storageCell.x, y: storageCell.y };
    }
    if (view.villageCenter) {
      return { x: view.villageCenter.x, y: view.villageCenter.y };
    }
    return { x: citizen.x, y: citizen.y };
  }

  private ensureGathererBrain(citizen: Citizen, resourceType: GatherableResourceType): GathererBrain {
    if (!citizen.brain || citizen.brain.kind !== "gatherer" || citizen.brain.resourceType !== resourceType) {
      citizen.brain = {
        kind: "gatherer",
        resourceType,
        phase: "idle",
        target: null,
      };
    }
    return citizen.brain as GathererBrain;
  }

  private isInventoryFull(citizen: Citizen, resourceType: GatherableResourceType) {
    return citizen.carrying[resourceType] >= MAX_CARRY[resourceType];
  }

  private findClosestResourceCell(citizen: Citizen, view: WorldView, resourceType: GatherableResourceType) {
    let closest: (typeof view.cells)[number] | null = null;
    let minScore = Infinity;

    for (const cell of view.cells) {
      if (!cell.resource || cell.resource.type !== resourceType) continue;
      const amount = cell.resource.amount ?? 0;
      if (amount <= 0) continue;
      if (resourceType === "food" && amount < MIN_FOOD_NODE_AMOUNT) continue;

      // Check for occupancy
      if (this.isCellOccupied(cell, view, citizen.id)) {
        continue;
      }

      const distance = Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y);
      const matchesPriority =
        (resourceType === "food" && cell.priority === "gather") ||
        (resourceType === "stone" && cell.priority === "mine") ||
        (resourceType === "wood" && cell.priority === "gather");
      const score = distance - (matchesPriority ? 0.75 : 0);
      if (score < minScore) {
        minScore = score;
        closest = cell;
        if (score <= 0.5) break;
      }
    }

    return closest;
  }

  private isCellOccupied(targetCell: { x: number; y: number; structure?: string; constructionSiteId?: number }, view: WorldView, selfId: number): boolean {
    // Construction sites allow multiple workers
    if (targetCell.constructionSiteId !== undefined || targetCell.structure === "village" || targetCell.structure === "warehouse" || targetCell.structure === "granary") {
      return false;
    }

    // Check if any other citizen is at the target cell or moving to it
    return view.nearbyCitizens.some((other) => {
      if (other.id === selfId) return false;
      if (other.state === "dead") return false;

      // Check current position
      if (other.x === targetCell.x && other.y === targetCell.y) return true;

      // Check intended target (if available in brain/target)
      // Note: We rely on the fact that if they are moving there, they might be close or targeting it.
      // Since we don't have full access to other's brain targets in a simple way here without casting,
      // we'll assume if they are ON the cell, it's occupied.
      // To be more strict as requested: "one villager per cell"

      // If we want to prevent moving to a cell someone else is targeting, we need that info.
      // Assuming 'target' property on Citizen reflects their destination.
      if (other.target && other.target.x === targetCell.x && other.target.y === targetCell.y) {
        return true;
      }

      return false;
    });
  }

  private harvestFood(citizen: Citizen, cell: WorldCell) {
    if (!cell.resource) return;
    const amount = clamp(cell.resource.amount, 0, 3);
    if (amount <= 0) return;
    const efficiency = citizen.role === "farmer" ? 1.1 : 1;
    const gathered = Math.min(1, cell.resource.amount);
    cell.resource.amount = clamp(cell.resource.amount - gathered, 0, 10);
    const isFarmPlot = cell.priority === "farm" && cell.cropStage > 0;
    citizen.carrying.food += Math.floor(gathered * efficiency);
    if (isFarmPlot) {
      const harvestDrain = 0.35 * gathered;
      cell.cropProgress = clamp(cell.cropProgress - harvestDrain, 0, 1.5);
    }
    if (cell.resource.amount <= 0) {
      if (isFarmPlot || !cell.resource.renewable) {
        cell.resource = undefined;
      } else {
        cell.resource.amount = 0;
      }
      if (isFarmPlot) {
        cell.cropProgress = 0;
      }
    }
  }

  private harvestStone(citizen: Citizen, cell: WorldCell) {
    if (!cell.resource) return;
    const gathered = Math.min(1, cell.resource.amount);
    if (gathered <= 0) return;
    citizen.carrying.stone += gathered;
    cell.resource.amount = clamp(cell.resource.amount - gathered, 0, 12);
    if (cell.resource.amount <= 0) {
      cell.resource = undefined;
    }
  }

  private harvestWood(citizen: Citizen, cell: WorldCell) {
    if (!cell.resource) return;
    const gathered = Math.min(1, cell.resource.amount);
    if (gathered <= 0) return;
    citizen.carrying.wood += gathered;
    cell.resource.amount = clamp(cell.resource.amount - gathered, 0, 20);
    if (cell.resource.amount <= 0 && !cell.resource.renewable) {
      cell.resource = undefined;
    }
  }
}
