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
    worldSize: 120,
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
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo obtener el contexto 2D");
    this.ctx = ctx;
    this.seedInputValue = this.config.seed.toString();
    
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
        this.config.worldSize = 80;
        this.requestPreviewUpdate();
        break;
      
      case "sizeNormal":
        this.config.worldSize = 120;
        this.requestPreviewUpdate();
        break;
      
      case "sizeLarge":
        this.config.worldSize = 160;
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
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    // Fondo oscuro con gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Título principal
    ctx.fillStyle = "#f0e7dc";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🏛️ GENERACIÓN DE MUNDO", centerX, 120);
    
    ctx.font = "18px Arial";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Configura tu civilización antes de comenzar", centerX, 160);
    
    // Panel de configuración
    const panelX = centerX - 300;
    const panelY = 200;
    const panelWidth = 600;
    const panelHeight = 520;
    
    ctx.fillStyle = "rgba(30, 41, 59, 0.8)";
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    
    ctx.strokeStyle = "rgba(233, 204, 152, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    
    let currentY = panelY + 40;
    
    // ===== SEMILLA =====
    ctx.fillStyle = "#e9cc98";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("🌱 Semilla del Mundo:", panelX + 20, currentY);
    
    currentY += 30;
    
    // Input de semilla
    const inputX = panelX + 20;
    const inputY = currentY;
    const inputWidth = 250;
    const inputHeight = 40;
    this.setButtonRegion("seedInput", inputX, inputY, inputWidth, inputHeight);
    
    const isInputHovered = this.hoveredButton === "seedInput";
    const isInputFocused = this.focusedInput === "seed";
    
    ctx.fillStyle = isInputFocused ? "rgba(59, 130, 246, 0.2)" : 
                    isInputHovered ? "rgba(100, 116, 139, 0.3)" : 
                    "rgba(15, 23, 42, 0.6)";
    ctx.fillRect(inputX, inputY, inputWidth, inputHeight);
    
    ctx.strokeStyle = isInputFocused ? "#3b82f6" : 
                      isInputHovered ? "#64748b" : "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(inputX, inputY, inputWidth, inputHeight);
    
    ctx.fillStyle = "#f0e7dc";
    ctx.font = "20px 'Courier New'";
    ctx.textAlign = "left";
    ctx.fillText(this.seedInputValue || "0", inputX + 10, inputY + 26);
    
    // Cursor parpadeante
    if (isInputFocused && Math.floor(Date.now() / 500) % 2 === 0) {
      const textWidth = ctx.measureText(this.seedInputValue).width;
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(inputX + 10 + textWidth + 2, inputY + 10, 2, 20);
    }
    
    // Botón Random
    const randomX = inputX + inputWidth + 10;
    const randomWidth = 140;
    this.setButtonRegion("randomSeed", randomX, inputY, randomWidth, inputHeight);
    const isRandomHovered = this.hoveredButton === "randomSeed";
    
    ctx.fillStyle = isRandomHovered ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.15)";
    ctx.fillRect(randomX, inputY, randomWidth, inputHeight);
    
    ctx.strokeStyle = isRandomHovered ? "#8b5cf6" : "#6d28d9";
    ctx.lineWidth = 2;
    ctx.strokeRect(randomX, inputY, randomWidth, inputHeight);
    
    ctx.fillStyle = isRandomHovered ? "#a78bfa" : "#8b5cf6";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎲 Aleatorio", randomX + randomWidth / 2, inputY + 25);
    
    currentY += 80;
    
    // ===== TAMAÑO DEL MUNDO =====
    ctx.fillStyle = "#e9cc98";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("🗺️ Tamaño del Mundo:", panelX + 20, currentY);
    
    currentY += 30;
    
    const sizeOptions: Array<{ label: string; value: number; key: MenuButtonKey }> = [
      { label: "Pequeño", value: 80, key: "sizeSmall" },
      { label: "Normal", value: 120, key: "sizeNormal" },
      { label: "Grande", value: 160, key: "sizeLarge" }
    ];
    
    this.renderOptionButtons(sizeOptions, currentY, this.config.worldSize);
    
    currentY += 70;
    
    // ===== DIFICULTAD =====
    ctx.fillStyle = "#e9cc98";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("⚔️ Dificultad:", panelX + 20, currentY);
    
    currentY += 30;
    
    const difficultyOptions: Array<{ label: string; value: "easy" | "normal" | "hard"; key: MenuButtonKey; desc: string }> = [
      { label: "Fácil", value: "easy", key: "difficultyEasy", desc: "8 ciudadanos" },
      { label: "Normal", value: "normal", key: "difficultyNormal", desc: "5 ciudadanos" },
      { label: "Difícil", value: "hard", key: "difficultyHard", desc: "3 ciudadanos" }
    ];
    
    this.renderDifficultyButtons(difficultyOptions, currentY);
    
    currentY += 90;

    this.renderWorldPreview(panelX + 20, currentY, panelWidth - 40, 160);
    currentY += 180;
    
    // ===== INFORMACIÓN =====
    ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
    ctx.fillRect(panelX + 20, currentY, panelWidth - 40, 80);
    
    ctx.strokeStyle = "rgba(59, 130, 246, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX + 20, currentY, panelWidth - 40, 80);
    
    ctx.fillStyle = "#93c5fd";
    ctx.font = "13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("ℹ️ Información:", panelX + 35, currentY + 22);
    
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px Arial";
    ctx.fillText(`• La misma semilla genera el mismo mundo`, panelX + 35, currentY + 42);
    ctx.fillText(`• Mundos más grandes = más exploración`, panelX + 35, currentY + 58);
    ctx.fillText(`• Puedes copiar la semilla para compartir mundos`, panelX + 35, currentY + 74);
    
    currentY += 100;
    
    // ===== BOTÓN START =====
    const startButtonY = currentY;
    const startButtonWidth = 300;
    const startButtonHeight = 60;
    const startButtonX = centerX - startButtonWidth / 2;
    this.setButtonRegion("start", startButtonX, startButtonY, startButtonWidth, startButtonHeight);
    
    const isStartHovered = this.hoveredButton === "start";
    
    const startGradient = ctx.createLinearGradient(
      startButtonX, startButtonY,
      startButtonX, startButtonY + startButtonHeight
    );
    
    if (isStartHovered) {
      startGradient.addColorStop(0, "#10b981");
      startGradient.addColorStop(1, "#059669");
    } else {
      startGradient.addColorStop(0, "#059669");
      startGradient.addColorStop(1, "#047857");
    }
    
    ctx.fillStyle = startGradient;
    ctx.fillRect(startButtonX, startButtonY, startButtonWidth, startButtonHeight);
    
    ctx.strokeStyle = isStartHovered ? "#34d399" : "#10b981";
    ctx.lineWidth = 3;
    ctx.strokeRect(startButtonX, startButtonY, startButtonWidth, startButtonHeight);
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🚀 COMENZAR PARTIDA", centerX, startButtonY + 38);
    
    // Footer
    ctx.fillStyle = "#64748b";
    ctx.font = "12px Arial";
    ctx.fillText("Presiona ESC durante el juego para pausar", centerX, this.canvas.height - 30);
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
    const gridTopOffset = 50;
    const availableWidth = width - 40;
    const availableHeight = height - gridTopOffset - 20;

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
    options: Array<{ label: string; value: number; key: MenuButtonKey }>,
    y: number,
    currentValue: number
  ) {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const buttonWidth = 110;
    const buttonHeight = 40;
    const spacing = 10;
    
    const totalWidth = options.length * buttonWidth + (options.length - 1) * spacing;
    let startX = centerX - totalWidth / 2;
    
    options.forEach((option) => {
      const isSelected = option.value === currentValue;
      const isHovered = this.hoveredButton === option.key;
      
      if (isSelected) {
        ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
      } else if (isHovered) {
        ctx.fillStyle = "rgba(100, 116, 139, 0.3)";
      } else {
        ctx.fillStyle = "rgba(30, 41, 59, 0.6)";
      }
      
      ctx.fillRect(startX, y, buttonWidth, buttonHeight);
      this.setButtonRegion(option.key, startX, y, buttonWidth, buttonHeight);
      
      ctx.strokeStyle = isSelected ? "#3b82f6" : isHovered ? "#64748b" : "#475569";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(startX, y, buttonWidth, buttonHeight);
      
      ctx.fillStyle = isSelected ? "#93c5fd" : "#cbd5e1";
      ctx.font = isSelected ? "bold 14px Arial" : "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(option.label, startX + buttonWidth / 2, y + 17);
      
      ctx.font = "11px Arial";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${option.value}x${option.value}`, startX + buttonWidth / 2, y + 32);
      
      startX += buttonWidth + spacing;
    });
  }
  
  private renderDifficultyButtons(
    options: Array<{ label: string; value: "easy" | "normal" | "hard"; key: MenuButtonKey; desc: string }>,
    y: number
  ) {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const buttonWidth = 110;
    const buttonHeight = 50;
    const spacing = 10;
    
    const totalWidth = options.length * buttonWidth + (options.length - 1) * spacing;
    let startX = centerX - totalWidth / 2;
    
    options.forEach((option) => {
      const isSelected = option.value === this.config.difficulty;
      const isHovered = this.hoveredButton === option.key;
      
      let color = "#64748b";
      if (option.value === "easy") color = "#10b981";
      if (option.value === "normal") color = "#f59e0b";
      if (option.value === "hard") color = "#ef4444";
      
      if (isSelected) {
        ctx.fillStyle = `${color}40`;
      } else if (isHovered) {
        ctx.fillStyle = `${color}20`;
      } else {
        ctx.fillStyle = "rgba(30, 41, 59, 0.6)";
      }
      
      ctx.fillRect(startX, y, buttonWidth, buttonHeight);
      this.setButtonRegion(option.key, startX, y, buttonWidth, buttonHeight);
      
      ctx.strokeStyle = isSelected ? color : isHovered ? `${color}80` : "#475569";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(startX, y, buttonWidth, buttonHeight);
      
      ctx.fillStyle = isSelected ? color : "#cbd5e1";
      ctx.font = isSelected ? "bold 14px Arial" : "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(option.label, startX + buttonWidth / 2, y + 20);
      
      ctx.font = "10px Arial";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(option.desc, startX + buttonWidth / 2, y + 36);
      
      startX += buttonWidth + spacing;
    });
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
}
