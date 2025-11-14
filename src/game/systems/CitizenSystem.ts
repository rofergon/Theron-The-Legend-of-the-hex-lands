import { clamp } from "../core/utils";
import type {
  Citizen,
  CitizenAction,
  CitizenAI,
  GathererBrain,
  PriorityMark,
  ResourceType,
  Role,
  StructureType,
  ToastNotification,
  Vec2,
  WorldView,
} from "../core/types";
import type { WorldEngine } from "../core/world/WorldEngine";

export type CitizenSystemEvent =
  | { type: "log"; message: string; notificationType?: ToastNotification["type"] }
  | { type: "powerGain"; amount: number };

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;
const ASSIGNABLE_ROLES: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
const GAME_HOURS_PER_YEAR = 24; // 1 in-game day equals 1 citizen year for balance pacing
const REST_START_FATIGUE = 70;
const REST_STOP_FATIGUE = 35;

export class CitizenSystem {
  private citizens: Citizen[] = [];
  private citizenById = new Map<number, Citizen>();
  private nextCitizenId = 1;
  private debugLogging = true;
  private elapsedHours = 0;

  constructor(private world: WorldEngine, private emit: (event: CitizenSystemEvent) => void = () => {}) {}

  init(roles: Role[], tribeId: number) {
    roles.forEach((role) => {
      const position = this.findSpawnNearVillage();
      const citizen = this.createCitizen(role, position.x, position.y, tribeId);
      this.addCitizen(citizen);
    });
  }

  getCitizens() {
    return this.citizens;
  }

  getCitizenById(id: number) {
    return this.citizenById.get(id);
  }

  addCitizen(citizen: Citizen) {
    this.citizens.push(citizen);
    this.citizenById.set(citizen.id, citizen);
    this.world.addCitizen(citizen.id, citizen.x, citizen.y);
  }

  createCitizen(role: Role, x: number, y: number, tribeId: number): Citizen {
    return {
      id: this.nextCitizenId++,
      x,
      y,
      age: role === "child" ? 2 : role === "elder" ? 60 : 20,
      role,
      hunger: 30,
      morale: 65,
      health: 80,
      fatigue: 20,
      tribeId,
      carrying: { food: 0, stone: 0 },
      state: "alive",
      actionHistory: [],
    };
  }

  update(tickHours: number) {
    this.elapsedHours += tickHours;
    for (const citizen of this.citizens) {
      if (citizen.state === "dead") continue;
      const cell = this.world.getCell(citizen.x, citizen.y);
      const hungerRate = cell?.terrain === "desert" ? 1.5 : 1;
      citizen.age += tickHours / GAME_HOURS_PER_YEAR;
      citizen.hunger = clamp(citizen.hunger + hungerRate * 0.864 * tickHours, 0, 100);
      citizen.fatigue = clamp(citizen.fatigue + 0.8 * tickHours, 0, 100);
      citizen.morale = clamp(citizen.morale - 0.2 * tickHours, 0, 100);

      if (citizen.hunger > 80) this.inflictDamage(citizen, 4, "hambre");
      if (citizen.fatigue > 80) this.inflictDamage(citizen, 2, "agotamiento");
      if (citizen.morale < 20) citizen.currentGoal = "passive";

      if (citizen.age > 70 && Math.random() < tickHours * 0.02) this.inflictDamage(citizen, 5, "vejez");

      if (citizen.health <= 0) {
        this.finalizeCitizenDeath(citizen);
        continue;
      }

      if (citizen.hunger > 70) {
        this.tryEatFromStockpile(citizen);
      }

      const view = this.world.getView(citizen, 5);
      const urgentAction = this.evaluateUrgentNeed(citizen, view);
      let actionSource = "urgencia";
      let action: CitizenAction;
      if (urgentAction) {
        action = urgentAction;
      } else {
        const ai = aiDispatch[citizen.role] ?? passiveAI;
        action = ai(citizen, view);
        actionSource = `rol ${citizen.role}`;
      }
      this.logCitizenAction(citizen, action, actionSource);
      this.applyCitizenAction(citizen, action, tickHours);
    }

    this.citizens = this.citizens.filter((citizen) => citizen.state !== "dead");
  }

