import { HOURS_PER_SECOND, PRIORITY_KEYMAP, TICK_HOURS, WORLD_SIZE } from "./core/constants";
import { InputHandler } from "./core/InputHandler";
import { clamp } from "./core/utils";
import type { Citizen, PriorityMark, Role, ToastNotification, Vec2 } from "./core/types";
import { SimulationSession } from "./core/SimulationSession";
import { CameraController } from "./core/CameraController";
import { HUDController, type HUDSnapshot } from "./ui/HUDController";
import { CitizenPanelController } from "./ui/CitizenPanel";
import { GameRenderer, type RenderState, type ViewMetrics } from "./ui/GameRenderer";
import { MainMenu } from "./ui/MainMenu";
import { CellTooltipController } from "./ui/CellTooltip";
import { axialToOffset, createHexGeometry, getHexCenter, getHexWorldBounds, pixelToAxial, roundAxial } from "./ui/hexGrid";

type AssignableRole = Extract<Role, "farmer" | "worker" | "warrior" | "scout">;

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

  private zoom = 1;
  private readonly minZoom = 0.75;
  private readonly maxZoom = 2.5;
  private viewTarget: Vec2 = { x: (WORLD_SIZE - 1) / 2, y: (WORLD_SIZE - 1) / 2 };
  private zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
  private zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
  private speedButtons: HTMLButtonElement[] = [];
  private speedMultiplier = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.camera = new CameraController({ canvas }, () => this.simulation?.getWorld() ?? null);
    this.mainMenu = new MainMenu(canvas);
    this.camera.setViewTarget({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    this.hud.setupHeaderButtons(this.handlePauseToggle);
    this.hud.hideOverlay(); // Ocultar el overlay inmediatamente
    this.hud.updateStatus("🎮 Configura tu mundo y presiona COMENZAR");
    this.hud.setPauseButtonState(false); // Mostrar botón como si estuviera pausado
    
    this.setupZoomControls();
    this.setupRoleControls();
    this.setupSpeedControls();
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
    const hudSnapshot: HUDSnapshot = {
      power: player.power,
      population: {
        value: citizenSystem.getPopulationCount((citizen) => citizen.state === "alive" && citizen.tribeId === 1),
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
    if (event.button === 1) {
      this.camera.stopPanning();
    }
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
