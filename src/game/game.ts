import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { clamp } from "./core/utils";
import type { Citizen, PriorityMark, Role, StructureType, ToastNotification, Vec2 } from "./core/types";
import { SimulationSession } from "./core/SimulationSession";
import { CameraController } from "./core/CameraController";
import { HUDController, type HUDSnapshot } from "./ui/HUDController";
import { CitizenPanelController } from "./ui/CitizenPanel";
import { GameRenderer, type RenderState, type ViewMetrics } from "./ui/GameRenderer";
import { MainMenu } from "./ui/MainMenu";
import { CellTooltipController } from "./ui/CellTooltip";
import { getStructureDefinition } from "./data/structures";
import type { StructureRequirements } from "./data/structures";
import { axialToOffset, createHexGeometry, getHexCenter, getHexWorldBounds, pixelToAxial, roundAxial } from "./ui/hexGrid";

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;
type PlanningMode = "farm" | "mine" | "gather" | "build";

export class Game {
  private running = false;
  private lastTime = 0;
  private accumulatedHours = 0;

  private readonly input = new InputHandler();
  private mainMenu: MainMenu;
  private readonly renderer: GameRenderer;
  private readonly hud = new HUDController();
  private readonly citizenPanel = new CitizenPanelController({ onSelect: (id) => this.handleCitizenPanelSelection(id) });
  private readonly cellTooltip = new CellTooltipController();
  private readonly playerTribeId = 1;
  private simulation: SimulationSession | null = null;
  private readonly assignableRoles: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
  private roleControls: Record<AssignableRole, { input: HTMLInputElement | null; value: HTMLSpanElement | null }> = {
    farmer: { input: null, value: null },
    worker: { input: null, value: null },
    warrior: { input: null, value: null },
    scout: { input: null, value: null },
  };
  private debugExportButton = document.querySelector<HTMLButtonElement>("#debug-export");
  private extinctionAnnounced = false;
  private gameInitialized = false;
  private readonly camera: CameraController;

  private currentDirection: Vec2 = { x: 0, y: 0 };
  private pendingMoveDirection: Vec2 | null = null;
  private pendingPriority: PriorityMark | null = null;

  private selectedCitizen: Citizen | null = null;
  private hoveredCell: Vec2 | null = null;
  private planningPriority: PlanningMode | null = null;
  private planningStrokeActive = false;
  private planningStrokeCells = new Set<string>();
  private planningButtons: HTMLButtonElement[] = [];
  private buildSelector = document.querySelector<HTMLDivElement>("#build-selector");
  private structurePrevButton = document.querySelector<HTMLButtonElement>("#build-prev");
  private structureNextButton = document.querySelector<HTMLButtonElement>("#build-next");
  private structureLabel = document.querySelector<HTMLSpanElement>("#build-name");
  private structureStatusLabel = document.querySelector<HTMLSpanElement>("#build-status");
  private buildDetailsContainer = document.querySelector<HTMLDivElement>("#build-details");
  private buildDetailsSummary = document.querySelector<HTMLParagraphElement>("#build-details-summary");
  private buildDetailsCost = document.querySelector<HTMLSpanElement>("#build-details-cost");
  private buildDetailsRequirements = document.querySelector<HTMLSpanElement>("#build-details-requirements");
  private planningHintLabel = document.querySelector<HTMLDivElement>("#planning-hint");
  private selectedStructureType: StructureType | null = null;
  private availableStructures: StructureType[] = [];

