import type { Citizen, CitizenAction, CitizenAI, FarmTask, Role, StructureType, Vec2, WorldView } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";
import type { CitizenSystemEvent } from "../CitizenSystem";
import { ResourceCollectionEngine } from "../resource/ResourceCollectionEngine";

const REST_START_FATIGUE = 70;
const REST_STOP_FATIGUE = 35;

type BehaviorHooks = {
  emit: (event: CitizenSystemEvent) => void;
  tryEatFromStockpile: (citizen: Citizen) => void;
  inflictDamage: (citizen: Citizen, amount: number, cause: string) => void;
};

export type BehaviorDecision = {
  action: CitizenAction;
  source: string;
};

let activeDirector: CitizenBehaviorDirector | null = null;
let activeGatherEngine: ResourceCollectionEngine | null = null;

export class CitizenBehaviorDirector {
  private readonly aiDispatch: Record<Role, CitizenAI>;
  readonly world: WorldEngine;

  constructor(world: WorldEngine, private hooks: BehaviorHooks, private resourceEngine: ResourceCollectionEngine) {
    this.world = world;
    this.aiDispatch = {
      warrior: warriorAI,
      farmer: farmerAI,
      worker: workerAI,
      scout: scoutAI,
      child: passiveAI,
      elder: passiveAI,
    };
    activeDirector = this;
    activeGatherEngine = this.resourceEngine;
  }

  decideAction(citizen: Citizen, view: WorldView): BehaviorDecision {
    const urgent = this.evaluateUrgentNeed(citizen, view);
    if (urgent) {
      return { action: urgent, source: "urgent" };
    }

    let ai = this.aiDispatch[citizen.role] ?? passiveAI;
    let source = `role ${citizen.role}`;
    if (isGoalBehavior(citizen.currentGoal)) {
      ai = GOAL_BEHAVIOR_MAP[citizen.currentGoal];
      source = `goal ${citizen.currentGoal}`;
    }

    return { action: ai(citizen, view), source };
  }

  private evaluateUrgentNeed(citizen: Citizen, view: WorldView): CitizenAction | null {
    const continuingRest = citizen.currentGoal === "resting" && citizen.fatigue > REST_STOP_FATIGUE;
    if (citizen.currentGoal === "resting" && citizen.fatigue <= REST_STOP_FATIGUE) {
      delete citizen.currentGoal;
    }

    if (citizen.health < 25 && view.villageCenter) {
      return { type: "move", x: view.villageCenter.x, y: view.villageCenter.y };
    }

    if (citizen.hunger > 90) {
      const foodAvailable = this.world.stockpile.food > 0 || citizen.carrying.food > 0;
      if (foodAvailable) {
        this.hooks.tryEatFromStockpile(citizen);
        return { type: "idle" };
      }
      return null;
    }

    if (view.threats.length > 0 && citizen.role !== "warrior") {
      if (view.villageCenter) {
        return { type: "move", x: view.villageCenter.x, y: view.villageCenter.y };
      }
    }

    if (citizen.role === "child" && citizen.age > 12) {
      citizen.role = "worker";
      this.hooks.emit({ type: "log", message: `Citizen ${citizen.id} has grown up and will work.` });
    }

    if (citizen.role === "elder" && citizen.age > 85) {
      this.hooks.inflictDamage(citizen, 2, "frailty");
    }

    if (citizen.fatigue >= REST_START_FATIGUE || continuingRest) {
      citizen.currentGoal = "resting";
      const restSpot = this.findRestLocation(citizen, view);
      if (restSpot && (restSpot.x !== citizen.x || restSpot.y !== citizen.y)) {
        return { type: "move", x: restSpot.x, y: restSpot.y };
      }
      return { type: "rest" };
    }

    return null;
  }

  private findRestLocation(citizen: Citizen, view: WorldView): Vec2 | null {
    const preferredStructures: StructureType[] = ["house", "campfire", "village"];
    let best: Vec2 | null = null;
    let bestDistance = Infinity;

    for (const cell of view.cells) {
      if (!cell.structure) continue;
      if (!preferredStructures.includes(cell.structure)) continue;

      const distance = Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: cell.x, y: cell.y };
      }
    }

    if (!best && view.villageCenter) {
      best = { x: view.villageCenter.x, y: view.villageCenter.y };
    }

    return best;
  }

  getConstructionDirectiveFor(citizen: Citizen) {
    return this.world.findClosestConstructionCell({ x: citizen.x, y: citizen.y });
  }
}

