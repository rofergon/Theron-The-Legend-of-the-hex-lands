import { clamp } from "./utils";
import type { Citizen, ClimateState, PriorityMark, ResourceTrend, Role, StructureType, ToastNotification, Vec2 } from "./types";
import { WorldEngine } from "./world/WorldEngine";
import { CitizenSystem, type CitizenSystemEvent } from "../systems/CitizenSystem";
import { CONVERSION_RATES } from "../../config/contracts";

export type ThreatAlert = {
  attackers: number;
  tribeName: string;
  spawn: Vec2[];
  icon: string;
  flavor: "raid" | "beast";
};

export type TravelerArrival = {
  count: number;
  positions: Vec2[];
  attitude: "neutral" | "friendly";
};

type SimulationConfig = {
  worldSize: number;
  seed: number;
  difficulty: "easy" | "normal" | "hard";
};

type SimulationHooks = {
  onLog?: (message: string, notificationType?: ToastNotification["type"]) => void;
  onExtinction?: () => void;
  onThreat?: (alert: ThreatAlert) => void;
  onThreatCleared?: () => void;
  onTravelers?: (arrival: TravelerArrival) => void;
  onDeath?: (event: { citizenId: number; name: string; role: Role; cause: string; position: Vec2 }) => void;
};

type RunTickOptions = {
  priority?: PriorityMark | null;
};

