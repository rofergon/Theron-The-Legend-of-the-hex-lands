import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { PlayerSpirit } from "./core/PlayerSpirit";
import { clamp } from "./core/utils";
import type { Citizen, ClimateState, PriorityMark, ResourceTrend, Role, ToastNotification, Vec2 } from "./core/types";
import { WorldEngine } from "./core/world/WorldEngine";
import { CitizenSystem, type CitizenSystemEvent } from "./systems/CitizenSystem";
import { HUDController, type HUDSnapshot } from "./ui/HUDController";
import { CitizenPanelController } from "./ui/CitizenPanel";
import { GameRenderer, type RenderState, type ViewMetrics } from "./ui/GameRenderer";

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;

export class Game {
  private running = false;
  private lastTime = 0;
  private accumulatedHours = 0;

  private readonly input = new InputHandler();
  private readonly world = new WorldEngine();
  private readonly player = new PlayerSpirit(WORLD_SIZE);
  private readonly renderer: GameRenderer;
  private readonly hud = new HUDController();
  private readonly citizenPanel = new CitizenPanelController({ onSelect: (id) => this.handleCitizenPanelSelection(id) });
  private readonly playerTribeId = 1;
  private readonly assignableRoles: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
  private roleControls: Record<AssignableRole, { input: HTMLInputElement | null; value: HTMLSpanElement | null }> = {
    farmer: { input: null, value: null },
    worker: { input: null, value: null },
    warrior: { input: null, value: null },
    scout: { input: null, value: null },
  };
  private debugExportButton = document.querySelector<HTMLButtonElement>("#debug-export");
  private extinctionAnnounced = false;
  private handleCitizenEvent = (event: CitizenSystemEvent) => {
    if (event.type === "log") {
      this.logEvent(event.message, event.notificationType);
    }
    if (event.type === "powerGain") {
      this.player.power = clamp(this.player.power + event.amount, 0, 120);
    }
  };
  private readonly citizenSystem = new CitizenSystem(this.world, this.handleCitizenEvent);

  private currentDirection: Vec2 = { x: 0, y: 0 };
  private pendingMoveDirection: Vec2 | null = null;
  private pendingPriority: PriorityMark | null = null;

  private climate: ClimateState = { drought: false, droughtTimer: 0, rainy: false, rainyTimer: 0 };
  private nextEventTimer = 8;

  private selectedCitizen: Citizen | null = null;
  private hoveredCell: Vec2 | null = null;

  private resourceHistory: ResourceTrend[] = [];
  private lastResourceSnapshot = { food: 40, stone: 10, population: 10 };
  private resourceTrackTimer = 0;