  spawnMigrants(attitude: "neutral" | "friendly" | "hostile") {
    const entryY = Math.floor(Math.random() * this.world.size);
    for (let i = 0; i < 3; i += 1) {
      const role: Role = attitude === "hostile" ? "warrior" : "worker";
      const citizen = this.createCitizen(role, 0, clamp(entryY + i, 0, this.world.size - 1), attitude === "hostile" ? 99 : 2);
      citizen.morale = 50;
      citizen.health = 70;
      citizen.currentGoal = attitude === "hostile" ? "raid" : "settle";
      this.addCitizen(citizen);
    }
    this.emit({
      type: "log",
      message: attitude === "hostile" ? "Una tribu hostil llega desde el horizonte." : "Viajeros se acercan buscando refugio.",
    });
  }

  spawnBeasts() {
    const entryX = Math.floor(Math.random() * this.world.size);
    for (let i = 0; i < 2; i += 1) {
      const beast = this.createCitizen("warrior", clamp(entryX + i, 0, this.world.size - 1), this.world.size - 1, 120);
      beast.health = 60;
      beast.morale = 100;
      beast.currentGoal = "beast";
      this.addCitizen(beast);
    }
    this.emit({ type: "log", message: "Bestias salvajes merodean la frontera." });
  }

  tryBlessCitizens(cells: Vec2[]) {
    const candidates = this.world
      .getCitizenIdsNear(cells)
      .map((id) => this.citizenById.get(id))
      .filter((cit): cit is Citizen => Boolean(cit && cit.state === "alive"));
    return candidates;
  }

  getPopulationCount(filter?: (citizen: Citizen) => boolean) {
    if (!filter) {
      return this.citizens.filter((citizen) => citizen.state === "alive").length;
    }
    return this.citizens.filter(filter).length;
  }

  getAssignablePopulationCount(tribeId?: number) {
    return this.citizens.filter(
      (citizen) =>
        citizen.state === "alive" &&
        citizen.role !== "child" &&
        citizen.role !== "elder" &&
        (tribeId === undefined || citizen.tribeId === tribeId),
    ).length;
  }

  getRoleCounts(tribeId?: number) {
    const counts: Record<Role, number> = {
      worker: 0,
      farmer: 0,
      warrior: 0,
      scout: 0,
      child: 0,
      elder: 0,
    };
    this.citizens.forEach((citizen) => {
      if (citizen.state !== "alive") return;
      if (tribeId !== undefined && citizen.tribeId !== tribeId) return;
      counts[citizen.role] += 1;
    });
    return counts;
  }

  rebalanceRoles(targets: Partial<Record<AssignableRole, number>>, tribeId?: number) {
    const pool = this.citizens.filter(
      (citizen) =>
        citizen.state === "alive" &&
        citizen.role !== "child" &&
        citizen.role !== "elder" &&
        (tribeId === undefined || citizen.tribeId === tribeId),
    );
    if (pool.length === 0) return;
    const assigned = new Set<number>();
    const assignCitizen = (citizen: Citizen, role: AssignableRole) => {
      if (citizen.role !== role) {
        citizen.role = role;
      }
      assigned.add(citizen.id);
    };

    for (const role of ASSIGNABLE_ROLES) {
      if (assigned.size >= pool.length) break;
      const desiredRaw = Math.max(0, Math.floor(targets[role] ?? 0));
      if (desiredRaw <= 0) continue;
      const availableSlots = pool.length - assigned.size;
      if (availableSlots <= 0) break;
      const targetCount = Math.min(desiredRaw, availableSlots);
      let assignedForRole = 0;
      for (const citizen of pool) {
        if (assigned.has(citizen.id)) continue;
        if (citizen.role === role) {
          assignCitizen(citizen, role);
          assignedForRole += 1;
          if (assignedForRole >= targetCount) break;
        }
      }
      if (assignedForRole >= targetCount) continue;
      for (const citizen of pool) {
        if (assigned.has(citizen.id)) continue;
        assignCitizen(citizen, role);
        assignedForRole += 1;
        if (assignedForRole >= targetCount) {
          break;
        }
      }
    }
  }