const warriorAI: CitizenAI = (citizen, view) => {
  if (view.threats.length > 0) {
    const target = view.threats[0];
    if (target) {
      const distance = Math.abs(citizen.x - target.x) + Math.abs(citizen.y - target.y);
      if (distance <= 1) {
        return { type: "attack", targetId: target.id };
      }
      return { type: "move", x: target.x, y: target.y };
    }
  }

  const defendCell = view.cells.find((cell) => cell.priority === "defend");
  if (defendCell) {
    return { type: "move", x: defendCell.x, y: defendCell.y };
  }

  if (view.villageCenter) {
    return {
      type: "move",
      x: view.villageCenter.x + Math.round(Math.random() * 4 - 2),
      y: view.villageCenter.y + Math.round(Math.random() * 4 - 2),
    };
  }

  return { type: "idle" };
};

const randomStep = () => Math.round(Math.random() * 2 - 1);

const pickWanderTarget = (citizen: Citizen): Vec2 => {
  for (let attempts = 0; attempts < 3; attempts += 1) {
    const dx = randomStep();
    const dy = randomStep();
    if (dx !== 0 || dy !== 0) {
      return { x: citizen.x + dx, y: citizen.y + dy };
    }
  }
  return { x: citizen.x, y: citizen.y };
};

const wanderCitizen = (citizen: Citizen): CitizenAction => {
  const target = pickWanderTarget(citizen);
  return { type: "move", x: target.x, y: target.y };
};

type LocatedEnemy = { target: Citizen; distance: number };

const findClosestEnemyCitizen = (citizen: Citizen, view: WorldView): LocatedEnemy | null => {
  let closest: Citizen | null = null;
  let bestDistance = Infinity;
  for (const other of view.nearbyCitizens) {
    if (other.state === "dead") continue;
    if (other.tribeId === citizen.tribeId) continue;
    const distance = Math.abs(other.x - citizen.x) + Math.abs(other.y - citizen.y);
    if (distance < bestDistance) {
      closest = other;
      bestDistance = distance;
    }
  }
  if (!closest) return null;
  return { target: closest, distance: bestDistance };
};

const raiderAI: CitizenAI = (citizen, view) => {
  const enemy = findClosestEnemyCitizen(citizen, view);
  if (enemy) {
    if (enemy.distance <= 1) {
      return { type: "attack", targetId: enemy.target.id };
    }
    return { type: "move", x: enemy.target.x, y: enemy.target.y };
  }
  if (view.villageCenter) {
    const offsetX = Math.round(Math.random() * 4 - 2);
    const offsetY = Math.round(Math.random() * 4 - 2);
    return { type: "move", x: view.villageCenter.x + offsetX, y: view.villageCenter.y + offsetY };
  }
  return wanderCitizen(citizen);
};

const beastAI: CitizenAI = (citizen, view) => {
  const enemy = findClosestEnemyCitizen(citizen, view);
  if (enemy) {
    if (enemy.distance <= 1) {
      return { type: "attack", targetId: enemy.target.id };
    }
    return { type: "move", x: enemy.target.x, y: enemy.target.y };
  }
  if (view.villageCenter) {
    const targetX = view.villageCenter.x + Math.round(Math.random() * 6 - 3);
    const targetY = view.villageCenter.y + Math.round(Math.random() * 6 - 3);
    return { type: "move", x: targetX, y: targetY };
  }
  return wanderCitizen(citizen);
};

const FARM_TASK_PRIORITY: FarmTask[] = ["harvest", "fertilize", "sow"];