  private zoom = 1;
  private readonly minZoom = 1;
  private readonly maxZoom = 5;
  private viewTarget: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private speedButtons: HTMLButtonElement[] = [];
  private speedMultiplier = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.camera = new CameraController({ canvas, minZoom: this.minZoom, maxZoom: this.maxZoom }, () => this.simulation?.getWorld() ?? null);
    this.mainMenu = new MainMenu(canvas);
    this.camera.setViewTarget({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.hideOverlay(); // Ocultar el overlay inmediatamente
    this.hud.updateStatus("🎮 Configura tu mundo y presiona COMENZAR");
    this.hud.setPauseButtonState(false); // Mostrar botón como si estuviera pausado
    
    this.setupZoomControls();
    this.setupRoleControls();
    this.setupSpeedControls();
    this.setupPlanningControls();
    this.bindCanvasEvents();
    this.debugExportButton?.addEventListener("click", this.exportDebugLog);

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("blur", this.stopPanning);
    this.handleResize();
    
    // Iniciar el loop de renderizado inmediatamente para mostrar el menú
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private initializeGame() {
    if (this.gameInitialized) return;
    
    const config = this.mainMenu.getConfig();

    this.simulation = new SimulationSession(this.playerTribeId, {
      onLog: (message, notificationType) => this.logEvent(message, notificationType),
      onExtinction: this.handleExtinction,
    });
    this.simulation.initialize(config);
    this.extinctionAnnounced = false;

    const player = this.simulation.getPlayer();
    this.camera.setViewTarget({ x: player.x + 0.5, y: player.y + 0.5 });
    this.selectedCitizen = null;
    this.hoveredCell = null;

    this.gameInitialized = true;
    this.updateRoleControls(true);
    this.refreshStructureSelection();
    this.updatePlanningHint();
    this.updateCitizenPanel();

    this.hud.setPauseButtonState(true);
    this.hud.updateStatus("▶️ Simulación en curso.");
  }

  private initializeAndStart() {
    this.mainMenu.hide();
    this.initializeGame();
    // El loop continuará automáticamente después de cerrar el menú
  }

  start() {
    // Ya no se necesita porque el juego empieza automáticamente mostrando el menú
  }

  pause() {
    if (!this.gameInitialized) return; // No pausar si el juego no ha iniciado
    this.running = false;
    this.hud.updateStatus("⏸️ En pausa.");
    this.hud.setPauseButtonState(false);
  }

  resume() {
    if (!this.gameInitialized) return; // No reanudar si el juego no ha iniciado
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.hud.updateStatus("▶️ Simulación en curso.");
    this.hud.setPauseButtonState(true);
    requestAnimationFrame(this.loop);
  }

  private handlePauseToggle = () => {
    if (!this.gameInitialized) {
      // Si el juego no ha iniciado, cerrar el menú e inicializar
      if (this.mainMenu.isMenuVisible()) {
        this.initializeAndStart();
      }
      return;
    }
    
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
    this.canvas.addEventListener("mouseleave", this.handleCanvasLeave);
    
    // Ocultar tooltip al hacer scroll o redimensionar
    window.addEventListener("scroll", this.hideTooltip);
    window.addEventListener("resize", this.hideTooltip);
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

  private setupSpeedControls() {
    const container = document.querySelector<HTMLDivElement>("#speed-controls");
    if (!container) {
      return;
    }
    this.speedButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-speed]"));
    if (this.speedButtons.length === 0) {
      return;
    }
    this.speedButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextSpeed = Number(button.dataset.speed ?? "1");
        if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) {
          return;
        }
        this.setSpeedMultiplier(nextSpeed);
      });
    });
    this.updateSpeedButtons();
  }

  private setSpeedMultiplier(multiplier: number) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }
    const changed = this.speedMultiplier !== multiplier;
    this.speedMultiplier = multiplier;
    this.updateSpeedButtons();
    if (changed && this.gameInitialized) {
      this.logEvent(`Velocidad de simulación ${multiplier}×`);
    }
  }

  private updateSpeedButtons() {
    if (this.speedButtons.length === 0) {
      return;
    }
    this.speedButtons.forEach((button) => {
      const buttonSpeed = Number(button.dataset.speed ?? "1");
      const isActive = buttonSpeed === this.speedMultiplier;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  private setupPlanningControls() {
    this.planningButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".planning-button"));
    this.planningButtons.forEach((button) => {
      const mode = button.dataset.planningMode as PlanningMode | undefined;
      if (!mode) return;
      button.addEventListener("click", () => this.togglePlanningMode(mode));
    });
    this.structurePrevButton?.addEventListener("click", () => this.cycleStructure(-1));
    this.structureNextButton?.addEventListener("click", () => this.cycleStructure(1));
    this.updatePlanningButtons();
    this.updatePlanningHint();
    this.updateBuildSelectorVisibility();
    this.updateStructureDetails();
  }

  private handleRoleSliderInput = () => {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    const targets = this.collectRoleTargets();
    this.simulation.getCitizenSystem().rebalanceRoles(targets, this.playerTribeId);
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

  private togglePlanningMode(mode: PlanningMode) {
    if (this.planningPriority === mode) {
      this.clearPlanningMode();
      return;
    }
    this.activatePlanningMode(mode);
  }

  private activatePlanningMode(mode: PlanningMode) {
    this.planningPriority = mode;
    if (mode !== "build") {
      this.planningStrokeActive = false;
      this.planningStrokeCells.clear();
    } else {
      this.ensureStructureSelection();
    }
    this.updatePlanningButtons();
    this.updatePlanningHint();
    this.updateBuildSelectorVisibility();
  }

  private clearPlanningMode() {
    if (!this.planningPriority) {
      return;
    }
    this.planningPriority = null;
    this.planningStrokeActive = false;
    this.planningStrokeCells.clear();
    this.updatePlanningButtons();
    this.updatePlanningHint();
    this.updateBuildSelectorVisibility();
  }

  private updatePlanningButtons() {
    if (this.planningButtons.length === 0) {
      return;
    }
    this.planningButtons.forEach((button) => {
      const mode = button.dataset.planningMode as PlanningMode | undefined;
      if (!mode) return;
      const active = mode === this.planningPriority;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  private updatePlanningHint(message?: string) {
    if (message) {
      this.setPlanningHint(message);
      return;
    }
    if (!this.planningHintLabel) {
      return;
    }
    if (!this.planningPriority) {
      this.setPlanningHint("Selecciona un modo para empezar a marcar zonas.");
      return;
    }
    if (this.planningPriority === "build") {
      if (!this.selectedStructureType) {
        this.setPlanningHint("No hay edificios disponibles todavía. Aumenta la población para desbloquearlos.");
      } else {
        this.setPlanningHint("Haz clic en el mapa para trazar el plano del edificio seleccionado.");
      }
      return;
    }
    const labels: Record<Exclude<PlanningMode, "build">, string> = {
      farm: "Arrastra sobre el mapa para señalar zonas de cultivo.",
      mine: "Pinta sobre colinas o montañas para priorizar la minería.",
      gather: "Designa zonas de recolección natural para tus trabajadores.",
    };
    this.setPlanningHint(labels[this.planningPriority]);
  }

  private setPlanningHint(text: string) {
    if (!this.planningHintLabel) return;
    this.planningHintLabel.textContent = text;
  }

  private updateBuildSelectorVisibility() {
    if (!this.buildSelector) {
      return;
    }
    const show = this.planningPriority === "build";
    this.buildSelector.classList.toggle("collapsed", !show);
    this.buildSelector.setAttribute("aria-hidden", show ? "false" : "true");
  }

  private refreshStructureSelection() {
    if (!this.simulation) {
      if (this.availableStructures.length > 0 || this.selectedStructureType) {
        this.availableStructures = [];
        this.selectedStructureType = null;
        this.updateStructureDetails();
      }
      return;
    }
    const unlocked = this.simulation.getAvailableStructures();
    const prevKey = this.availableStructures.join(",");
    const nextKey = unlocked.join(",");
    if (prevKey === nextKey) {
      return;
    }
    this.availableStructures = unlocked;
    this.ensureStructureSelection();
    this.updateStructureDetails();
    this.updatePlanningHint();
  }

  private ensureStructureSelection() {
    if (this.availableStructures.length === 0) {
      this.selectedStructureType = null;
      return;
    }
    if (!this.selectedStructureType || !this.availableStructures.includes(this.selectedStructureType)) {
      this.selectedStructureType = this.availableStructures[0] ?? null;
    }
  }

  private cycleStructure(direction: number) {
    if (this.availableStructures.length === 0) {
      return;
    }
    if (!this.selectedStructureType) {
      this.selectedStructureType = this.availableStructures[0] ?? null;
      this.updateStructureDetails();
      this.updatePlanningHint();
      return;
    }
    const index = this.availableStructures.indexOf(this.selectedStructureType);
    const length = this.availableStructures.length;
    const nextIndex = (index + direction + length) % length;
    this.selectedStructureType = this.availableStructures[nextIndex] ?? null;
    this.updateStructureDetails();
    this.updatePlanningHint();
  }

  private updateStructureDetails() {
    const hasOptions = this.availableStructures.length > 0;
    if (!hasOptions) {
      this.selectedStructureType = null;
    }
    const disableCyclers = this.availableStructures.length <= 1;
    if (this.structurePrevButton) {
      this.structurePrevButton.disabled = disableCyclers;
    }
    if (this.structureNextButton) {
      this.structureNextButton.disabled = disableCyclers;
    }

    if (!this.selectedStructureType) {
      if (this.structureLabel) this.structureLabel.textContent = "Ninguno";
      if (this.structureStatusLabel) {
        this.structureStatusLabel.textContent = hasOptions
          ? "Selecciona un edificio para comenzar."
          : "Aumenta la población para desbloquear edificios.";
      }
      if (this.buildDetailsContainer) {
        this.buildDetailsContainer.hidden = true;
      }
      if (this.buildDetailsSummary) {
        this.buildDetailsSummary.textContent = "Selecciona un edificio para ver sus detalles.";
      }
      if (this.buildDetailsCost) {
        this.buildDetailsCost.textContent = "-";
      }
      if (this.buildDetailsRequirements) {
        this.buildDetailsRequirements.textContent = "-";
      }
      return;
    }

    const definition = getStructureDefinition(this.selectedStructureType);
    if (this.structureLabel) {
      if (definition) {
        this.structureLabel.textContent = `${definition.icon} ${definition.displayName}`;
      } else {
        this.structureLabel.textContent = this.selectedStructureType;
      }
    }
    if (this.structureStatusLabel) {
      this.structureStatusLabel.textContent = "Haz clic en el mapa para planificar este edificio.";
    }
    if (this.buildDetailsContainer) {
      this.buildDetailsContainer.hidden = !definition;
    }
    if (definition) {
      if (this.buildDetailsSummary) {
        this.buildDetailsSummary.textContent = definition.summary;
      }
      if (this.buildDetailsCost) {
        this.buildDetailsCost.textContent = this.formatStructureCosts(definition.costs);
      }
      if (this.buildDetailsRequirements) {
        this.buildDetailsRequirements.textContent = this.formatStructureRequirements(definition.requirements);
      }
    }
  }

  private formatStructureCosts(costs: { stone?: number; food?: number }) {
    const parts: string[] = [];
    if (costs.stone && costs.stone > 0) {
      parts.push(`${costs.stone} piedra${costs.stone > 1 ? "s" : ""}`);
    }
    if (costs.food && costs.food > 0) {
      parts.push(`${costs.food} comida`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Sin coste";
  }

  private formatStructureRequirements(req: StructureRequirements) {
    const parts: string[] = [];
    if (req.population) {
      parts.push(`Población ${req.population}+`);
    }
    if (req.structures && req.structures.length > 0) {
      const names = req.structures
        .map((type) => getStructureDefinition(type)?.displayName ?? type)
        .join(", ");
      parts.push(`Estructuras: ${names}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "Ninguno";
  }

  private applyPlanningAtCell(cell: Vec2) {
    if (!this.simulation || !this.planningPriority || this.planningPriority === "build") {
      return;
    }
    const key = this.planningCellKey(cell);
    if (this.planningStrokeCells.has(key)) {
      return;
    }
    this.planningStrokeCells.add(key);
    this.simulation.getWorld().setPriorityAt(cell.x, cell.y, this.planningPriority);
  }

  private applyStructurePlan(cell: Vec2) {
    if (!this.simulation) {
      return;
    }
    if (!this.selectedStructureType) {
      this.updatePlanningHint("No hay edificios desbloqueados todavía.");
      return;
    }
    const result = this.simulation.planConstruction(this.selectedStructureType, cell);
    if (!result.ok) {
      this.updatePlanningHint(result.reason ?? "No se pudo trazar el plano aquí.");
    } else {
      this.updatePlanningHint(`Plano trazado en (${cell.x}, ${cell.y}).`);
    }
  }

  private planningCellKey(cell: Vec2) {
    return `${cell.x},${cell.y}`;
  }

  private updateRoleControls(force = false) {
    if (!this.simulation) {
      return;
    }
    const citizenSystem = this.simulation.getCitizenSystem();
    const assignable = citizenSystem.getAssignablePopulationCount(this.playerTribeId);
    const counts = citizenSystem.getRoleCounts(this.playerTribeId);
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
    
    // Si el menú está visible, solo renderizarlo
    if (this.mainMenu.isMenuVisible()) {
      this.mainMenu.render();
      requestAnimationFrame(this.loop);
      return;
    }
    
    // Si el juego no está inicializado pero el menú se cerró, inicializar ahora
    if (!this.gameInitialized) {
      this.initializeGame();
    }
    
    const deltaSeconds = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.handleRealtimeInput();

    this.accumulatedHours += deltaSeconds * HOURS_PER_SECOND * this.speedMultiplier;
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

    if (this.input.consumeKey("KeyF")) {
      this.togglePlanningMode("farm");
    }
    if (this.input.consumeKey("KeyM")) {
      this.togglePlanningMode("mine");
    }
    if (this.input.consumeKey("KeyG")) {
      this.togglePlanningMode("gather");
    }
    if (this.input.consumeKey("KeyB")) {
      this.togglePlanningMode("build");
    }
    if (this.input.consumeKey("Escape")) {
      this.clearPlanningMode();
    }
    if (this.planningPriority === "build") {
      if (this.input.consumeKey("BracketLeft")) {
        this.cycleStructure(-1);
      }
      if (this.input.consumeKey("BracketRight")) {
        this.cycleStructure(1);
      }
    }

    if (this.input.consumeAny(["KeyE", "Space"])) {
      this.blessNearestCitizen();
    }

    if (this.input.consumeKey("KeyT")) {
      this.dropTotem();
    }
  }

  private runTick(tickHours: number) {
    if (!this.gameInitialized || !this.simulation) return;

    const moveIntent = this.pendingMoveDirection ?? this.currentDirection;
    const priority = this.pendingPriority;

    this.simulation.runTick(tickHours, {
      moveIntent,
      priority: priority ?? null,
    });

    this.pendingMoveDirection = null;
    this.pendingPriority = null;

    if (this.selectedCitizen?.state === "dead") {
      this.selectedCitizen = null;
    }

    this.hud.tickNotifications();
    this.updateRoleControls();
    this.updateHUD();
    this.updateCitizenPanel();
    this.refreshStructureSelection();
  }

  private blessNearestCitizen() {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    this.simulation.blessNearestCitizen();
  }

  private dropTotem() {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    this.simulation.dropTotem();
  }

  private updateHUD() {
    if (!this.gameInitialized || !this.simulation) return;
    const player = this.simulation.getPlayer();
    const citizenSystem = this.simulation.getCitizenSystem();
    const world = this.simulation.getWorld();
    const citizens = citizenSystem.getCitizens();
    const livingPopulation = citizens.filter((citizen) => citizen.state === "alive").length;
    const hudSnapshot: HUDSnapshot = {
      power: player.power,
      population: {
        value: livingPopulation,
        trend: this.simulation.getResourceTrendAverage("population"),
      },
      climate: this.simulation.getClimate(),
      food: {
        value: world.stockpile.food,
        capacity: world.stockpile.foodCapacity,
        trend: this.simulation.getResourceTrendAverage("food"),
      },
      stone: {
        value: world.stockpile.stone,
        capacity: world.stockpile.stoneCapacity,
        trend: this.simulation.getResourceTrendAverage("stone"),
      },
      water: world.stockpile.water,
    };

    this.hud.updateHUD(hudSnapshot);
  }

  private updateCitizenPanel() {
    if (!this.simulation) return;
    this.citizenPanel.update(this.simulation.getCitizenSystem().getCitizens(), this.selectedCitizen);
  }

  private handleExtinction = () => {
    if (this.extinctionAnnounced) {
      return;
    }
    this.extinctionAnnounced = true;
    this.hud.updateStatus("☠️ La tribu ha desaparecido.");
    this.logEvent("Todos los habitantes han muerto. Usa 'Descargar debug' para guardar el registro.");
    this.enableDebugExport();
  };

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
    if (!this.gameInitialized || !this.simulation) return;

    const renderState: RenderState = {
      world: this.simulation.getWorld(),
      citizens: this.simulation.getCitizenSystem().getCitizens(),
      player: this.simulation.getPlayer(),
      selectedCitizen: this.selectedCitizen,
      hoveredCell: this.hoveredCell,
      notifications: this.hud.getNotifications(),
      view: this.camera.getViewMetrics(),
    };

    this.renderer.render(renderState);
  }

  private handleCanvasClick = (event: MouseEvent) => {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    if (this.planningPriority) {
      return;
    }
    const cell = this.camera.getCellUnderPointer(event);
    if (!cell) {
      this.selectedCitizen = null;
      this.cellTooltip.hide();
      return;
    }

    const clickedCitizen = this.simulation
      .getCitizenSystem()
      .getCitizens()
      .find((citizen) => citizen.state === "alive" && citizen.x === cell.x && citizen.y === cell.y);
    this.selectedCitizen = clickedCitizen || null;

    this.showCellTooltip(cell, event);

    const worldPoint = this.camera.getWorldPosition(event);
    if (worldPoint) {
      this.camera.focusOn(worldPoint);
    }
    this.updateCitizenPanel();
  };

  private handleCitizenPanelSelection = (citizenId: number) => {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    const citizen = this.simulation.getCitizenSystem().getCitizenById(citizenId) ?? null;
    this.selectedCitizen = citizen;
    if (citizen) {
      this.camera.focusOn({ x: citizen.x + 0.5, y: citizen.y + 0.5 });
    }
    this.updateCitizenPanel();
  };

  private handleCanvasHover = (event: MouseEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    this.hoveredCell = this.camera.getCellUnderPointer(event);
    if (this.planningStrokeActive && this.planningPriority && this.planningPriority !== "build" && this.hoveredCell) {
      this.applyPlanningAtCell(this.hoveredCell);
    }
  };

  private showCellTooltip(cellPos: Vec2, event: MouseEvent) {
    if (!this.simulation) return;
    const cell = this.simulation.getWorld().getCell(cellPos.x, cellPos.y);
    if (!cell) return;

    const citizensInCell = this.simulation
      .getCitizenSystem()
      .getCitizens()
      .filter((citizen) => citizen.state === "alive" && citizen.x === cellPos.x && citizen.y === cellPos.y);

    this.cellTooltip.show({
      cell,
      citizens: citizensInCell,
      position: { x: event.clientX, y: event.clientY }
    });
  }

  private handleCanvasLeave = () => {
    this.cellTooltip.hide();
    this.planningStrokeActive = false;
    this.planningStrokeCells.clear();
  };

  private hideTooltip = () => {
    this.cellTooltip.hide();
  };

  private handleCanvasWheel = (event: WheelEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    event.preventDefault();
    this.cellTooltip.hide(); // Ocultar tooltip al hacer zoom
    const anchor = this.camera.getWorldPosition(event);
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    this.camera.adjustZoom(delta, anchor ?? undefined);
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    if (event.button === 0 && this.planningPriority) {
      const cell = this.camera.getCellUnderPointer(event);
      if (cell) {
        event.preventDefault();
        this.cellTooltip.hide();
        if (this.planningPriority === "build") {
          this.applyStructurePlan(cell);
          this.planningStrokeActive = false;
          this.planningStrokeCells.clear();
        } else {
          this.planningStrokeActive = true;
          this.planningStrokeCells.clear();
          this.applyPlanningAtCell(cell);
        }
      }
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      this.cellTooltip.hide(); // Ocultar tooltip al iniciar paneo
      this.camera.startPanning({ x: event.clientX, y: event.clientY });
    }
  };

  private handleMouseUp = (event: MouseEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    if (event.button === 0 && this.planningStrokeActive) {
      this.planningStrokeActive = false;
      this.planningStrokeCells.clear();
    }
    if (event.button === 1) {
      this.camera.stopPanning();
    }
  };

  private stopPanning = () => {
    this.camera.stopPanning();
    this.planningStrokeActive = false;
    this.planningStrokeCells.clear();
  };

  private handlePanMove = (event: MouseEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    this.camera.pan({ x: event.clientX, y: event.clientY });
  };

  private setupZoomControls() {
    const hoverAnchor = () => (this.hoveredCell ? { x: this.hoveredCell.x + 0.5, y: this.hoveredCell.y + 0.5 } : null);

    this.zoomInButton?.addEventListener("click", () => {
      if (!this.gameInitialized) {
        return;
      }
      const player = this.simulation?.getPlayer();
      const anchor = hoverAnchor() ?? (player ? { x: player.x + 0.5, y: player.y + 0.5 } : null);
      this.camera.adjustZoom(0.2, anchor);
    });

    this.zoomOutButton?.addEventListener("click", () => {
      if (!this.gameInitialized) {
        return;
      }
      this.camera.adjustZoom(-0.2, hoverAnchor());
    });
  }

  private handleResize = () => {
    const gameWrapper = this.canvas.parentElement;
    if (!gameWrapper) return;

    const wrapperRect = gameWrapper.getBoundingClientRect();
    const padding = 32;
    const availableWidth = wrapperRect.width - padding;
    const availableHeight = wrapperRect.height - padding;
    const size = Math.max(0, Math.min(availableWidth, availableHeight));

    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = size;
    this.canvas.height = size;
    
    // Ocultar tooltip al redimensionar
    this.cellTooltip.hide();
  };

  destroy() {
    this.cellTooltip.destroy();
    // Limpiar otros event listeners si es necesario
  }

}
