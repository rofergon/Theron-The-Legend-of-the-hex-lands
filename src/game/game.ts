type Vec2 = { x: number; y: number };

export type Terrain = "grass" | "desert" | "mountain" | "water";
export type ResourceType = "food" | "stone" | "waterSpring";
export type StructureType = "village" | "granary" | "house" | "tower" | "temple" | "campfire";
export type PriorityMark = "none" | "explore" | "defend" | "farm" | "mine";
export type Role = "worker" | "farmer" | "warrior" | "scout" | "child" | "elder";

export interface ResourceNode {
  type: ResourceType;
  amount: number;
  renewable: boolean;
  richness: number;
}

export interface WorldCell {
  x: number;
  y: number;
  terrain: Terrain;
  fertility: number;
  moisture: number;
  resource?: ResourceNode;
  structure?: StructureType;
  inhabitants: number[];
  priority: PriorityMark;
  cropProgress: number;
}

export interface Citizen {
  id: number;
  x: number;
  y: number;
  age: number;
  role: Role;
  hunger: number;
  morale: number;
  health: number;
  fatigue: number;
  tribeId: number;
  homeId?: number;
  target?: Vec2 | null;
  carrying: {
    food: number;
    stone: number;
  };
  blessedUntil?: number;
  state: "alive" | "dead";
  currentGoal?: string;
}

export interface WorldView {
  cells: Array<{ x: number; y: number; priority: PriorityMark; terrain: Terrain; resource?: ResourceNode; structure?: StructureType; cropReady: boolean }>;
  nearbyCitizens: Citizen[];
  threats: Citizen[];
  villageCenter?: Vec2;
}

export type CitizenAction =
  | { type: "move"; x: number; y: number }
  | { type: "gather"; resourceType: ResourceType }
  | { type: "attack"; targetId: number }
  | { type: "rest" }
  | { type: "idle" }
  | { type: "storeResources" }
  | { type: "mate"; partnerId: number }
  | { type: "tendCrops"; x: number; y: number };

export type CitizenAI = (citizen: Citizen, view: WorldView) => CitizenAction;

type ClimateState = {
  drought: boolean;
  droughtTimer: number;
  rainy: boolean;
  rainyTimer: number;
};

type ToastNotification = {
  id: number;
  message: string;
  type: "info" | "warning" | "critical" | "success";
  timestamp: number;
  duration: number;
};

type ResourceTrend = {
  food: number;
  stone: number;
  population: number;
};

const WORLD_SIZE = 64;
const HOURS_PER_SECOND = 0.25;
const TICK_HOURS = 0.25;

const PRIORITY_KEYMAP: Record<string, PriorityMark> = {
  Digit1: "explore",
  Digit2: "defend",
  Digit3: "farm",
  Digit4: "mine",
  Digit0: "none",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const mulberry32 = (seed: number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashNoise = (x: number, y: number, seed: number) => {
  const s = Math.sin((x * 374761 + y * 668265 + seed * 69069) * 0.0001);
  return s - Math.floor(s);
};

class InputHandler {
  private pressed = new Set<string>();
  private justPressed = new Set<string>();

  constructor(private target: Window = window) {
    this.target.addEventListener("keydown", this.onKeyDown);
    this.target.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    this.pressed.add(event.code);
    this.justPressed.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
    this.justPressed.delete(event.code);
  };

  getDirection(): Vec2 {
    const x = Number(this.isPressed("ArrowRight") || this.isPressed("KeyD")) - Number(this.isPressed("ArrowLeft") || this.isPressed("KeyA"));
    const y = Number(this.isPressed("ArrowDown") || this.isPressed("KeyS")) - Number(this.isPressed("ArrowUp") || this.isPressed("KeyW"));
    return { x, y };
  }

  consumeKey(code: string) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  consumeAny(keys: string[]) {
    return keys.some((key) => this.consumeKey(key));
  }

  isPressed(code: string) {
    return this.pressed.has(code);
  }

  flushFrame() {
    this.justPressed.clear();
  }
}

class PlayerSpirit {
  x: number;
  y: number;
  readonly size = 3;
  power = 45;
  influenceRadius = 6;
  blessingCost = 8;

  constructor(private worldSize: number) {
    this.x = Math.floor(worldSize / 2);
    this.y = Math.floor(worldSize / 2);
  }

  move(dx: number, dy: number, world: World) {
    if (dx === 0 && dy === 0) return;
    const nextX = clamp(this.x + dx, 1, this.worldSize - 2);
    const nextY = clamp(this.y + dy, 1, this.worldSize - 2);
    if (!world.isWalkable(nextX, nextY)) {
      return;
    }
    this.x = nextX;
    this.y = nextY;
  }

  getCoveredCells() {
    const cells: Vec2[] = [];
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        cells.push({ x: this.x + ox, y: this.y + oy });
      }
    }
    return cells;
  }

  spendPower(amount: number) {
    if (this.power < amount) return false;
    this.power -= amount;
    return true;
  }
}

class World {
  readonly size: number;
  readonly cells: WorldCell[][];
  readonly stockpile = {
    food: 40,
    stone: 10,
    water: 20,
    foodCapacity: 80,
    stoneCapacity: 40,
  };

  readonly villageCenter: Vec2;
  private structures: Array<{ type: StructureType; x: number; y: number }> = [];
  private rng: () => number;

  constructor(size = WORLD_SIZE, seed = Date.now()) {
    this.size = size;
    this.rng = mulberry32(seed);
    this.cells = this.generateTerrain(seed);
    this.villageCenter = this.placeVillageCenter();
    this.buildStructure("village", this.villageCenter.x, this.villageCenter.y);
    this.placeInitialStructures();
  }

