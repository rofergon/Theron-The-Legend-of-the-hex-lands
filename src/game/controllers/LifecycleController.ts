import { HOURS_PER_SECOND, TICK_HOURS } from "../core/constants";
import type { CameraController } from "../core/CameraController";
import type { ToastNotification } from "../core/types";
import { SimulationSession } from "../core/SimulationSession";
import type { HUDController } from "../ui/HUDController";
import type { MainMenu } from "../ui/MainMenu";
import type { PlanningController } from "./PlanningController";
import type { RoleController } from "./RoleController";
import type { ThreatController } from "./ThreatController";
import type { TravelersController } from "./TravelersController";
import type { TokenController } from "./TokenController";

interface LifecycleDependencies {
  playerTribeId: number;
  mainMenu: MainMenu;
  planning: PlanningController;
  camera: CameraController;
  hud: HUDController;
  tokens: TokenController;
  roles: RoleController;
  threats: ThreatController;
  travelers: TravelersController;
  logEvent: (message: string, notificationType?: ToastNotification["type"]) => void;
  onExtinction: () => void;
  resetExtinctionAnnouncement: () => void;
  clearSelection: () => void;
  setSimulation: (session: SimulationSession) => void;
  updateCitizenPanel: () => void;
  onTick: (tickHours: number) => void;
  onDraw: () => void;
  onFrame?: () => void;
  onSpeedChange?: (multiplier: number, changed: boolean) => void;
}

export class LifecycleController {
  private running = false;
  private paused = false;
  private lastTime = 0;
  private accumulatedHours = 0;
  private initialized = false;
  private speedMultiplier = 1;

  constructor(private readonly deps: LifecycleDependencies) {}

  start() {
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  isRunning() {
    return this.initialized && !this.paused;
  }

  isInitialized() {
    return this.initialized;
  }

  getSpeedMultiplier() {
    return this.speedMultiplier;
  }

  setSpeedMultiplier(multiplier: number) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }
    const changed = this.speedMultiplier !== multiplier;
    this.speedMultiplier = multiplier;
    this.deps.onSpeedChange?.(multiplier, changed);
  }

  handlePauseToggle = () => {
    if (!this.initialized) {
      if (this.deps.mainMenu.isMenuVisible()) {
        this.initializeAndStart();
      }
      return;
    }
    this.paused ? this.resume() : this.pause();
  };

  pause = () => {
    if (!this.initialized) return;
    this.paused = true;
    this.deps.hud.updateStatus("⏸️ Paused.");
    this.deps.hud.setPauseButtonState(false);
  };

  resume = () => {
    if (!this.initialized || !this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.deps.hud.updateStatus("▶️ Simulation in progress.");
    this.deps.hud.setPauseButtonState(true);
  };

  private initializeAndStart() {
    this.deps.mainMenu.hide();
    this.initializeGame();
  }

  private initializeGame() {
    if (this.initialized) return;

    const config = this.deps.mainMenu.getConfig();
    const simulation = new SimulationSession(this.deps.playerTribeId, {
      onLog: (message, notificationType) => this.deps.logEvent(message, notificationType),
      onExtinction: this.deps.onExtinction,
      onThreat: (alert) => this.deps.threats.handleThreat(alert),
      onTravelers: (arrival) => this.deps.travelers.handleArrival(arrival),
    });
    simulation.initialize(config);
    this.deps.resetExtinctionAnnouncement();

    const world = simulation.getWorld();
    this.deps.camera.setViewTarget({ x: world.villageCenter.x + 0.5, y: world.villageCenter.y + 0.5 });
    this.deps.clearSelection();
    this.deps.tokens.resetBalances();
    this.deps.setSimulation(simulation);
    this.initialized = true;
    this.deps.roles.refresh(true);
    this.deps.planning.refreshStructureSelection();
    this.deps.planning.updatePlanningHint();
    this.deps.updateCitizenPanel();
    void this.deps.tokens.refreshOnChainBalances();

    this.deps.hud.setPauseButtonState(true);
    this.deps.hud.updateStatus("▶️ Simulation in progress.");
  }

  private loop = (time: number) => {
    if (!this.running) return;

    if (this.deps.mainMenu.isMenuVisible()) {
      this.deps.planning.setActionBarHidden(true);
      this.deps.mainMenu.render();
      this.lastTime = time;
      requestAnimationFrame(this.loop);
      return;
    }
    this.deps.planning.setActionBarHidden(false);

    if (!this.initialized) {
      this.initializeGame();
    }

    const deltaSeconds = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.deps.onFrame?.();

    if (!this.paused) {
      this.accumulatedHours += deltaSeconds * HOURS_PER_SECOND * this.speedMultiplier;
      while (this.accumulatedHours >= TICK_HOURS) {
        this.deps.onTick(TICK_HOURS);
        this.accumulatedHours -= TICK_HOURS;
      }
    }

    this.deps.onDraw();
    requestAnimationFrame(this.loop);
  };
}
