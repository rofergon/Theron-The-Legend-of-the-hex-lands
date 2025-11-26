import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { clamp } from "./core/utils";
import type { Citizen, PriorityMark, Role, ToastNotification, Vec2 } from "./core/types";
import { SimulationSession, type ThreatAlert, type SimulationVisualEvent } from "./core/SimulationSession";
import { CameraController } from "./core/CameraController";
import { HUDController, type HUDSnapshot } from "./ui/HUDController";
import { CitizenPortraitBarController } from "./ui/CitizenPortraitBar";
import { CitizenControlPanelController } from "./ui/CitizenControlPanel";
import { GameRenderer, type RenderState } from "./ui/GameRenderer";
import { MainMenu } from "./ui/MainMenu";
import { CellTooltipController } from "./ui/CellTooltip";
import { PlanningController } from "./controllers/PlanningController";
import { TokenController } from "./controllers/TokenController";
import { burnHexForRaidBlessing, type BurnResult, type TransactionStatus } from "./wallet/hexConversionService";

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;

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
  private readonly planning: PlanningController;
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
  private readonly tokens: TokenController;
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

  private readonly minZoom = 2;
  private readonly maxZoom = 10;
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private speedButtons: HTMLButtonElement[] = [];
  private speedMultiplier = 1;
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
  private projectileAnimations: Array<{ from: Vec2; to: Vec2; spawnedAt: number; duration: number }> = [];
  private readonly projectileDurationMs = 650;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.cellTooltip = new CellTooltipController({
      onCancelConstruction: this.handleCancelConstruction,
      onClearPriority: this.handleClearPriority,
    });
    this.camera = new CameraController({ canvas, minZoom: this.minZoom, maxZoom: this.maxZoom }, () => this.simulation?.getWorld() ?? null);
    this.mainMenu = new MainMenu(canvas, { isMobile: false });
    this.planning = new PlanningController({
      hud: this.hud,
      camera: this.camera,
      mainMenu: this.mainMenu,
      getSimulation: () => this.simulation,
      onPauseToggle: this.handlePauseToggle,
      onResize: this.handleResize,
      getHoveredCell: () => this.hoveredCell,
      isRunning: () => this.running,
    });
    this.tokens = new TokenController({
      hud: this.hud,
      getSimulation: () => this.simulation,
      logEvent: (message, notificationType) => this.logEvent(message, notificationType),
      onBalancesChanged: () => this.updateHUD(),
    });
    this.camera.setViewTarget({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.hideOverlay(); // Hide the overlay immediately
    this.hud.updateStatus("🎮 Configure your world and press START");
    this.hud.setPauseButtonState(false); // Show button as if paused

    this.planning.registerZoomButtons(this.zoomInButton, this.zoomOutButton);
    this.setupZoomControls();
    this.setupRoleControls();
    this.setupSpeedControls();
    this.planning.init();
    this.tokens.init();
    this.setupThreatModal();
    this.bindCanvasEvents();
    this.debugExportButton?.addEventListener("click", this.exportDebugLog);

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("blur", this.stopPanning);
    this.handleResize();

    // Start the render loop immediately to show the menu
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
      onThreat: this.handleThreatAlert,
    });
    this.simulation.initialize(config);
    this.extinctionAnnounced = false;

    const world = this.simulation.getWorld();
    this.camera.setViewTarget({ x: world.villageCenter.x + 0.5, y: world.villageCenter.y + 0.5 });
    this.selectedCitizen = null;
    this.hoveredCell = null;

    this.tokens.resetBalances();
    this.gameInitialized = true;
    this.updateRoleControls(true);
    this.planning.refreshStructureSelection();
    this.planning.updatePlanningHint();
    this.updateCitizenControlPanel();
    // Si la wallet ya está conectada, sincronizar balances on-chain al arrancar
    void this.tokens.refreshOnChainBalances();

    this.hud.setPauseButtonState(true);
    this.hud.updateStatus("▶️ Simulation in progress.");
  }

  private initializeAndStart() {
    this.mainMenu.hide();
    this.initializeGame();
    // The loop will continue automatically after closing the menu
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
    this.planning.refreshStructureSelection();
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
  private loop = (time: number) => {
    if (!this.running) return;

    // If menu is visible, only render it
    if (this.mainMenu.isMenuVisible()) {
      this.planning.setActionBarHidden(true);
      this.mainMenu.render();
      // Prevent delta from exploding when closing the menu
      this.lastTime = time;
      requestAnimationFrame(this.loop);
      return;
    }
    this.planning.setActionBarHidden(false);

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
      this.planning.togglePlanningMode("farm");
    }
    if (this.input.consumeKey("KeyM")) {
      this.planning.togglePlanningMode("mine");
    }
    if (this.input.consumeKey("KeyG")) {
      this.planning.togglePlanningMode("gather");
    }
    if (this.input.consumeKey("KeyB")) {
      this.planning.togglePlanningMode("build");
    }
    if (this.input.consumeKey("Escape")) {
      this.planning.clearPlanningMode();
    }
    if (this.planning.isBuildMode()) {
      if (this.input.consumeKey("BracketLeft")) {
        this.planning.cycleStructure(-1);
      }
      if (this.input.consumeKey("BracketRight")) {
        this.planning.cycleStructure(1);
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
    this.planning.refreshStructureSelection();
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
    const tokenSnapshot = this.tokens.getTokenSnapshot() ?? this.simulation.getTokens();
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
    if (this.planning.consumeSkippedClick()) {
      return;
    }
    if (!this.gameInitialized || !this.simulation) {
      return;
    }
    if (this.planning.isActive()) {
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
    } else if (this.planning.isActive()) {
      event.preventDefault();
      const pos = { x: primary.clientX, y: primary.clientY };
      this.planning.handlePlanningTouch(pos);
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

    const planningActive = this.planning.isActive();
    const strokeActive = this.planning.isStrokeActive();
    const buildMode = this.planning.isBuildMode();

    if (strokeActive && planningActive && !buildMode) {
      const cell = this.camera.getCellUnderPointer({ clientX: current.x, clientY: current.y } as MouseEvent);
      if (cell) {
        this.hoveredCell = cell;
        this.planning.continueStrokeAt(cell);
      }
      return;
    }

    if (!planningActive) {
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

    const planningActive = this.planning.isActive();
    const strokeActive = this.planning.isStrokeActive();
    const buildMode = this.planning.isBuildMode();

    if (!moved) {
      const pseudoEvent = { clientX: last.x, clientY: last.y } as MouseEvent;
      if (!planningActive) {
        this.handleCanvasClick(pseudoEvent);
      } else {
        this.planning.finishStroke();
        this.planning.suppressNextCanvasClick();
      }
    } else if (planningActive && strokeActive) {
      this.planning.finishStroke();
      this.planning.suppressNextCanvasClick();
    }

    if (planningActive && !buildMode) {
      this.planning.clearPlanningMode();
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
    if (this.planning.isStrokeActive() && this.planning.isActive() && !this.planning.isBuildMode() && this.hoveredCell) {
      this.planning.continueStrokeAt(this.hoveredCell);
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
    this.planning.finishStroke();
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
    if (event.button === 0 && this.planning.isActive()) {
      const cell = this.camera.getCellUnderPointer(event);
      if (cell) {
        event.preventDefault();
        this.cellTooltip.hide();
        this.planning.suppressNextCanvasClick(); // Ignore the click event fired right after painting.
        this.planning.startStrokeAt(cell);
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
    if (event.button === 0 && this.planning.isStrokeActive()) {
      const shouldClearPlanning = this.planning.isActive() && !this.planning.isBuildMode();
      this.planning.finishStroke(shouldClearPlanning);
      this.planning.suppressNextCanvasClick();
    }
    if (event.button === 1) {
      this.camera.stopPanning();
    }
  };

  private stopPanning = () => {
    this.camera.stopPanning();
    this.planning.finishStroke();
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
    const isMobile = this.planning.isMobileLayout();
    const padding = isMobile ? 12 : 32;
    const mobileOffset = isMobile ? 96 : 0;
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
    this.planning.destroy();
    this.tokens.destroy();
    // Clear other event listeners if necessary
  }

}