  private generateTerrain(seed: number) {
    const rows: WorldCell[][] = [];
    for (let y = 0; y < this.size; y += 1) {
      const row: WorldCell[] = [];
      for (let x = 0; x < this.size; x += 1) {
        const height = this.fractalNoise(x, y, seed);
        const moisture = this.fractalNoise(x + 1000, y + 1000, seed);
        const terrain: Terrain = this.pickTerrain(height, moisture);
        const fertility = terrain === "grass" ? clamp(moisture + 0.2, 0, 1) : terrain === "desert" ? 0.2 : 0.05;
        const resource = this.generateResource(terrain, x, y);

        const cell: WorldCell = {
          x,
          y,
          terrain,
          fertility,
          moisture,
          inhabitants: [],
          priority: "none",
          cropProgress: 0,
        };

        if (resource) {
          cell.resource = resource;
        }

        row.push(cell);
      }
      rows.push(row);
    }
    return rows;
  }

  private fractalNoise(x: number, y: number, seed: number) {
    let total = 0;
    let amplitude = 1;
    let frequency = 0.05;
    for (let i = 0; i < 3; i += 1) {
      total += hashNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return clamp(total, 0, 1);
  }

  private pickTerrain(height: number, moisture: number): Terrain {
    if (height < 0.35) return "water";
    if (height > 0.8) return "mountain";
    if (moisture < 0.3) return "desert";
    return "grass";
  }

  private generateResource(terrain: Terrain, x: number, y: number): ResourceNode | undefined {
    const roll = this.rng();
    if (terrain === "grass" && roll > 0.7) {
      return { type: "food", amount: 2 + Math.floor(roll * 4), renewable: true, richness: 1 };
    }
    if (terrain === "mountain" && roll > 0.55) {
      return { type: "stone", amount: 4 + Math.floor(roll * 6), renewable: false, richness: 1 };
    }
    if (terrain === "water" && roll > 0.65) {
      return { type: "waterSpring", amount: 5, renewable: true, richness: 1 };
    }
    if (terrain === "desert" && roll > 0.85) {
      return { type: "stone", amount: 2, renewable: false, richness: 0.4 };
    }
    return undefined;
  }

  private placeVillageCenter(): Vec2 {
    let best = { x: Math.floor(this.size / 2), y: Math.floor(this.size / 2), score: -Infinity };
    for (let y = 8; y < this.size - 8; y += 1) {
      for (let x = 8; x < this.size - 8; x += 1) {
        const cell = this.cells[y]?.[x];
        if (!cell || cell.terrain !== "grass") continue;
        const score = cell.fertility + cell.moisture - Math.abs(x - this.size / 2) * 0.01 - Math.abs(y - this.size / 2) * 0.01;
        if (score > best.score) {
          best = { x, y, score };
        }
      }
    }
    return { x: best.x, y: best.y };
  }

  private placeInitialStructures() {
    const offsets = [
      { type: "granary" as StructureType, dx: 1, dy: 0 },
      { type: "house" as StructureType, dx: -2, dy: 1 },
      { type: "house" as StructureType, dx: 2, dy: 1 },
      { type: "temple" as StructureType, dx: 0, dy: -2 },
      { type: "tower" as StructureType, dx: -3, dy: -1 },
      { type: "campfire" as StructureType, dx: 3, dy: -1 },
    ];
    offsets.forEach(({ type, dx, dy }) => {
      const x = clamp(this.villageCenter.x + dx, 0, this.size - 1);
      const y = clamp(this.villageCenter.y + dy, 0, this.size - 1);
      if (this.isWalkable(x, y)) {
        this.buildStructure(type, x, y);
      }
    });
  }

  isWalkable(x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return false;
    if (cell.terrain === "water") return false;
    if (cell.terrain === "mountain") return false;
    return true;
  }

  getCell(x: number, y: number) {
    return this.cells[y]?.[x];
  }

  addCitizen(citizenId: number, x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return;
    cell.inhabitants.push(citizenId);
  }

  moveCitizen(citizenId: number, from: Vec2, to: Vec2) {
    const fromCell = this.getCell(from.x, from.y);
    const toCell = this.getCell(to.x, to.y);
    if (!toCell || !this.isWalkable(to.x, to.y)) {
      return false;
    }
    if (fromCell) {
      fromCell.inhabitants = fromCell.inhabitants.filter((id) => id !== citizenId);
    }
    toCell.inhabitants.push(citizenId);
    return true;
  }

  removeCitizen(citizenId: number, position: Vec2) {
    const cell = this.getCell(position.x, position.y);
    if (cell) {
      cell.inhabitants = cell.inhabitants.filter((id) => id !== citizenId);
    }
  }

  setPriorityAt(x: number, y: number, priority: PriorityMark) {
    const cell = this.getCell(x, y);
    if (cell) {
      cell.priority = priority;
    }
  }

  getCitizenIdsNear(cells: Vec2[]) {
    const ids = new Set<number>();
    cells.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.inhabitants.forEach((id) => ids.add(id));
      }
    });
    return Array.from(ids);
  }

  getView(origin: Citizen, radius: number): WorldView {
    const cells: WorldView["cells"] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const cell = this.getCell(x, y);
        if (!cell) continue;
        const viewCell: (typeof cells)[number] = {
          x,
          y,
          priority: cell.priority,
          terrain: cell.terrain,
          cropReady: cell.cropProgress >= 1,
        };
        if (cell.resource) {
          viewCell.resource = cell.resource;
        }
        if (cell.structure) {
          viewCell.structure = cell.structure;
        }
        cells.push(viewCell);
      }
    }

    const nearbyIds = this.getCitizenIdsNear([{ x: origin.x, y: origin.y }]);
    const nearbyCitizens = nearbyIds
      .map((id) => this.citizenLookup?.(id))
      .filter((cit): cit is Citizen => {
        if (!cit) return false;
        return true;
      });

    const threats = nearbyCitizens.filter((citizen) => citizen.tribeId !== origin.tribeId && citizen.role === "warrior");

    return {
      cells,
      nearbyCitizens,
      threats,
      villageCenter: this.villageCenter,
    };
  }

  citizenLookup?: (id: number) => Citizen | undefined;

  updateEnvironment(climate: ClimateState, tickHours: number) {
    this.cells.forEach((row) => {
      row.forEach((cell) => {
        if (cell.terrain === "grass") {
          cell.moisture = clamp(cell.moisture + (climate.rainy ? 0.02 : climate.drought ? -0.03 : -0.005), 0, 1);
          if (!cell.resource && Math.random() < cell.fertility * 0.001) {
            cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
          }
        }

        if (cell.resource?.type === "food" && cell.resource.renewable) {
          const growth = (cell.fertility + (climate.rainy ? 0.5 : 0) - (climate.drought ? 0.8 : 0)) * 0.02;
          cell.resource.amount = clamp(cell.resource.amount + growth * tickHours, 0, 6);
        }

        if (cell.cropProgress > 0) {
          cell.cropProgress = clamp(cell.cropProgress + cell.fertility * 0.05 * tickHours, 0, 1.5);
        }
      });
    });

    if (this.hasStructure("granary")) {
      this.stockpile.foodCapacity = 150;
    }
  }

  hasStructure(type: StructureType) {
    return this.structures.some((structure) => structure.type === type);
  }

  buildStructure(type: StructureType, x: number, y: number) {
    const cell = this.getCell(x, y);
    if (!cell) return false;
    cell.structure = type;
    this.structures.push({ type, x, y });
    return true;
  }

  deposit(type: "food" | "stone", amount: number) {
    const capacityKey = type === "food" ? "foodCapacity" : "stoneCapacity";
    const current = this.stockpile[type];
    const capacity = this.stockpile[capacityKey];
    const accepted = Math.min(amount, Math.max(capacity - current, 0));
    this.stockpile[type] += accepted;
    return accepted;
  }

  consume(type: "food" | "stone", amount: number) {
    const available = this.stockpile[type];
    const used = Math.min(amount, available);
    this.stockpile[type] -= used;
    return used;
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
  const farmCell = view.cells.find((cell) => cell.priority === "farm" && cell.terrain === "grass");
  if (farmCell) {
    if (citizen.x === farmCell.x && citizen.y === farmCell.y) {
      return { type: "tendCrops", x: farmCell.x, y: farmCell.y };
    }
    return { type: "move", x: farmCell.x, y: farmCell.y };
  }

  const readyCrop = view.cells.find((cell) => cell.cropReady);
  if (readyCrop) {
    return { type: "gather", resourceType: "food" };
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

export class Game {
  private ctx: CanvasRenderingContext2D;
  private running = false;
  private lastTime = 0;
  private accumulatedHours = 0;

  private readonly input = new InputHandler();
  private readonly world = new World();
  private readonly player = new PlayerSpirit(WORLD_SIZE);

  private citizens: Citizen[] = [];
  private citizenById = new Map<number, Citizen>();
  private nextCitizenId = 1;

  private currentDirection: Vec2 = { x: 0, y: 0 };
  private pendingPriority: PriorityMark | null = null;

  private climate: ClimateState = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
  private nextEventTimer = 8;

  private notifications: ToastNotification[] = [];
  private nextNotificationId = 1;
  private selectedCitizen: Citizen | null = null;
  private hoveredCell: Vec2 | null = null;
  
  private resourceHistory: ResourceTrend[] = [];
  private lastResourceSnapshot = { food: 40, stone: 10, population: 10 };
  private resourceTrackTimer = 0;

  private hudScore = document.querySelector<HTMLSpanElement>("#score");
  private hudPopulation = document.querySelector<HTMLSpanElement>("#energy");
  private hudClimate = document.querySelector<HTMLSpanElement>("#time");
  private hudFood = document.querySelector<HTMLSpanElement>("#food");
  private hudStone = document.querySelector<HTMLSpanElement>("#stone");
  private hudWater = document.querySelector<HTMLSpanElement>("#water");
  private overlay = document.querySelector<HTMLDivElement>("#overlay");
  private historyList = document.querySelector<HTMLUListElement>("#history");

  private zoom = 1;
  private readonly minZoom = 0.75;
  private readonly maxZoom = 2.5;
  private readonly defaultCenter: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private viewTarget: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private isPanning = false;
  private lastPanPosition: { x: number; y: number } | null = null;

  private historyEntries: string[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo obtener el contexto 2D.");
    }
    this.ctx = ctx;
    this.world.citizenLookup = (id) => this.citizenById.get(id);
    this.viewTarget = { x: this.player.x + 0.5, y: this.player.y + 0.5 };
    this.spawnInitialCitizens();
    this.registerOverlayInstructions();
    this.setupHeaderButtons();
    this.setupZoomControls();
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasHover);
    this.canvas.addEventListener("wheel", this.handleCanvasWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("blur", this.stopPanning);
    this.handleResize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.overlay?.setAttribute("hidden", "true");
    requestAnimationFrame(this.loop);
  }

  private spawnInitialCitizens() {
    const roles: Role[] = ["farmer", "farmer", "worker", "worker", "warrior", "warrior", "scout", "child", "child", "elder"];
    roles.forEach((role) => {
      const position = this.findSpawnNearVillage();
      const citizen = this.createCitizen(role, position.x, position.y, 1);
      this.addCitizen(citizen);
    });
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

  private createCitizen(role: Role, x: number, y: number, tribeId: number): Citizen {
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

  private addCitizen(citizen: Citizen) {
    this.citizens.push(citizen);
    this.citizenById.set(citizen.id, citizen);
    this.world.addCitizen(citizen.id, citizen.x, citizen.y);
  }

  private showNotification(message: string, type: ToastNotification["type"] = "info", duration = 4000) {
    const notification: ToastNotification = {
      id: this.nextNotificationId++,
      message,
      type,
      timestamp: Date.now(),
      duration,
    };
    this.notifications.push(notification);
    if (this.notifications.length > 5) {
      this.notifications.shift();
    }
  }

  private loop = (time: number) => {
    if (!this.running) return;
    const deltaSeconds = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.handleRealtimeInput();

    this.accumulatedHours += deltaSeconds * HOURS_PER_SECOND;
    while (this.accumulatedHours >= TICK_HOURS) {
      this.runTick(TICK_HOURS);
      this.accumulatedHours -= TICK_HOURS;
    }

    this.draw();
    requestAnimationFrame(this.loop);
  };

  private handleRealtimeInput() {
    this.currentDirection = this.input.getDirection();
    Object.entries(PRIORITY_KEYMAP).forEach(([key, priority]) => {
      if (this.input.consumeKey(key)) {
        this.pendingPriority = priority;
      }
    });

    if (this.input.consumeAny(["KeyE", "Space"])) {
      this.blessNearestCitizen();
    }

    if (this.input.consumeKey("KeyT")) {
      this.dropTotem();
    }
  }

  private runTick(tickHours: number) {
    this.player.move(this.currentDirection.x, this.currentDirection.y, this.world);
    if (this.pendingPriority) {
      this.applyPriority(this.pendingPriority);
      this.pendingPriority = null;
    }

    this.updateEvents(tickHours);
    this.world.updateEnvironment(this.climate, tickHours);
    this.updateCitizens(tickHours);
    this.resolveConflicts();
    this.regeneratePlayerPower(tickHours);
    this.trackResourceTrends(tickHours);
    this.updateNotifications();
    this.updateHUD();
  }

  private applyPriority(priority: PriorityMark) {
    this.player.getCoveredCells().forEach(({ x, y }) => this.world.setPriorityAt(x, y, priority));
    const label =
      priority === "none" ? "Sin prioridad" : priority === "explore" ? "Explorar" : priority === "defend" ? "Defender" : priority === "farm" ? "Farmear" : "Minar";
    this.logEvent(`Prioridad: ${label}`);
  }

  private blessNearestCitizen() {
    if (!this.player.spendPower(this.player.blessingCost)) {
      this.logEvent("No hay poder suficiente para bendecir.");
      return;
    }
    const candidates = this.world
      .getCitizenIdsNear(this.player.getCoveredCells())
      .map((id) => this.citizenById.get(id))
      .filter((cit): cit is Citizen => {
        if (!cit) return false;
        return cit.state === "alive";
      });
    if (candidates.length === 0) {
      this.logEvent("No hay habitantes cercanos.");
      this.player.power += this.player.blessingCost;
      return;
    }
    const target = candidates[0];
    if (!target) return;
    target.morale = clamp(target.morale + 20, 0, 100);
    target.health = clamp(target.health + 10, 0, 100);
    target.fatigue = clamp(target.fatigue - 20, 0, 100);
    target.blessedUntil = target.age + 8;
    this.logEvent(`Habitante ${target.id} bendecido.`);
  }

  private dropTotem() {
    const cell = this.world.getCell(this.player.x, this.player.y);
    if (!cell || cell.structure) {
      this.logEvent("Aquí no cabe otro tótem.");
      return;
    }
    if (!this.player.spendPower(25)) {
      this.logEvent("Hace falta más poder para invocar.");
      return;
    }
    this.world.buildStructure("temple", this.player.x, this.player.y);
    this.logEvent("Se ha elevado un tótem espiritual.");
  }

  private updateEvents(tickHours: number) {
    if (this.climate.drought) {
      this.climate.droughtTimer -= tickHours;
      if (this.climate.droughtTimer <= 0) {
        this.climate.drought = false;
        this.logEvent("La sequía termina.");
      }
    } else {
      this.nextEventTimer -= tickHours;
    }

    if (this.climate.rainy) {
      this.climate.rainyTimer -= tickHours;
      if (this.climate.rainyTimer <= 0) {
        this.climate.rainy = false;
        this.logEvent("Las lluvias menguan.");
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
      this.logEvent("Una sequía azota la comarca.");
      return;
    }
    if (roll < 0.7) {
      this.climate.rainy = true;
      this.climate.rainyTimer = 10 + Math.random() * 8;
      this.logEvent("Nubes cargadas bendicen con lluvia.");
      return;
    }
    if (roll < 0.85) {
      this.spawnMigrants("neutral");
      return;
    }
    this.spawnBeasts();
  }

  private spawnMigrants(attitude: "neutral" | "friendly" | "hostile") {
    const entryY = Math.floor(Math.random() * this.world.size);
    for (let i = 0; i < 3; i += 1) {
      const role: Role = attitude === "hostile" ? "warrior" : "worker";
      const citizen = this.createCitizen(role, 0, clamp(entryY + i, 0, this.world.size - 1), attitude === "hostile" ? 99 : 2);
      citizen.morale = 50;
      citizen.health = 70;
      citizen.currentGoal = attitude === "hostile" ? "raid" : "settle";
      this.addCitizen(citizen);
    }
    this.logEvent(attitude === "hostile" ? "Una tribu hostil llega desde el horizonte." : "Viajeros se acercan buscando refugio.");
  }

  private spawnBeasts() {
    const entryX = Math.floor(Math.random() * this.world.size);
    for (let i = 0; i < 2; i += 1) {
      const beast = this.createCitizen("warrior", clamp(entryX + i, 0, this.world.size - 1), this.world.size - 1, 120);
      beast.health = 60;
      beast.morale = 100;
      beast.currentGoal = "beast";
      this.addCitizen(beast);
    }
    this.logEvent("Bestias salvajes merodean la frontera.");
  }

  private updateCitizens(tickHours: number) {
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
        this.logEvent(`Habitante ${citizen.id} ha muerto.`);
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
      this.logEvent(`El habitante ${citizen.id} ha crecido y trabajará.`);
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
    if (!cell) return;
    const nearStorage = cell.structure === "village" || cell.structure === "granary";
    if (!nearStorage) return;
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
        this.player.power += 2;
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
    this.logEvent("Ha nacido un nuevo niño en la tribu.");
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

  private regeneratePlayerPower(tickHours: number) {
    const alive = this.citizens.filter((citizen) => citizen.state === "alive" && citizen.tribeId === 1).length;
    this.player.power = clamp(this.player.power + alive * 0.01 * tickHours, 0, 120);
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

  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const { cellSize, offsetX, offsetY } = this.getViewMetrics();

    this.world.cells.forEach((row) =>
      row.forEach((cell) => {
        ctx.fillStyle = this.getTerrainColor(cell);
        ctx.fillRect(offsetX + cell.x * cellSize, offsetY + cell.y * cellSize, cellSize, cellSize);

        if (cell.priority !== "none") {
          ctx.fillStyle = this.getPriorityColor(cell.priority);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(offsetX + cell.x * cellSize, offsetY + cell.y * cellSize, cellSize, cellSize);
          ctx.globalAlpha = 1;
        }

        if (cell.structure) {
          this.drawStructure(ctx, cell.structure, cell.x, cell.y, cellSize, offsetX, offsetY);
        }

        if (cell.resource) {
          this.drawResource(ctx, cell.resource.type, cell.x, cell.y, cellSize, offsetX, offsetY);
        }
      }),
    );

    this.citizens.forEach((citizen) => {
      if (citizen.state === "dead") return;
      this.drawCitizen(ctx, citizen, cellSize, offsetX, offsetY);
      
      if (citizen === this.selectedCitizen) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX + citizen.x * cellSize, offsetY + citizen.y * cellSize, cellSize, cellSize);
      }
    });

    ctx.strokeStyle = "#f9dd82";
    ctx.lineWidth = 2;
    this.player.getCoveredCells().forEach(({ x, y }) => {
      ctx.strokeRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
    });

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      offsetX + (this.player.x - this.player.influenceRadius) * cellSize,
      offsetY + (this.player.y - this.player.influenceRadius) * cellSize,
      this.player.influenceRadius * 2 * cellSize,
      this.player.influenceRadius * 2 * cellSize,
    );
    
    this.drawNotifications(ctx);
    this.drawContextPanel(ctx);
    this.drawLegend(ctx);
  }

  private getTerrainColor(cell: WorldCell) {
    switch (cell.terrain) {
      case "grass":
        return "#1b3f2f";
      case "desert":
        return "#856a42";
      case "mountain":
        return "#4b4f5d";
      case "water":
        return "#0a2540";
      default:
        return "#000";
    }
  }

  private getPriorityColor(priority: PriorityMark) {
    switch (priority) {
      case "explore":
        return "#53bfff";
      case "defend":
        return "#ff5267";
      case "farm":
        return "#76ff8b";
      case "mine":
        return "#b19cff";
      default:
        return "transparent";
    }
  }

  private updateHUD() {
    if (this.hudScore) {
      this.hudScore.textContent = `${this.player.power.toFixed(1)} Fe`;
    }
    if (this.hudPopulation) {
      const alive = this.citizens.filter((citizen) => citizen.state === "alive" && citizen.tribeId === 1).length;
      const trend = this.getResourceTrendAverage("population");
      const arrow = trend > 0.1 ? "⬆️" : trend < -0.1 ? "⬇️" : "➡️";
      this.hudPopulation.textContent = `${alive} habitantes ${arrow}`;
    }
    if (this.hudClimate) {
      let label = "Clima templado";
      if (this.climate.drought) label = "🌵 Sequía";
      if (this.climate.rainy) label = "🌧️ Lluvia";
      this.hudClimate.textContent = label;
    }
    if (this.hudFood) {
      const trend = this.getResourceTrendAverage("food");
      const arrow = trend > 0.5 ? "⬆️" : trend < -0.5 ? "⬇️" : "➡️";
      this.hudFood.textContent = `${Math.floor(this.world.stockpile.food)}/${this.world.stockpile.foodCapacity} ${arrow}`;
    }
    if (this.hudStone) {
      const trend = this.getResourceTrendAverage("stone");
      const arrow = trend > 0.2 ? "⬆️" : trend < -0.2 ? "⬇️" : "➡️";
      this.hudStone.textContent = `${Math.floor(this.world.stockpile.stone)}/${this.world.stockpile.stoneCapacity} ${arrow}`;
    }
    if (this.hudWater) {
      this.hudWater.textContent = Math.floor(this.world.stockpile.water).toString();
    }
  }

  private getResourceTrendAverage(type: keyof ResourceTrend): number {
    if (this.resourceHistory.length === 0) return 0;
    const recent = this.resourceHistory.slice(-5);
    const sum = recent.reduce((acc, trend) => acc + trend[type], 0);
    return sum / recent.length;
  }

  private logEvent(message: string, notificationType?: ToastNotification["type"]) {
    this.historyEntries.unshift(message);
    this.historyEntries = this.historyEntries.slice(0, 12);
    if (this.historyList) {
      this.historyList.innerHTML = this.historyEntries.map((entry) => `<li>${entry}</li>`).join("");
    }
    
    if (notificationType) {
      this.showNotification(message, notificationType);
    } else if (message.includes("muerto") || message.includes("Bestias") || message.includes("hostil")) {
      this.showNotification(message, "critical");
    } else if (message.includes("hambruna") || message.includes("sequía") || message.includes("Sin")) {
      this.showNotification(message, "warning");
    } else if (message.includes("nacido") || message.includes("bendecido") || message.includes("lluvia")) {
      this.showNotification(message, "success");
    }
  }

  private registerOverlayInstructions() {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div>
        <h1>Espíritu Guardián</h1>
        <p>WASD o flechas: moverte (3×3 celdas).</p>
        <p>1 Explorar · 2 Defender · 3 Farmear · 4 Minar · 0 limpiar prioridad.</p>
        <p>Rueda sobre el mapa o usa los botones +/- para acercar o alejar.</p>
        <p>Mantén el click medio y arrastra para desplazar la cámara.</p>
        <p>E / Espacio: bendecir habitante cercano. T: invocar tótem.</p>
        <p>Observa el HUD para Fe, población y clima. Mantén viva la tribu.</p>
        <p>Presiona Enter para comenzar.</p>
      </div>
    `;
    const startHandler = (event: KeyboardEvent) => {
      if (event.code === "Enter") {
        this.overlay?.setAttribute("hidden", "true");
        window.removeEventListener("keydown", startHandler);
        this.start();
      }
    };
    window.addEventListener("keydown", startHandler);
  }

  private handleCanvasClick = (event: MouseEvent) => {
    const cell = this.getCellUnderPointer(event);
    if (!cell) {
      this.selectedCitizen = null;
      return;
    }

    const clickedCitizen = this.citizens.find((c) => c.state === "alive" && c.x === cell.x && c.y === cell.y);
    this.selectedCitizen = clickedCitizen || null;

    const worldPoint = this.getWorldPosition(event);
    if (worldPoint) {
      this.focusOn(worldPoint);
    }
  };

  private handleCanvasHover = (event: MouseEvent) => {
    this.hoveredCell = this.getCellUnderPointer(event);
  };

  private handleCanvasWheel = (event: WheelEvent) => {
    event.preventDefault();
    const anchor = this.getWorldPosition(event);
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    this.adjustZoom(delta, anchor ?? undefined);
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      this.isPanning = true;
      this.lastPanPosition = { x: event.clientX, y: event.clientY };
    }
  };

  private handleMouseUp = (event: MouseEvent) => {
    if (event.button === 1) {
      this.stopPanning();
    }
  };

  private handlePanMove = (event: MouseEvent) => {
    if (!this.isPanning || !this.lastPanPosition) return;
    if (this.zoom <= 1) {
      this.lastPanPosition = { x: event.clientX, y: event.clientY };
      return;
    }
    event.preventDefault();
    const dx = event.clientX - this.lastPanPosition.x;
    const dy = event.clientY - this.lastPanPosition.y;
    if (dx === 0 && dy === 0) return;
    const { cellSize } = this.getViewMetrics();
    if (cellSize <= 0) return;
    const nextTarget = {
      x: this.viewTarget.x - dx / cellSize,
      y: this.viewTarget.y - dy / cellSize,
    };
    this.focusOn(nextTarget);
    this.lastPanPosition = { x: event.clientX, y: event.clientY };
  };

  private stopPanning = () => {
    this.isPanning = false;
    this.lastPanPosition = null;
  };

  private getWorldPosition(event: MouseEvent | WheelEvent): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { cellSize, offsetX, offsetY } = this.getViewMetrics();
    const worldX = (x - offsetX) / cellSize;
    const worldY = (y - offsetY) / cellSize;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
      return null;
    }
    return { x: worldX, y: worldY };
  }

  private getCellUnderPointer(event: MouseEvent | WheelEvent): Vec2 | null {
    const worldPoint = this.getWorldPosition(event);
    if (!worldPoint) return null;
    const cellX = Math.floor(worldPoint.x);
    const cellY = Math.floor(worldPoint.y);
    if (cellX < 0 || cellY < 0 || cellX >= this.world.size || cellY >= this.world.size) {
      return null;
    }
    return { x: cellX, y: cellY };
  }

  private adjustZoom(delta: number, anchor?: Vec2 | null) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const nextZoom = clamp(this.zoom + delta, this.minZoom, this.maxZoom);
    this.setZoom(nextZoom, anchor ?? undefined);
  }

  private setZoom(value: number, anchor?: Vec2) {
    const previous = this.zoom;
    this.zoom = clamp(value, this.minZoom, this.maxZoom);
    if (anchor) {
      this.focusOn(anchor);
    } else if (previous <= 1 && this.zoom > 1) {
      this.focusOn({ x: this.player.x + 0.5, y: this.player.y + 0.5 });
    }
  }

  private focusOn(point: Vec2) {
    this.viewTarget = {
      x: clamp(point.x, 0.5, this.world.size - 0.5),
      y: clamp(point.y, 0.5, this.world.size - 0.5),
    };
  }

  private getViewMetrics() {
    const baseCell = Math.min(this.canvas.width, this.canvas.height) / this.world.size;
    const cellSize = baseCell * this.zoom;
    const center = this.resolveCenter(cellSize);
    const offsetX = this.canvas.width / 2 - center.x * cellSize;
    const offsetY = this.canvas.height / 2 - center.y * cellSize;
    return { cellSize, offsetX, offsetY, center };
  }

  private resolveCenter(cellSize: number): Vec2 {
    if (this.zoom <= 1) {
      return this.defaultCenter;
    }

    const halfVisibleX = this.canvas.width / (cellSize * 2);
    const halfVisibleY = this.canvas.height / (cellSize * 2);
    const maxHalf = this.world.size / 2;

    const centerX = halfVisibleX >= maxHalf ? this.defaultCenter.x : clamp(this.viewTarget.x, halfVisibleX, this.world.size - halfVisibleX);
    const centerY = halfVisibleY >= maxHalf ? this.defaultCenter.y : clamp(this.viewTarget.y, halfVisibleY, this.world.size - halfVisibleY);

    return { x: centerX, y: centerY };
  }

  private trackResourceTrends(tickHours: number) {
    this.resourceTrackTimer += tickHours;
    if (this.resourceTrackTimer >= 1) {
      const current = {
        food: this.world.stockpile.food,
        stone: this.world.stockpile.stone,
        population: this.citizens.filter((c) => c.state === "alive" && c.tribeId === 1).length,
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

  private updateNotifications() {
    const now = Date.now();
    this.notifications = this.notifications.filter(
      (notif) => now - notif.timestamp < notif.duration
    );
  }

  private drawCitizen(ctx: CanvasRenderingContext2D, citizen: Citizen, cellSize: number, offsetX: number, offsetY: number) {
    const x = offsetX + citizen.x * cellSize;
    const y = offsetY + citizen.y * cellSize;
    
    const roleEmoji: Record<Role, string> = {
      worker: "🔨",
      farmer: "👨‍🌾",
      warrior: "⚔️",
      scout: "🔍",
      child: "👶",
      elder: "👴",
    };
    
    const color = citizen.tribeId === 1 ? "#ffe7c7" : citizen.tribeId === 99 ? "#ff7b7b" : "#7db2ff";
    ctx.fillStyle = color;
    ctx.fillRect(x + cellSize * 0.2, y + cellSize * 0.2, cellSize * 0.6, cellSize * 0.6);
    
    if (citizen.blessedUntil && citizen.age < citizen.blessedUntil) {
      ctx.strokeStyle = "#ffea00";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + cellSize * 0.15, y + cellSize * 0.15, cellSize * 0.7, cellSize * 0.7);
    }
    
    ctx.font = `${cellSize * 0.5}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(roleEmoji[citizen.role], x + cellSize * 0.5, y + cellSize * 0.5);
    
    if (citizen.health < 30) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(x, y, cellSize * (citizen.health / 100), cellSize * 0.1);
    }
  }

  private drawResource(ctx: CanvasRenderingContext2D, type: ResourceType, x: number, y: number, cellSize: number, offsetX: number, offsetY: number) {
    const emoji = type === "food" ? "🌾" : type === "stone" ? "🪨" : "💧";
    ctx.font = `${cellSize * 0.6}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, offsetX + x * cellSize + cellSize * 0.5, offsetY + y * cellSize + cellSize * 0.5);
  }

  private drawStructure(ctx: CanvasRenderingContext2D, type: StructureType, x: number, y: number, cellSize: number, offsetX: number, offsetY: number) {
    const emoji: Record<StructureType, string> = {
      village: "🏛️",
      granary: "🏪",
      house: "🏠",
      tower: "🗼",
      temple: "⛪",
      campfire: "🔥",
    };
    ctx.font = `${cellSize * 0.7}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji[type], offsetX + x * cellSize + cellSize * 0.5, offsetY + y * cellSize + cellSize * 0.5);
  }

  private drawNotifications(ctx: CanvasRenderingContext2D) {
    const padding = 16;
    const notifHeight = 50;
    const notifWidth = 320;
    const startY = padding;
    
    this.notifications.forEach((notif, index) => {
      const y = startY + index * (notifHeight + 8);
      const now = Date.now();
      const elapsed = now - notif.timestamp;
      const alpha = Math.min(1, (notif.duration - elapsed) / 500);
      
      ctx.globalAlpha = alpha;
      
      const bgColor = 
        notif.type === "critical" ? "rgba(220, 38, 38, 0.95)" :
        notif.type === "warning" ? "rgba(234, 179, 8, 0.95)" :
        notif.type === "success" ? "rgba(34, 197, 94, 0.95)" :
        "rgba(59, 130, 246, 0.95)";
      
      ctx.fillStyle = bgColor;
      ctx.fillRect(padding, y, notifWidth, notifHeight);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(padding, y, notifWidth, notifHeight);
      
      const icon = 
        notif.type === "critical" ? "⚠️" :
        notif.type === "warning" ? "⚡" :
        notif.type === "success" ? "✅" : "ℹ️";
      
      ctx.font = "20px Arial";
      ctx.fillText(icon, padding + 20, y + 25);
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(notif.message.substring(0, 40), padding + 45, y + 25);
      
      ctx.globalAlpha = 1;
    });
    
    ctx.textAlign = "left";
  }

  private drawContextPanel(ctx: CanvasRenderingContext2D) {
    if (!this.selectedCitizen || this.selectedCitizen.state === "dead") return;
    
    const c = this.selectedCitizen;
    const panelWidth = 280;
    const panelHeight = 200;
    const x = this.canvas.width - panelWidth - 16;
    const y = 16;
    
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(x, y, panelWidth, panelHeight);
    
    ctx.strokeStyle = "rgba(233, 204, 152, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, panelWidth, panelHeight);
    
    ctx.fillStyle = "#f0e7dc";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`CIUDADANO #${c.id} - ${this.getRoleLabel(c.role)}`, x + 12, y + 20);
    
    let lineY = y + 45;
    const lineHeight = 28;
    
    this.drawStatBar(ctx, "❤️ Salud", c.health, x + 12, lineY, panelWidth - 24, "#ef4444");
    lineY += lineHeight;
    this.drawStatBar(ctx, "🍖 Hambre", 100 - c.hunger, x + 12, lineY, panelWidth - 24, "#f59e0b");
    lineY += lineHeight;
    this.drawStatBar(ctx, "😊 Moral", c.morale, x + 12, lineY, panelWidth - 24, "#3b82f6");
    lineY += lineHeight;
    this.drawStatBar(ctx, "💤 Fatiga", 100 - c.fatigue, x + 12, lineY, panelWidth - 24, "#8b5cf6");
    lineY += lineHeight;
    
    ctx.font = "11px Arial";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`📍 Pos: (${c.x}, ${c.y})  🎂 Edad: ${Math.floor(c.age)}`, x + 12, lineY);
    lineY += 16;
    ctx.fillText(`📦 Carga: ${c.carrying.food}🌾 ${c.carrying.stone}🪨`, x + 12, lineY);
  }

  private drawStatBar(ctx: CanvasRenderingContext2D, label: string, value: number, x: number, y: number, width: number, color: string) {
    ctx.font = "11px Arial";
    ctx.fillStyle = "#cbd5e1";
    ctx.textAlign = "left";
    ctx.fillText(label, x, y - 4);
    
    ctx.fillStyle = "rgba(30, 41, 59, 0.8)";
    ctx.fillRect(x, y + 2, width, 10);
    
    const percent = clamp(value, 0, 100) / 100;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 2, width * percent, 10);
    
    ctx.font = "9px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(value)}%`, x + width - 4, y + 10);
  }

  private drawLegend(ctx: CanvasRenderingContext2D) {
    const legendWidth = 200;
    const legendHeight = 140;
    const x = 16;
    const y = this.canvas.height - legendHeight - 16;
    
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(x, y, legendWidth, legendHeight);
    
    ctx.strokeStyle = "rgba(233, 204, 152, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, legendWidth, legendHeight);
    
    ctx.font = "bold 11px Arial";
    ctx.fillStyle = "#f0e7dc";
    ctx.textAlign = "left";
    ctx.fillText("LEYENDA", x + 8, y + 15);
    
    const items = [
      { icon: "🔨", label: "Trabajador" },
      { icon: "👨‍🌾", label: "Granjero" },
      { icon: "⚔️", label: "Guerrero" },
      { icon: "🔍", label: "Explorador" },
      { icon: "🌾", label: "Comida" },
      { icon: "🪨", label: "Piedra" },
      { icon: "🏛️", label: "Aldea" },
    ];
    
    ctx.font = "10px Arial";
    let itemY = y + 32;
    items.forEach((item) => {
      ctx.fillText(`${item.icon} ${item.label}`, x + 8, itemY);
      itemY += 15;
    });
  }

  private getRoleLabel(role: Role): string {
    const labels: Record<Role, string> = {
      worker: "Trabajador",
      farmer: "Granjero",
      warrior: "Guerrero",
      scout: "Explorador",
      child: "Niño",
      elder: "Anciano",
    };
    return labels[role];
  }

  private setupHeaderButtons() {
    const btnNewGame = document.querySelector("#btn-new-game");
    const btnSave = document.querySelector("#btn-save");
    const btnLoad = document.querySelector("#btn-load");
    const btnSettings = document.querySelector("#btn-settings");
    const btnHelp = document.querySelector("#btn-help");

    btnNewGame?.addEventListener("click", () => {
      if (confirm("¿Iniciar una nueva partida? Se perderá el progreso actual.")) {
        window.location.reload();
      }
    });

    btnSave?.addEventListener("click", () => {
      this.showNotification("Función de guardado próximamente disponible", "info");
    });

    btnLoad?.addEventListener("click", () => {
      this.showNotification("Función de carga próximamente disponible", "info");
    });

    btnSettings?.addEventListener("click", () => {
      this.showNotification("Configuración próximamente disponible", "info");
    });

    btnHelp?.addEventListener("click", () => {
      this.showNotification("Usa WASD para moverte, 1-4 para marcar áreas, E para bendecir", "info", 6000);
    });
  }

  private setupZoomControls() {
    const hoverAnchor = () => (this.hoveredCell ? { x: this.hoveredCell.x + 0.5, y: this.hoveredCell.y + 0.5 } : null);

    this.zoomInButton?.addEventListener("click", () => {
      const anchor = hoverAnchor() ?? { x: this.player.x + 0.5, y: this.player.y + 0.5 };
      this.adjustZoom(0.2, anchor);
    });

    this.zoomOutButton?.addEventListener("click", () => {
      this.adjustZoom(-0.2, hoverAnchor());
    });
  }

  private handleResize = () => {
    const gameWrapper = this.canvas.parentElement;
    if (!gameWrapper) return;
    
    const wrapperRect = gameWrapper.getBoundingClientRect();
    const padding = 32; // padding del wrapper
    const availableWidth = wrapperRect.width - padding;
    const availableHeight = wrapperRect.height - padding;
    
    // Mantener el canvas cuadrado usando el menor de los dos valores
    const size = Math.min(availableWidth, availableHeight);
    
    this.canvas.width = size;
    this.canvas.height = size;
  };
}
