import type { Terrain } from "../core/types";
import { WorldEngine } from "../core/world/WorldEngine";
import { createHexGeometry, getHexCenter, getHexWorldBounds, traceHexPath } from "./hexGrid";

export interface WorldGenerationConfig {
  seed: number;
  worldSize: number;
  difficulty: "easy" | "normal" | "hard";
  startingCitizens: number;
}

type MenuButtonKey =
  | "start"
  | "seedInput"
  | "randomSeed"
  | "sizeSmall"
  | "sizeNormal"
  | "sizeLarge"
  | "difficultyEasy"
  | "difficultyNormal"
  | "difficultyHard";

type ButtonRegion = { x: number; y: number; width: number; height: number };

export class MainMenu {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isVisible: boolean = true;

  // Opciones configurables
  private config: WorldGenerationConfig = {
    seed: Math.floor(Math.random() * 1000000),
    worldSize: 36,
    difficulty: "normal",
    startingCitizens: 5
  };

  private hoveredButton: MenuButtonKey | null = null;
  private focusedInput: string | null = null;
  private seedInputValue: string = "";
  private previewWorld: WorldEngine | null = null;
  private previewDirty = true;
  private lastPreviewUpdate = 0;
  private readonly previewThrottleMs = 220;
  private buttonRegions: Partial<Record<MenuButtonKey, ButtonRegion>> = {};
  private useMobileLayout: boolean;

  constructor(canvas: HTMLCanvasElement, options?: { isMobile?: boolean }) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo obtener el contexto 2D");
    this.ctx = ctx;
    this.seedInputValue = this.config.seed.toString();
    this.useMobileLayout = options?.isMobile ?? false;

