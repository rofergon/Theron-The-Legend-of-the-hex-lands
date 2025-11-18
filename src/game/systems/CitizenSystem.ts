import { clamp } from "../core/utils";
import type { Citizen, PriorityMark, Role, ToastNotification, Vec2 } from "../core/types";
import type { WorldEngine } from "../core/world/WorldEngine";
import { CitizenRepository } from "./citizen/CitizenRepository";
import { CitizenBehaviorDirector } from "./citizen/CitizenBehaviorDirector";
import { CitizenNeedsSimulator } from "./citizen/CitizenNeedsSimulator";
import { Navigator } from "./citizen/Navigator";
import { CitizenActionExecutor } from "./citizen/CitizenActionExecutor";

export type CitizenSystemEvent =
  | { type: "log"; message: string; notificationType?: ToastNotification["type"] }
  | { type: "powerGain"; amount: number };

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;
const ASSIGNABLE_ROLES: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
export class CitizenSystem {
  private readonly repository: CitizenRepository;
  private readonly needsSimulator: CitizenNeedsSimulator;
  private readonly behaviorDirector: CitizenBehaviorDirector;
  private readonly navigator: Navigator;
  private readonly actionExecutor: CitizenActionExecutor;
  private debugLogging = true;
  private elapsedHours = 0;

  constructor(private world: WorldEngine, private emit: (event: CitizenSystemEvent) => void = () => {}) {
    this.repository = new CitizenRepository(world);
    this.needsSimulator = new CitizenNeedsSimulator(world, {
      inflictDamage: (citizen, amount, cause) => this.inflictDamage(citizen, amount, cause),
      tryEatFromStockpile: (citizen) => this.tryEatFromStockpile(citizen),
    });
    this.behaviorDirector = new CitizenBehaviorDirector(world, {
      emit: (event) => this.emit(event),
      tryEatFromStockpile: (citizen) => this.tryEatFromStockpile(citizen),
      inflictDamage: (citizen, amount, cause) => this.inflictDamage(citizen, amount, cause),
    });
    this.navigator = new Navigator(world);
    this.actionExecutor = new CitizenActionExecutor(world, this.repository, this.navigator, {
      emit: (event) => this.emit(event),
      finalizeCitizenDeath: (citizen) => this.finalizeCitizenDeath(citizen),
      createCitizen: (role, x, y, tribeId) => this.createCitizen(role, x, y, tribeId),
      addCitizen: (citizen) => this.addCitizen(citizen),
    });
  }

  init(roles: Role[], tribeId: number) {
    roles.forEach((role) => {
      const position = this.findSpawnNearVillage();
      const citizen = this.createCitizen(role, position.x, position.y, tribeId);
      this.addCitizen(citizen);
    });
  }

  getCitizens() {
    return this.repository.getCitizens();
  }

  getCitizenById(id: number) {
    return this.repository.getCitizenById(id);
  }

  addCitizen(citizen: Citizen) {
    this.repository.addCitizen(citizen);
  }

  createCitizen(role: Role, x: number, y: number, tribeId: number): Citizen {
    return this.repository.createCitizen(role, x, y, tribeId);
  }

  update(tickHours: number) {
    this.elapsedHours += tickHours;
    for (const citizen of this.repository.getCitizens()) {
      if (citizen.state === "dead") continue;
      const needsResult = this.needsSimulator.advance(citizen, tickHours);
      if (needsResult.died) {
        this.finalizeCitizenDeath(citizen);
        continue;
      }
      const view = this.world.getView(citizen, 5);
      const decision = this.behaviorDirector.decideAction(citizen, view);
      this.actionExecutor.execute(citizen, decision, tickHours, {
        debugLogging: this.debugLogging,
        elapsedHours: this.elapsedHours,
      });
    }

    this.repository.pruneDeadCitizens();
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
      .map((id) => this.repository.getCitizenById(id))
      .filter((cit): cit is Citizen => Boolean(cit && cit.state === "alive"));
    return candidates;
  }

  getPopulationCount(filter?: (citizen: Citizen) => boolean) {
    return this.repository.getPopulationCount(filter);
  }

  getAssignablePopulationCount(tribeId?: number) {
    return this.repository.getAssignablePopulationCount(tribeId);
  }

  getRoleCounts(tribeId?: number) {
    return this.repository.getRoleCounts(tribeId);
  }

  rebalanceRoles(targets: Partial<Record<AssignableRole, number>>, tribeId?: number) {
    const pool = this.repository.getAssignableCitizens(tribeId);
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

  private inflictDamage(citizen: Citizen, amount: number, cause: string) {
    citizen.health = clamp(citizen.health - amount, -50, 100);
    citizen.lastDamageCause = cause;
  }

  private finalizeCitizenDeath(citizen: Citizen) {
    citizen.state = "dead";
    this.world.removeCitizen(citizen.id, { x: citizen.x, y: citizen.y });
    this.repository.removeLookup(citizen);
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

  private formatCoords(x: number, y: number): string {
    return `(${x},${y})`;
  }
}
