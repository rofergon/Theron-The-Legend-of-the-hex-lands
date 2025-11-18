import { clamp } from "./utils";
import type { ClimateState, PriorityMark, ResourceTrend, Role, ToastNotification, Vec2 } from "./types";
import { PlayerSpirit } from "./PlayerSpirit";
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
  moveIntent?: Vec2 | null;
  priority?: PriorityMark | null;
};

export class SimulationSession {
  private world!: WorldEngine;
  private player!: PlayerSpirit;
  private citizenSystem!: CitizenSystem;
  private climate: ClimateState = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
  private nextEventTimer = 8;
  private resourceHistory: ResourceTrend[] = [];
  private lastResourceSnapshot = { food: 0, stone: 0, population: 0 };
  private resourceTrackTimer = 0;
  private extinctionAnnounced = false;
  private initialized = false;

  constructor(private playerTribeId: number, private hooks: SimulationHooks = {}) {}

  initialize(config: SimulationConfig) {
    if (this.initialized) return;
    this.climate = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
    this.nextEventTimer = 8;
    this.resourceHistory = [];
    this.resourceTrackTimer = 0;
    this.extinctionAnnounced = false;
    this.world = new WorldEngine(config.worldSize, config.seed);
    this.player = new PlayerSpirit(config.worldSize);
    this.player.x = this.world.villageCenter.x;
    this.player.y = this.world.villageCenter.y;

    this.citizenSystem = new CitizenSystem(this.world, (event) => this.handleCitizenEvent(event));
    this.world.citizenLookup = (id) => this.citizenSystem.getCitizenById(id);

    const roles = this.buildInitialRoles(config.difficulty);
    this.citizenSystem.init(roles, this.playerTribeId);
    this.applyDifficultyAdjustments(config.difficulty);

    this.lastResourceSnapshot = {
      food: this.world.stockpile.food,
      stone: this.world.stockpile.stone,
      population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId),
    };

    this.initialized = true;

    this.log(`🌍 Mundo generado con semilla: ${config.seed}`, "info");
    this.log(`📏 Tamaño: ${config.worldSize}x${config.worldSize}`, "info");
    this.log(`⚔️ Dificultad: ${config.difficulty}`, "info");
  }

  runTick(tickHours: number, options: RunTickOptions = {}) {
    if (!this.initialized) return;

    const moveIntent = options.moveIntent ?? { x: 0, y: 0 };
    if (moveIntent.x !== 0 || moveIntent.y !== 0) {
      this.player.move(moveIntent.x, moveIntent.y, this.world);
    }

    if (options.priority) {
      this.applyPriority(options.priority);
    }

    this.updateEvents(tickHours);
    this.world.updateEnvironment(this.climate, tickHours);
    this.citizenSystem.update(tickHours);
    this.regeneratePlayerPower(tickHours);
    this.trackResourceTrends(tickHours);
    this.checkExtinction();
  }

  applyPriority(priority: PriorityMark) {
    if (!this.initialized) return;
    this.player.getCoveredCells().forEach(({ x, y }) => this.world.setPriorityAt(x, y, priority));
    const label =
      priority === "none" ? "Sin prioridad" : priority === "explore" ? "Explorar" : priority === "defend" ? "Defender" : priority === "farm" ? "Farmear" : "Minar";
    this.log(`Prioridad: ${label}`);
  }

  blessNearestCitizen() {
    if (!this.initialized) return;
    if (!this.player.spendPower(this.player.blessingCost)) {
      this.log("No hay poder suficiente para bendecir.");
      return;
    }

    const candidates = this.citizenSystem.tryBlessCitizens(this.player.getCoveredCells());
    if (candidates.length === 0) {
      this.log("No hay habitantes cercanos.");
      this.player.power = clamp(this.player.power + this.player.blessingCost, 0, 120);
      return;
    }

    const target = candidates[0];
    if (!target) return;
    target.morale = clamp(target.morale + 20, 0, 100);
    target.health = clamp(target.health + 10, 0, 100);
    target.fatigue = clamp(target.fatigue - 20, 0, 100);
    target.blessedUntil = target.age + 8;
    this.log(`Habitante ${target.id} bendecido.`);
  }

  dropTotem() {
    if (!this.initialized) return;
    const cell = this.world.getCell(this.player.x, this.player.y);
    if (!cell || cell.structure) {
      this.log("Aquí no cabe otro tótem.");
      return;
    }
    if (!this.player.spendPower(25)) {
      this.log("Hace falta más poder para invocar.");
      return;
    }
    this.world.buildStructure("temple", this.player.x, this.player.y);
    this.log("Se ha elevado un tótem espiritual.");
  }

  getWorld() {
    return this.world;
  }

  getPlayer() {
    return this.player;
  }

  getCitizenSystem() {
    return this.citizenSystem;
  }

  getClimate() {
    return this.climate;
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

  private regeneratePlayerPower(tickHours: number) {
    const alive = this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId);
    this.player.power = clamp(this.player.power + alive * 0.01 * tickHours, 0, 120);
  }

  private trackResourceTrends(tickHours: number) {
    this.resourceTrackTimer += tickHours;
    if (this.resourceTrackTimer >= 1) {
      const current = {
        food: this.world.stockpile.food,
        stone: this.world.stockpile.stone,
        population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId),
      };

      this.resourceHistory.push({
        food: current.food - this.lastResourceSnapshot.food,
        stone: current.stone - this.lastResourceSnapshot.stone,
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
    } else if (event.type === "powerGain") {
      this.player.power = clamp(this.player.power + event.amount, 0, 120);
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
    } else if (difficulty === "hard") {
      this.world.stockpile.food = Math.max(20, this.world.stockpile.food - 10);
      this.world.stockpile.stone = Math.max(5, this.world.stockpile.stone - 5);
    }
  }

  private log(message: string, notificationType?: ToastNotification["type"]) {
    this.hooks.onLog?.(message, notificationType);
  }
}