    this.setupEventListeners();
    this.requestPreviewUpdate();
  }

  private setupEventListeners() {
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("click", (e) => this.handleClick(e));

    // Capturar entrada de teclado para el input de semilla
    window.addEventListener("keydown", (e) => {
      if (this.focusedInput === "seed") {
        if (e.key === "Backspace") {
          this.seedInputValue = this.seedInputValue.slice(0, -1);
        } else if (e.key === "Enter") {
          this.focusedInput = null;
          this.applySeedInput();
        } else if (e.key >= "0" && e.key <= "9" && this.seedInputValue.length < 10) {
          this.seedInputValue += e.key;
        } else if (e.key === "-" && this.seedInputValue.length === 0) {
          this.seedInputValue = "-";
        }
      }
    });
  }

  private applySeedInput() {
    const parsed = parseInt(this.seedInputValue) || Math.floor(Math.random() * 1000000);
    this.config.seed = parsed;
    this.seedInputValue = parsed.toString();
    this.requestPreviewUpdate();
  }

  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.hoveredButton = this.getButtonAt(x, y);
    this.canvas.style.cursor = this.hoveredButton ? "pointer" : "default";
  }

  private handleClick(e: MouseEvent) {
    if (!this.isVisible) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const button = this.getButtonAt(x, y);

    switch (button) {
      case "start":
        this.isVisible = false;
        break;

      case "randomSeed":
        this.config.seed = Math.floor(Math.random() * 1000000);
        this.seedInputValue = this.config.seed.toString();
        this.focusedInput = null;
        this.requestPreviewUpdate();
        break;

      case "seedInput":
        this.focusedInput = "seed";
        break;

      case "sizeSmall":
        this.config.worldSize = 24;
        this.requestPreviewUpdate();
        break;

      case "sizeNormal":
        this.config.worldSize = 36;
        this.requestPreviewUpdate();
        break;

      case "sizeLarge":
        this.config.worldSize = 48;
        this.requestPreviewUpdate();
        break;

      case "difficultyEasy":
        this.config.difficulty = "easy";
        this.config.startingCitizens = 8;
        break;

      case "difficultyNormal":
        this.config.difficulty = "normal";
        this.config.startingCitizens = 5;
        break;

      case "difficultyHard":
        this.config.difficulty = "hard";
        this.config.startingCitizens = 3;
        break;
    }
  }

  private getButtonAt(x: number, y: number): MenuButtonKey | null {
    for (const [key, region] of Object.entries(this.buttonRegions) as Array<[MenuButtonKey, ButtonRegion]>) {
      if (!region) continue;
      if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) {
        return key;
      }
    }
    return null;
  }

  private setButtonRegion(key: MenuButtonKey, x: number, y: number, width: number, height: number) {
    this.buttonRegions[key] = { x, y, width, height };
  }

  private clearButtonRegions() {
    this.buttonRegions = {};
  }

  render() {
    if (!this.isVisible) return;
    this.clearButtonRegions();

    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Fondo con gradiente
    this.renderBackground();

    // Layout principal
    const layout = this.calculateLayout(canvasWidth, canvasHeight);

    // Preview del mundo (fondo completo)
    this.renderWorldPreview(layout.preview.x, layout.preview.y, layout.preview.width, layout.preview.height);

    // Título
    this.renderTitle(layout.centerX);

    // Panel de configuración (superpuesto sobre el mapa)
    this.renderConfigPanel(layout.configPanel);

    // Panel de información (solo desktop o muy minimalista en móvil)
    if (!this.useMobileLayout) {
      this.renderInfoPanel(layout.infoPanel);
    }

    // Botón de inicio
    this.renderStartButton(layout.startButton);

    // Footer
    if (!this.useMobileLayout) {
      this.renderFooter(layout.centerX, canvasHeight);
    }
  }

  private calculateLayout(canvasWidth: number, canvasHeight: number) {
    const centerX = canvasWidth / 2;
    const margin = this.useMobileLayout ? 12 : 40;

    if (this.useMobileLayout) {
      const available = canvasHeight - margin * 2;
      const gap = 12;

      // Alturas fijas para componentes móviles (reducidas)
      const titleHeight = 35;
      const configPanelHeight = 180;
      const startButtonHeight = 48;

      // El preview ocupa el espacio restante, pero con un mínimo
      let previewHeight = available - titleHeight - configPanelHeight - startButtonHeight - gap * 3;
      previewHeight = Math.max(60, previewHeight);

      const contentWidth = canvasWidth - margin * 2;

      // Posiciones
      const previewY = margin + titleHeight + gap;
      const configPanelY = previewY + previewHeight + gap;
      const startButtonY = configPanelY + configPanelHeight + gap;

      // Check for overflow
      const totalHeight = startButtonY + startButtonHeight + margin;
      if (totalHeight > canvasHeight) {
        const overflow = totalHeight - canvasHeight;
        previewHeight = Math.max(0, previewHeight - overflow);

        const newConfigPanelY = previewY + previewHeight + gap;
        const newStartButtonY = newConfigPanelY + configPanelHeight + gap;

        return {
          centerX,
          useColumns: false,
          preview: { x: margin, y: previewY, width: contentWidth, height: previewHeight },
          infoPanel: { x: 0, y: 0, width: 0, height: 0 },
          startButton: { x: margin, y: newStartButtonY, width: contentWidth, height: startButtonHeight },
          configPanel: { x: margin, y: newConfigPanelY, width: contentWidth, height: configPanelHeight }
        };
      }

      return {
        centerX,
        useColumns: false,
        preview: { x: margin, y: previewY, width: contentWidth, height: previewHeight },
        infoPanel: { x: 0, y: 0, width: 0, height: 0 }, // Oculto en móvil
        startButton: { x: margin, y: startButtonY, width: contentWidth, height: startButtonHeight },
        configPanel: { x: margin, y: configPanelY, width: contentWidth, height: configPanelHeight }
      };
    }

    const previewMargin = 100;
    const previewWidth = canvasWidth - previewMargin * 2;
    const previewHeight = canvasHeight - previewMargin * 2;
    const previewX = previewMargin;
    const previewY = previewMargin;

    const headerHeight = 227;
    const configPanelHeight = 360;
    const configPanelWidth = Math.min(500, canvasWidth - margin * 2);
    const configPanelX = centerX - configPanelWidth / 2;
    const configPanelY = headerHeight;

    const infoPanelHeight = 85;
    const infoPanelWidth = Math.min(500, canvasWidth - margin * 2);
    const infoPanelX = centerX - infoPanelWidth / 2;
    const infoPanelY = configPanelY + configPanelHeight + 20;

    const startButtonHeight = 60;
    const startButtonWidth = 360;
    const startButtonX = centerX - startButtonWidth / 2;
    const startButtonY = infoPanelY + infoPanelHeight + 20;

    return {
      centerX,
      useColumns: false,
      preview: { x: previewX, y: previewY, width: previewWidth, height: previewHeight },
      infoPanel: { x: infoPanelX, y: infoPanelY, width: infoPanelWidth, height: infoPanelHeight },
      startButton: {
        x: startButtonX,
        y: startButtonY,
        width: startButtonWidth,
        height: startButtonHeight
      },
      configPanel: { x: configPanelX, y: configPanelY, width: configPanelWidth, height: configPanelHeight }
    };
  }

  private renderBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderTitle(centerX: number) {
    const ctx = this.ctx;
    const titleSize = this.useMobileLayout ? 24 : 48;
    const subtitleSize = this.useMobileLayout ? 12 : 18;
    const yPos = this.useMobileLayout ? 28 : 90;

    ctx.fillStyle = "#f0e7dc";
    ctx.font = `bold ${titleSize}px "Space Grotesk", Arial`;
    ctx.textAlign = "center";
    ctx.fillText("🏛️ MUNDO", centerX, yPos);

    if (!this.useMobileLayout) {
      ctx.font = `${subtitleSize}px Arial`;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Configura tu civilización antes de comenzar", centerX, yPos + 40);
    }
  }

  private renderInfoPanel(bounds: { x: number; y: number; width: number; height: number }) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("ℹ️ Información:", bounds.x + 16, bounds.y + 22);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px Arial";
    const tips = [
      "• La misma semilla genera el mismo mundo",
      "• Mundos más grandes = más exploración",
      "• Puedes copiar la semilla para compartir"
    ];

    tips.forEach((tip, i) => {
      ctx.fillText(tip, bounds.x + 16, bounds.y + 44 + i * 18);
    });
  }

  private renderStartButton(bounds: { x: number; y: number; width: number; height: number }) {
    const ctx = this.ctx;
    this.setButtonRegion("start", bounds.x, bounds.y, bounds.width, bounds.height);

    const isHovered = this.hoveredButton === "start";

    // Gradiente del botón
    const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
    if (isHovered) {
      gradient.addColorStop(0, "#10b981");
      gradient.addColorStop(1, "#059669");
    } else {
      gradient.addColorStop(0, "#059669");
      gradient.addColorStop(1, "#047857");
    }

    // Sombra suave
    ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 16);
    ctx.fill();

    ctx.shadowColor = "transparent"; // Reset shadow

    ctx.strokeStyle = isHovered ? "#34d399" : "#10b981";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Texto del botón
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🚀 JUGAR", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 7);
  }

  private renderConfigPanel(bounds: { x: number; y: number; width: number; height: number }) {
    const ctx = this.ctx;

    // Fondo del panel
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(233, 204, 152, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const padding = this.useMobileLayout ? 12 : 24;
    let currentY = bounds.y + padding + 6;
    const contentX = bounds.x + padding;
    const contentWidth = bounds.width - padding * 2;

    // Sección: Semilla
    currentY = this.renderSeedSection(contentX, currentY, contentWidth);
    currentY += this.useMobileLayout ? 14 : 40;

    // Sección: Tamaño del mundo
    currentY = this.renderWorldSizeSection(contentX, currentY, bounds.x + bounds.width / 2);
    currentY += this.useMobileLayout ? 14 : 70;

    // Sección: Dificultad
    this.renderDifficultySection(contentX, currentY, bounds.x + bounds.width / 2);
  }

  private renderSeedSection(x: number, y: number, width: number): number {
    const ctx = this.ctx;

    // Título
    ctx.fillStyle = "#e9cc98";
    ctx.font = this.useMobileLayout ? "bold 12px Arial" : "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("SEMILLA", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const inputHeight = this.useMobileLayout ? 36 : 44;
    const randomWidth = this.useMobileLayout ? 42 : 50; // Botón cuadrado para aleatorio
    const spacing = 10;
    const inputWidth = width - randomWidth - spacing;

    // Input box
    const isInputFocused = this.focusedInput === "seed";
    this.setButtonRegion("seedInput", x, y, inputWidth, inputHeight);

    ctx.fillStyle = isInputFocused ? "rgba(59, 130, 246, 0.15)" : "rgba(15, 23, 42, 0.5)";
    ctx.beginPath();
    ctx.roundRect(x, y, inputWidth, inputHeight, 10);
    ctx.fill();

    ctx.strokeStyle = isInputFocused ? "#3b82f6" : "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#f0e7dc";
    ctx.font = this.useMobileLayout ? "15px 'Courier New'" : "18px 'Courier New'";
    ctx.textAlign = "left";
    ctx.fillText(this.seedInputValue || "0", x + 12, y + 28);

    // Cursor
    if (isInputFocused && Math.floor(Date.now() / 500) % 2 === 0) {
      const textWidth = ctx.measureText(this.seedInputValue).width;
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(x + 14 + textWidth, y + 12, 2, 20);
    }

    // Botón aleatorio (Icono de dado)
    const randomX = x + inputWidth + spacing;
    const isRandomHovered = this.hoveredButton === "randomSeed";

    this.setButtonRegion("randomSeed", randomX, y, randomWidth, inputHeight);

    ctx.fillStyle = isRandomHovered ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.15)";
    ctx.beginPath();
    ctx.roundRect(randomX, y, randomWidth, inputHeight, 10);
    ctx.fill();

    ctx.strokeStyle = isRandomHovered ? "#8b5cf6" : "rgba(139, 92, 246, 0.5)";
    ctx.stroke();

    ctx.fillStyle = "#c4b5fd";
    ctx.font = this.useMobileLayout ? "16px Arial" : "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎲", randomX + randomWidth / 2, y + 29);

    return y + inputHeight;
  }

  private renderWorldSizeSection(x: number, y: number, centerX: number): number {
    const ctx = this.ctx;

    ctx.fillStyle = "#e9cc98";
    ctx.font = this.useMobileLayout ? "bold 12px Arial" : "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("TAMAÑO", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const sizeOptions: Array<{ label: string; value: number; key: MenuButtonKey; icon: string }> = [
      { label: "S", value: 24, key: "sizeSmall", icon: "🟩" },
      { label: "M", value: 36, key: "sizeNormal", icon: "🟨" },
      { label: "L", value: 48, key: "sizeLarge", icon: "🟥" }
    ];

    this.renderOptionButtons(sizeOptions, y, this.config.worldSize, centerX);

    return y + (this.useMobileLayout ? 40 : 50);
  }

  private renderDifficultySection(x: number, y: number, centerX: number) {
    const ctx = this.ctx;

    ctx.fillStyle = "#e9cc98";
    ctx.font = this.useMobileLayout ? "bold 12px Arial" : "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("DIFICULTAD", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const difficultyOptions: Array<{ label: string; value: "easy" | "normal" | "hard"; key: MenuButtonKey; icon: string }> = [
      { label: "Fácil", value: "easy", key: "difficultyEasy", icon: "😌" },
      { label: "Normal", value: "normal", key: "difficultyNormal", icon: "😐" },
      { label: "Difícil", value: "hard", key: "difficultyHard", icon: "💀" }
    ];

    this.renderOptionButtons(difficultyOptions, y, this.config.difficulty, centerX, true);
  }




  private renderWorldPreview(x: number, y: number, width: number, height: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = "#e9cc98";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "left";
    ctx.fillText("🧭 Vista previa del mundo", x + 12, y + 24);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(`Semilla ${this.config.seed} • ${this.config.worldSize}x${this.config.worldSize}`, x + 12, y + 42);

    const previewWorld = this.ensurePreviewWorld();
    const gridTopOffset = this.useMobileLayout ? 28 : 50;
    const availableWidth = width - 24;
    const availableHeight = height - gridTopOffset - 16;

    if (!previewWorld) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px Arial";
      ctx.fillText("Generando vista previa...", x + 12, y + gridTopOffset + 30);
      return;
    }

    const gridSize = previewWorld.size;
    const widthFactor = Math.sqrt(3) * (gridSize + 0.5);
    const heightFactor = 1.5 * gridSize + 0.5;
    const cellSize = Math.max(4, Math.min(availableWidth / widthFactor, availableHeight / heightFactor));
    const hex = createHexGeometry(cellSize);
    const bounds = getHexWorldBounds(gridSize, hex);
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    const originX = x + (width - worldWidth) / 2;
    const originY = y + gridTopOffset + (availableHeight - worldHeight) / 2;
    const offsetX = originX - bounds.minX;
    const offsetY = originY - bounds.minY;

    previewWorld.cells.forEach((row) =>
      row.forEach((cell) => {
        const center = getHexCenter(cell.x, cell.y, hex, offsetX, offsetY);
        traceHexPath(ctx, center, hex);
        ctx.fillStyle = this.getPreviewTerrainColor(cell.terrain);
        ctx.fill();
      }),
    );

    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = Math.max(1, cellSize * 0.18);
    const villageCenter = getHexCenter(previewWorld.villageCenter.x, previewWorld.villageCenter.y, hex, offsetX, offsetY);
    traceHexPath(ctx, villageCenter, hex);
    ctx.stroke();

    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
    ctx.fillRect(x + 10, y + height - 26, width - 20, 18);
    ctx.font = "11px Arial";
    ctx.fillStyle = "#93c5fd";
    ctx.fillText("Cambia semilla o tamaño para regenerar la vista previa.", x + 15, y + height - 13);
  }

  private getPreviewTerrainColor(terrain: Terrain): string {
    switch (terrain) {
      case "ocean":
        return "#0a2540";
      case "beach":
        return "#c2b280";
      case "grassland":
        return "#2d5016";
      case "forest":
        return "#1a3d0f";
      case "desert":
        return "#9b7e46";
      case "tundra":
        return "#6b7b8c";
      case "snow":
        return "#e8e8e8";
      case "mountain":
        return "#4b4f5d";
      case "swamp":
        return "#3d4f2f";
      case "river":
        return "#1e4d7b";
      default:
        return "#111";
    }
  }

  private requestPreviewUpdate(): void {
    this.previewDirty = true;
  }

  private ensurePreviewWorld(): WorldEngine | null {
    if (!this.previewDirty) {
      return this.previewWorld;
    }
    const now = performance.now();
    if (now - this.lastPreviewUpdate < this.previewThrottleMs) {
      return this.previewWorld;
    }
    this.previewWorld = new WorldEngine(this.config.worldSize, this.config.seed);
    this.lastPreviewUpdate = now;
    this.previewDirty = false;
    return this.previewWorld;
  }

  private renderOptionButtons(
    options: Array<{ label: string; value: number | string; key: MenuButtonKey; icon?: string }>,
    y: number,
    currentValue: number | string,
    centerXOverride?: number,
    isDifficulty = false
  ) {
    const ctx = this.ctx;
    const centerX = centerXOverride ?? this.canvas.width / 2;

    // Botones más compactos
    // Botones más compactos
    // Calculate button width based on available space if needed
    const maxButtonWidth = this.useMobileLayout ? (this.canvas.width - 40) / options.length - 10 : 100;
    const buttonWidth = Math.min(this.useMobileLayout ? 70 : 100, maxButtonWidth);
    const buttonHeight = this.useMobileLayout ? 42 : 50;
    const spacing = 8; // Reduced spacing

    const totalWidth = options.length * buttonWidth + (options.length - 1) * spacing;
    let startX = centerX - totalWidth / 2;

    options.forEach((option) => {
      const isSelected = option.value === currentValue;
      const isHovered = this.hoveredButton === option.key;

      this.setButtonRegion(option.key, startX, y, buttonWidth, buttonHeight);

      // Fondo
      ctx.fillStyle = isSelected
        ? "rgba(59, 130, 246, 0.25)"
        : isHovered
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(15, 23, 42, 0.6)";

      ctx.beginPath();
      ctx.roundRect(startX, y, buttonWidth, buttonHeight, 10);
      ctx.fill();

      // Borde
      ctx.strokeStyle = isSelected ? "#60a5fa" : "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Icono
      if (option.icon) {
        ctx.font = this.useMobileLayout ? "16px Arial" : "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(option.icon, startX + buttonWidth / 2, y + 24);
      }

      // Etiqueta
      ctx.fillStyle = isSelected ? "#bfdbfe" : "#94a3b8";
      ctx.font = this.useMobileLayout ? (isSelected ? "bold 10px Arial" : "10px Arial") : (isSelected ? "bold 11px Arial" : "11px Arial");
      ctx.textAlign = "center";
      ctx.fillText(option.label, startX + buttonWidth / 2, y + 42);

      startX += buttonWidth + spacing;
    });
  }

  private renderDifficultyButtons(
    options: Array<{ label: string; value: "easy" | "normal" | "hard"; key: MenuButtonKey; desc: string }>,
    y: number,
    centerXOverride?: number
  ) {
    // Deprecated, using generic renderOptionButtons now
  }

  setMobileMode(isMobile: boolean) {
    this.useMobileLayout = isMobile;
    this.requestPreviewUpdate();
  }

  isMenuVisible(): boolean {
    return this.isVisible;
  }

  getConfig(): WorldGenerationConfig {
    return { ...this.config };
  }

  show() {
    this.isVisible = true;
  }

  hide() {
    this.isVisible = false;
  }
  private renderFooter(centerX: number, canvasHeight: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("v1.0.0 - Alpha Build", centerX, canvasHeight - 20);
  }
}