  private findSpawnNearVillage() {
    const { villageCenter } = this.world;
    for (let radius = 0; radius < 6; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          const x = villageCenter.x + dx;
          const y = villageCenter.y + dy;
          if (this.world.isWalkable(x, y)) {
            return { x, y };
          }
        }
      }
    }
    return { x: villageCenter.x, y: villageCenter.y };
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
        this.tryEatFromStockpile(citizen);
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
      this.emit({ type: "log", message: `El habitante ${citizen.id} ha crecido y trabajará.` });
    }

    if (citizen.role === "elder" && citizen.age > 85) {
      this.inflictDamage(citizen, 2, "fragilidad");
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

  private applyCitizenAction(citizen: Citizen, action: CitizenAction, tickHours: number) {
    switch (action.type) {
      case "move":
        this.moveCitizenTowards(citizen, action.x, action.y);
        break;
      case "gather":
        this.gatherResource(citizen, action.resourceType);
        break;
      case "storeResources":
        this.storeResources(citizen);
        break;
      case "rest":
        citizen.fatigue = clamp(citizen.fatigue - 3 * tickHours, 0, 100);
        citizen.hunger = clamp(citizen.hunger - 0.5 * tickHours, 0, 100);
        citizen.morale = clamp(citizen.morale + 2 * tickHours, 0, 100);
        break;
      case "idle":
        citizen.fatigue = clamp(citizen.fatigue - 1 * tickHours, 0, 100);
        break;
      case "attack":
        this.handleAttack(citizen, action.targetId);
        break;
      case "mate":
        this.handleReproduction(citizen, action.partnerId);
        break;
      case "tendCrops":
        this.tendCrop(citizen, action.x, action.y, tickHours);
        break;
    }
  }

  private moveCitizenTowards(citizen: Citizen, targetX: number, targetY: number) {
    const dx = clamp(targetX - citizen.x, -1, 1);
    const dy = clamp(targetY - citizen.y, -1, 1);
    if (dx === 0 && dy === 0) return;

    const tries: Vec2[] = [];
    const start = { x: citizen.x, y: citizen.y };
    const pushStep = (stepX: number, stepY: number) => {
      if (stepX === 0 && stepY === 0) return;
      tries.push({ x: start.x + stepX, y: start.y + stepY });
    };

    pushStep(dx, dy);
    if (dx !== 0 && dy !== 0) {
      // Intentar avanzar en ejes independientes si la diagonal está bloqueada.
      pushStep(dx, 0);
      pushStep(0, dy);
    }

    const currentDist = Math.abs(targetX - citizen.x) + Math.abs(targetY - citizen.y);
    for (const next of tries) {
      if (!this.world.isWalkable(next.x, next.y)) continue;
      const nextDist = Math.abs(targetX - next.x) + Math.abs(targetY - next.y);
      if (nextDist > currentDist) continue;
      if (this.world.moveCitizen(citizen.id, { x: citizen.x, y: citizen.y }, next)) {
        citizen.x = next.x;
        citizen.y = next.y;
        return;
      }
    }
  }

  private gatherResource(citizen: Citizen, type: ResourceType) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!cell || !cell.resource || cell.resource.type !== type) return;
    const amount = clamp(cell.resource.amount, 0, 3);
    if (amount <= 0) return;
    const efficiency = type === "food" && citizen.role === "farmer" ? 1.1 : 1;
    const gathered = Math.min(1, cell.resource.amount);
    cell.resource.amount = clamp(cell.resource.amount - gathered, 0, 10);
    if (type === "food") {
      citizen.carrying.food += Math.floor(gathered * efficiency);
      if (cell.cropProgress >= 1) {
        cell.cropProgress = 0;
      }
    } else if (type === "stone") {
      citizen.carrying.stone += gathered;
    }
    // Depositing now happens via the gatherer brain's state machine.
  }

  private storeResources(citizen: Citizen) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    const atStorage = cell?.structure === "village" || cell?.structure === "granary";
    if (!atStorage) {
      const target = this.world.villageCenter;
      this.moveCitizenTowards(citizen, target.x, target.y);
      return;
    }
    let deposited = false;
    if (citizen.carrying.food > 0) {
      const stored = this.world.deposit("food", citizen.carrying.food);
      citizen.carrying.food -= stored;
      deposited = stored > 0;
    }
    if (citizen.carrying.stone > 0) {
      const stored = this.world.deposit("stone", citizen.carrying.stone);
      citizen.carrying.stone -= stored;
      deposited = deposited || stored > 0;
    }
    if (deposited) {
      citizen.morale = clamp(citizen.morale + 4, 0, 100);
    }
  }

  private handleAttack(attacker: Citizen, targetId: number) {
    const target = this.citizenById.get(targetId);
    if (!target || target.state === "dead") return;
    const distance = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);
    if (distance > 1) {
      this.moveCitizenTowards(attacker, target.x, target.y);
      return;
    }
    const damage = attacker.role === "warrior" ? 15 : 5;
    this.inflictDamage(target, damage, `combate con ${attacker.id}`);
    attacker.fatigue = clamp(attacker.fatigue + 5, 0, 100);
    if (target.health <= 0) {
      this.finalizeCitizenDeath(target);
      if (target.tribeId !== attacker.tribeId) {
        this.emit({ type: "powerGain", amount: 2 });
      }
    }
  }

  private handleReproduction(citizen: Citizen, partnerId: number) {
    const partner = this.citizenById.get(partnerId);
    if (!partner || partner.state === "dead") return;
    const near = Math.abs(citizen.x - partner.x) <= 1 && Math.abs(citizen.y - partner.y) <= 1;
    if (!near) return;
    if (this.world.stockpile.food < 10) return;
    if (citizen.role === "child" || partner.role === "child") return;
    if (citizen.role === "elder" || partner.role === "elder") return;
    this.world.consume("food", 10);
    const spawn = this.createCitizen("child", citizen.x, citizen.y, citizen.tribeId);
    spawn.hunger = 10;
    this.addCitizen(spawn);
    this.emit({ type: "log", message: "Ha nacido un nuevo niño en la tribu." });
  }

  private tendCrop(citizen: Citizen, x: number, y: number, tickHours: number) {
    const cell = this.world.getCell(x, y);
    if (!cell) return;
    if (citizen.x !== x || citizen.y !== y) return;
    cell.cropProgress = clamp(cell.cropProgress + 0.11 * tickHours, 0, 1.2);
    citizen.fatigue = clamp(citizen.fatigue + 1, 0, 100);
    if (cell.cropProgress >= 1 && !cell.resource) {
      cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
    }
  }



  private logCitizenAction(citizen: Citizen, action: CitizenAction, source: string) {
    if (!this.debugLogging) return;
    const signature = `${source}|${this.getActionSignature(action)}`;
    if (citizen.debugLastAction === signature) return;
    citizen.debugLastAction = signature;

    const description = this.describeAction(action);
    const brainPhase = citizen.brain?.kind === "gatherer" ? ` fase:${citizen.brain.phase}` : "";
    const carrying = `F${citizen.carrying.food}/P${citizen.carrying.stone}`;
    const hunger = `hambre ${citizen.hunger.toFixed(0)}`;
    const logMessage = `[DEBUG] Habitante ${citizen.id} (${citizen.role}) ${description} via ${source}${brainPhase} @${this.formatCoords(
      citizen.x,
      citizen.y,
    )} | ${carrying} | ${hunger}`;
    this.emit({
      type: "log",
      message: logMessage,
    });
    this.appendCitizenHistory(citizen, `${description} via ${source}${brainPhase} @${this.formatCoords(citizen.x, citizen.y)} | ${carrying} | ${hunger}`);
  }

  private appendCitizenHistory(citizen: Citizen, details: string) {
    citizen.actionHistory.unshift({
      timestamp: this.elapsedHours,
      description: details,
    });
    if (citizen.actionHistory.length > 15) {
      citizen.actionHistory.length = 15;
    }
  }

  private describeAction(action: CitizenAction): string {
    switch (action.type) {
      case "move":
        return `se mueve hacia ${this.formatCoords(action.x, action.y)}`;
      case "gather":
        return `recolecta ${action.resourceType}`;
      case "storeResources":
        return "deposita recursos";
      case "rest":
        return "descansa";
      case "idle":
        return "permanece inactivo";
      case "attack":
        return `ataca al objetivo ${action.targetId}`;
      case "mate":
        return `busca pareja ${action.partnerId}`;
      case "tendCrops":
        return `atiende cultivos en ${this.formatCoords(action.x, action.y)}`;
      default:
        return "acción desconocida";
    }
  }

  private getActionSignature(action: CitizenAction): string {
    switch (action.type) {
      case "move":
        return `move:${action.x},${action.y}`;
      case "gather":
        return `gather:${action.resourceType}`;
      case "storeResources":
        return "store";
      case "rest":
        return "rest";
      case "idle":
        return "idle";
      case "attack":
        return `attack:${action.targetId}`;
      case "mate":
        return `mate:${action.partnerId}`;
      case "tendCrops":
        return `tend:${action.x},${action.y}`;
      default:
        return "unknown";
    }
  }

  private formatCoords(x: number, y: number): string {
    return `(${x},${y})`;
  }

  private inflictDamage(citizen: Citizen, amount: number, cause: string) {
    citizen.health = clamp(citizen.health - amount, -50, 100);
    citizen.lastDamageCause = cause;
  }

  private finalizeCitizenDeath(citizen: Citizen) {
    citizen.state = "dead";
    this.world.removeCitizen(citizen.id, { x: citizen.x, y: citizen.y });
    const reason = citizen.lastDamageCause ?? "causa desconocida";
    this.emit({
      type: "log",
      message: `Habitante ${citizen.id} ha muerto (${reason}) en ${this.formatCoords(citizen.x, citizen.y)}.`,
    });
  }

  private tryEatFromStockpile(citizen: Citizen) {
    let ateFromCarry = false;
    if (citizen.carrying.food > 0) {
      const ration = Math.min(2, citizen.carrying.food);
      citizen.carrying.food -= ration;
      citizen.hunger = clamp(citizen.hunger - ration * 5, 0, 100);
      citizen.morale = clamp(citizen.morale + 3, 0, 100);
      ateFromCarry = ration > 0;
      if (citizen.hunger <= 70) {
        return;
      }
    }

    if (this.world.stockpile.food <= 0) {
      if (!ateFromCarry) {
        citizen.morale = clamp(citizen.morale - 3, 0, 100);
        this.inflictDamage(citizen, 1, "hambre (sin reservas)");
      }
      return;
    }

    const eaten = this.world.consume("food", 3);
    if (eaten > 0) {
      citizen.hunger = clamp(citizen.hunger - eaten * 5, 0, 100);
      citizen.morale = clamp(citizen.morale + 4, 0, 100);
    }
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
    return { type: "move", x: view.villageCenter.x + Math.round(Math.random() * 4 - 2), y: view.villageCenter.y + Math.round(Math.random() * 4 - 2) };
  }

  return { type: "idle" };
};

