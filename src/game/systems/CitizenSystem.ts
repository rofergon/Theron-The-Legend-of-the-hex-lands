import { clamp } from "../core/utils";
import type { Citizen, PriorityMark, Role, ToastNotification, Vec2 } from "../core/types";
import type { WorldEngine } from "../core/world/WorldEngine";
import { CitizenRepository } from "./citizen/CitizenRepository";
import { CitizenBehaviorDirector } from "./citizen/CitizenBehaviorDirector";
import { CitizenNeedsSimulator } from "./citizen/CitizenNeedsSimulator";
import { Navigator } from "./citizen/Navigator";
import { CitizenActionExecutor } from "./citizen/CitizenActionExecutor";
import { ResourceCollectionEngine } from "./resource/ResourceCollectionEngine";

export type CitizenSystemEvent =
  | { type: "log"; message: string; notificationType?: ToastNotification["type"] }
  | { type: "powerGain"; amount: number };

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;
const ASSIGNABLE_ROLES: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
const BUSY_GOALS = new Set([
  "construct",
  "sow",
  "fertilize",
  "harvest",
  "gather",
  "mining",
  "attack",
  "mate",
]);
export class CitizenSystem {
  private readonly repository: CitizenRepository;
  private readonly needsSimulator: CitizenNeedsSimulator;
  private readonly behaviorDirector: CitizenBehaviorDirector;
  private readonly navigator: Navigator;
  private readonly actionExecutor: CitizenActionExecutor;
  private readonly resourceEngine: ResourceCollectionEngine;
  private debugLogging = true;
  private elapsedHours = 0;
  private playerTribeId = 1;

  constructor(private world: WorldEngine, private emit: (event: CitizenSystemEvent) => void = () => { }) {
    this.repository = new CitizenRepository(world);
    this.needsSimulator = new CitizenNeedsSimulator(world, {
      inflictDamage: (citizen, amount, cause) => this.inflictDamage(citizen, amount, cause),
      tryEatFromStockpile: (citizen) => this.tryEatFromStockpile(citizen),
    });
    this.resourceEngine = new ResourceCollectionEngine(world);
    this.behaviorDirector = new CitizenBehaviorDirector(world, {
      emit: (event) => this.emit(event),
      tryEatFromStockpile: (citizen) => this.tryEatFromStockpile(citizen),
      inflictDamage: (citizen, amount, cause) => this.inflictDamage(citizen, amount, cause),
    }, this.resourceEngine);
    this.navigator = new Navigator(world);
    this.actionExecutor = new CitizenActionExecutor(world, this.repository, this.navigator, this.resourceEngine, {
      emit: (event) => this.emit(event),
      finalizeCitizenDeath: (citizen) => this.finalizeCitizenDeath(citizen),
      createCitizen: (role, x, y, tribeId) => this.createCitizen(role, x, y, tribeId),
      addCitizen: (citizen) => this.addCitizen(citizen),
    });
  }

  init(roles: Role[], tribeId: number) {
    this.playerTribeId = tribeId;
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
      const view = this.world.getView(citizen, 15);
      const decision = this.behaviorDirector.decideAction(citizen, view);
      this.actionExecutor.execute(citizen, decision, tickHours, {
        debugLogging: this.debugLogging,
        elapsedHours: this.elapsedHours,
      });
    }

    // Apply any pending role changes for citizens who are no longer busy
    this.applyPendingRoleChanges();