  private zoom = 1;
  private readonly minZoom = 0.75;
  private readonly maxZoom = 2.5;
  private readonly defaultCenter: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private viewTarget: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private isPanning = false;
  private lastPanPosition: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.world.citizenLookup = (id) => this.citizenSystem.getCitizenById(id);
    this.viewTarget = { x: this.player.x + 0.5, y: this.player.y + 0.5 };
    this.citizenSystem.init(["farmer", "farmer", "worker", "worker", "warrior", "warrior", "scout", "child", "child", "elder"], this.playerTribeId);

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.registerOverlayInstructions(() => this.start());
    this.setupZoomControls();
    this.setupRoleControls();
    this.bindCanvasEvents();
    this.debugExportButton?.addEventListener("click", this.exportDebugLog);

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("blur", this.stopPanning);
    this.handleResize();
    this.updateCitizenPanel();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.hud.hideOverlay();
    this.hud.setPauseButtonState(true);
    requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
    this.hud.updateStatus("⏸️ En pausa.");
    this.hud.setPauseButtonState(false);
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.hud.updateStatus("▶️ Simulación en curso.");
    this.hud.setPauseButtonState(true);
    requestAnimationFrame(this.loop);
  }

  private handlePauseToggle = () => {
    if (this.running) {
      this.pause();
    } else {
      this.resume();
    }
  };

  private bindCanvasEvents() {
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasHover);
    this.canvas.addEventListener("wheel", this.handleCanvasWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
  }

  private setupRoleControls() {
    this.roleControls = {
      farmer: {
        input: document.querySelector<HTMLInputElement>("#role-farmer"),
        value: document.querySelector<HTMLSpanElement>("#role-value-farmer"),
      },
      worker: {
        input: document.querySelector<HTMLInputElement>("#role-worker"),
        value: document.querySelector<HTMLSpanElement>("#role-value-worker"),
      },
      warrior: {
        input: document.querySelector<HTMLInputElement>("#role-warrior"),
        value: document.querySelector<HTMLSpanElement>("#role-value-warrior"),
      },
      scout: {
        input: document.querySelector<HTMLInputElement>("#role-scout"),
        value: document.querySelector<HTMLSpanElement>("#role-value-scout"),
      },
    };

    for (const role of this.assignableRoles) {
      this.roleControls[role].input?.addEventListener("input", this.handleRoleSliderInput);
    }

    this.updateRoleControls(true);
  }

  private handleRoleSliderInput = () => {
    const targets = this.collectRoleTargets();
    this.citizenSystem.rebalanceRoles(targets, this.playerTribeId);
    this.updateRoleControls(true);
  };

  private collectRoleTargets() {
    const targets: Record<AssignableRole, number> = {
      farmer: 0,
      worker: 0,
      warrior: 0,
      scout: 0,
    };
    for (const role of this.assignableRoles) {
      const input = this.roleControls[role].input;
      const value = input ? Number.parseInt(input.value, 10) : 0;
      targets[role] = Number.isNaN(value) ? 0 : Math.max(0, value);
    }
    return targets;
  }

  private updateRoleControls(force = false) {
    const assignable = this.citizenSystem.getAssignablePopulationCount(this.playerTribeId);
    const counts = this.citizenSystem.getRoleCounts(this.playerTribeId);
    for (const role of this.assignableRoles) {
      const control = this.roleControls[role];
      if (control.value) {
        control.value.textContent = counts[role]?.toString() ?? "0";
      }
      if (control.input) {
        control.input.max = Math.max(assignable, 0).toString();
        if (force || document.activeElement !== control.input) {
          control.input.value = counts[role]?.toString() ?? "0";
        }
      }
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
    const dir = this.input.getDirection();
    this.currentDirection = dir;
    if (dir.x !== 0 || dir.y !== 0) {
      this.pendingMoveDirection = { ...dir };
    }

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
    const moveIntent = this.pendingMoveDirection ?? this.currentDirection;
    if (moveIntent.x !== 0 || moveIntent.y !== 0) {
      this.player.move(moveIntent.x, moveIntent.y, this.world);
    }
    this.pendingMoveDirection = null;

    if (this.pendingPriority) {
      this.applyPriority(this.pendingPriority);
      this.pendingPriority = null;
    }

    this.updateEvents(tickHours);
    this.world.updateEnvironment(this.climate, tickHours);
    this.citizenSystem.update(tickHours);
    if (this.selectedCitizen?.state === "dead") {
      this.selectedCitizen = null;
    }
    this.regeneratePlayerPower(tickHours);
    this.trackResourceTrends(tickHours);
    this.hud.tickNotifications();
    this.updateRoleControls();
    this.updateHUD();
    this.updateCitizenPanel();
    this.checkExtinction();
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

    const candidates = this.citizenSystem.tryBlessCitizens(this.player.getCoveredCells());
    if (candidates.length === 0) {
      this.logEvent("No hay habitantes cercanos.");
      this.player.power += this.player.blessingCost;
      return;
    }

    const target = candidates[0];
    if (!target) {
      return;
    }
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
      this.citizenSystem.spawnMigrants("neutral");
      return;
    }
    this.citizenSystem.spawnBeasts();
  }

  private regeneratePlayerPower(tickHours: number) {
    const alive = this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === 1);
    this.player.power = clamp(this.player.power + alive * 0.01 * tickHours, 0, 120);
  }

  private trackResourceTrends(tickHours: number) {
    this.resourceTrackTimer += tickHours;
    if (this.resourceTrackTimer >= 1) {
      const current = {
        food: this.world.stockpile.food,
        stone: this.world.stockpile.stone,
        population: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === 1),
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

  private updateHUD() {
    const hudSnapshot: HUDSnapshot = {
      power: this.player.power,
      population: {
        value: this.citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === 1),
        trend: this.getResourceTrendAverage("population"),
      },
      climate: this.climate,
      food: {
        value: this.world.stockpile.food,
        capacity: this.world.stockpile.foodCapacity,
        trend: this.getResourceTrendAverage("food"),
      },
      stone: {
        value: this.world.stockpile.stone,
        capacity: this.world.stockpile.stoneCapacity,
        trend: this.getResourceTrendAverage("stone"),
      },
      water: this.world.stockpile.water,
    };

    this.hud.updateHUD(hudSnapshot);
  }

  private updateCitizenPanel() {
    this.citizenPanel.update(this.citizenSystem.getCitizens(), this.selectedCitizen);
  }

  private getResourceTrendAverage(type: keyof ResourceTrend): number {
    if (this.resourceHistory.length === 0) return 0;
    const recent = this.resourceHistory.slice(-5);
    const sum = recent.reduce((acc, trend) => acc + trend[type], 0);
    return sum / recent.length;
  }

  private checkExtinction() {
    if (this.extinctionAnnounced) return;
    const alive = this.citizenSystem.getPopulationCount(
      (citizen) => citizen.state === "alive" && citizen.tribeId === this.playerTribeId,
    );
    if (alive > 0) return;
    this.extinctionAnnounced = true;
    this.hud.updateStatus("☠️ La tribu ha desaparecido.");
    this.logEvent("Todos los habitantes han muerto. Usa 'Descargar debug' para guardar el registro.");
    this.enableDebugExport();
  }

  private enableDebugExport() {
    if (this.debugExportButton) {
      this.debugExportButton.disabled = false;
    }
  }

  private exportDebugLog = () => {
    const entries = this.hud.getHistoryArchive();
    if (entries.length === 0) {
      this.logEvent("No hay eventos registrados para exportar.");
      return;
    }
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const header = `Registro de depuración - ${now.toLocaleString()} (entradas: ${entries.length})\n`;
    const lines = entries.map((entry, index) => `${String(index + 1).padStart(4, "0")} ${entry}`);
    const blob = new Blob([header + lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `espiritu-debug-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.logEvent("Registro de depuración exportado.");
  };

  private logEvent(message: string, notificationType?: ToastNotification["type"]) {
    this.hud.appendHistory(message);

    if (message.startsWith("[DEBUG]")) {
      return;
    }

    if (notificationType) {
      this.hud.showNotification(message, notificationType);
    } else if (message.includes("muerto") || message.includes("Bestias") || message.includes("hostil")) {
      this.hud.showNotification(message, "critical");
    } else if (message.includes("hambruna") || message.includes("sequía") || message.includes("Sin")) {
      this.hud.showNotification(message, "warning");
    } else if (message.includes("nacido") || message.includes("bendecido") || message.includes("lluvia")) {
      this.hud.showNotification(message, "success");
    }
  }

  private draw() {
    const renderState: RenderState = {
      world: this.world,
      citizens: this.citizenSystem.getCitizens(),
      player: this.player,
      selectedCitizen: this.selectedCitizen,
      hoveredCell: this.hoveredCell,
      notifications: this.hud.getNotifications(),
      view: this.getViewMetrics(),
    };

    this.renderer.render(renderState);
  }

  private handleCanvasClick = (event: MouseEvent) => {
    const cell = this.getCellUnderPointer(event);
    if (!cell) {
      this.selectedCitizen = null;
      return;
    }

    const clickedCitizen = this.citizenSystem
      .getCitizens()
      .find((citizen) => citizen.state === "alive" && citizen.x === cell.x && citizen.y === cell.y);
    this.selectedCitizen = clickedCitizen || null;

    const worldPoint = this.getWorldPosition(event);
    if (worldPoint) {
      this.focusOn(worldPoint);
    }
    this.updateCitizenPanel();
  };

  private handleCitizenPanelSelection = (citizenId: number) => {
    const citizen = this.citizenSystem.getCitizenById(citizenId) ?? null;
    this.selectedCitizen = citizen;
    if (citizen) {
      this.focusOn({ x: citizen.x + 0.5, y: citizen.y + 0.5 });
    }
    this.updateCitizenPanel();
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

  private getViewMetrics(): ViewMetrics {
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
    const padding = 32;
    const availableWidth = wrapperRect.width - padding;
    const availableHeight = wrapperRect.height - padding;
    const size = Math.min(availableWidth, availableHeight);

    this.canvas.width = size;
    this.canvas.height = size;
  };

}
