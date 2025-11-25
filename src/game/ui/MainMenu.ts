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

  // Configurable options
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
  private readonly onStartCallback?: (config: WorldGenerationConfig) => void;
  private keyListenerAttached = false;

  // Animation and visual effects
  private particles: Array<{ x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, opacity: number }> = [];
  private animationFrame: number = 0;
  private menuOpenTime: number = 0;
  private lastAnimationTime: number = 0;
  private logoImage: HTMLImageElement;

  // Chest Icons
  private chestImages: Record<string, HTMLImageElement> = {};

  private keydownHandler = (e: KeyboardEvent) => {
    if (!this.isVisible) return;
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
  };

  constructor(canvas: HTMLCanvasElement, options?: { isMobile?: boolean; onStart?: (config: WorldGenerationConfig) => void }) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    this.seedInputValue = this.config.seed.toString();
    this.useMobileLayout = options?.isMobile ?? false;
    this.onStartCallback = options?.onStart;

    this.menuOpenTime = performance.now();
    this.lastAnimationTime = this.menuOpenTime;

    this.logoImage = new Image();
    this.logoImage.src = "/assets/Landing/Theron_game_logo.png";

    // Preload chest images
    const chestSources = {
      common: "/assets/Chest/Land_chest_common_1.png",
      rare: "/assets/Chest/Land_chest_rare_1.png",
      epic: "/assets/Chest/Land_chest_epic.png",
      gold: "/assets/Chest/Gold_chest.png",
      silver: "/assets/Chest/Silver_chest.png",
      copper: "/assets/Chest/Copper_Chest.png"
    };

    Object.entries(chestSources).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      this.chestImages[key] = img;
    });

    this.initParticles();

    this.setupEventListeners();
    this.requestPreviewUpdate();
  }

  private setupEventListeners() {
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("click", (e) => this.handleClick(e));

    // Capture keyboard input for seed input while menu is visible
    this.attachKeyListener();
  }

  private initParticles() {
    const particleCount = this.useMobileLayout ? 20 : 40;
    this.particles = [];

    for (let i = 0; i < particleCount; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle() {
    const maxLife = 3000 + Math.random() * 4000;
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.5, // Float upward
      life: Math.random() * maxLife,
      maxLife,
      size: 1 + Math.random() * 2,
      opacity: 0.3 + Math.random() * 0.4
    };
  }

  private updateParticles(deltaTime: number) {
    this.particles.forEach(particle => {
      particle.x += particle.vx * deltaTime * 0.06;
      particle.y += particle.vy * deltaTime * 0.06;
      particle.life += deltaTime;

      // Reset particle if it goes off screen or dies
      if (particle.life > particle.maxLife || particle.y < -10 || particle.x < -10 || particle.x > this.canvas.width + 10) {
        const newParticle = this.createParticle();
        newParticle.y = this.canvas.height + 10; // Start from bottom
        Object.assign(particle, newParticle);
        particle.life = 0;
      }
    });
  }

  private renderParticles() {
    const ctx = this.ctx;

    this.particles.forEach(particle => {
      const lifeFactor = particle.life / particle.maxLife;
      const fadeIn = Math.min(1, lifeFactor * 4);
      const fadeOut = Math.max(0, 1 - (lifeFactor - 0.7) / 0.3);
      const alpha = particle.opacity * fadeIn * fadeOut;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Create glow effect - Cyan/Orange theme
      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size * 3);
      gradient.addColorStop(0, "rgba(110, 231, 255, 0.8)"); // Cyan
      gradient.addColorStop(0.5, "rgba(255, 107, 53, 0.4)"); // Orange
      gradient.addColorStop(1, "rgba(255, 107, 53, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core particle
      ctx.fillStyle = "#eaf0ff";
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  private attachKeyListener() {
    if (this.keyListenerAttached) return;
    window.addEventListener("keydown", this.keydownHandler);
    this.keyListenerAttached = true;
  }

  private detachKeyListener() {
    if (!this.keyListenerAttached) return;
    window.removeEventListener("keydown", this.keydownHandler);
    this.keyListenerAttached = false;
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
        this.detachKeyListener();
        this.onStartCallback?.({ ...this.config });
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

    // Update animation frame and particles
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastAnimationTime;
    this.lastAnimationTime = currentTime;
    this.animationFrame++;
    this.updateParticles(deltaTime);

    this.clearButtonRegions();

    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Animated gradient background
    this.renderBackground();

    // Render particles
    this.renderParticles();

    // Main layout
    const layout = this.calculateLayout(canvasWidth, canvasHeight);

    // World preview (full background)
    this.renderWorldPreview(layout.preview.x, layout.preview.y, layout.preview.width, layout.preview.height);

    // Title
    this.renderTitle(layout.centerX);

    // Configuration panel (overlaid on map)
    this.renderConfigPanel(layout.configPanel);

    // Info panel removed


    // Start button
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

      // Fixed heights for mobile components (reduced)
      const titleHeight = 35;
      const configPanelHeight = 180;
      const startButtonHeight = 48;

      // Preview takes remaining space, but with a minimum
      let previewHeight = available - titleHeight - configPanelHeight - startButtonHeight - gap * 3;
      previewHeight = Math.max(60, previewHeight);

      const contentWidth = canvasWidth - margin * 2;

      // Positions
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
          startButton: { x: margin, y: newStartButtonY, width: contentWidth, height: startButtonHeight },
          configPanel: { x: margin, y: newConfigPanelY, width: contentWidth, height: configPanelHeight }
        };
      }

      return {
        centerX,
        useColumns: false,
        preview: { x: margin, y: previewY, width: contentWidth, height: previewHeight },
        startButton: { x: margin, y: startButtonY, width: contentWidth, height: startButtonHeight },
        configPanel: { x: margin, y: configPanelY, width: contentWidth, height: configPanelHeight }
      };
    }

    const previewMargin = 100;
    const previewWidth = canvasWidth - previewMargin * 2;
    const previewHeight = canvasHeight - previewMargin * 2;
    const previewX = previewMargin;
    const previewY = previewMargin;

    // 2K Screen adjustment (width > 2000)
    const is2K = canvasWidth > 2000;
    const headerHeight = is2K ? 400 : 160; // Push down significantly on large screens

    const configPanelHeight = is2K ? 500 : 420; // Increase panel height for 2K to fit larger icons
    const configPanelWidth = Math.min(500, canvasWidth - margin * 2);
    const configPanelX = centerX - configPanelWidth / 2;
    const configPanelY = headerHeight;

    const startButtonHeight = 56;
    const startButtonWidth = 360;
    const startButtonX = centerX - startButtonWidth / 2;
    // Position start button below config panel with good spacing
    const startButtonY = configPanelY + configPanelHeight + 30;

    return {
      centerX,
      useColumns: false,
      preview: { x: previewX, y: previewY, width: previewWidth, height: previewHeight },
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

    // Dark blue/cosmic background from store.css
    // radial-gradient(circle at 20% 10%, #182132, #0b0f16 55%)
    const gradient = ctx.createRadialGradient(
      this.canvas.width * 0.2, this.canvas.height * 0.1, 0,
      this.canvas.width * 0.2, this.canvas.height * 0.1, this.canvas.width
    );
    gradient.addColorStop(0, "#182132");
    gradient.addColorStop(0.55, "#0b0f16");
    gradient.addColorStop(1, "#0b0f16");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Subtle grid overlay
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    const gridSize = 40;

    // Draw grid lines
    /*
    for (let x = 0; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
    */
    ctx.restore();
  }

  private renderTitle(centerX: number) {
    const ctx = this.ctx;

    // 2K Screen adjustment
    const is2K = this.canvas.width > 2000;

    // Moved up by ~15px for normal, but lowered for 2K
    const yPos = is2K ? 100 : (this.useMobileLayout ? 15 : 35);

    if (this.logoImage.complete && this.logoImage.naturalWidth > 0) {
      // Check for small screen condition (mobile or width < 1000)
      const isSmallScreen = this.useMobileLayout || this.canvas.width < 1000;

      // Base width: 340 (already reduced by 15% from original 400)
      // If small screen, reduce by another 15% -> 340 * 0.85 = ~290
      // Mobile layout default was 170, let's keep that for mobile, but apply the reduction for small desktop windows

      let maxWidth = 340;
      if (this.useMobileLayout) {
        maxWidth = 170;
      } else if (isSmallScreen) {
        maxWidth = 290;
      }

      const scale = maxWidth / this.logoImage.naturalWidth;
      const width = maxWidth;
      const height = this.logoImage.naturalHeight * scale;

      ctx.save();
      // Glow effect behind logo
      ctx.shadowColor = "rgba(255, 107, 53, 0.3)";
      ctx.shadowBlur = 40;
      ctx.drawImage(this.logoImage, centerX - width / 2, yPos, width, height);
      ctx.restore();
    } else {
      // Fallback text if image fails
      const titleSize = this.useMobileLayout ? 24 : 48;
      ctx.save();
      ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#eaf0ff";
      ctx.font = `bold ${titleSize}px "Space Grotesk", Arial`;
      ctx.textAlign = "center";
      ctx.fillText("THERON", centerX, yPos + 40);
      ctx.restore();
    }


  }



  private renderStartButton(bounds: { x: number; y: number; width: number; height: number }) {
    const ctx = this.ctx;
    this.setButtonRegion("start", bounds.x, bounds.y, bounds.width, bounds.height);

    const isHovered = this.hoveredButton === "start";

    // Button gradient: #ff8455 to #ff6b35
    const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
    if (isHovered) {
      gradient.addColorStop(0, "#ff9a75");
      gradient.addColorStop(1, "#ff8455");
    } else {
      gradient.addColorStop(0, "#ff8455");
      gradient.addColorStop(1, "#ff6b35");
    }

    ctx.save();
    // Shadow: 0 12px 30px rgba(255, 107, 53, 0.35)
    ctx.shadowColor = "rgba(255, 107, 53, 0.35)";
    ctx.shadowBlur = isHovered ? 30 : 20;
    ctx.shadowOffsetY = 12;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Button text
    ctx.save();
    if (isHovered) {
      const scale = 1.02;
      ctx.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2));
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px 'Space Grotesk', Arial";
    ctx.textAlign = "center";
    ctx.letterSpacing = "1px";
    ctx.fillText("PLAY DEMO", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 6);
    ctx.restore();
  }

  private renderConfigPanel(bounds: { x: number; y: number; width: number; height: number }) {
    const ctx = this.ctx;

    // Panel background - Glassmorphism
    // rgba(12, 17, 25, 0.82)
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 18;

    ctx.fillStyle = "rgba(12, 17, 25, 0.82)";
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 16);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.restore();

    // Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const padding = this.useMobileLayout ? 12 : 24;
    let currentY = bounds.y + padding + 6;
    const contentX = bounds.x + padding;
    const contentWidth = bounds.width - padding * 2;

    // Section: Seed
    currentY = this.renderSeedSection(contentX, currentY, contentWidth);
    currentY += this.useMobileLayout ? 14 : 25;

    // Section: World size
    currentY = this.renderWorldSizeSection(contentX, currentY, bounds.x + bounds.width / 2);
    currentY += this.useMobileLayout ? 14 : 35;

    // Section: Difficulty
    this.renderDifficultySection(contentX, currentY, bounds.x + bounds.width / 2);
  }

  private renderSeedSection(x: number, y: number, width: number): number {
    const ctx = this.ctx;

    // Title
    ctx.fillStyle = "#ff6b35"; // accent
    ctx.font = this.useMobileLayout ? "bold 12px 'Space Grotesk', Arial" : "bold 14px 'Space Grotesk', Arial";
    ctx.textAlign = "left";
    ctx.fillText("SEED", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const inputHeight = this.useMobileLayout ? 36 : 44;
    const randomWidth = this.useMobileLayout ? 42 : 50;
    const spacing = 10;
    const inputWidth = width - randomWidth - spacing;

    // Input box
    const isInputFocused = this.focusedInput === "seed";
    this.setButtonRegion("seedInput", x, y, inputWidth, inputHeight);

    ctx.fillStyle = isInputFocused ? "rgba(255, 107, 53, 0.1)" : "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(x, y, inputWidth, inputHeight, 8);
    ctx.fill();

    ctx.strokeStyle = isInputFocused ? "#ff6b35" : "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#eaf0ff";
    ctx.font = this.useMobileLayout ? "15px 'Space Grotesk'" : "16px 'Space Grotesk'";
    ctx.textAlign = "left";
    ctx.fillText(this.seedInputValue || "0", x + 12, y + 28);

    // Cursor
    if (isInputFocused && Math.floor(Date.now() / 500) % 2 === 0) {
      const textWidth = ctx.measureText(this.seedInputValue).width;
      ctx.fillStyle = "#ff6b35";
      ctx.fillRect(x + 14 + textWidth, y + 12, 2, 20);
    }

    // Random button
    const randomX = x + inputWidth + spacing;
    const isRandomHovered = this.hoveredButton === "randomSeed";

    this.setButtonRegion("randomSeed", randomX, y, randomWidth, inputHeight);

    ctx.fillStyle = isRandomHovered ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(randomX, y, randomWidth, inputHeight, 8);
    ctx.fill();

    ctx.strokeStyle = isRandomHovered ? "#ff6b35" : "rgba(255, 255, 255, 0.1)";
    ctx.stroke();

    ctx.fillStyle = isRandomHovered ? "#ff6b35" : "#9fb2d7";
    ctx.font = this.useMobileLayout ? "14px Arial" : "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("RND", randomX + randomWidth / 2, y + 27);

    return y + inputHeight;
  }

  private renderWorldSizeSection(x: number, y: number, centerX: number): number {
    const ctx = this.ctx;

    ctx.fillStyle = "#ff6b35";
    ctx.font = this.useMobileLayout ? "bold 12px 'Space Grotesk', Arial" : "bold 14px 'Space Grotesk', Arial";
    ctx.textAlign = "left";
    ctx.fillText("SIZE", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const sizeOptions: Array<{ label: string; value: number; key: MenuButtonKey; iconKey: string }> = [
      { label: "Small", value: 24, key: "sizeSmall", iconKey: "common" },
      { label: "Normal", value: 36, key: "sizeNormal", iconKey: "rare" },
      { label: "Large", value: 48, key: "sizeLarge", iconKey: "epic" }
    ];

    this.renderOptionButtons(sizeOptions, y, this.config.worldSize, centerX);

    return y + (this.useMobileLayout ? 80 : 100); // Increased height for icons
  }

  private renderDifficultySection(x: number, y: number, centerX: number) {
    const ctx = this.ctx;

    ctx.fillStyle = "#ff6b35";
    ctx.font = this.useMobileLayout ? "bold 12px 'Space Grotesk', Arial" : "bold 14px 'Space Grotesk', Arial";
    ctx.textAlign = "left";
    ctx.fillText("DIFFICULTY", x, y);

    y += this.useMobileLayout ? 12 : 15;

    const difficultyOptions: Array<{ label: string; value: "easy" | "normal" | "hard"; key: MenuButtonKey; iconKey: string }> = [
      { label: "Easy", value: "easy", key: "difficultyEasy", iconKey: "gold" },
      { label: "Normal", value: "normal", key: "difficultyNormal", iconKey: "silver" },
      { label: "Hard", value: "hard", key: "difficultyHard", iconKey: "copper" }
    ];

    this.renderOptionButtons(difficultyOptions, y, this.config.difficulty, centerX, true);
  }




  private renderWorldPreview(x: number, y: number, width: number, height: number): void {
    const ctx = this.ctx;

    // Background with subtle shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = "rgba(12, 17, 25, 0.6)";
    ctx.fillRect(x, y, width, height);

    ctx.shadowColor = "transparent";
    ctx.restore();

    // Animated border glow
    const borderPulse = 0.3 + Math.sin((performance.now() - this.menuOpenTime) * 0.0025) * 0.2;
    ctx.strokeStyle = `rgba(110, 231, 255, ${borderPulse + 0.1})`; // Cyan accent
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = "#ff6b35";
    ctx.font = "bold 15px 'Space Grotesk', Arial";
    ctx.textAlign = "left";
    ctx.fillText("WORLD PREVIEW", x + 12, y + 24);

    ctx.font = "12px 'Inter', Arial";
    ctx.fillStyle = "#9fb2d7";
    ctx.fillText(`Seed ${this.config.seed} • ${this.config.worldSize}x${this.config.worldSize}`, x + 12, y + 42);

    const previewWorld = this.ensurePreviewWorld();
    const gridTopOffset = this.useMobileLayout ? 28 : 50;
    const availableWidth = width - 24;
    const availableHeight = height - gridTopOffset - 16;

    if (!previewWorld) {
      // Animated loading text
      const loadingAlpha = 0.5 + Math.sin((performance.now() - this.menuOpenTime) * 0.005) * 0.3;
      ctx.save();
      ctx.globalAlpha = loadingAlpha;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px Arial";
      ctx.fillText("Generating preview...", x + 12, y + gridTopOffset + 30);
      ctx.restore();
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

    // Pulsing village center marker
    const villagePulse = 0.6 + Math.sin((performance.now() - this.menuOpenTime) * 0.004) * 0.4;
    ctx.save();
    ctx.shadowColor = `rgba(249, 115, 22, ${villagePulse})`;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = Math.max(1, cellSize * 0.18);
    const villageCenter = getHexCenter(previewWorld.villageCenter.x, previewWorld.villageCenter.y, hex, offsetX, offsetY);
    traceHexPath(ctx, villageCenter, hex);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(12, 17, 25, 0.8)";
    ctx.fillRect(x + 10, y + height - 26, width - 20, 18);
    ctx.font = "11px 'Inter', Arial";
    ctx.fillStyle = "#9fb2d7";
    ctx.fillText("Change seed or size to regenerate preview.", x + 15, y + height - 13);
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
    options: Array<{ label: string; value: number | string; key: MenuButtonKey; iconKey: string }>,
    y: number,
    currentValue: number | string,
    centerXOverride?: number,
    isDifficulty = false
  ) {
    const ctx = this.ctx;
    const centerX = centerXOverride ?? this.canvas.width / 2;

    // Icon button dimensions
    const is2K = this.canvas.width > 2000;
    const buttonSize = is2K ? 120 : (this.useMobileLayout ? 60 : 80);
    const spacing = 20;

    const totalWidth = options.length * buttonSize + (options.length - 1) * spacing;
    let startX = centerX - totalWidth / 2;

    options.forEach((option) => {
      const isSelected = option.value === currentValue;
      const isHovered = this.hoveredButton === option.key;

      this.setButtonRegion(option.key, startX, y, buttonSize, buttonSize);

      const img = this.chestImages[option.iconKey];

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();

        // Selection/Hover effects
        if (isSelected) {
          // Selected glow
          ctx.shadowColor = "rgba(255, 107, 53, 0.6)";
          ctx.shadowBlur = 25;

          // Scale up slightly
          const scale = 1.1;
          const scaledSize = buttonSize * scale;
          const offset = (scaledSize - buttonSize) / 2;

          // Draw background glow for selected
          ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
          ctx.beginPath();
          ctx.arc(startX + buttonSize / 2, y + buttonSize / 2, buttonSize / 2 + 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.drawImage(img, startX - offset, y - offset, scaledSize, scaledSize);

          // Selection border ring
          ctx.strokeStyle = "#ff6b35";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(startX + buttonSize / 2, y + buttonSize / 2, buttonSize / 2 + 8, 0, Math.PI * 2);
          ctx.stroke();

        } else if (isHovered) {
          // Hover glow
          ctx.shadowColor = "rgba(255, 255, 255, 0.3)";
          ctx.shadowBlur = 15;

          // Slight scale
          const scale = 1.05;
          const scaledSize = buttonSize * scale;
          const offset = (scaledSize - buttonSize) / 2;

          ctx.drawImage(img, startX - offset, y - offset, scaledSize, scaledSize);

          // Hover border ring
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(startX + buttonSize / 2, y + buttonSize / 2, buttonSize / 2 + 5, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Normal state
          ctx.globalAlpha = 0.7; // Dim unselected
          ctx.drawImage(img, startX, y, buttonSize, buttonSize);
        }

        ctx.restore();
      } else {
        // Fallback if image not loaded
        ctx.fillStyle = isSelected ? "#ff6b35" : "#333";
        ctx.fillRect(startX, y, buttonSize, buttonSize);
      }

      startX += buttonSize + spacing;
    });
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
    this.menuOpenTime = performance.now();
    this.lastAnimationTime = this.menuOpenTime;
    this.initParticles();
    this.attachKeyListener();
  }

  hide() {
    this.isVisible = false;
    this.detachKeyListener();
  }
  private renderFooter(centerX: number, canvasHeight: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(159, 178, 215, 0.5)"; // muted
    ctx.font = "11px 'Inter', Arial";
    ctx.textAlign = "center";
    ctx.fillText("v1.0.0 - Alpha Build", centerX, canvasHeight - 20);
  }
}