const findFarmWorkCell = (citizen: Citizen, view: WorldView, tasks: FarmTask[]) => {
  for (const task of tasks) {
    let best: { cell: (typeof view.cells)[number]; distance: number } | null = null;
    for (const cell of view.cells) {
      if (cell.priority !== "farm") continue;
      if (cell.farmTask !== task) continue;
      const distance = Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y);
      if (!best || distance < best.distance) {
        best = { cell, distance };
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
};

const farmerAI: CitizenAI = (citizen, view) => {
  const brain =
    citizen.brain && citizen.brain.kind === "gatherer" && citizen.brain.resourceType === "food" ? citizen.brain : null;
  const isReturningToStorage = brain?.phase === "goingToStorage";
  const isGatheringPhase = brain?.phase === "gathering" || brain?.phase === "goingToResource";

  if (!isReturningToStorage && citizen.carrying.food >= 3) {
    if (activeGatherEngine) {
      return activeGatherEngine.runGathererBrain(citizen, view, "food");
    }
  }

  const farmWork = findFarmWorkCell(citizen, view, FARM_TASK_PRIORITY);
  if (farmWork) {
    if (citizen.x === farmWork.cell.x && citizen.y === farmWork.cell.y) {
      return { type: "tendCrops", x: farmWork.cell.x, y: farmWork.cell.y };
    }
    return { type: "move", x: farmWork.cell.x, y: farmWork.cell.y };
  }

  // If in natural gathering phases, continue
  if (isReturningToStorage || isGatheringPhase) {
    if (activeGatherEngine) {
      return activeGatherEngine.runGathererBrain(citizen, view, "food");
    }
    return wanderCitizen(citizen);
  }

  // Gather natural food using gatherer brain as a last resort
  if (activeGatherEngine) {
    return activeGatherEngine.runGathererBrain(citizen, view, "food");
  }

  // Fallback: Global search for farm tasks
  if (activeDirector?.world) {
    const globalFarm = activeDirector.world.findClosestMarkedCell({ x: citizen.x, y: citizen.y }, "farm");
    if (globalFarm) {
      return { type: "move", x: globalFarm.x, y: globalFarm.y };
    }
  }

  return wanderCitizen(citizen);
};

const workerAI: CitizenAI = (citizen, view) => {
  const directive = activeDirector?.getConstructionDirectiveFor(citizen) ?? null;
  const gatherEngine = activeGatherEngine;

  if (directive) {
    const stoneDeficit = Math.max(directive.site.stoneRequired - directive.site.stoneDelivered, 0);
    const woodDeficit = Math.max(directive.site.woodRequired - directive.site.woodDelivered, 0);
    const needsStone = stoneDeficit > 0;
    const needsWood = woodDeficit > 0;
    const materialsComplete = !needsStone && !needsWood;
    const storagePos = view.villageCenter ?? activeDirector?.world?.villageCenter;

    // If materials are complete, work on construction
    if (materialsComplete) {
      const isOnSite = directive.site.footprint.some(
        cell => cell.x === citizen.x && cell.y === citizen.y
      );
      if (isOnSite) {
        return { type: "construct", siteId: directive.site.id };
      }
      return { type: "move", x: directive.cell.x, y: directive.cell.y };
    }

    // If materials are missing, go to the warehouse to collect them
    if (storagePos) {
      const hasStone = citizen.carrying.stone > 0;
      const hasWood = citizen.carrying.wood > 0;
      const atStorage = citizen.x === storagePos.x && citizen.y === storagePos.y;

      // If at the warehouse, collect materials
      if (atStorage && activeDirector?.world) {
        const world = activeDirector.world;
        if (needsStone && !hasStone && world.stockpile.stone > 0) {
          const taken = world.consume("stone", Math.min(3, stoneDeficit));
          citizen.carrying.stone += taken;
        }
        if (needsWood && !hasWood && world.stockpile.wood > 0) {
          const taken = world.consume("wood", Math.min(4, woodDeficit));
          citizen.carrying.wood += taken;
        }
        // If materials have been collected, go to the construction site
        if (citizen.carrying.stone > 0 || citizen.carrying.wood > 0) {
          return { type: "move", x: directive.cell.x, y: directive.cell.y };
        }
      }

      // If carrying materials, deliver them to the site
      if (hasStone || hasWood) {
        const isOnSite = directive.site.footprint.some(
          cell => cell.x === citizen.x && cell.y === citizen.y
        );
        if (isOnSite) {
          return { type: "construct", siteId: directive.site.id };
        }
        return { type: "move", x: directive.cell.x, y: directive.cell.y };
      }

      // If not carrying materials and not at the warehouse, check if there are any in stock
      const world = activeDirector?.world;
      const stockpileStone = world?.stockpile.stone ?? 0;
      const stockpileWood = world?.stockpile.wood ?? 0;
      const canPickup = (needsStone && stockpileStone > 0) || (needsWood && stockpileWood > 0);

      if (canPickup) {
        return { type: "move", x: storagePos.x, y: storagePos.y };
      }

      // If the warehouse is empty, gather manually
      if (gatherEngine) {
        if (needsStone) return gatherEngine.runGathererBrain(citizen, view, "stone");
        if (needsWood) return gatherEngine.runGathererBrain(citizen, view, "wood");
      }
    }
  }

  // If there is no construction directive, gather natural resources
  if (gatherEngine) {
    const needWood = gatherEngine.shouldHarvestWood(citizen, view);
    const needStone = gatherEngine.shouldHarvestStone(citizen, view);

    if (needWood && needStone) {
      // If both are needed, prioritize the one with less relative stock
      const world = activeDirector?.world;
      if (world) {
        const woodRatio = world.stockpile.wood / world.stockpile.woodCapacity;
        const stoneRatio = world.stockpile.stone / world.stockpile.stoneCapacity;

        if (stoneRatio < woodRatio) {
          return gatherEngine.runGathererBrain(citizen, view, "stone");
        }
      }
      return gatherEngine.runGathererBrain(citizen, view, "wood");
    }

    if (needWood) {
      return gatherEngine.runGathererBrain(citizen, view, "wood");
    }
    if (needStone) {
      return gatherEngine.runGathererBrain(citizen, view, "stone");
    }
  }
  // Fallback: Global search for construction or resources
  if (activeDirector?.world) {
    const world = activeDirector.world;
    // Check for any active construction site globally
    const sites = world.getActiveConstructionSites();
    if (sites.length > 0) {
      // Find closest site
      let closestSite = sites[0];
      let minDist = Infinity;
      sites.forEach(site => {
        const dist = Math.abs(site.anchor.x - citizen.x) + Math.abs(site.anchor.y - citizen.y);
        if (dist < minDist) {
          minDist = dist;
          closestSite = site;
        }
      });
      if (closestSite) {
        return { type: "move", x: closestSite.anchor.x, y: closestSite.anchor.y };
      }
    }

    // Check for marked resources globally
    const globalWood = world.findClosestMarkedCell({ x: citizen.x, y: citizen.y }, "gather", "wood");
    const globalStone = world.findClosestMarkedCell({ x: citizen.x, y: citizen.y }, "mine", "stone");

    if (globalWood && globalStone) {
      // Simple distance check for fallback
      const dWood = Math.abs(globalWood.x - citizen.x) + Math.abs(globalWood.y - citizen.y);
      const dStone = Math.abs(globalStone.x - citizen.x) + Math.abs(globalStone.y - citizen.y);
      if (dStone < dWood) return { type: "move", x: globalStone.x, y: globalStone.y };
      return { type: "move", x: globalWood.x, y: globalWood.y };
    }
    if (globalWood) return { type: "move", x: globalWood.x, y: globalWood.y };
    if (globalStone) return { type: "move", x: globalStone.x, y: globalStone.y };
  }

  return wanderCitizen(citizen);
};

const settlerAI: CitizenAI = (citizen, view) => {
  const hasFarmOpportunity = view.cells.some((cell) => {
    if (cell.priority === "farm") return true;
    if (cell.cropReady) return true;
    return cell.resource?.type === "food" && (cell.resource.amount ?? 0) > 0;
  });
  if (hasFarmOpportunity || citizen.carrying.food === 0) {
    return farmerAI(citizen, view);
  }
  return workerAI(citizen, view);
};

const scoutAI: CitizenAI = (citizen, view) => {
  const exploreCell = view.cells.find((cell) => cell.priority === "explore");
  if (exploreCell) {
    return { type: "move", x: exploreCell.x, y: exploreCell.y };
  }
  return { type: "move", x: citizen.x + Math.round(Math.random() * 6 - 3), y: citizen.y + Math.round(Math.random() * 6 - 3) };
};

const passiveAI: CitizenAI = (citizen, view) => {
  if (view.villageCenter) {
    return { type: "move", x: view.villageCenter.x, y: view.villageCenter.y };
  }
  return { type: "idle" };
};

const worshipAI: CitizenAI = (citizen, view) => {
  const world = activeDirector?.world;
  let target: Vec2 | null = null;

  // Prefer a known temple position from the world map (covers cases outside the local view radius)
  const structures = world?.getStructures()?.filter((structure) => structure.type === "temple") ?? [];
  if (structures.length > 0) {
    const closest = structures.reduce<{ pos: Vec2; distance: number } | null>((best, structure) => {
      const distance = Math.abs(structure.x - citizen.x) + Math.abs(structure.y - citizen.y);
      if (!best || distance < best.distance) {
        return { pos: { x: structure.x, y: structure.y }, distance };
      }
      return best;
    }, null);
    target = closest?.pos ?? null;
  }

  // Fallback to any temple within the current view
  if (!target) {
    const nearbyTemple = view.cells.find((cell) => cell.structure === "temple");
    if (nearbyTemple) {
      target = { x: nearbyTemple.x, y: nearbyTemple.y };
    }
  }

  if (target) {
    const distance = Math.abs(target.x - citizen.x) + Math.abs(target.y - citizen.y);
    if (distance > 0) {
      return { type: "move", x: target.x, y: target.y };
    }
    return { type: "rest" };
  }

  return passiveAI(citizen, view);
};

const GOAL_BEHAVIOR_MAP = {
  passive: passiveAI,
  raid: raiderAI,
  settle: settlerAI,
  beast: beastAI,
  worship: worshipAI,
} as const;

type GoalBehavior = keyof typeof GOAL_BEHAVIOR_MAP;

const isGoalBehavior = (goal?: string): goal is GoalBehavior => {
  if (!goal) return false;
  return Object.prototype.hasOwnProperty.call(GOAL_BEHAVIOR_MAP, goal);
};