export type SimulationVisualEvent =
  | {
    type: "towerProjectile";
    from: Vec2;
    to: Vec2;
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
  private token1 = 0;
  private token2 = 0;
  private faithToToken1Rate = CONVERSION_RATES.FAITH_TO_HEX;
  private readonly towerAttackRange = 4;
  private readonly warriorBaseDamage = 15;
  private readonly towerDamage = Math.max(1, Math.round(this.warriorBaseDamage / 2));
  private readonly towerCooldown = 2; // Towers attack every 2 hours
  private towerCooldownTimer = 0;
  private visualEvents: SimulationVisualEvent[] = [];
  private threatActive = false;

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
    this.token1 = 0;
    this.token2 = 0;
    this.threatActive = false;
    this.world = new WorldEngine(config.worldSize, config.seed);
    this.visualEvents = [];

    this.citizenSystem = new CitizenSystem(this.world, (event) => this.handleCitizenEvent(event));
    this.world.citizenLookup = (id) => this.citizenSystem.getCitizenById(id);

    const roles = this.buildInitialRoles(config.difficulty);
    this.citizenSystem.init(roles, this.playerTribeId);
    this.applyDifficultyAdjustments(config.difficulty);
    this.world.updateVisibility(this.citizenSystem.getCitizens(), this.playerTribeId);

    this.lastResourceSnapshot = {
      food: this.world.stockpile.food,
      stone: this.world.stockpile.stone,
      wood: this.world.stockpile.wood,
      population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId),
    };

    this.initialized = true;

    this.log(`🌍 World generated with seed: ${config.seed}`, "info");
    this.log(`📏 Size: ${config.worldSize}x${config.worldSize}`, "info");
    this.log(`⚔️ Difficulty: ${config.difficulty}`, "info");
  }

  runTick(tickHours: number, options: RunTickOptions = {}) {
    if (!this.initialized) return;

    // Note: priority from options is no longer applied here as applyPriority 
    // now requires an explicit position. Use applyPriority() directly when needed.

    this.updateEvents(tickHours);
    this.world.updateEnvironment(this.climate, tickHours);
    this.citizenSystem.update(tickHours);
    this.resolveTowerAttacks(tickHours);
    this.world.updateVisibility(this.citizenSystem.getCitizens(), this.playerTribeId);
    this.generateFaith(tickHours);
    this.trackResourceTrends(tickHours);
    this.checkThreatResolution();
    this.checkExtinction();
  }


  applyPriority(priority: PriorityMark, position?: Vec2) {
    if (!this.initialized) return;
    if (!position) return;

    const cell = this.world.getCell(position.x, position.y);
    if (!cell) return;

    // Don't set priority on non-walkable terrain
    if (!this.world.isWalkable(position.x, position.y)) return;

    this.world.setPriorityAt(position.x, position.y, priority);
  }



  planConstruction(type: StructureType, anchor: Vec2) {
    if (!this.initialized) {
      return { ok: false as const, reason: "World is not ready." };
    }
    const available = this.getAvailableStructures();
    if (!available.includes(type)) {
      return { ok: false as const, reason: "Structure is locked." };
    }
    const result = this.world.planStructure(type, anchor);
    if (!result.ok) {
      this.log(`Could not plan ${type}: ${result.reason}`);
      return result;
    }
    this.log(`Blueprint placed for ${type} at (${anchor.x},${anchor.y}).`, "info");
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

  getTokens() {
    return { token1: this.token1, token2: this.token2 };
  }

  getFaithConversionRate() {
    return this.faithToToken1Rate;
  }

  consumeVisualEvents() {
    const events = [...this.visualEvents];
    this.visualEvents.length = 0;
    return events;
  }

  getResourceTrendAverage(type: keyof ResourceTrend) {
    if (this.resourceHistory.length === 0) return 0;
    const recent = this.resourceHistory.slice(-5);
    if (recent.length === 0) return 0; // Safety check for division by zero
    const sum = recent.reduce((acc, trend) => acc + trend[type], 0);
    return sum / recent.length;
  }

  clearPriorityAt(position: Vec2) {
    if (!this.initialized) return { ok: false as const, reason: "Simulation not running." };
    this.world.setPriorityAt(position.x, position.y, "none");
    this.log(`Designation cleared at (${position.x}, ${position.y}).`, "info");
    return { ok: true as const };
  }

  cancelConstruction(siteId: number, options?: { reclaimMaterials?: boolean }) {
    if (!this.initialized) {
      return { ok: false as const, reason: "Simulation not running." };
    }
    const site = this.world.getConstructionSite(siteId);
    if (!site) {
      return { ok: false as const, reason: "Construction site not found." };
    }
    const result = this.world.cancelConstruction(siteId, { refundMaterials: options?.reclaimMaterials ?? true, clearPriority: true });
    if (!result.ok) {
      return { ok: false as const, reason: "Unable to cancel construction." };
    }

    const stoneReturned = result.refunded.stone > 0 ? this.world.deposit("stone", result.refunded.stone) : 0;
    const woodReturned = result.refunded.wood > 0 ? this.world.deposit("wood", result.refunded.wood) : 0;

    const reclaimed = [];
    if (stoneReturned > 0) reclaimed.push(`${stoneReturned} stone`);
    if (woodReturned > 0) reclaimed.push(`${woodReturned} wood`);
    const reclaimedText = reclaimed.length > 0 ? ` Recovered: ${reclaimed.join(", ")}.` : "";
    this.log(`Construction of ${site.type} canceled. Villagers will recover the materials.${reclaimedText}`, "info");

    return { ok: true as const, stoneReturned, woodReturned, siteType: site.type };
  }

  private updateEvents(tickHours: number) {
    if (this.climate.drought) {
      this.climate.droughtTimer -= tickHours;
      if (this.climate.droughtTimer <= 0) {
        this.climate.drought = false;
        this.log("The drought ends.");
      }
    } else {
      this.nextEventTimer -= tickHours;
    }

    if (this.climate.rainy) {
      this.climate.rainyTimer -= tickHours;
      if (this.climate.rainyTimer <= 0) {
        this.climate.rainy = false;
        this.log("The rains fade.");
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
      this.log("A drought scorches the land.");
      return;
    }
    if (roll < 0.7) {
      this.climate.rainy = true;
      this.climate.rainyTimer = 10 + Math.random() * 8;
      this.log("Heavy clouds bring rain.");
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

  private checkThreatResolution() {
    if (!this.threatActive) return;
    const hasHostiles = this.citizenSystem.hasHostiles(this.playerTribeId);
    if (hasHostiles) return;
    this.threatActive = false;
    this.hooks.onThreatCleared?.();
  }

  private handleCitizenEvent(event: CitizenSystemEvent) {
    if (event.type === "log") {
      this.log(event.message, event.notificationType);
    } else if (event.type === "invasion") {
      this.threatActive = true;
      this.hooks.onThreat?.({
        attackers: event.attackers,
        tribeName: event.tribeName,
        spawn: event.spawn,
        icon: event.icon,
        flavor: event.flavor,
      });
    } else if (event.type === "travelers") {
      this.hooks.onTravelers?.({
        count: event.count,
        positions: event.positions,
        attitude: event.attitude,
      });
    } else if (event.type === "death") {
      this.hooks.onDeath?.({
        citizenId: event.citizenId,
        name: event.name,
        role: event.role,
        cause: event.cause,
        position: event.position,
      });
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

  private resolveTowerAttacks(tickHours: number) {
    // Tower cooldown: towers only attack once every towerCooldown hours
    this.towerCooldownTimer += tickHours;
    if (this.towerCooldownTimer < this.towerCooldown) return;
    this.towerCooldownTimer = 0;

    const towers = this.world.getStructures().filter((structure) => structure.type === "tower");
    if (towers.length === 0) return;

    const hostiles = this.citizenSystem.getCitizens().filter(
      (citizen) => citizen.state === "alive" && citizen.tribeId !== this.playerTribeId,
    );
    if (hostiles.length === 0) return;

    // Track which enemies have been targeted this tick to distribute attacks
    const targetedThisTick = new Set<number>();

    towers.forEach((tower) => {
      const target = this.pickTowerTarget(tower, hostiles, targetedThisTick);
      if (!target) return;

      targetedThisTick.add(target.id);
      this.citizenSystem.applyRangedDamage(target.id, this.towerDamage, "tower arrow");
      this.visualEvents.push({
        type: "towerProjectile",
        from: { x: tower.x, y: tower.y },
        to: { x: target.x, y: target.y },
      });
    });
  }

  private pickTowerTarget(tower: { x: number; y: number }, hostiles: Citizen[], alreadyTargeted: Set<number>) {
    let selected: Citizen | null = null;
    let bestDistance = Infinity;
    let selectedIsAlreadyTargeted = false;

    for (const hostile of hostiles) {
      if (hostile.state === "dead") continue;
      const distance = Math.abs(hostile.x - tower.x) + Math.abs(hostile.y - tower.y);
      if (distance > this.towerAttackRange) continue;

      const isTargeted = alreadyTargeted.has(hostile.id);

      // Prefer untargeted enemies, then closest, then lowest health
      const shouldSelect =
        !selected ||
        (selectedIsAlreadyTargeted && !isTargeted) ||
        (!selectedIsAlreadyTargeted === !isTargeted && distance < bestDistance) ||
        (!selectedIsAlreadyTargeted === !isTargeted && distance === bestDistance && hostile.health < selected.health);

      if (shouldSelect) {
        selected = hostile;
        bestDistance = distance;
        selectedIsAlreadyTargeted = isTargeted;
      }
    }

    return selected;
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

  convertFaithToToken1(requestedFaith?: number) {
    const available = Math.max(0, this.faith);
    const spend = Math.min(requestedFaith ?? available, available);
    if (spend <= 0) {
      return { faithSpent: 0, token1Gained: 0 };
    }

    // Alinear con el contrato: floor(spend / rate)
    const rate = this.faithToToken1Rate;
    const minted = Math.floor(spend / rate);
    if (minted <= 0) {
      return { faithSpent: 0, token1Gained: 0 };
    }

    const faithConsumed = minted * rate;
    this.faith -= faithConsumed;
    this.token1 += minted;
    return { faithSpent: faithConsumed, token1Gained: minted };
  }
}
