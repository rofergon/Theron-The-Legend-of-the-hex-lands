import { clamp } from "../core/utils";
import type {
  Citizen,
  ConstructionSite,
  PriorityMark,
  ResourceType,
  StructureType,
  ToastNotification,
  Vec2,
  WorldCell,
} from "../core/types";
import type { WorldEngine } from "../core/world/WorldEngine";
import { createHexGeometry, getHexCenter, traceHexPath } from "./hexGrid";
import type { HexGeometry } from "./hexGrid";
import { drawTree, drawStone, drawFood, drawWaterSpring, drawStructure, drawCitizenSprite } from "./RenderHelpers";

type TextureResources = {
  textures: Record<string, HTMLImageElement[]>;
  hexFrame: HTMLImageElement | null;
  cacheTag: string;
};

const sharedTextureState: { resources: TextureResources | null } = {
  resources: null,
};

const loadImage = (src: string, label: string) => {
  const img = new Image();
  img.src = src;
  img.onerror = () => console.error(`Failed to load texture: ${label} -> ${src}`);
  return img;
};

const ensureSharedTextures = (cacheTag: string): TextureResources => {
  if (sharedTextureState.resources && sharedTextureState.resources.cacheTag === cacheTag) {
    return sharedTextureState.resources;
  }

  const textures: Record<string, HTMLImageElement[]> = {};

  // Terrenos con texturas simples (sin variantes múltiples)
  ["snow", "tundra"].forEach((terrain) => {
    textures[terrain] = [loadImage(`/assets/textures/${terrain}.png${cacheTag}`, terrain)];
  });

  // Terrenos con múltiples variantes (incluyendo ocean)
  const variantTerrains = [
    { name: "grassland", folder: "extracted_grass_hexes", prefix: "grass_hex_c26606bc-1358-490f-9219-970fc0a664c2 (1)" },
    { name: "forest", folder: "extracted_forest_hexes", prefix: "forest_hex_Forest" },
    { name: "mountain", folder: "extracted_mountain_hexes", prefix: "mountain_hex_Rock_Mountains" },
    { name: "desert", folder: "extracted_desert_hexes", prefix: "desert_hex_Desert" },
    { name: "beach", folder: "extracted_beach_hexes", prefix: "beach_hex_Beach_Beach_variants" },
    { name: "ocean", folder: "extracted_ocean_hexes", prefix: "ocean_hex_Ocean_Ocean_variants" },
    { name: "river", folder: "extracted_river_hexes", prefix: "river_hex_Rivers_Rivers2" },
  ];

  variantTerrains.forEach(({ name, folder, prefix }) => {
    textures[name] = [];
    for (let i = 1; i <= 4; i += 1) {
      textures[name].push(loadImage(`/assets/${folder}/${prefix}_${i}.png${cacheTag}`, `${name}-${i}`));
    }
  });

  const hexFrame = loadImage(`/assets/hex_frames_textures/hex_frame_stone.png${cacheTag}`, "hex-frame");

  // Load structure icons
  textures["structure_campfire"] = [loadImage(`/assets/extracted_icons/bonfire.png${cacheTag}`, "structure_campfire")];
  textures["structure_house"] = [loadImage(`/assets/extracted_icons/house.png${cacheTag}`, "structure_house")];
  textures["structure_warehouse"] = [loadImage(`/assets/extracted_icons/warehouse.png${cacheTag}`, "structure_warehouse")];
  textures["structure_granary"] = [loadImage(`/assets/extracted_icons/barn.png${cacheTag}`, "structure_granary")];

  // Load resource icons
  textures["resource_food"] = [loadImage(`/assets/extracted_icons/wheat.png${cacheTag}`, "resource_food")];
  textures["resource_tree_1"] = [loadImage(`/assets/extracted_icons/tree_1.png${cacheTag}`, "resource_tree_1")];
  textures["resource_tree_2"] = [loadImage(`/assets/extracted_icons/tree_2.png${cacheTag}`, "resource_tree_2")];
  textures["construction_site"] = [loadImage(`/assets/extracted_icons/construction_site.png${cacheTag}`, "construction_site")];

  const resources: TextureResources = { textures, hexFrame, cacheTag };
  sharedTextureState.resources = resources;
  return resources;
};

