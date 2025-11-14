import { clamp } from "../core/utils";
import type {
  Citizen,
  CitizenAction,
  CitizenAI,
  PriorityMark,
  ResourceType,
  Role,
  ToastNotification,
  Vec2,
  WorldView,
} from "../core/types";
import type { WorldEngine } from "../core/world/WorldEngine";

export type CitizenSystemEvent =
  | { type: "log"; message: string; notificationType?: ToastNotification["type"] }
  | { type: "powerGain"; amount: number };

export class CitizenSystem {
  private citizens: Citizen[] = [];
  private citizenById = new Map<number, Citizen>();
  private nextCitizenId = 1;

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
    };
  }

  update(tickHours: number) {
    for (const citizen of this.citizens) {
      if (citizen.state === "dead") continue;
      const cell = this.world.getCell(citizen.x, citizen.y);
      const hungerRate = cell?.terrain === "desert" ? 1.5 : 1;
      citizen.age += tickHours;
      citizen.hunger = clamp(citizen.hunger + hungerRate * 1.2, 0, 100);
      citizen.fatigue = clamp(citizen.fatigue + 0.8, 0, 100);
      citizen.morale = clamp(citizen.morale - 0.2, 0, 100);

      if (citizen.hunger > 80) citizen.health -= 4;
      if (citizen.fatigue > 80) citizen.health -= 2;
      if (citizen.morale < 20) citizen.currentGoal = "passive";

      if (citizen.age > 70 && Math.random() < tickHours * 0.02) citizen.health -= 5;

      if (citizen.health <= 0) {
        citizen.state = "dead";
        this.world.removeCitizen(citizen.id, { x: citizen.x, y: citizen.y });
        this.emit({ type: "log", message: `Habitante ${citizen.id} ha muerto.` });
        continue;
      }

      if (citizen.hunger > 70) {
        this.tryEatFromStockpile(citizen);
      }

      const view = this.world.getView(citizen, 5);
      let action: CitizenAction | null = this.evaluateUrgentNeed(citizen, view);
      if (!action) {
        const ai = aiDispatch[citizen.role] ?? passiveAI;
        action = ai(citizen, view);
      }
      this.applyCitizenAction(citizen, action, tickHours);
    }

    this.citizens = this.citizens.filter((citizen) => citizen.state !== "dead");
    this.resolveConflicts();
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
    if (citizen.health < 25 && view.villageCenter) {
      return { type: "move", x: view.villageCenter.x, y: view.villageCenter.y };
    }

    if (citizen.hunger > 90) {
      return { type: "move", x: view.villageCenter?.x ?? citizen.x, y: view.villageCenter?.y ?? citizen.y };
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
      citizen.health -= 2;
    }

    return null;
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
    const next = { x: citizen.x + dx, y: citizen.y + dy };
    if (!this.world.isWalkable(next.x, next.y)) return;
    if (this.world.moveCitizen(citizen.id, { x: citizen.x, y: citizen.y }, next)) {
      citizen.x = next.x;
      citizen.y = next.y;
    }
  }

  private gatherResource(citizen: Citizen, type: ResourceType) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!cell || !cell.resource || cell.resource.type !== type) return;
    const amount = clamp(cell.resource.amount, 0, 3);
    if (amount <= 0) return;
    cell.resource.amount = clamp(cell.resource.amount - 1, 0, 10);
    if (type === "food") {
      citizen.carrying.food += 1;
      if (cell.cropProgress >= 1) {
        cell.cropProgress = 0;
      }
    } else if (type === "stone") {
      citizen.carrying.stone += 1;
    }
    if (citizen.carrying.food >= 3 || citizen.carrying.stone >= 3) {
      this.applyCitizenAction(citizen, { type: "storeResources" }, 0);
    }
  }

  private storeResources(citizen: Citizen) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    const atStorage = cell?.structure === "village" || cell?.structure === "granary";
    if (!atStorage) {
      const target = this.world.villageCenter;
      this.moveCitizenTowards(citizen, target.x, target.y);
      return;
    }
    if (citizen.carrying.food > 0) {
      const stored = this.world.deposit("food", citizen.carrying.food);
      citizen.carrying.food -= stored;
    }
    if (citizen.carrying.stone > 0) {
      const stored = this.world.deposit("stone", citizen.carrying.stone);
      citizen.carrying.stone -= stored;
    }
    citizen.morale = clamp(citizen.morale + 4, 0, 100);
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
    target.health -= damage;
    attacker.fatigue = clamp(attacker.fatigue + 5, 0, 100);
    if (target.health <= 0) {
      target.state = "dead";
      this.world.removeCitizen(target.id, { x: target.x, y: target.y });
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
    cell.cropProgress = clamp(cell.cropProgress + 0.1 * tickHours, 0, 1.2);
    citizen.fatigue = clamp(citizen.fatigue + 1, 0, 100);
    if (cell.cropProgress >= 1 && !cell.resource) {
      cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
    }
  }

  private resolveConflicts() {
    const hostiles = this.citizens.filter((citizen) => citizen.tribeId !== 1 && citizen.state === "alive");
    hostiles.forEach((hostile) => {
      const view = this.world.getView(hostile, 4);
      const target = view.nearbyCitizens.find((cit) => cit.tribeId === 1);
      if (target) {
        this.handleAttack(hostile, target.id);
      } else if (view.villageCenter) {
        this.moveCitizenTowards(hostile, view.villageCenter.x, view.villageCenter.y);
      }
    });
  }

  private tryEatFromStockpile(citizen: Citizen) {
    if (this.world.stockpile.food <= 0) {
      citizen.morale -= 3;
      citizen.health -= 1;
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
      return { type: "attack", targetId: target.id };
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

const farmerAI: CitizenAI = (citizen, view) => {
  const harvestTarget = [...view.cells]
    .filter((cell) => cell.resource?.type === "food")
    .sort((a, b) => {
      const da = Math.abs(a.x - citizen.x) + Math.abs(a.y - citizen.y);
      const db = Math.abs(b.x - citizen.x) + Math.abs(b.y - citizen.y);
      return da - db;
    })[0];

  if (harvestTarget) {
    if (citizen.x === harvestTarget.x && citizen.y === harvestTarget.y) {
      return { type: "gather", resourceType: "food" };
    }
    return { type: "move", x: harvestTarget.x, y: harvestTarget.y };
  }

  const farmCell = view.cells.find((cell) => cell.priority === "farm" && cell.terrain === "grass");
  if (farmCell) {
    if (citizen.x === farmCell.x && citizen.y === farmCell.y) {
      return { type: "tendCrops", x: farmCell.x, y: farmCell.y };
    }
    return { type: "move", x: farmCell.x, y: farmCell.y };
  }

  return { type: "move", x: citizen.x + Math.round(Math.random() * 2 - 1), y: citizen.y + Math.round(Math.random() * 2 - 1) };
};

const workerAI: CitizenAI = (citizen, view) => {
  const mineCell = view.cells.find((cell) => cell.priority === "mine" && cell.resource?.type === "stone");
  if (mineCell) {
    if (citizen.x === mineCell.x && citizen.y === mineCell.y) {
      return { type: "gather", resourceType: "stone" };
    }
    return { type: "move", x: mineCell.x, y: mineCell.y };
  }

  const stoneCell = view.cells.find((cell) => cell.resource?.type === "stone");
  if (stoneCell) {
    return { type: "move", x: stoneCell.x, y: stoneCell.y };
  }

  return { type: "idle" };
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
