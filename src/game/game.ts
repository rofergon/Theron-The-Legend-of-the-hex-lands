import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { clamp } from "./core/utils";
import type { Citizen, PriorityMark, Role, StructureType, ToastNotification, Vec2 } from "./core/types";
import { SimulationSession, type ThreatAlert, type SimulationVisualEvent } from "./core/SimulationSession";
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
import { convertFaithToHex, type TransactionStatus, getOnChainBalances, burnHexForRaidBlessing, type BurnResult } from "./wallet/hexConversionService";
import { isWalletConnected, connectOneWallet, getCurrentAccount, getWalletInstance } from "./wallet/walletConfig";

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
  private readonly cellTooltip: CellTooltipController;
  private readonly playerTribeId = 1;
  private simulation: SimulationSession | null = null;
  private readonly assignableRoles: AssignableRole[] = ["farmer", "worker", "warrior", "scout"];
  private roleControls: Record<AssignableRole, { input: HTMLInputElement | null; value: HTMLSpanElement | null }> = {
    farmer: { input: null, value: null },
    worker: { input: null, value: null },
    warrior: { input: null, value: null },
    scout: { input: null, value: null },
  };
  private devoteeControl: {
    input: HTMLInputElement | null;
    value: HTMLSpanElement | null;
    slots: HTMLSpanElement | null;
    help: HTMLParagraphElement | null;
  } = {
    input: document.querySelector<HTMLInputElement>("#role-devotee"),
    value: document.querySelector<HTMLSpanElement>("#role-value-devotee"),
    slots: document.querySelector<HTMLSpanElement>("#role-devotee-slots"),
    help: document.querySelector<HTMLParagraphElement>("#role-devotee-help"),
  };
  private readonly devoteeSlotsPerTemple = 3;
  private devoteeTarget = 0;
  private token1Pill = document.querySelector<HTMLDivElement>("#token1-pill");
  private tokenModal = document.querySelector<HTMLDivElement>("#token-modal");
  private tokenModalBackdrop = document.querySelector<HTMLDivElement>("#token-modal-backdrop");
  private tokenModalClose = document.querySelector<HTMLButtonElement>("#token-modal-close");
  private tokenModalCancel = document.querySelector<HTMLButtonElement>("#token-modal-cancel");
  private tokenModalConvertAll = document.querySelector<HTMLButtonElement>("#token-convert-all");
  private tokenModalFaithValue = document.querySelector<HTMLSpanElement>("#token-modal-faith");
  private tokenModalRate = document.querySelector<HTMLSpanElement>("#token-modal-rate");
  private tokenModalStatus = document.querySelector<HTMLParagraphElement>("#token-modal-status");
  private debugExportButton = document.querySelector<HTMLButtonElement>("#debug-export");
  private threatModal = document.querySelector<HTMLDivElement>("#threat-modal");
  private threatBackdrop = document.querySelector<HTMLDivElement>("#threat-modal-backdrop");
  private threatTitle = document.querySelector<HTMLHeadingElement>("#threat-modal-title");
  private threatSubtitle = document.querySelector<HTMLParagraphElement>("#threat-modal-subtitle");
  private threatIcons = document.querySelector<HTMLDivElement>("#threat-modal-icons");
  private threatCount = document.querySelector<HTMLSpanElement>("#threat-modal-count");
  private threatFocusButton = document.querySelector<HTMLButtonElement>("#threat-modal-focus");
  private threatCloseButton = document.querySelector<HTMLButtonElement>("#threat-modal-close");
  private threatResumeButton = document.querySelector<HTMLButtonElement>("#threat-modal-resume");
  private threatBurnButton = document.querySelector<HTMLButtonElement>("#threat-modal-burn");
  private extinctionAnnounced = false;
  private gameInitialized = false;
  private readonly camera: CameraController;

  private pendingPriority: PriorityMark | null = null;

  private selectedCitizen: Citizen | null = null;
  private hoveredCell: Vec2 | null = null;
  private planningPriority: PlanningMode | null = null;
  private planningStrokeActive = false;
  private planningStrokeCells = new Set<string>();
  private skipNextCanvasClick = false;
  private skipClickReset: number | null = null;
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
  private lastAdjustedRole: AssignableRole | null = null;
  private roleTargets: Record<AssignableRole, number> = {
    farmer: 0,
    worker: 0,
    warrior: 0,
    scout: 0,
  };
  private lastThreatFocus: Vec2 | null = null;
  private preThreatWarriors: number[] = [];
  private blessingApplied = false;
  private burningHex = false;
  private onChainBalances: { hex: number; theron: number } | null = null;
  private onChainBalanceInterval: number | null = null;
  private projectileAnimations: Array<{ from: Vec2; to: Vec2; spawnedAt: number; duration: number }> = [];
  private readonly projectileDurationMs = 650;

  constructor(private canvas: HTMLCanvasElement) {
    this.mobileMediaQuery = window.matchMedia("(max-width: 900px)");
    this.useMobileLayout = this.shouldUseMobileLayout();
    document.body.classList.toggle("is-mobile", this.useMobileLayout);

    this.renderer = new GameRenderer(canvas);
    this.cellTooltip = new CellTooltipController({
      onCancelConstruction: this.handleCancelConstruction,
      onClearPriority: this.handleClearPriority,
    });
    this.camera = new CameraController({ canvas, minZoom: this.minZoom, maxZoom: this.maxZoom }, () => this.simulation?.getWorld() ?? null);
    this.mainMenu = new MainMenu(canvas, { isMobile: this.useMobileLayout });
    this.camera.setViewTarget({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.hideOverlay(); // Hide the overlay immediately
    this.hud.updateStatus("🎮 Configure your world and press START");
    this.hud.setPauseButtonState(false); // Show button as if paused

    this.setupZoomControls();
    this.setupRoleControls();
    this.setupSpeedControls();
    this.setupPlanningControls();
    this.setupTokenUI();
    this.setupThreatModal();
    this.startOnChainBalancePolling();
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
      onThreat: this.handleThreatAlert,
    });
    this.simulation.initialize(config);
    this.extinctionAnnounced = false;

    const world = this.simulation.getWorld();
    this.camera.setViewTarget({ x: world.villageCenter.x + 0.5, y: world.villageCenter.y + 0.5 });
    this.selectedCitizen = null;
    this.hoveredCell = null;

    this.onChainBalances = null;
    this.gameInitialized = true;
    this.updateRoleControls(true);
    this.refreshStructureSelection();
    this.updatePlanningHint();
    this.updateCitizenControlPanel();
    // Si la wallet ya está conectada, sincronizar balances on-chain al arrancar
    void this.refreshOnChainBalances();

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
    // No longer needed because the game starts by showing the menu automatically
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
      const control = this.roleControls[role];
      if (control.input) {
        control.input.dataset.role = role;
        control.input.addEventListener("input", this.handleRoleSliderInput);
      }
    }

    this.devoteeControl.input?.addEventListener("input", this.handleDevoteeSliderInput);

    // Prime targets with the initial slider values so the UI reflects user intent, not current assignments.
    for (const role of this.assignableRoles) {
      const control = this.roleControls[role];
      const initial = Number.parseInt(control.input?.value ?? "0", 10);
      this.roleTargets[role] = Number.isFinite(initial) ? Math.max(0, initial) : 0;
    }

    this.updateRoleControls(true);
  }

  private setupSpeedControls() {
    const container = document.querySelector<HTMLDivElement>(".speed-controls-header");
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
    this.planningButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".planning-hex-button"));
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

  private setupTokenUI() {
    const open = (event?: KeyboardEvent | MouseEvent) => {
      if (event && event.type === "keydown") {
        const key = (event as KeyboardEvent).key;
        if (key !== "Enter" && key !== " ") return;
        event.preventDefault();
      }
      this.openTokenModal();
    };
    this.token1Pill?.addEventListener("click", open);
    this.token1Pill?.addEventListener("keydown", open);
    this.tokenModalConvertAll?.addEventListener("click", this.convertAllFaithToToken1);
    this.tokenModalClose?.addEventListener("click", this.closeTokenModal);
    this.tokenModalCancel?.addEventListener("click", this.closeTokenModal);
    this.tokenModalBackdrop?.addEventListener("click", this.closeTokenModal);
  }

  private setupThreatModal() {
    const close = (resumeAfter?: boolean) => {
      this.threatModal?.classList.add("hidden");
      this.threatBackdrop?.classList.add("hidden");
      if (resumeAfter) {
        this.resume();
      }
    };

    const focus = () => {
      if (this.lastThreatFocus) {
        this.camera.focusOn(this.lastThreatFocus);
      }
    };

    this.threatBackdrop?.addEventListener("click", () => close(false));
    this.threatCloseButton?.addEventListener("click", () => close(false));
    this.threatResumeButton?.addEventListener("click", () => close(true));
    this.threatFocusButton?.addEventListener("click", () => {
      focus();
      this.hud.updateStatus("Centered on threat. Game paused.");
    });
    this.threatBurnButton?.addEventListener("click", this.handleThreatBurn);
  }

  private handleRoleSliderInput = (event: Event) => {
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    const role = this.getRoleFromEvent(event);
    if (role) {
      this.lastAdjustedRole = role;
      const targetInput = event.target as HTMLInputElement | null;
      const rawValue = targetInput ? Number.parseInt(targetInput.value ?? "0", 10) : 0;
      this.roleTargets[role] = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    }
    const assignable = this.simulation.getCitizenSystem().getAssignablePopulationCount(this.playerTribeId, true);
    const normalized = this.normalizeRoleTargets(this.roleTargets, assignable, this.lastAdjustedRole ?? undefined);
    this.roleTargets = normalized;
    const finalTargets = this.simulation
      .getCitizenSystem()
      .rebalanceRoles(normalized, this.playerTribeId, this.lastAdjustedRole ?? undefined);
    this.roleTargets = finalTargets;
    this.updateRoleControls(true);
  };

  private getRoleFromEvent(event: Event): AssignableRole | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }
    const datasetRole = target.dataset.role as AssignableRole | undefined;
    if (datasetRole && this.assignableRoles.includes(datasetRole)) {
      return datasetRole;
    }
    return this.assignableRoles.find((role) => this.roleControls[role].input === target) ?? null;
  }

  private handleDevoteeSliderInput = () => {
    if (!this.simulation) {
      this.updateDevoteeControl(true);
      return;
    }
    const input = this.devoteeControl.input;
    if (!input) return;

    const requested = Number.parseInt(input.value ?? "0", 10) || 0;
    this.devoteeTarget = Math.max(0, requested);
    const assigned = this.simulation.getCitizenSystem().setDevoteeTarget(this.devoteeTarget, this.playerTribeId);

    this.updateRoleControls(true);
    this.updateDevoteeControl(true);

    if (input.disabled) {
      this.hud.updateStatus("Build a temple to enable devotees.");
      return;
    }
    const maxSlots = Number.parseInt(input.max ?? "0", 10) || 0;
    this.hud.updateStatus(`Devotees assigned: ${assigned}/${Math.max(maxSlots, this.devoteeTarget)}`);
  };

  private collectRoleTargets() {
    return { ...this.roleTargets };
  }

  private normalizeRoleTargets(
    targets: Record<AssignableRole, number>,
    available: number,
    priorityRole?: AssignableRole | null,
  ): Record<AssignableRole, number> {
    const normalized: Record<AssignableRole, number> = {
      farmer: Math.max(0, Math.floor(targets.farmer ?? 0)),
      worker: Math.max(0, Math.floor(targets.worker ?? 0)),
      warrior: Math.max(0, Math.floor(targets.warrior ?? 0)),
      scout: Math.max(0, Math.floor(targets.scout ?? 0)),
    };

    if (available <= 0) {
      return { farmer: 0, worker: 0, warrior: 0, scout: 0 };
    }

    const totalRequested = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (totalRequested <= available) {
      return normalized;
    }

    const finalTargets: Record<AssignableRole, number> = {
      farmer: 0,
      worker: 0,
      warrior: 0,
      scout: 0,
    };

    if (priorityRole && this.assignableRoles.includes(priorityRole)) {
      // Keep the last-adjusted role intact, scale the rest to fit.
      finalTargets[priorityRole] = Math.min(normalized[priorityRole], available);
      const remainingSlots = Math.max(available - finalTargets[priorityRole], 0);
      const otherRoles = this.assignableRoles.filter((role) => role !== priorityRole);
      const requestedOthers = otherRoles.reduce((sum, role) => sum + normalized[role], 0);

      if (remainingSlots > 0 && requestedOthers > 0) {
        const scale = remainingSlots / requestedOthers;
        let assigned = finalTargets[priorityRole];

        for (const role of otherRoles) {
          finalTargets[role] = Math.floor(normalized[role] * scale);
          assigned += finalTargets[role];
        }

        for (const role of otherRoles) {
          if (assigned >= available) break;
          if (finalTargets[role] < normalized[role]) {
            finalTargets[role] += 1;
            assigned += 1;
          }
        }
      }

      return finalTargets;
    }

    const scale = available / totalRequested;
    let assigned = 0;
    for (const role of this.assignableRoles) {
      finalTargets[role] = Math.floor(normalized[role] * scale);
      assigned += finalTargets[role];
    }

    for (const role of this.assignableRoles) {
      if (assigned >= available) break;
      if (finalTargets[role] < normalized[role]) {
        finalTargets[role] += 1;
        assigned += 1;
      }
    }

    return finalTargets;
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
      const isSelectedAvailable = this.selectedStructureType
        ? this.availableStructures.includes(this.selectedStructureType)
        : false;
      if (!this.selectedStructureType) {
        this.setPlanningHint("No buildings available yet. Increase population to unlock them.");
      } else if (!isSelectedAvailable) {
        this.setPlanningHint("Building locked. Meet the requirements to plan it.");
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

  private suppressNextCanvasClick(delayMs = 400) {
    this.skipNextCanvasClick = true;
    if (this.skipClickReset !== null) {
      window.clearTimeout(this.skipClickReset);
    }
    this.skipClickReset = window.setTimeout(() => {
      this.skipNextCanvasClick = false;
      this.skipClickReset = null;
    }, delayMs);
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
    if (!this.selectedStructureType && this.availableStructures.length > 0) {
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
    const hasOptions = this.availableStructures.length > 0 || !!this.selectedStructureType;
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

      const isAvailable = this.availableStructures.includes(structureType);
      button.disabled = false;
      button.classList.toggle("locked", !isAvailable);
      button.setAttribute("aria-disabled", isAvailable ? "false" : "true");

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
    const isSelectedAvailable = this.selectedStructureType
      ? this.availableStructures.includes(this.selectedStructureType)
      : false;
    if (this.structureLabel) {
      if (definition) {
        this.structureLabel.textContent = `${definition.icon} ${definition.displayName}`;
      } else {
        this.structureLabel.textContent = this.selectedStructureType;
      }
    }
    if (this.structureStatusLabel) {
      this.structureStatusLabel.textContent = isSelectedAvailable
        ? "Click on the map to plan this building."
        : "Locked: meet requirements to plan this building.";
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
      const message = "No buildings unlocked yet.";
      this.hud.updateStatus(message);
      this.updatePlanningHint(message);
      this.clearPlanningMode();
      return;
    }
    const result = this.simulation.planConstruction(this.selectedStructureType, cell);
    const message = result.ok
      ? `Blueprint placed at (${cell.x}, ${cell.y}).`
      : result.reason ?? "Could not place blueprint here.";
    this.hud.updateStatus(message);
    this.updatePlanningHint(message);
    this.clearPlanningMode();
  }

  private handleCancelConstruction = (siteId: number) => {
    if (!this.simulation) return;
    const result = this.simulation.cancelConstruction(siteId, { reclaimMaterials: true });
    if (!result.ok) {
      this.hud.updateStatus(result.reason ?? "Could not cancel construction.");
      return;
    }
    const parts: string[] = [];
    if (result.stoneReturned && result.stoneReturned > 0) {
      parts.push(`${result.stoneReturned} stone`);
    }
    if (result.woodReturned && result.woodReturned > 0) {
      parts.push(`${result.woodReturned} wood`);
    }
    const reclaimed = parts.length > 0 ? ` Materials reclaimed: ${parts.join(", ")}.` : "";
    this.hud.updateStatus(`Construction canceled.${reclaimed}`.trim());
    this.updateHUD();
    this.refreshStructureSelection();
    this.cellTooltip.hide();
  };

  private handleClearPriority = (cell: Vec2) => {
    if (!this.simulation) return;
    const result = this.simulation.clearPriorityAt(cell);
    this.hud.updateStatus(
      result.ok ? `Designation cleared at (${cell.x}, ${cell.y}).` : result.reason ?? "Could not clear designation.",
    );
    this.cellTooltip.hide();
  };

  private planningCellKey(cell: Vec2) {
    return `${cell.x},${cell.y}`;
  }

  private updateRoleControls(force = false) {
    if (!this.simulation) {
      return;
    }
    const citizenSystem = this.simulation.getCitizenSystem();
    const assignable = citizenSystem.getAssignablePopulationCount(this.playerTribeId, true);
    this.roleTargets = this.normalizeRoleTargets(this.roleTargets, assignable, this.lastAdjustedRole);
    for (const role of this.assignableRoles) {
      const control = this.roleControls[role];
      const currentTarget = Number.isFinite(this.roleTargets[role]) ? this.roleTargets[role] : 0;
      const clampedTarget = Math.max(0, Math.min(currentTarget, assignable));
      this.roleTargets[role] = clampedTarget;

      if (control.value) {
        control.value.textContent = clampedTarget.toString();
      }
      if (control.input) {
        control.input.max = Math.max(assignable, 0).toString();
        if (force || document.activeElement !== control.input) {
          control.input.value = clampedTarget.toString();
        }
      }
    }
    this.updateDevoteeControl(force);
  }

  private updateDevoteeControl(force = false) {
    if (!this.simulation) {
      return;
    }
    const { input, value, slots, help } = this.devoteeControl;
    if (!input) {
      return;
    }
    const world = this.simulation.getWorld();
    const citizenSystem = this.simulation.getCitizenSystem();
    const templeCount = typeof world.getStructureCount === "function" ? world.getStructureCount("temple") : 0;
    const maxSlots = Math.max(templeCount * this.devoteeSlotsPerTemple, 0);
    const assignable = citizenSystem.getAssignablePopulationCount(this.playerTribeId);
    const effectiveMax = Math.min(maxSlots, assignable);
    const currentRaw = Number.parseInt(input.value ?? "0", 10);
    const desired = Math.max(0, Math.min(Number.isFinite(currentRaw) ? currentRaw : 0, effectiveMax));
    this.devoteeTarget = desired;

    const assigned = citizenSystem.setDevoteeTarget(desired, this.playerTribeId);

    input.max = maxSlots.toString();
    input.disabled = maxSlots === 0 || assignable === 0;
    const displayValue = input.disabled ? 0 : desired;
    if (input.disabled) {
      input.value = "0";
    } else if (force || displayValue !== currentRaw) {
      input.value = displayValue.toString();
    }

    if (value) {
      value.textContent = input.value;
    }

    if (slots) {
      slots.textContent = `${assigned}/${maxSlots}`;
    }

    if (help) {
      help.textContent =
        maxSlots === 0
          ? "Build a temple to enable devotees."
          : assignable === 0
            ? "No assignable inhabitants available."
            : `Available devotee slots: ${maxSlots}`;
    }
  }

  private openTokenModal = () => {
    if (!this.simulation || !this.tokenModal || !this.tokenModalBackdrop) {
      return;
    }
    this.updateTokenModalStats();
    this.tokenModal.classList.remove("hidden");
    this.tokenModalBackdrop.classList.remove("hidden");
  };

  private closeTokenModal = () => {
    this.tokenModal?.classList.add("hidden");
    this.tokenModalBackdrop?.classList.add("hidden");
  };

  private handleThreatAlert = (alert: ThreatAlert) => {
    this.burningHex = false;
    this.preThreatWarriors = this.captureWarriorIds();
    this.blessingApplied = false;
    this.pause();
    this.populateThreatModal(alert);
    this.focusOnThreat(alert);
  };

  private populateThreatModal(alert: ThreatAlert) {
    if (!this.threatModal || !this.threatBackdrop) return;
    this.threatModal.classList.remove("hidden");
    this.threatBackdrop.classList.remove("hidden");

    const icon = alert.flavor === "beast" ? "🐺" : alert.icon || "⚔️";

    if (this.threatTitle) {
      this.threatTitle.textContent = `${icon} ${alert.tribeName} attack`;
    }
    if (this.threatSubtitle) {
      this.threatSubtitle.textContent =
        alert.flavor === "raid"
          ? "Hostile raiders have appeared at the edge of your lands."
          : "Wild beasts have entered the valley. Prepare defenses.";
    }
    if (this.threatCount) {
      this.threatCount.textContent = `${alert.attackers} enemy units detected`;
    }
    if (this.threatIcons) {
      this.threatIcons.innerHTML = "";
      const count = Math.min(alert.attackers, 12);
      for (let i = 0; i < count; i += 1) {
        const badge = document.createElement("span");
        badge.className = "threat-icon";
        badge.textContent = icon;
        this.threatIcons.appendChild(badge);
      }
    }
    if (this.threatBurnButton) {
      this.threatBurnButton.textContent = this.blessingApplied ? "Blessing applied" : "Burn 20 HEX & bless warriors";
      this.threatBurnButton.disabled = this.blessingApplied || this.burningHex;
    }
    this.hud.updateStatus("⚠️ Invasion detected. Game paused.");
  }

  private focusOnThreat(alert: ThreatAlert) {
    if (!alert.spawn || alert.spawn.length === 0) {
      this.lastThreatFocus = null;
      return;
    }
    const center = alert.spawn.reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 },
    );
    const focusPoint = {
      x: center.x / alert.spawn.length,
      y: center.y / alert.spawn.length,
    };
    this.lastThreatFocus = focusPoint;
    this.camera.focusOn(focusPoint);
    this.draw();
  }

  private handleThreatBurn = async () => {
    if (this.burningHex || this.blessingApplied) return;
    this.burningHex = true;
    if (this.threatBurnButton) {
      this.threatBurnButton.disabled = true;
      this.threatBurnButton.textContent = "Burning 20 HEX...";
    }
    const statusUpdate = (status: TransactionStatus, message?: string) => {
      if (message) {
        this.hud.updateStatus(message);
      }
    };
    const result: BurnResult = await burnHexForRaidBlessing(statusUpdate);
    this.burningHex = false;
    if (this.threatBurnButton) {
      this.threatBurnButton.textContent = this.blessingApplied ? "Blessing applied" : "Burn 20 HEX & bless warriors";
      this.threatBurnButton.disabled = this.blessingApplied;
    }
    if (!result.success) {
      this.hud.updateStatus(result.error ?? "HEX burn failed.");
      this.hud.showNotification(result.error ?? "HEX burn failed", "critical");
      return;
    }
    this.applyWarriorBlessing();
    this.hud.showNotification("HEX burned. Warriors blessed with +20% resistance.", "success");
  };

  private captureWarriorIds() {
    if (!this.simulation) return [];
    return this.simulation
      .getCitizenSystem()
      .getCitizens()
      .filter((c) => c.state === "alive" && c.role === "warrior" && c.tribeId === this.playerTribeId)
      .map((c) => c.id);
  }

  private applyWarriorBlessing() {
    if (!this.simulation) return;
    const citizens = this.simulation.getCitizenSystem().getCitizens();
    let boosted = 0;
    for (const citizen of citizens) {
      if (citizen.state !== "alive") continue;
      if (citizen.role !== "warrior") continue;
      if (!this.preThreatWarriors.includes(citizen.id)) continue;
      citizen.damageResistance = Math.max(citizen.damageResistance ?? 0, 0.2);
      citizen.health = clamp(citizen.health * 1.2, -50, 100);
      citizen.hexBlessed = true;
      boosted += 1;
    }
    this.hud.updateStatus(
      boosted > 0
        ? `🔥 Warriors blessed: ${boosted} reinforced with +20% resistance.`
        : "No existing warriors to bless.",
    );
    this.blessingApplied = boosted > 0;
  }

  private updateTokenModalStats() {
    if (!this.simulation) return;
    const faith = this.simulation.getFaithSnapshot().value;
    const rate = this.simulation.getFaithConversionRate();
    if (this.tokenModalFaithValue) {
      this.tokenModalFaithValue.textContent = Math.floor(faith).toString();
    }
    if (this.tokenModalRate) {
      this.tokenModalRate.textContent = `${rate} Faith → 1 HEX`;
    }
    if (this.tokenModalStatus) {
      if (faith <= 0) {
        this.tokenModalStatus.textContent = "No stored Faith to convert.";
      } else if (!isWalletConnected()) {
        this.tokenModalStatus.textContent = "Connect your OneWallet to convert Faith to HEX on-chain.";
      } else {
        this.tokenModalStatus.textContent = "Convert your Faith to HEX tokens on OneChain.";
      }
    }
  }

  private async refreshOnChainBalances() {
    // Usar la cuenta actual si existe; si no, intentar la primera cuenta visible de la wallet
    const current = getCurrentAccount();
    const fallbackAccount = getWalletInstance()?.accounts?.[0];
    const account = current ?? fallbackAccount ?? null;
    if (!account?.address) return;
    try {
      const { hex, theron } = await getOnChainBalances(account.address);
      const token1El = document.querySelector<HTMLSpanElement>("#token1-value");
      const token2El = document.querySelector<HTMLSpanElement>("#token2-value");
      if (token1El) token1El.textContent = hex.toFixed(2);
      if (token2El) token2El.textContent = theron.toFixed(2);
      this.onChainBalances = { hex, theron };
      this.updateHUD();
    } catch (error) {
      console.warn("No se pudo refrescar balances on-chain:", error);
    }
  }

  private startOnChainBalancePolling() {
    if (this.onChainBalanceInterval !== null) return;
    this.onChainBalanceInterval = window.setInterval(() => {
      void this.refreshOnChainBalances();
    }, 30_000);
  }

  private convertAllFaithToToken1 = async () => {
    if (!this.simulation) {
      return;
    }

    // Obtener la cantidad de Faith disponible
    const faithAmount = Math.floor(this.simulation.getFaithSnapshot().value);
    
    if (faithAmount <= 0) {
      this.hud.updateStatus("No Faith available to convert.");
      this.closeTokenModal();
      return;
    }

    // Verificar si la wallet está conectada
    if (!isWalletConnected()) {
      if (this.tokenModalStatus) {
        this.tokenModalStatus.textContent = "Connecting wallet...";
      }
      
      const connection = await connectOneWallet();
      if (!connection.success) {
        if (this.tokenModalStatus) {
          this.tokenModalStatus.textContent = connection.error || "Error connecting wallet";
        }
        this.hud.showNotification("Could not connect wallet", "critical");
        return;
      }
      
      this.hud.showNotification("Wallet connected successfully", "success");
      await this.refreshOnChainBalances();
    }

    // Actualizar estado en el modal
    const updateModalStatus = (status: TransactionStatus, message?: string) => {
      if (this.tokenModalStatus) {
        const statusMessages: Record<TransactionStatus, string> = {
          'idle': 'Preparing...',
          'connecting-wallet': 'Connecting wallet...',
          'building-transaction': 'Preparing transaction...',
          'signing': '✍️ Please sign the transaction in OneWallet',
          'executing': '⏳ Executing transaction on OneChain...',
          'confirming': '🔄 Confirming...',
          'success': '✅ Conversion successful!',
          'error': '❌ Transaction error',
        };
        this.tokenModalStatus.textContent = message || statusMessages[status];
      }
    };

    // Deshabilitar el botón durante la transacción
    if (this.tokenModalConvertAll) {
      this.tokenModalConvertAll.disabled = true;
      this.tokenModalConvertAll.textContent = "Procesando...";
    }

    try {
      // Llamar al servicio de conversión con firma de wallet
      const result = await convertFaithToHex(faithAmount, updateModalStatus);

      if (result.success && result.hexReceived) {
        // Actualizar el estado del juego (restar la Faith gastada)
        const gameResult = this.simulation.convertFaithToToken1();
        
        this.logEvent(
          `✨ Convertiste ${result.faithSpent} Faith en ${result.hexReceived} HEX tokens on-chain. ` +
          `TX: ${result.transactionDigest?.slice(0, 10)}...`
        );
        this.hud.showNotification(
          `¡${result.hexReceived} HEX tokens recibidos!`,
          "success",
          6000
        );
        this.showConversionSuccessAnimation(result.hexReceived);
        await this.refreshOnChainBalances();
        this.updateHUD();
        
        // Cerrar modal después de 2 segundos
        setTimeout(() => {
          this.closeTokenModal();
        }, 2000);
      } else {
        this.hud.showNotification(
          result.error || "Error al convertir Faith a HEX",
          "critical",
          5000
        );
      }
    } catch (error: any) {
      console.error("Error en convertAllFaithToToken1:", error);
      if (this.tokenModalStatus) {
        this.tokenModalStatus.textContent = `Error: ${error.message || 'Error desconocido'}`;
      }
      this.hud.showNotification("Error al convertir Faith a HEX", "critical");
    } finally {
      // Rehabilitar el botón
      if (this.tokenModalConvertAll) {
        this.tokenModalConvertAll.disabled = false;
        this.tokenModalConvertAll.textContent = "Convert all";
      }
    }
  };

  private showConversionSuccessAnimation(hexAmount: number) {
    if (!this.tokenModal) return;
    const anim = document.createElement("div");
    anim.className = "conversion-success-anim";
    anim.innerHTML = `
      <div class="fireworks">
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
      </div>
      <div class="coin-3d">
        <div class="face front"><img src="/assets/extracted_icons/Hex_Token.png" alt="HEX token" /></div>
        <div class="face back"><img src="/assets/extracted_icons/Hex_Token.png" alt="HEX token" /></div>
        <div class="edge"></div>
      </div>
      <div class="celebrate-text">+${hexAmount.toFixed(2)} HEX</div>
    `;
    this.tokenModal.appendChild(anim);
    setTimeout(() => anim.remove(), 4000);
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
    const visualEvents = this.simulation.consumeVisualEvents();
    if (visualEvents.length > 0) {
      this.enqueueProjectileVisuals(visualEvents);
    }

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

  private enqueueProjectileVisuals(events: SimulationVisualEvent[]) {
    const now = performance.now();
    events.forEach((event) => {
      if (event.type === "towerProjectile") {
        this.projectileAnimations.push({
          from: event.from,
          to: event.to,
          spawnedAt: now,
          duration: this.projectileDurationMs,
        });
      }
    });
  }

  private collectProjectileFrames(): RenderState["projectiles"] {
    const now = performance.now();
    const active: typeof this.projectileAnimations = [];
    const frames: RenderState["projectiles"] = [];

    this.projectileAnimations.forEach((projectile) => {
      const progress = (now - projectile.spawnedAt) / projectile.duration;
      if (progress <= 1) {
        frames.push({
          from: projectile.from,
          to: projectile.to,
          progress: clamp(progress, 0, 1),
        });
        active.push(projectile);
      }
    });

    this.projectileAnimations = active;
    return frames;
  }



  private updateHUD() {
    if (!this.gameInitialized || !this.simulation) return;
    const citizenSystem = this.simulation.getCitizenSystem();
    const world = this.simulation.getWorld();
    const citizens = citizenSystem.getCitizens();
    const livingPopulation = citizens.filter((citizen) => citizen.state === "alive").length;
    const tokenSnapshot = this.onChainBalances
      ? { token1: this.onChainBalances.hex, token2: this.onChainBalances.theron }
      : this.simulation.getTokens();
    const hudSnapshot: HUDSnapshot = {
      faith: this.simulation.getFaithSnapshot(),
      tokens: tokenSnapshot,
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
    link.download = `guardian-spirit-debug-${timestamp}.txt`;
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

    const normalizedMessage = message.toLowerCase();

    this.hud.appendHistory(message);

    if (notificationType) {
      this.hud.showNotification(message, notificationType);
    } else if (normalizedMessage.includes("dead") || normalizedMessage.includes("beast") || normalizedMessage.includes("hostile")) {
      this.hud.showNotification(message, "critical");
    } else if (normalizedMessage.includes("famine") || normalizedMessage.includes("drought") || normalizedMessage.includes("without")) {
      this.hud.showNotification(message, "warning");
    } else if (normalizedMessage.includes("born") || normalizedMessage.includes("blessed") || normalizedMessage.includes("rain")) {
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
      projectiles: this.collectProjectileFrames(),
      view: this.camera.getViewMetrics(),
    };

    this.renderer.render(renderState);
  }

  private handleCanvasClick = (event: MouseEvent) => {
    if (this.skipNextCanvasClick) {
      this.skipNextCanvasClick = false;
      if (this.skipClickReset !== null) {
        window.clearTimeout(this.skipClickReset);
        this.skipClickReset = null;
      }
      return;
    }
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
        this.suppressNextCanvasClick();
      }
    } else if (this.planningPriority && this.planningStrokeActive) {
      this.planningStrokeActive = false;
      this.planningStrokeCells.clear();
      this.suppressNextCanvasClick();
    }

    if (this.planningPriority && this.planningPriority !== "build") {
      this.clearPlanningMode();
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
    const site = cell.constructionSiteId ? this.simulation.getWorld().getConstructionSite(cell.constructionSiteId) : null;

    const citizensInCell = this.simulation
      .getCitizenSystem()
      .getCitizens()
      .filter((citizen) => citizen.state === "alive" && citizen.x === cellPos.x && citizen.y === cellPos.y);

    this.cellTooltip.show({
      cell,
      citizens: citizensInCell,
      position: { x: event.clientX, y: event.clientY },
      constructionSite: site,
    });
  }

  private handleCanvasLeave = (event?: MouseEvent) => {
    if (this.cellTooltip.isPointerOver(event?.relatedTarget)) {
      return;
    }
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
        this.suppressNextCanvasClick(); // Ignore the click event fired right after painting.
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
      this.suppressNextCanvasClick();
      if (this.planningPriority && this.planningPriority !== "build") {
        this.clearPlanningMode();
      }
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
