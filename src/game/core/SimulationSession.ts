import { clamp } from "./utils";
import type { ClimateState, PriorityMark, ResourceTrend, Role, StructureType, ToastNotification, Vec2 } from "./types";
import { WorldEngine } from "./world/WorldEngine";
import { CitizenSystem, type CitizenSystemEvent } from "../systems/CitizenSystem";

type SimulationConfig = {
  worldSize: number;
  seed: number;
  difficulty: "easy" | "normal" | "hard";
};

type SimulationHooks = {
  onLog?: (message: string, notificationType?: ToastNotification["type"]) => void;
  onExtinction?: () => void;
};

type RunTickOptions = {
  priority?: PriorityMark | null;
};

export class SimulationSession {
  private world!: WorldEngine;
  private citizenSystem!: CitizenSystem;
  private climate: ClimateState = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
  private nextEventTimer = 8;
  private resourceHistory: ResourceTrend[] = [];
  private lastResourceSnapshot = { food: 0, stone: 0, wood: 0, population: 0 };
  private resourceTrackTimer = 0;
  private extinctionAnnounced = false;
  private initialized = false;
  private faith = 0;
  private faithPerHour = 0;

  constructor(private playerTribeId: number, private hooks: SimulationHooks = {}) { }

  initialize(config: SimulationConfig) {
    if (this.initialized) return;
    this.climate = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
    this.nextEventTimer = 8;
    this.resourceHistory = [];
    this.resourceTrackTimer = 0;
    this.extinctionAnnounced = false;
    this.faith = 0;
    this.faithPerHour = 0;
    this.world = new WorldEngine(config.worldSize, config.seed);

    this.citizenSystem = new CitizenSystem(this.world, (event) => this.handleCitizenEvent(event));
    this.world.citizenLookup = (id) => this.citizenSystem.getCitizenById(id);

    const roles = this.buildInitialRoles(config.difficulty);
    this.citizenSystem.init(roles, this.playerTribeId);
    this.applyDifficultyAdjustments(config.difficulty);

    this.lastResourceSnapshot = {
      food: this.world.stockpile.food,
      stone: this.world.stockpile.stone,
      wood: this.world.stockpile.wood,
      population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId),
    };

    this.initialized = true;

