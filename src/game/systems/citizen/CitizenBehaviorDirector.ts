import type {
  Citizen,
  CitizenAction,
  CitizenAI,
  GathererBrain,
  Role,
  StructureType,
  Vec2,
  WorldView,
} from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";
import type { CitizenSystemEvent } from "../CitizenSystem";

const REST_START_FATIGUE = 70;
const REST_STOP_FATIGUE = 35;
const MAX_FOOD_CARRY = 3;
const MAX_STONE_CARRY = 3;
const MIN_FOOD_NODE_AMOUNT = 0.95; // Consider food nodes depleted when they can't yield a full unit.

type BehaviorHooks = {
  emit: (event: CitizenSystemEvent) => void;
  tryEatFromStockpile: (citizen: Citizen) => void;
  inflictDamage: (citizen: Citizen, amount: number, cause: string) => void;
};

export type BehaviorDecision = {
  action: CitizenAction;
  source: string;
};

export class CitizenBehaviorDirector {
  private readonly aiDispatch: Record<Role, CitizenAI> = {
    warrior: warriorAI,
    farmer: farmerAI,
    worker: workerAI,
    scout: scoutAI,
    child: passiveAI,
    elder: passiveAI,
  };

  constructor(private world: WorldEngine, private hooks: BehaviorHooks) {}

