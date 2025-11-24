import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { clamp } from "./core/utils";
import type { Citizen, PriorityMark, Role, StructureType, ToastNotification, Vec2 } from "./core/types";
import { SimulationSession } from "./core/SimulationSession";
import { CameraController } from "./core/CameraController";
import { HUDController, type HUDSnapshot } from "./ui/HUDController";
import { CitizenPortraitBarController } from "./ui/CitizenPortraitBar";
import { CitizenControlPanelController } from "./ui/CitizenControlPanel";
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
  private readonly portraitBar = new CitizenPortraitBarController({ onSelectCitizen: (id) => this.handleCitizenSelection(id) });
  private readonly citizenPanel = new CitizenControlPanelController({ onClose: () => this.handlePanelClose() });
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

  private zoom = 5;
  private readonly minZoom = 2;
  private readonly maxZoom = 10;
  private viewTarget: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private speedButtons: HTMLButtonElement[] = [];
  private speedMultiplier = 1;
  private mobileMediaQuery: MediaQueryList;
  private useMobileLayout = false;
  private mobileActionBar: HTMLDivElement | null = null;
  private mobileHintBubble: HTMLDivElement | null = null;
  private mobileHintTimeout: number | null = null;
  private mobileBuildLabel: HTMLSpanElement | null = null;
  private mobilePlanningButtons: Partial<Record<PlanningMode, HTMLButtonElement>> = {};
  private touchStart: { x: number; y: number } | null = null;
  private touchLast: { x: number; y: number } | null = null;
  private touchMoved = false;
  private pinchStartDistance: number | null = null;
  private pinchStartZoom: number | null = null;
  private isTouchPanning = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.mobileMediaQuery = window.matchMedia("(max-width: 900px)");
    this.useMobileLayout = this.shouldUseMobileLayout();
    document.body.classList.toggle("is-mobile", this.useMobileLayout);

    this.renderer = new GameRenderer(canvas);
    this.camera = new CameraController({ canvas, minZoom: this.minZoom, maxZoom: this.maxZoom }, () => this.simulation?.getWorld() ?? null);
    this.mainMenu = new MainMenu(canvas, { isMobile: this.useMobileLayout });
    this.camera.setViewTarget({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.hideOverlay(); // Ocultar el overlay inmediatamente
    this.hud.updateStatus("🎮 Configure your world and press START");
    this.hud.setPauseButtonState(false); // Show button as if paused

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
    this.mobileMediaQuery.addEventListener("change", this.syncMobileLayout);
    window.addEventListener("orientationchange", this.syncMobileLayout);
    this.handleResize();
    this.initializeMobileUI();

    // Start the render loop immediately to show the menu
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private shouldUseMobileLayout() {
    const prefersSmallScreen =
      typeof window !== "undefined" && "matchMedia" in window && this.mobileMediaQuery.matches;
    const touchCapable = (typeof window !== "undefined" && "ontouchstart" in window) || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
    return Boolean(prefersSmallScreen || touchCapable);
  }

  private syncMobileLayout = () => {
    const next = this.shouldUseMobileLayout();
    if (next === this.useMobileLayout) {
      return;
    }
    this.useMobileLayout = next;
    document.body.classList.toggle("is-mobile", this.useMobileLayout);
    this.mainMenu.setMobileMode(this.useMobileLayout);
    if (this.useMobileLayout) {
      this.initializeMobileUI();
    } else {
      this.teardownMobileUI();
    }
    this.handleResize();
  };

  private initializeMobileUI() {
    if (!this.useMobileLayout) {
      return;
    }
    this.createMobileActionBar();
    this.setupMobileTooltips();
    this.updatePlanningButtons();
    this.updateStructureDetails();
    if (this.planningHintLabel?.textContent) {
      this.updateMobileHint(this.planningHintLabel.textContent, true);
    }
  }

  private teardownMobileUI() {
    this.mobileActionBar?.remove();
    this.mobileActionBar = null;
    this.mobilePlanningButtons = {};
    this.mobileHintBubble = null;
    this.mobileBuildLabel = null;
    if (this.mobileHintTimeout) {
      window.clearTimeout(this.mobileHintTimeout);
      this.mobileHintTimeout = null;
    }
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

    const world = this.simulation.getWorld();
    this.camera.setViewTarget({ x: world.villageCenter.x + 0.5, y: world.villageCenter.y + 0.5 });
    this.selectedCitizen = null;
    this.hoveredCell = null;

    this.gameInitialized = true;
    this.updateRoleControls(true);
    this.refreshStructureSelection();
    this.updatePlanningHint();
    this.updateCitizenControlPanel();

    this.hud.setPauseButtonState(true);
    this.hud.updateStatus("▶️ Simulation in progress.");
  }

  private initializeAndStart() {
    this.mainMenu.hide();
    this.initializeGame();
    // The loop will continue automatically after closing the menu
  }

  private createMobileActionBar() {
    if (this.mobileActionBar) {
      return;
    }
    const bar = document.createElement("div");
    bar.id = "mobile-action-bar";
    bar.innerHTML = `
      <div class="mobile-action-row">
        <button type="button" data-mobile-mode="farm" aria-label="Crops" data-mobile-tip="Mark fertile zones for sowing.">🌾</button>
        <button type="button" data-mobile-mode="mine" aria-label="Mining" data-mobile-tip="Prioritize quarries and hills.">🪨</button>
        <button type="button" data-mobile-mode="gather" aria-label="Gathering" data-mobile-tip="Gather quick natural resources.">🍃</button>
        <button type="button" data-mobile-mode="build" class="mobile-build-button" aria-label="Construction" data-mobile-tip="Create building blueprints where you touch.">
          🧱 <span id="mobile-build-label">-</span>
        </button>
      </div>
      <div class="mobile-action-row mobile-secondary-row">
        <button type="button" data-mobile-action="prev-structure" aria-label="Previous building" data-mobile-tip="Switch to previous building.">◀</button>
        <button type="button" data-mobile-action="pause" aria-label="Pause or resume" data-mobile-tip="Pause or resume the simulation.">⏯️</button>
        <button type="button" data-mobile-action="next-structure" aria-label="Next building" data-mobile-tip="Switch to next building.">▶</button>
        <button type="button" data-mobile-action="zoom-out" aria-label="Zoom out" data-mobile-tip="Zoom out map.">−</button>
        <button type="button" data-mobile-action="zoom-in" aria-label="Zoom in" data-mobile-tip="Zoom in map.">+</button>
      </div>
      <div id="mobile-hint-bubble" aria-live="polite"></div>
    `;
    document.body.appendChild(bar);
    this.mobileActionBar = bar;
    this.mobileHintBubble = bar.querySelector<HTMLDivElement>("#mobile-hint-bubble");
    this.mobileBuildLabel = bar.querySelector<HTMLSpanElement>("#mobile-build-label");
    this.mobilePlanningButtons = {
      farm: bar.querySelector<HTMLButtonElement>('[data-mobile-mode="farm"]') ?? undefined,
      mine: bar.querySelector<HTMLButtonElement>('[data-mobile-mode="mine"]') ?? undefined,
      gather: bar.querySelector<HTMLButtonElement>('[data-mobile-mode="gather"]') ?? undefined,
      build: bar.querySelector<HTMLButtonElement>('[data-mobile-mode="build"]') ?? undefined,
    };
    this.registerMobileActionHandlers(bar);
  }

  private registerMobileActionHandlers(bar: HTMLDivElement) {
    const modeButtons = bar.querySelectorAll<HTMLButtonElement>("[data-mobile-mode]");
    modeButtons.forEach((btn) => {
      const mode = btn.dataset.mobileMode as PlanningMode | undefined;
      if (!mode) return;
      btn.addEventListener("click", () => {
        this.togglePlanningMode(mode);
        this.updateMobileHint(btn.dataset.mobileTip ?? `Mode ${mode}`);
      });
      this.attachMobileTip(btn, btn.dataset.mobileTip ?? "");
    });

    const prevButton = bar.querySelector<HTMLButtonElement>('[data-mobile-action="prev-structure"]');
    const nextButton = bar.querySelector<HTMLButtonElement>('[data-mobile-action="next-structure"]');
    const pauseButton = bar.querySelector<HTMLButtonElement>('[data-mobile-action="pause"]');
    const zoomInButton = bar.querySelector<HTMLButtonElement>('[data-mobile-action="zoom-in"]');
    const zoomOutButton = bar.querySelector<HTMLButtonElement>('[data-mobile-action="zoom-out"]');

    prevButton?.addEventListener("click", () => {
      this.activatePlanningMode("build");
      this.cycleStructure(-1);
      this.updateMobileHint("Previous building");
    });
    nextButton?.addEventListener("click", () => {
      this.activatePlanningMode("build");
      this.cycleStructure(1);
      this.updateMobileHint("Next building");
    });
    pauseButton?.addEventListener("click", () => {
      this.handlePauseToggle();
      this.updateMobileHint(this.running ? "▶️ Simulation in progress" : "⏸️ Paused");
    });
    zoomInButton?.addEventListener("click", () => {
      const anchor = this.hoveredCell ? { x: this.hoveredCell.x + 0.5, y: this.hoveredCell.y + 0.5 } : null;
      this.camera.adjustZoom(0.25, anchor ?? undefined);
      this.updateMobileHint("Zoom in map");
    });
    zoomOutButton?.addEventListener("click", () => {
      const anchor = this.hoveredCell ? { x: this.hoveredCell.x + 0.5, y: this.hoveredCell.y + 0.5 } : null;
      this.camera.adjustZoom(-0.25, anchor ?? undefined);
      this.updateMobileHint("Zoom out map");
    });

    [prevButton, nextButton, pauseButton, zoomInButton, zoomOutButton].forEach((btn) => {
      this.attachMobileTip(btn, btn?.dataset.mobileTip ?? "");
    });
  }

  private setupMobileTooltips() {
    if (!this.useMobileLayout) {
      return;
    }
    const tipTargets: Array<[HTMLElement | null, string]> = [
      [this.zoomInButton, "Zoom in map"],
      [this.zoomOutButton, "Zoom out map"],
      [this.structurePrevButton, "Previous building"],
      [this.structureNextButton, "Next building"],
      [this.planningHintLabel, "Choose a mode and paint over the map."],
    ];
    this.planningButtons.forEach((button) => {
      const mode = button.dataset.planningMode as PlanningMode | undefined;
      if (!mode) return;
      const defaultHints: Record<PlanningMode, string> = {
        farm: "Mark crop fields.",
        mine: "Mark mines and quarries.",
        gather: "Gather natural resources.",
        build: "Place building blueprints.",
      };
      tipTargets.push([button, defaultHints[mode]]);
    });
    tipTargets.forEach(([el, message]) => this.attachMobileTip(el, message));
  }

  private attachMobileTip(element: HTMLElement | null, message: string) {
    if (!element || !message) {
      return;
    }
    if ((element as HTMLElement).dataset.tipBound === "true") {
      return;
    }
    element.dataset.tipBound = "true";
    element.setAttribute("data-mobile-tip", message);
    element.addEventListener("pointerup", () => this.updateMobileHint(message));
    element.addEventListener("focus", () => this.updateMobileHint(message, true));
  }

  private updateMobileHint(text: string, sticky = false) {
    if (!this.useMobileLayout || !this.mobileHintBubble) {
      return;
    }
    this.mobileHintBubble.textContent = this.formatMobileHint(text);
    this.mobileHintBubble.classList.add("visible");
    if (this.mobileHintTimeout) {
      window.clearTimeout(this.mobileHintTimeout);
      this.mobileHintTimeout = null;
    }
    if (!sticky) {
      this.mobileHintTimeout = window.setTimeout(() => {
        this.mobileHintBubble?.classList.remove("visible");
      }, 2600);
    }
  }

  private formatMobileHint(text: string) {
    const trimmed = text.trim();
    if (trimmed.length <= 90) {
      return trimmed;
    }
    return `${trimmed.slice(0, 88)}…`;
  }

  start() {
    // Ya no se necesita porque el juego empieza automáticamente mostrando el menú
  }

  pause() {
    if (!this.gameInitialized) return; // Do not pause if game has not started
    this.running = false;
    this.hud.updateStatus("⏸️ Paused.");
    this.hud.setPauseButtonState(false);
  }

  resume() {
    if (!this.gameInitialized) return; // Do not resume if game has not started
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.hud.updateStatus("▶️ Simulation in progress.");
    this.hud.setPauseButtonState(true);
    requestAnimationFrame(this.loop);
  }

  private handlePauseToggle = () => {
    if (!this.gameInitialized) {
      // If game has not started, close menu and initialize
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
    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);
    this.canvas.addEventListener("touchcancel", this.handleTouchCancel);

    // Hide tooltip on scroll or resize
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
      this.logEvent(`Simulation speed ${multiplier}×`);
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

    // Setup hexagonal construction button event listeners
    const hexButtons = document.querySelectorAll<HTMLButtonElement>(".construction-hex-button");
    hexButtons.forEach((button) => {
      const structureType = button.dataset.structure as StructureType | undefined;
      if (!structureType) return;
      button.addEventListener("click", () => {
        // Activate build mode
        this.activatePlanningMode("build");
        // Set the selected structure
        this.selectedStructureType = structureType;
        // Update UI
        this.updateStructureDetails();
        this.updatePlanningHint();
      });
    });

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
    Object.entries(this.mobilePlanningButtons).forEach(([mode, button]) => {
      if (!button) return;
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
      this.setPlanningHint("Select a mode to start marking zones.");
      return;
    }
    if (this.planningPriority === "build") {
      if (!this.selectedStructureType) {
        this.setPlanningHint("No buildings available yet. Increase population to unlock them.");
      } else {
        this.setPlanningHint("Click on the map to place the blueprint of the selected building.");
      }
      return;
    }
    const labels: Record<Exclude<PlanningMode, "build">, string> = {
      farm: "Drag over the map to mark crop zones.",
      mine: "Paint over hills or mountains to prioritize mining.",
      gather: "Designate natural gathering zones for your workers.",
    };
    this.setPlanningHint(labels[this.planningPriority]);
  }

  private setPlanningHint(text: string) {
    if (!this.planningHintLabel) return;
    this.planningHintLabel.textContent = text;
    this.updateMobileHint(text, true);
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

    // Update hexagonal button states
    const hexButtons = document.querySelectorAll<HTMLButtonElement>(".construction-hex-button");
    hexButtons.forEach((button) => {
      const structureType = button.dataset.structure as StructureType | undefined;
      if (!structureType) return;

      // Enable/disable based on availability
      const isAvailable = this.availableStructures.includes(structureType);
      button.disabled = !isAvailable;

      // Add/remove selected class
      const isSelected = structureType === this.selectedStructureType;
      button.classList.toggle("selected", isSelected);
    });

    if (!this.selectedStructureType) {
      if (this.structureLabel) this.structureLabel.textContent = "None";
      if (this.structureStatusLabel) {
        this.structureStatusLabel.textContent = hasOptions
          ? "Select a building to start."
          : "Increase population to unlock buildings.";
      }
      if (this.buildDetailsContainer) {
        this.buildDetailsContainer.hidden = true;
      }
      if (this.buildDetailsSummary) {
        this.buildDetailsSummary.textContent = "Select a building to see its details.";
      }
      if (this.buildDetailsCost) {
        this.buildDetailsCost.textContent = "-";
      }
      if (this.buildDetailsRequirements) {
        this.buildDetailsRequirements.textContent = "-";
      }
      if (this.mobileBuildLabel) {
        this.mobileBuildLabel.textContent = "—";
        this.mobileBuildLabel.title = "No buildings available";
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
      this.structureStatusLabel.textContent = "Click on the map to plan this building.";
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
    if (this.mobileBuildLabel) {
      this.mobileBuildLabel.textContent = definition?.icon ?? "🧱";
      this.mobileBuildLabel.title = definition?.displayName ?? this.selectedStructureType;
    }
  }

  private formatStructureCosts(costs: { stone?: number; food?: number; wood?: number }) {
    const parts: string[] = [];
    if (costs.stone && costs.stone > 0) {
      parts.push(`${costs.stone} stone${costs.stone > 1 ? "s" : ""}`);
    }
    if (costs.food && costs.food > 0) {
      parts.push(`${costs.food} food`);
    }
    if (costs.wood && costs.wood > 0) {
      parts.push(`${costs.wood} wood${costs.wood > 1 ? "s" : ""}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "No cost";
  }

  private formatStructureRequirements(req: StructureRequirements) {
    const parts: string[] = [];
    if (req.population) {
      parts.push(`Population ${req.population}+`);
    }
    if (req.structures && req.structures.length > 0) {
      const names = req.structures
        .map((type) => getStructureDefinition(type)?.displayName ?? type)
        .join(", ");
      parts.push(`Structures: ${names}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "None";
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
      this.updatePlanningHint("No buildings unlocked yet.");
      return;
    }
    const result = this.simulation.planConstruction(this.selectedStructureType, cell);
    if (!result.ok) {
      this.updatePlanningHint(result.reason ?? "Could not place blueprint here.");
    } else {
      this.updatePlanningHint(`Blueprint placed at (${cell.x}, ${cell.y}).`);
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

    // If menu is visible, only render it
    if (this.mainMenu.isMenuVisible()) {
      this.mobileActionBar?.classList.add("is-hidden");
      this.mainMenu.render();
      // Prevent delta from exploding when closing the menu
      this.lastTime = time;
      requestAnimationFrame(this.loop);
      return;
    }
    this.mobileActionBar?.classList.remove("is-hidden");

    // If game is not initialized but menu closed, initialize now
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
  }

  private runTick(tickHours: number) {
    if (!this.gameInitialized || !this.simulation) return;

    const priority = this.pendingPriority;

    this.simulation.runTick(tickHours, {
      priority: priority ?? null,
    });

    this.pendingPriority = null;

    if (this.selectedCitizen?.state === "dead") {
      this.selectedCitizen = null;
    }

    this.hud.tickNotifications();
    this.updateRoleControls();
    this.updateHUD();
    this.updateCitizenControlPanel();
    this.refreshStructureSelection();
  }



  private updateHUD() {
    if (!this.gameInitialized || !this.simulation) return;
    const citizenSystem = this.simulation.getCitizenSystem();
    const world = this.simulation.getWorld();
    const citizens = citizenSystem.getCitizens();
    const livingPopulation = citizens.filter((citizen) => citizen.state === "alive").length;
    const hudSnapshot: HUDSnapshot = {
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
      wood: {
        value: world.stockpile.wood,
        capacity: world.stockpile.woodCapacity,
        trend: this.simulation.getResourceTrendAverage("wood"),
      },
      water: world.stockpile.water,
    };

    this.hud.updateHUD(hudSnapshot);
  }

  private updateCitizenControlPanel() {
    if (!this.simulation) return;
    const citizens = this.simulation.getCitizenSystem().getCitizens();
    const selectedId = this.selectedCitizen?.id ?? null;
    this.portraitBar.update(citizens, selectedId);

    // Update panel if it's visible and we have a selected citizen
    if (this.selectedCitizen) {
      this.citizenPanel.update();
    }
  }

  private handleExtinction = () => {
    if (this.extinctionAnnounced) {
      return;
    }
    this.extinctionAnnounced = true;
    this.hud.updateStatus("☠️ The tribe has vanished.");
    this.logEvent("All inhabitants have died. Use 'Download debug' to save the log.");
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
      this.logEvent("No events recorded to export.");
      return;
    }
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const header = `Debug log - ${now.toLocaleString()} (entries: ${entries.length})\n`;
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
    this.logEvent("Debug log exported.");
  };

  private logEvent(message: string, notificationType?: ToastNotification["type"]) {
    // Skip DEBUG messages completely - don't add to history
    if (message.startsWith("[DEBUG]")) {
      return;
    }

    this.hud.appendHistory(message);

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

    this.updateCitizenControlPanel();
  };

  private handleTouchStart = (event: TouchEvent) => {
    if (!this.gameInitialized || !this.canvas) {
      return;
    }
    if (event.touches.length === 0) {
      return;
    }
    this.hideTooltip();
    const primary = event.touches[0];
    if (!primary) return;
    this.touchStart = { x: primary.clientX, y: primary.clientY };
    this.touchLast = { x: primary.clientX, y: primary.clientY };
    this.touchMoved = false;
    this.isTouchPanning = false;

    if (event.touches.length === 2) {
      this.pinchStartDistance = this.getPinchDistance(event.touches);
      this.pinchStartZoom = this.camera.getZoom();
    } else if (this.planningPriority) {
      event.preventDefault();
      const pos = { x: primary.clientX, y: primary.clientY };
      this.handlePlanningTouch(pos);
    }
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    if (event.touches.length === 2) {
      event.preventDefault();
      this.handlePinchZoom(event);
      return;
    }
    const primary = event.touches[0];
    if (!primary) return;
    const current = { x: primary.clientX, y: primary.clientY };
    this.touchLast = current;
    const movedEnough = this.touchStart
      ? Math.hypot(current.x - this.touchStart.x, current.y - this.touchStart.y) > 6
      : false;
    this.touchMoved = this.touchMoved || movedEnough;

    if (this.planningStrokeActive && this.planningPriority && this.planningPriority !== "build") {
      const cell = this.camera.getCellUnderPointer({ clientX: current.x, clientY: current.y } as MouseEvent);
      if (cell) {
        this.hoveredCell = cell;
        this.applyPlanningAtCell(cell);
      }
      return;
    }

    if (!this.planningPriority) {
      if (movedEnough) {
        event.preventDefault();
        if (!this.camera) return;
        if (!this.isTouchPanning) {
          this.camera.startPanning(current);
          this.isTouchPanning = true;
        }
        this.camera.pan(current);
      }
      return;
    }
  };

  private handleTouchEnd = (event: TouchEvent) => {
    if (!this.gameInitialized) {
      return;
    }
    if (event.touches.length > 0) {
      return;
    }

    const last = this.touchLast;
    const moved = this.touchMoved;
    this.touchStart = null;
    this.touchLast = null;
    this.touchMoved = false;
    this.pinchStartDistance = null;
    this.pinchStartZoom = null;
    this.camera.stopPanning();
    this.isTouchPanning = false;

    if (!last) {
      return;
    }

    if (!moved) {
      const pseudoEvent = { clientX: last.x, clientY: last.y } as MouseEvent;
      if (!this.planningPriority) {
        this.handleCanvasClick(pseudoEvent);
      } else {
        this.planningStrokeActive = false;
        this.planningStrokeCells.clear();
      }
    } else if (this.planningPriority && this.planningStrokeActive) {
      this.planningStrokeActive = false;
      this.planningStrokeCells.clear();
    }
  };

  private handleTouchCancel = () => {
    this.touchStart = null;
    this.touchLast = null;
    this.touchMoved = false;
    this.pinchStartDistance = null;
    this.pinchStartZoom = null;
    this.camera.stopPanning();
    this.isTouchPanning = false;
    this.stopPanning();
  };

  private handlePlanningTouch(position: { x: number; y: number }) {
    const eventLike = { clientX: position.x, clientY: position.y } as MouseEvent;
    const cell = this.camera.getCellUnderPointer(eventLike);
    if (!cell) {
      return;
    }
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

  private handlePinchZoom(event: TouchEvent) {
    if (event.touches.length !== 2 || !this.gameInitialized) {
      return;
    }
    const dist = this.getPinchDistance(event.touches);
    if (this.pinchStartDistance === null) {
      this.pinchStartDistance = dist;
      this.pinchStartZoom = this.camera.getZoom();
      return;
    }
    if (!this.pinchStartZoom) {
      this.pinchStartZoom = this.camera.getZoom();
    }
    if (dist <= 0 || this.pinchStartDistance <= 0) {
      return;
    }
    const scale = dist / this.pinchStartDistance;
    const newZoom = this.pinchStartZoom * scale;
    const center = this.getPinchCenter(event.touches);
    const anchor = this.camera.getWorldPosition({ clientX: center.x, clientY: center.y } as MouseEvent);
    this.camera.setZoom(newZoom, anchor ?? undefined);
  }

  private getPinchDistance(touches: TouchList) {
    const a = touches[0];
    const b = touches[1];
    if (!a || !b) return 0;
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  private getPinchCenter(touches: TouchList) {
    const a = touches[0];
    const b = touches[1];
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  private handleCitizenPanelSelection = (citizenId: number) => {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    const citizen = this.simulation.getCitizenSystem().getCitizenById(citizenId) ?? null;
    this.selectedCitizen = citizen;
    if (citizen) {
      this.camera.focusOn({ x: citizen.x + 0.5, y: citizen.y + 0.5 });
    }
    this.updateCitizenControlPanel();
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
    this.cellTooltip.hide(); // Hide tooltip on zoom
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    this.camera.adjustZoom(delta);
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
      this.cellTooltip.hide(); // Hide tooltip on pan start
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
      this.camera.adjustZoom(0.2, hoverAnchor());
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
    const padding = this.useMobileLayout ? 12 : 32;
    const mobileOffset = this.useMobileLayout ? 96 : 0;
    const availableWidth = Math.max(0, wrapperRect.width - padding);
    const availableHeight = Math.max(0, wrapperRect.height - padding - mobileOffset);

    this.canvas.style.width = `${availableWidth}px`;
    this.canvas.style.height = `${availableHeight}px`;
    this.canvas.width = availableWidth;
    this.canvas.height = availableHeight;

    // Hide tooltip on resize
    this.cellTooltip.hide();
  };

  private handleCitizenSelection(citizenId: number) {
    if (!this.simulation) return;
    const citizen = this.simulation.getCitizenSystem().getCitizens().find((c) => c.id === citizenId);
    if (!citizen) return;

    this.selectedCitizen = citizen;
    this.citizenPanel.show(citizen);
    this.updateCitizenControlPanel();
  }

  private handlePanelClose() {
    this.selectedCitizen = null;
    this.updateCitizenControlPanel();
  }

  destroy() {
    this.cellTooltip.destroy();
    this.teardownMobileUI();
    this.mobileMediaQuery.removeEventListener("change", this.syncMobileLayout);
    window.removeEventListener("orientationchange", this.syncMobileLayout);
    // Clear other event listeners if necessary
  }

}