export type ViewMetrics = {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  center: Vec2;
};

export type RenderState = {
  world: WorldEngine;
  citizens: Citizen[];
  selectedCitizen: Citizen | null;
  hoveredCell: Vec2 | null;
  notifications: ToastNotification[];
  view: ViewMetrics;
};

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private textures: Record<string, HTMLImageElement[]> = {};
  private hexFrame: HTMLImageElement | null = null;
  private readonly cacheTag: string;
  private terrainDetailCache = new WeakMap<WorldCell, Array<{ type: "rect" | "dot"; x: number; y: number; r?: number; w?: number; h?: number }>>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo obtener el contexto 2D.");
    }
    this.ctx = ctx;
    this.cacheTag = this.getCacheTag();
    const shared = ensureSharedTextures(this.cacheTag);
    this.textures = shared.textures;
    this.hexFrame = shared.hexFrame;
  }

  private getCacheTag() {
    const meta = import.meta as unknown as { env?: Record<string, string> };
    const version = meta.env?.VITE_ASSET_VERSION;
    return version ? `?v=${version}` : "";
  }

  getCanvas() {
    return this.canvas;
  }

  render(state: RenderState) {
    const { ctx } = this;
    const { cellSize, offsetX, offsetY } = state.view;
    const hex = createHexGeometry(cellSize);
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const visibilityPadding = Math.max(4, cellSize * 0.5); // small buffer to avoid popping at edges

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Ensure high quality scaling to avoid aliasing at low zoom
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    state.world.cells.forEach((row) =>
      row.forEach((cell) => {
        const center = getHexCenter(cell.x, cell.y, hex, offsetX, offsetY);

        // Skip cells that fall completely outside the viewport
        const halfWidth = hex.halfWidth + visibilityPadding;
        const halfHeight = hex.size + visibilityPadding;
        if (
          center.x + halfWidth < 0 ||
          center.x - halfWidth > canvasWidth ||
          center.y + halfHeight < 0 ||
          center.y - halfHeight > canvasHeight
        ) {
          return;
        }

        this.drawTerrainBase(center, hex, cell);
        this.drawTerrainDetail(center, hex, cell);
        this.drawHexFrame(center, hex);

        if (cell.priority !== "none") {
          ctx.globalAlpha = 0.35;
          this.fillHex(center, hex, this.getPriorityColor(cell.priority));
          ctx.globalAlpha = 1;
        }

        if (cell.structure) {
          this.drawStructure(cell.structure, center, cellSize);
        }

        if (cell.cropProgress > 0) {
          this.drawCrop(cell, center, cellSize);
          this.drawFarmOverlay(cell, center, hex);
        } else if (cell.resource) {
          this.drawResource(cell, center, cellSize);
        }

        if (cell.constructionSiteId) {
          const site = state.world.getConstructionSite(cell.constructionSiteId);
          if (site) {
            this.drawConstructionOverlay(site, center, hex);
          }
        }
      }),
    );

    state.citizens.forEach((citizen) => {
      if (citizen.state === "dead") return;
      const center = getHexCenter(citizen.x, citizen.y, hex, offsetX, offsetY);
      this.drawCitizen(citizen, center, hex);

      if (citizen === state.selectedCitizen) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        traceHexPath(ctx, center, hex);
        ctx.stroke();
      }
    });

    this.drawNotifications(state.notifications);

    this.drawLegend();
  }

  private drawTerrainBase(center: Vec2, hex: HexGeometry, cell: WorldCell) {
    const ctx = this.ctx;
    traceHexPath(ctx, center, hex);

    const terrain = cell.terrain;
    const textureVariants = this.textures[terrain];

    if (textureVariants && textureVariants.length > 0) {
      // Seleccionar una variante basada en las coordenadas de la celda
      const hash = (cell.x * 73856093 + cell.y * 19349663) >>> 0;
      const variantIndex = hash % textureVariants.length;
      const texture = textureVariants[variantIndex];

      if (texture && texture.complete) {
        ctx.save();
        ctx.clip();

        // Draw the image to cover the hexagon
        // Use size * 2 for both dimensions to ensure proper coverage
        // This matches the hexagon's actual bounding circle
        const imgSize = hex.size * 2;

        ctx.drawImage(
          texture,
          center.x - imgSize / 2,
          center.y - imgSize / 2,
          imgSize,
          imgSize
        );

        ctx.restore();
        return;
      }
    }

    // Fallback to solid color
    ctx.fillStyle = this.getTerrainColor(cell);
    ctx.fill();
  }

  private getTerrainColor(cell: WorldCell) {
    switch (cell.terrain) {
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
        return "#000";
    }
  }

  private getPriorityColor(priority: PriorityMark) {
    switch (priority) {
      case "explore":
        return "#53bfff";
      case "defend":
        return "#ff5267";
      case "farm":
        return "#76ff8b";
      case "mine":
        return "#b19cff";
      case "gather":
        return "#ffd966";
      case "build":
        return "#fcd34d";
      default:
        return "transparent";
    }
  }


  private drawTerrainDetail(center: Vec2, hex: HexGeometry, cell: WorldCell) {
    if (hex.size < 9) return; // Skip tiny hexes to save work at low zoom

    const terrain = cell.terrain;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#000";

    const shapes = this.getTerrainDetailShapes(cell, terrain);
    shapes.forEach((shape) => {
      if (shape.type === "rect") {
        ctx.fillRect(center.x + shape.x, center.y + shape.y, shape.w ?? 2, shape.h ?? 4);
      } else {
        ctx.beginPath();
        ctx.arc(center.x + shape.x, center.y + shape.y, shape.r ?? 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.restore();
  }

  private getTerrainDetailShapes(cell: WorldCell, terrain: WorldCell["terrain"]) {
    const cached = this.terrainDetailCache.get(cell);
    if (cached) return cached;

    const shapes: Array<{ type: "rect" | "dot"; x: number; y: number; r?: number; w?: number; h?: number }> = [];
    const seed = (cell.x * 12.9898 + cell.y * 78.233) * 43758.5453;

    if (terrain === "grassland" || terrain === "forest") {
      for (let i = 0; i < 3; i++) {
        const offset = (seed + i) % 10;
        shapes.push({ type: "rect", x: (offset - 5) * 2, y: (offset - 5) * 2, w: 2, h: 4 });
      }
    } else if (terrain === "desert" || terrain === "beach") {
      for (let i = 0; i < 5; i++) {
        const offset = (seed + i) % 10;
        shapes.push({ type: "dot", x: (offset - 5) * 3, y: (offset - 5) * 3, r: 1 });
      }
    }

    this.terrainDetailCache.set(cell, shapes);
    return shapes;
  }

  private drawHexFrame(center: Vec2, hex: HexGeometry) {
    if (!this.hexFrame || !this.hexFrame.complete) return;

    const ctx = this.ctx;
    ctx.save();

    // Usar la relación de aspecto geométrica del hexágono Pointy Top
    // Alto / Ancho = 2 / sqrt(3) ≈ 1.1547
    const aspectRatio = 1.1547;

    const frameWidth = hex.size * 1.75; // Ajustado para encajar
    const frameHeight = frameWidth * aspectRatio;

    ctx.drawImage(
      this.hexFrame,
      center.x - frameWidth / 2,
      center.y - frameHeight / 2,
      frameWidth,
      frameHeight
    );

    ctx.restore();
  }
  private drawCitizen(citizen: Citizen, center: Vec2, hex: HexGeometry) {
    const ctx = this.ctx;

    drawCitizenSprite(ctx, citizen, center.x, center.y, hex.size);

    if (citizen.blessedUntil && citizen.age < citizen.blessedUntil) {
      ctx.strokeStyle = "#ffea00";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y, hex.size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawResource(cell: WorldCell, center: Vec2, cellSize: number) {
    const resource = cell.resource;
    if (!resource) return;
    if (resource.type === "wood") {
      this.drawWoodCluster(cell, center, cellSize);
      return;
    }

    const ctx = this.ctx;
    switch (resource.type) {
      case "food":
        // Try to draw wheat icon
        const wheatTextures = this.textures["resource_food"];
        if (wheatTextures && wheatTextures.length > 0) {
          const texture = wheatTextures[0];
          if (texture && texture.complete) {
            const size = cellSize * 1.0;
            ctx.drawImage(texture, center.x - size / 2, center.y - size / 2, size, size);
          } else {
            drawFood(ctx, center.x, center.y, cellSize);
          }
        } else {
          drawFood(ctx, center.x, center.y, cellSize);
        }
        break;
      case "stone":
        drawStone(ctx, center.x, center.y, cellSize);
        break;
      case "waterSpring":
        drawWaterSpring(ctx, center.x, center.y, cellSize);
        break;
    }
  }

  private drawWoodCluster(cell: WorldCell, center: Vec2, cellSize: number) {
    const resource = cell.resource;
    if (!resource) return;
    const fullness = clamp(resource.amount / 12, 0.2, 1);
    const maxTrees = 4;
    const treeCount = clamp(Math.round(fullness * maxTrees), 1, maxTrees);
    const offsets = this.getWoodOffsets(cell, maxTrees);

    for (let i = 0; i < treeCount; i += 1) {
      const offset = offsets[i];
      if (!offset) continue;
      const x = center.x + offset.x * cellSize;
      const y = center.y + offset.y * cellSize;
      // Vary tree size slightly
      const sizeVar = 1 + (Math.sin(x * y) * 0.1);

      // Use tree icons if available
      const treeType = (Math.abs(Math.floor(x * y * 100)) % 2) + 1; // 1 or 2
      const treeTextures = this.textures[`resource_tree_${treeType}`];

      if (treeTextures && treeTextures.length > 0) {
        const texture = treeTextures[0];
        if (texture && texture.complete) {
          const size = cellSize * sizeVar * 1.2; // Slightly larger for icons
          this.ctx.drawImage(texture, x - size / 2, y - size / 2, size, size);
        } else {
          drawTree(this.ctx, x, y, cellSize * sizeVar);
        }
      } else {
        drawTree(this.ctx, x, y, cellSize * sizeVar);
      }
    }
  }

  private getWoodOffsets(cell: WorldCell, count: number) {
    const offsets = [
      { x: -0.25, y: -0.2 },
      { x: 0.23, y: -0.18 },
      { x: -0.15, y: 0.25 },
      { x: 0.2, y: 0.18 },
      { x: 0, y: 0.05 },
    ];
    const hash = (cell.x * 73856093 + cell.y * 19349663) >>> 0;
    const start = hash % offsets.length;

    const arranged: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const offset = offsets[(start + i) % offsets.length];
      if (!offset) continue;
      arranged.push(offset);
    }
    return arranged;
  }

  private drawCrop(cell: WorldCell, center: Vec2, cellSize: number) {
    const ctx = this.ctx;
    const progress = clamp(cell.cropProgress, 0, 1);
    if (progress <= 0) return;

    const stage: 1 | 2 | 3 = progress < 0.34 ? 1 : progress < 0.67 ? 2 : 3;
    const sizeByStage: Record<1 | 2 | 3, number> = {
      1: 0.4,
      2: 0.65,
      3: 0.95,
    };
    const size = cellSize * sizeByStage[stage];

    // Draw multiple small crops
    const wheatTextures = this.textures["resource_food"];
    let useIcon = false;
    let icon: HTMLImageElement | undefined;

    if (wheatTextures && wheatTextures.length > 0) {
      icon = wheatTextures[0];
      if (icon && icon.complete) {
        useIcon = true;
      }
    }

    if (useIcon && icon) {
      const currentIcon = icon; // Capture for closure
      const drawIcon = (x: number, y: number, s: number) => {
        ctx.drawImage(currentIcon, x - s / 2, y - s / 2, s, s);
      };
      drawIcon(center.x - size * 0.2, center.y, size * 0.8);
      if (stage > 1) drawIcon(center.x + size * 0.2, center.y - size * 0.1, size * 0.8);
      if (stage > 2) drawIcon(center.x, center.y + size * 0.2, size * 0.8);
    } else {
      drawFood(ctx, center.x - size * 0.2, center.y, size * 0.8);
      if (stage > 1) drawFood(ctx, center.x + size * 0.2, center.y - size * 0.1, size * 0.8);
      if (stage > 2) drawFood(ctx, center.x, center.y + size * 0.2, size * 0.8);
    }
  }
  private drawStructure(type: StructureType, center: Vec2, cellSize: number) {
    // Check for specialized texture
    const textureKey = `structure_${type}`;
    const textures = this.textures[textureKey];
    if (textures && textures.length > 0) {
      const texture = textures[0];
      if (texture && texture.complete) {
        const ctx = this.ctx;
        // Adjust size to fit well within the hex
        // Adjust size to fit well within the hex
        // Standard: Reduced by 20% + 5% -> 1.37
        // Campfire: Reduced by additional 10% -> 1.23
        const scale = type === "campfire" ? 1.23 : 1.37;
        const size = cellSize * scale;

        ctx.drawImage(
          texture,
          center.x - size / 2,
          center.y - size / 2,
          size,
          size
        );
        return;
      }
    }

    drawStructure(this.ctx, type, center.x, center.y, cellSize);
  }

  private drawProgressOverlay(center: Vec2, hex: HexGeometry, pct: number, color: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    traceHexPath(ctx, center, hex);
    ctx.stroke();
    ctx.restore();

    const progressWidth = hex.width * 0.6;
    const progressHeight = 4;
    const progressX = center.x - progressWidth / 2;
    const progressY = center.y - hex.size * 0.65;
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(progressX, progressY, progressWidth, progressHeight);
    ctx.fillStyle = color;
    ctx.fillRect(progressX, progressY, progressWidth * clamp(pct, 0, 1), progressHeight);
  }

  private drawConstructionOverlay(site: ConstructionSite, center: Vec2, hex: HexGeometry) {
    const ctx = this.ctx;
    const materialsComplete =
      site.stoneDelivered >= site.stoneRequired &&
      site.woodDelivered >= site.woodRequired;

    // Dibujar icono según la fase
    let icon = "📦"; // Materiales pendientes
    let color = "#94a3b8";

    if (materialsComplete) {
      if (site.phase === "foundation") {
        icon = "🏗️";
        color = "#f59e0b";
      } else if (site.phase === "structure") {
        icon = "🔨";
        color = "#facc15";
      } else if (site.phase === "finishing") {
        icon = "✨";
        color = "#22c55e";
      }
    }

    // Dibujar icono
    const constructionTextures = this.textures["construction_site"];
    if (constructionTextures && constructionTextures.length > 0) {
      const texture = constructionTextures[0];
      if (texture && texture.complete) {
        const size = hex.size * 1.5;
        ctx.drawImage(texture, center.x - size / 2, center.y - size / 2, size, size);
      } else {
        // Fallback if texture not ready
        ctx.font = `${hex.size * 0.6}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText(icon, center.x, center.y - hex.size * 0.2);
      }
    } else {
      ctx.font = `${hex.size * 0.6}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText(icon, center.x, center.y - hex.size * 0.2);
    }

    // Dibujar barra de progreso
    const pct = site.workRequired > 0 ? clamp(site.workDone / site.workRequired, 0, 1) : 0;
    this.drawProgressOverlay(center, hex, pct, color);

    // Si faltan materiales, mostrar info
    if (!materialsComplete) {
      ctx.font = `${hex.size * 0.25}px sans-serif`;
      ctx.fillStyle = "white";
      const stoneNeeded = Math.max(0, site.stoneRequired - site.stoneDelivered);
      const woodNeeded = Math.max(0, site.woodRequired - site.woodDelivered);
      let text = "";
      if (stoneNeeded > 0) text += `🪨${stoneNeeded}`;
      if (woodNeeded > 0) text += ` 🪵${woodNeeded}`;
      ctx.fillText(text, center.x, center.y + hex.size * 0.3);
    }
  }

  private drawFarmOverlay(cell: WorldCell, center: Vec2, hex: HexGeometry) {
    const pct = clamp(cell.cropProgress, 0, 1);
    this.drawProgressOverlay(center, hex, pct, "#4ade80");
  }

  private fillHex(center: Vec2, hex: HexGeometry, color: string) {
    const ctx = this.ctx;
    traceHexPath(ctx, center, hex);
    ctx.fillStyle = color;
    ctx.fill();
  }



  private drawNotifications(notifications: ToastNotification[]) {
    const ctx = this.ctx;
    const padding = 16;
    const notifHeight = 50;
    const notifWidth = 320;
    const startY = padding;

    notifications.forEach((notif, index) => {
      const y = startY + index * (notifHeight + 8);
      const now = Date.now();
      const elapsed = now - notif.timestamp;
      const alpha = Math.min(1, (notif.duration - elapsed) / 500);

      ctx.globalAlpha = alpha;

      const bgColor =
        notif.type === "critical"
          ? "rgba(220, 38, 38, 0.95)"
          : notif.type === "warning"
            ? "rgba(234, 179, 8, 0.95)"
            : notif.type === "success"
              ? "rgba(34, 197, 94, 0.95)"
              : "rgba(59, 130, 246, 0.95)";

      ctx.fillStyle = bgColor;
      ctx.fillRect(padding, y, notifWidth, notifHeight);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(padding, y, notifWidth, notifHeight);

      const icon =
        notif.type === "critical" ? "⚠️" : notif.type === "warning" ? "⚡" : notif.type === "success" ? "✅" : "ℹ️";

      ctx.font = "20px Arial";
      ctx.fillText(icon, padding + 20, y + 25);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(notif.message.substring(0, 40), padding + 45, y + 25);

      ctx.globalAlpha = 1;
    });

    ctx.textAlign = "left";
  }



  private drawLegend() {
    const ctx = this.ctx;
    const legendWidth = 200;
    const legendHeight = 140;
    const x = 16;
    const y = this.canvas.height - legendHeight - 16;

    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(x, y, legendWidth, legendHeight);

    ctx.strokeStyle = "rgba(233, 204, 152, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, legendWidth, legendHeight);

    ctx.font = "bold 11px Arial";
    ctx.fillStyle = "#f0e7dc";
    ctx.textAlign = "left";
    ctx.fillText("LEYENDA", x + 8, y + 15);

    const items = [
      { icon: "🔨", label: "Trabajador" },
      { icon: "👨‍🌾", label: "Granjero" },
      { icon: "⚔️", label: "Guerrero" },
      { icon: "🔍", label: "Explorador" },
      { icon: "🌾", label: "Comida" },
      { icon: "🪨", label: "Piedra" },
      { icon: "🏛️", label: "Aldea" },
    ];

    ctx.font = "10px Arial";
    let itemY = y + 32;
    items.forEach((item) => {
      ctx.fillText(`${item.icon} ${item.label}`, x + 8, itemY);
      itemY += 15;
    });
  }
}