  decideAction(citizen: Citizen, view: WorldView): BehaviorDecision {
    const urgent = this.evaluateUrgentNeed(citizen, view);
    if (urgent) {
      return { action: urgent, source: "urgencia" };
    }

    let ai = this.aiDispatch[citizen.role] ?? passiveAI;
    let source = `rol ${citizen.role}`;
    if (isGoalBehavior(citizen.currentGoal)) {
      ai = GOAL_BEHAVIOR_MAP[citizen.currentGoal];
      source = `meta ${citizen.currentGoal}`;
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
      this.hooks.emit({ type: "log", message: `El habitante ${citizen.id} ha crecido y trabajará.` });
    }

    if (citizen.role === "elder" && citizen.age > 85) {
      this.hooks.inflictDamage(citizen, 2, "fragilidad");
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

const isInventoryFull = (citizen: Citizen, resourceType: "food" | "stone") => {
  return resourceType === "food" ? citizen.carrying.food >= MAX_FOOD_CARRY : citizen.carrying.stone >= MAX_STONE_CARRY;
};

const ensureGathererBrain = (citizen: Citizen, resourceType: "food" | "stone"): GathererBrain => {
  if (!citizen.brain || citizen.brain.kind !== "gatherer" || citizen.brain.resourceType !== resourceType) {
    citizen.brain = {
      kind: "gatherer",
      resourceType,
      phase: "idle",
      target: null,
    };
  }
  return citizen.brain as GathererBrain;
};

const findClosestResourceCell = (citizen: Citizen, view: WorldView, resourceType: "food" | "stone") => {
  let closest: (typeof view.cells)[number] | null = null;
  let minDistance = Infinity;

  for (const cell of view.cells) {
    if (!cell.resource || cell.resource.type !== resourceType) continue;
    const amount = cell.resource.amount ?? 0;
    if (amount <= 0) continue;
    if (resourceType === "food" && amount < MIN_FOOD_NODE_AMOUNT) continue;

    const distance = Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y);
    if (distance < minDistance) {
      minDistance = distance;
      closest = cell;
      if (distance === 1) break;
    }
  }

  return closest;
};

const findStorageTarget = (citizen: Citizen, view: WorldView): Vec2 => {
  const storageCell = view.cells.find((cell) => cell.structure === "granary" || cell.structure === "village");
  if (storageCell) {
    return { x: storageCell.x, y: storageCell.y };
  }
  if (view.villageCenter) {
    return { x: view.villageCenter.x, y: view.villageCenter.y };
  }
  return { x: citizen.x, y: citizen.y };
};

const runGathererBrain = (citizen: Citizen, view: WorldView, resourceType: "food" | "stone"): CitizenAction => {
  const brain = ensureGathererBrain(citizen, resourceType);
  const carryAmount = resourceType === "food" ? citizen.carrying.food : citizen.carrying.stone;
  const hasCargo = carryAmount > 0;
  const sendToStorage = (): CitizenAction => {
    brain.phase = "goingToStorage";
    brain.target = findStorageTarget(citizen, view);
    return { type: "move", x: brain.target.x, y: brain.target.y };
  };
  const redirectToNewResource = (): CitizenAction => {
    const nextCell = findClosestResourceCell(citizen, view, resourceType);
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
    return wanderCitizen(citizen);
  };

  switch (brain.phase) {
    case "idle": {
      if (isInventoryFull(citizen, resourceType)) {
        brain.phase = "goingToStorage";
        brain.target = findStorageTarget(citizen, view);
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }

      // Hysteresis: Si ya tenemos un target cercano válido, continuar con él
      if (brain.target) {
        const distanceToTarget = Math.abs(citizen.x - brain.target.x) + Math.abs(citizen.y - brain.target.y);
        if (distanceToTarget <= 2) {
          brain.phase = "goingToResource";
          return { type: "move", x: brain.target.x, y: brain.target.y };
        }
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
      if (isInventoryFull(citizen, resourceType)) {
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
};

const farmerAI: CitizenAI = (citizen, view) => {
  const brain = ensureGathererBrain(citizen, "food");
  const isReturningToStorage = brain.phase === "goingToStorage";
  const isGatheringPhase = brain.phase === "gathering" || brain.phase === "goingToResource";

  // Prioridad 1: si el inventario está lleno, forzar el depósito (salvo que ya esté en ello).
  if (!isReturningToStorage && isInventoryFull(citizen, "food")) {
    brain.phase = "goingToStorage";
    brain.target = findStorageTarget(citizen, view);
    return runGathererBrain(citizen, view, "food");
  }

  // Prioridad 2: si ya está en alguna fase del cerebro recolector, continuarla.
  if (isReturningToStorage || isGatheringPhase) {
    return runGathererBrain(citizen, view, "food");
  }

  // Hysteresis para cultivo: Si ya está cultivando cerca, continuar
  const currentCell = view.cells.find((cell) => cell.x === citizen.x && cell.y === citizen.y);
  if (currentCell?.priority === "farm" && (currentCell.terrain === "grassland" || currentCell.terrain === "forest") && !currentCell.cropReady) {
    return { type: "tendCrops", x: citizen.x, y: citizen.y };
  }

  const nearbyFarmCell = view.cells.find(
    (cell) => cell.priority === "farm" && (cell.terrain === "grassland" || cell.terrain === "forest") && !cell.cropReady && Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y) <= 2,
  );
  if (nearbyFarmCell) {
    if (citizen.x === nearbyFarmCell.x && citizen.y === nearbyFarmCell.y) {
      return { type: "tendCrops", x: nearbyFarmCell.x, y: nearbyFarmCell.y };
    }
    return { type: "move", x: nearbyFarmCell.x, y: nearbyFarmCell.y };
  }

  // Prioridad 3: Recoger cultivos maduros cercanos (solo si el inventario no está casi lleno)
  if (citizen.carrying.food < MAX_FOOD_CARRY - 1) {
    const matureCrop = view.cells.find((cell) => cell.cropReady && cell.resource?.type === "food" && (cell.resource.amount ?? 0) > 0);
    if (matureCrop) {
      brain.phase = "goingToResource";
      brain.target = { x: matureCrop.x, y: matureCrop.y };
      return runGathererBrain(citizen, view, "food");
    }
  }

  // Prioridad 4: Cultivar celdas marcadas como farm
  const farmCell = view.cells.find(
    (cell) => cell.priority === "farm" && (cell.terrain === "grassland" || cell.terrain === "forest") && !cell.cropReady,
  );
  if (farmCell) {
    if (citizen.x === farmCell.x && citizen.y === farmCell.y) {
      return { type: "tendCrops", x: farmCell.x, y: farmCell.y };
    }
    return { type: "move", x: farmCell.x, y: farmCell.y };
  }

  // Prioridad 5: Recolectar comida natural usando gatherer brain
  return runGathererBrain(citizen, view, "food");
};

const workerAI: CitizenAI = (citizen, view) => {
  return runGathererBrain(citizen, view, "stone");
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

const GOAL_BEHAVIOR_MAP = {
  passive: passiveAI,
  raid: raiderAI,
  settle: settlerAI,
  beast: beastAI,
} as const;

type GoalBehavior = keyof typeof GOAL_BEHAVIOR_MAP;

const isGoalBehavior = (goal?: string): goal is GoalBehavior => {
  if (!goal) return false;
  return Object.prototype.hasOwnProperty.call(GOAL_BEHAVIOR_MAP, goal);
};