    this.log(`🌍 Mundo generado con semilla: ${config.seed}`, "info");
    this.log(`📏 Tamaño: ${config.worldSize}x${config.worldSize}`, "info");
    this.log(`⚔️ Dificultad: ${config.difficulty}`, "info");
  }

  runTick(tickHours: number, options: RunTickOptions = {}) {
    if (!this.initialized) return;

    if (options.priority) {
      this.applyPriority(options.priority);
    }

    this.updateEvents(tickHours);
    this.world.updateEnvironment(this.climate, tickHours);
    this.citizenSystem.update(tickHours);
    this.generateFaith(tickHours);
    this.trackResourceTrends(tickHours);
    this.checkExtinction();
  }

  applyPriority(priority: PriorityMark) {

    if (!this.initialized) return;
  }



  planConstruction(type: StructureType, anchor: Vec2) {
    if (!this.initialized) {
      return { ok: false as const, reason: "El mundo no está listo." };
    }
    const available = this.getAvailableStructures();
    if (!available.includes(type)) {
      return { ok: false as const, reason: "Estructura bloqueada." };
    }
    const result = this.world.planStructure(type, anchor);
    if (!result.ok) {
      this.log(`No se pudo planificar ${type}: ${result.reason}`);
      return result;
    }
    this.log(`Se ha trazado el plano de ${type} en (${anchor.x},${anchor.y}).`, "info");
    return result;
  }

  getWorld() {
    return this.world;
  }

  getCitizenSystem() {
    return this.citizenSystem;
  }

  getAvailableStructures() {
    if (!this.initialized) return [];
    const population = this.citizenSystem.getPopulationCount(
      (citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId,
    );
    const unlocked: StructureType[] = ["campfire", "house"];
    if (population >= 5) {
      unlocked.push("granary");
    }
    if (population >= 6) {
      unlocked.push("warehouse");
    }
    if (population >= 8) {
      unlocked.push("tower");
    }
    if (population >= 12) {
      unlocked.push("temple");
    }
    return unlocked;
  }

  getClimate() {
    return this.climate;
  }

  getFaithSnapshot() {
    return { value: this.faith, perHour: this.faithPerHour };
  }

  getResourceTrendAverage(type: keyof ResourceTrend) {
    if (this.resourceHistory.length === 0) return 0;
    const recent = this.resourceHistory.slice(-5);
    const sum = recent.reduce((acc, trend) => acc + trend[type], 0);
    return sum / recent.length;
  }

  private updateEvents(tickHours: number) {
    if (this.climate.drought) {
      this.climate.droughtTimer -= tickHours;
      if (this.climate.droughtTimer <= 0) {
        this.climate.drought = false;
        this.log("La sequía termina.");
      }
    } else {
      this.nextEventTimer -= tickHours;
    }

    if (this.climate.rainy) {
      this.climate.rainyTimer -= tickHours;
      if (this.climate.rainyTimer <= 0) {
        this.climate.rainy = false;
        this.log("Las lluvias menguan.");
      }
    }

    if (this.nextEventTimer <= 0) {
      this.triggerRandomEvent();
      this.nextEventTimer = 12 + Math.random() * 12;
    }
  }

  private triggerRandomEvent() {
    const roll = Math.random();
    if (roll < 0.4) {
      this.climate.drought = true;
      this.climate.droughtTimer = 16 + Math.random() * 10;
      this.log("Una sequía azota la comarca.");
      return;
    }
    if (roll < 0.7) {
      this.climate.rainy = true;
      this.climate.rainyTimer = 10 + Math.random() * 8;
      this.log("Nubes cargadas bendicen con lluvia.");
      return;
    }
    if (roll < 0.85) {
      this.citizenSystem.spawnMigrants("neutral");
      return;
    }
    this.citizenSystem.spawnBeasts();
  }



  private trackResourceTrends(tickHours: number) {
    this.resourceTrackTimer += tickHours;
    if (this.resourceTrackTimer >= 1) {
      const current = {
        food: this.world.stockpile.food,
        stone: this.world.stockpile.stone,
        wood: this.world.stockpile.wood,
        population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId),
      };

      this.resourceHistory.push({
        food: current.food - this.lastResourceSnapshot.food,
        stone: current.stone - this.lastResourceSnapshot.stone,
        wood: current.wood - this.lastResourceSnapshot.wood,
        population: current.population - this.lastResourceSnapshot.population,
      });

      if (this.resourceHistory.length > 24) {
        this.resourceHistory.shift();
      }

      this.lastResourceSnapshot = current;
      this.resourceTrackTimer = 0;
    }
  }

  private checkExtinction() {
    if (this.extinctionAnnounced) return;
    const alive = this.citizenSystem.getPopulationCount(
      (citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId,
    );
    if (alive > 0) return;
    this.extinctionAnnounced = true;
    this.hooks.onExtinction?.();
  }

  private handleCitizenEvent(event: CitizenSystemEvent) {
    if (event.type === "log") {
      this.log(event.message, event.notificationType);
    }
  }

  private buildInitialRoles(difficulty: SimulationConfig["difficulty"]): Role[] {
    const baseRoles: Role[] = ["farmer", "farmer", "worker", "worker"];
    if (difficulty === "easy") {
      return [...baseRoles, "warrior", "scout", "child", "child"];
    }
    if (difficulty === "normal") {
      return [...baseRoles, "warrior", "scout", "child"];
    }
    return [...baseRoles, "warrior"];
  }

  private applyDifficultyAdjustments(difficulty: SimulationConfig["difficulty"]) {
    if (difficulty === "easy") {
      this.world.stockpile.food += 20;
      this.world.stockpile.stone += 10;
      this.world.stockpile.wood += 6;
    } else if (difficulty === "hard") {
      this.world.stockpile.food = Math.max(20, this.world.stockpile.food - 10);
      this.world.stockpile.stone = Math.max(5, this.world.stockpile.stone - 5);
      this.world.stockpile.wood = Math.max(3, this.world.stockpile.wood - 4);
    }
  }

  private log(message: string, notificationType?: ToastNotification["type"]) {
    this.hooks.onLog?.(message, notificationType);
  }

  private generateFaith(tickHours: number) {
    const devoteeCount = this.citizenSystem.getDevoteeCount(this.playerTribeId);
    if (devoteeCount <= 0) {
      this.faithPerHour = 0;
      return;
    }
    const templeCount = this.world.getStructureCount("temple");
    const basePerHour = 0.6; // base faith per devotee per in-game hour
    const templeBonus = 1 + Math.max(0, templeCount - 1) * 0.1;
    const gainPerHour = devoteeCount * basePerHour * templeBonus;
    this.faithPerHour = gainPerHour;
    const gainThisTick = gainPerHour * (tickHours / 1);
    this.faith += gainThisTick;
  }
}