    this.repository.pruneDeadCitizens();
  }

  spawnMigrants(attitude: "neutral" | "friendly" | "hostile") {
    const entry = this.findValidSpawnPoint("left");
    if (!entry) {
      this.emit({ type: "log", message: "Un grupo de viajeros pasó de largo (sin ruta segura)." });
      return;
    }

    for (let i = 0; i < 3; i += 1) {
      const role: Role = attitude === "hostile" ? "warrior" : "worker";
      const tribeId = attitude === "hostile" ? 99 : this.playerTribeId;
      // Intentar colocar cerca del punto de entrada
      const offsetX = Math.floor(Math.random() * 3);
      const offsetY = Math.floor(Math.random() * 3);
      const x = clamp(entry.x + offsetX, 0, this.world.size - 1);
      const y = clamp(entry.y + offsetY, 0, this.world.size - 1);

      if (this.world.isWalkable(x, y)) {
        const citizen = this.createCitizen(role, x, y, tribeId);
        citizen.morale = 50;
        citizen.health = 70;
        citizen.currentGoal = attitude === "hostile" ? "raid" : "settle";
        this.addCitizen(citizen);
      }
    }
    this.emit({
      type: "log",
      message: attitude === "hostile" ? "Una tribu hostil llega desde el horizonte." : "Viajeros se acercan buscando refugio.",
    });
  }

  spawnBeasts() {
    const entry = this.findValidSpawnPoint("bottom");
    if (!entry) return;

    for (let i = 0; i < 2; i += 1) {
      const offsetX = Math.floor(Math.random() * 3);
      const x = clamp(entry.x + offsetX, 0, this.world.size - 1);
      const y = clamp(entry.y, 0, this.world.size - 1);

      if (this.world.isWalkable(x, y)) {
        const beast = this.createCitizen("warrior", x, y, 120);
        beast.health = 60;
        beast.morale = 100;
        beast.currentGoal = "beast";
        this.addCitizen(beast);
      }
    }
    this.emit({ type: "log", message: "Bestias salvajes merodean la frontera." });
  }

  private findValidSpawnPoint(edge: "left" | "bottom"): Vec2 | null {
    const size = this.world.size;
    const attempts = 20;

    for (let i = 0; i < attempts; i++) {
      let x = 0;
      let y = 0;

      if (edge === "left") {
        x = 0;
        y = Math.floor(Math.random() * size);
      } else {
        x = Math.floor(Math.random() * size);
        y = size - 1;
      }

      if (this.world.isWalkable(x, y)) {
        return { x, y };
      }
    }
    return null;
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

    // Normalize targets to ensure we have a value for each role
    const normalizedTargets: Record<AssignableRole, number> = {
      farmer: Math.max(0, Math.floor(targets.farmer ?? 0)),
      worker: Math.max(0, Math.floor(targets.worker ?? 0)),
      warrior: Math.max(0, Math.floor(targets.warrior ?? 0)),
      scout: Math.max(0, Math.floor(targets.scout ?? 0)),
    };

    // Calculate total requested
    const totalRequested = Object.values(normalizedTargets).reduce((sum, count) => sum + count, 0);

    // If total requested exceeds pool, we need to scale down proportionally
    let finalTargets = { ...normalizedTargets };
    if (totalRequested > pool.length) {
      const scale = pool.length / totalRequested;
      for (const role of ASSIGNABLE_ROLES) {
        finalTargets[role] = Math.floor(normalizedTargets[role] * scale);
      }
      // Distribute remaining slots to maintain total
      let assigned = Object.values(finalTargets).reduce((sum, count) => sum + count, 0);
      for (const role of ASSIGNABLE_ROLES) {
        if (assigned >= pool.length) break;
        if (normalizedTargets[role] > finalTargets[role]) {
          finalTargets[role]++;
          assigned++;
        }
      }
    }

    // Assign roles in order of priority
    const assignments: Map<number, AssignableRole> = new Map();

    for (const role of ASSIGNABLE_ROLES) {
      const targetCount = finalTargets[role];
      if (targetCount <= 0) continue;

      // First pass: keep citizens who already have this role
      const alreadyInRole = pool.filter(c => c.role === role && !assignments.has(c.id));
      const toKeep = alreadyInRole.slice(0, targetCount);
      toKeep.forEach(c => assignments.set(c.id, role));

      // Second pass: assign from other roles if we need more
      const stillNeeded = targetCount - toKeep.length;
      if (stillNeeded > 0) {
        const available = pool.filter(c => !assignments.has(c.id));
        const toAssign = available.slice(0, stillNeeded);
        toAssign.forEach(c => assignments.set(c.id, role));
      }
    }

    // Assign remaining citizens to "worker" by default
    const unassigned = pool.filter(c => !assignments.has(c.id));
    unassigned.forEach(c => assignments.set(c.id, "worker"));

    // Apply assignments, respecting busy status
    for (const citizen of pool) {
      const targetRole = assignments.get(citizen.id);
      if (!targetRole || targetRole === citizen.role) {
        // Clear any pending role change if the target matches current role
        if (citizen.pendingRoleChange) {
          delete citizen.pendingRoleChange;
        }
        continue;
      }

      // Check if citizen is busy with an active task
      if (this.isCitizenBusy(citizen)) {
        // Defer the role change until the task is complete
        citizen.pendingRoleChange = targetRole;
      } else {
        // Apply immediately if not busy
        citizen.role = targetRole;
        delete citizen.pendingRoleChange;
      }
    }
  }

  private isCitizenBusy(citizen: Citizen): boolean {
    // Check if citizen has an active goal that indicates they're performing a task
    if (!citizen.currentGoal) return false;

    // Normalize once per call and compare against a set to avoid repeated lowercase conversions
    const goal = citizen.currentGoal.toLowerCase();
    return BUSY_GOALS.has(goal);
  }

  applyPendingRoleChanges() {
    // Called each tick to apply pending role changes for citizens who are no longer busy
    for (const citizen of this.repository.getCitizens()) {
      if (!citizen.pendingRoleChange) continue;

      // Check if citizen is still busy
      if (!this.isCitizenBusy(citizen)) {
        citizen.role = citizen.pendingRoleChange;
        delete citizen.pendingRoleChange;
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