const MAX_FOOD_CARRY = 3;
const MAX_STONE_CARRY = 3;

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
    if (!cell.resource || cell.resource.type !== resourceType || (cell.resource.amount ?? 0) <= 0) continue;
    
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
  const redirectToNewResource = (): CitizenAction => {
    const nextCell = findClosestResourceCell(citizen, view, resourceType);
    if (nextCell) {
      brain.phase = "goingToResource";
      brain.target = { x: nextCell.x, y: nextCell.y };
      return { type: "move", x: nextCell.x, y: nextCell.y };
    }
    brain.phase = "idle";
    brain.target = null;
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
        if (distanceToTarget <= 3) {
          const targetCell = view.cells.find(c => c.x === brain.target!.x && c.y === brain.target!.y);
          if (targetCell?.resource?.type === resourceType && (targetCell.resource.amount ?? 0) > 0) {
            brain.phase = "goingToResource";
            return { type: "move", x: brain.target.x, y: brain.target.y };
          }
        }
      }
      
      const targetCell = findClosestResourceCell(citizen, view, resourceType);
      if (!targetCell) {
        brain.target = null;
        return wanderCitizen(citizen);
      }
      brain.phase = "goingToResource";
      brain.target = { x: targetCell.x, y: targetCell.y };
      return { type: "move", x: targetCell.x, y: targetCell.y };
    }
    case "goingToResource": {
      if (!brain.target) {
        return redirectToNewResource();
      }
      if (isInventoryFull(citizen, resourceType)) {
        brain.phase = "goingToStorage";
        brain.target = findStorageTarget(citizen, view);
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }
      const targetCell = view.cells.find((c) => c.x === brain.target!.x && c.y === brain.target!.y);
      if (targetCell && (!targetCell.resource || targetCell.resource.type !== resourceType || (targetCell.resource.amount ?? 0) <= 0)) {
        return redirectToNewResource();
      }
      if (citizen.x === brain.target.x && citizen.y === brain.target.y) {
        brain.phase = "gathering";
        return { type: "gather", resourceType };
      }
      return { type: "move", x: brain.target.x, y: brain.target.y };
    }
    case "gathering": {
      const cell = view.cells.find((c) => c.x === citizen.x && c.y === citizen.y);
      if (!cell || !cell.resource || cell.resource.type !== resourceType || (cell.resource.amount ?? 0) <= 0) {
        return redirectToNewResource();
      }
      if (isInventoryFull(citizen, resourceType)) {
        brain.phase = "goingToStorage";
        brain.target = findStorageTarget(citizen, view);
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }
      return { type: "gather", resourceType };
    }
    case "goingToStorage": {
      if (!brain.target) {
        brain.target = findStorageTarget(citizen, view);
      }
      const atStorage = citizen.x === brain.target.x && citizen.y === brain.target.y;
      if (atStorage) {
        brain.phase = "depositing";
        return { type: "storeResources" };
      }
      return { type: "move", x: brain.target.x, y: brain.target.y };
    }
    case "depositing": {
      const currentCell = view.cells.find((c) => c.x === citizen.x && c.y === citizen.y);
      const atStorage = currentCell?.structure === "village" || currentCell?.structure === "granary";
      if (!atStorage) {
        brain.phase = "goingToStorage";
        brain.target = findStorageTarget(citizen, view);
        return { type: "move", x: brain.target.x, y: brain.target.y };
      }
      const hasResources = (resourceType === "food" && citizen.carrying.food > 0) || (resourceType === "stone" && citizen.carrying.stone > 0);
      if (hasResources) {
        return { type: "storeResources" };
      }
      brain.phase = "idle";
      brain.target = null;
      return { type: "idle" };
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
  const isDepositingPhase = brain.phase === "goingToStorage" || brain.phase === "depositing";
  const isGatheringPhase = brain.phase === "gathering" || brain.phase === "goingToResource";

  // Prioridad 1: si el inventario está lleno, forzar el depósito (salvo que ya esté en ello).
  if (!isDepositingPhase && isInventoryFull(citizen, "food")) {
    brain.phase = "goingToStorage";
    brain.target = findStorageTarget(citizen, view);
    return runGathererBrain(citizen, view, "food");
  }

  // Prioridad 2: si ya está en alguna fase del cerebro recolector, continuarla.
  if (isDepositingPhase || isGatheringPhase) {
    return runGathererBrain(citizen, view, "food");
  }

  // Hysteresis para cultivo: Si ya está cultivando cerca, continuar
  const currentCell = view.cells.find(c => c.x === citizen.x && c.y === citizen.y);
  if (currentCell?.priority === "farm" && (currentCell.terrain === "grassland" || currentCell.terrain === "forest") && !currentCell.cropReady) {
    return { type: "tendCrops", x: citizen.x, y: citizen.y };
  }
  
  const nearbyFarmCell = view.cells.find(
    (cell) => cell.priority === "farm" && (cell.terrain === "grassland" || cell.terrain === "forest") && !cell.cropReady &&
              Math.abs(cell.x - citizen.x) + Math.abs(cell.y - citizen.y) <= 2
  );
  if (nearbyFarmCell) {
    if (citizen.x === nearbyFarmCell.x && citizen.y === nearbyFarmCell.y) {
      return { type: "tendCrops", x: nearbyFarmCell.x, y: nearbyFarmCell.y };
    }
    return { type: "move", x: nearbyFarmCell.x, y: nearbyFarmCell.y };
  }

  // Prioridad 3: Recoger cultivos maduros cercanos (solo si el inventario no está casi lleno)
  if (citizen.carrying.food < MAX_FOOD_CARRY - 1) {
    const matureCrop = view.cells.find(
      (cell) => cell.cropReady && cell.resource?.type === "food" && (cell.resource.amount ?? 0) > 0
    );
    if (matureCrop) {
      brain.phase = "goingToResource";
      brain.target = { x: matureCrop.x, y: matureCrop.y };
      return runGathererBrain(citizen, view, "food");
    }
  }

  // Prioridad 4: Cultivar celdas marcadas como farm
  const farmCell = view.cells.find(
    (cell) => cell.priority === "farm" && (cell.terrain === "grassland" || cell.terrain === "forest") && !cell.cropReady
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

const aiDispatch: Record<Role, CitizenAI> = {
  warrior: warriorAI,
  farmer: farmerAI,
  worker: workerAI,
  scout: scoutAI,
  child: passiveAI,
  elder: passiveAI,
};
