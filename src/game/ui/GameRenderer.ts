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
  textures["structure_village"] = [loadImage(`/assets/extracted_icons/Urban_center.png${cacheTag}`, "structure_village")];
  textures["structure_tower"] = [loadImage(`/assets/extracted_icons/Tower_defense.png${cacheTag}`, "structure_tower")];
  textures["structure_temple"] = [loadImage(`/assets/extracted_icons/Temple.png${cacheTag}`, "structure_temple")];

  // Load resource icons
  textures["resource_food"] = [loadImage(`/assets/extracted_icons/wheat.png${cacheTag}`, "resource_food")];
  textures["resource_tree_1"] = [loadImage(`/assets/extracted_icons/tree_1.png${cacheTag}`, "resource_tree_1")];
  textures["resource_tree_2"] = [loadImage(`/assets/extracted_icons/tree_2.png${cacheTag}`, "resource_tree_2")];
  textures["construction_site"] = [loadImage(`/assets/extracted_icons/construction_site.png${cacheTag}`, "construction_site")];

  // Load citizen icons
  textures["citizen_lumberjack"] = [loadImage(`/assets/extracted_icons/Lumberjack.png${cacheTag}`, "citizen_lumberjack")];
  textures["citizen_miner"] = [loadImage(`/assets/extracted_icons/Human_miner.png${cacheTag}`, "citizen_miner")];
  textures["citizen_worker"] = [loadImage(`/assets/extracted_icons/Worker.png${cacheTag}`, "citizen_worker")];
  textures["citizen_farmer"] = [loadImage(`/assets/extracted_icons/Farmer.png${cacheTag}`, "citizen_farmer")];
  textures["citizen_scout"] = [loadImage(`/assets/extracted_icons/Explorer.png${cacheTag}`, "citizen_scout")];
  textures["citizen_child"] = [loadImage(`/assets/extracted_icons/Baby.png${cacheTag}`, "citizen_child")];
  textures["citizen_warrior"] = [loadImage(`/assets/extracted_icons/Warrior.png${cacheTag}`, "citizen_warrior")];
  textures["citizen_archer"] = [loadImage(`/assets/extracted_icons/Archer.png${cacheTag}`, "citizen_archer")];

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
    const visibilityPadding = Math.max(4, cellSize * 0.5);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // --- Pass 1: Ground & Collection ---
    type RenderItem = {
      y: number; // For sorting
      x: number; // Secondary sort for stability
      draw: () => void;
    };
    const renderList: RenderItem[] = [];

    state.world.cells.forEach((row) =>
      row.forEach((cell) => {
        const center = getHexCenter(cell.x, cell.y, hex, offsetX, offsetY);

        // Visibility check
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

        // 1. Draw Ground
        this.drawTerrainBase(center, hex, cell);
        this.drawTerrainDetail(center, hex, cell);
        this.drawHexFrame(center, hex);

        if (cell.priority !== "none") {
          ctx.globalAlpha = 0.35;
          this.fillHex(center, hex, this.getPriorityColor(cell.priority));
          ctx.globalAlpha = 1;
        }

        // 2. Collect Objects
        // Structure
        if (cell.structure) {
          renderList.push({
            y: center.y,
            x: center.x,
            draw: () => this.drawStructure(cell.structure!, center, cellSize),
          });
        }

        // Resources / Crops
        if (cell.cropProgress > 0) {
          renderList.push({
            y: center.y,
            x: center.x,
            draw: () => {
              this.drawCrop(cell, center, cellSize);
              this.drawFarmOverlay(cell, center, hex);
            },
          });
        } else if (cell.resource) {
          renderList.push({
            y: center.y,
            x: center.x,
            draw: () => this.drawResource(cell, center, cellSize),
          });
        }

        // Construction Site
        if (cell.constructionSiteId) {
          const site = state.world.getConstructionSite(cell.constructionSiteId);
          if (site) {
            renderList.push({
              y: center.y,
              x: center.x,
              draw: () => this.drawConstructionOverlay(site, center, hex),
            });
          }
        }
      }),
    );

    // Collect Citizens
    state.citizens.forEach((citizen) => {
      if (citizen.state === "dead") return;
      const center = getHexCenter(citizen.x, citizen.y, hex, offsetX, offsetY);

      // Visibility check for citizens
      if (
        center.x + hex.size < 0 ||
        center.x - hex.size > canvasWidth ||
        center.y + hex.size < 0 ||
        center.y - hex.size > canvasHeight
      ) {
        return;
      }

      renderList.push({
        y: center.y,
        x: center.x,
        draw: () => {
          this.drawCitizen(citizen, center, hex);
          if (citizen === state.selectedCitizen) {
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 2;
            traceHexPath(ctx, center, hex);
            ctx.stroke();
          }
        },
      });
    });

    // --- Pass 2: Sort & Draw Objects ---
    renderList.sort((a, b) => {
      if (Math.abs(a.y - b.y) < 0.1) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    renderList.forEach((item) => item.draw());

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
      const variantIndex = this.getTerrainVariantIndex(cell, terrain, textureVariants.length);
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

  private getTerrainVariantIndex(cell: WorldCell, terrain: WorldCell["terrain"], variants: number) {
    if (variants <= 1) return 0;
    const salt = terrain === "mountain" ? 0x9e3779b9 : 0;
    let hash = Math.imul(cell.x + 1, 374761393) ^ Math.imul(cell.y + 1, 668265263) ^ salt;
    hash = (hash ^ (hash >>> 13)) >>> 0;
    return hash % variants;
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

    // Determine which icon to use based on citizen activity
    let iconKey: string | null = null;
    const action = citizen.debugLastAction?.toLowerCase() || "";
    const task = citizen.activeTask;
    const goal = citizen.currentGoal?.toLowerCase() || "";

    // Priority 1: Check active task (currently doing)
    if (task === "construct") {
      iconKey = "citizen_worker";
    } else if (task === "tendCrops") {
      iconKey = "citizen_farmer";
    } else if (task === "gather") {
      // When gathering, check what they're gathering from action or goal
      if (action.includes("wood") || action.includes("tree") || action.includes("lumber") || goal.includes("wood")) {
        iconKey = "citizen_lumberjack";
      } else if (action.includes("stone") || action.includes("mine") || goal.includes("stone")) {
        iconKey = "citizen_miner";
      }
    }

    // Priority 2: Check debugLastAction for recent activities
    if (!iconKey) {
      if (action.includes("wood") || action.includes("tree") || action.includes("lumber")) {
        iconKey = "citizen_lumberjack";
      } else if (action.includes("stone") || action.includes("mine") || action.includes("mining")) {
        iconKey = "citizen_miner";
      } else if (action.includes("build") || action.includes("construct")) {
        iconKey = "citizen_worker";
      } else if (action.includes("farm") || action.includes("crop") || action.includes("harvest") || action.includes("plant")) {
        iconKey = "citizen_farmer";
      }
    }

    // Priority 3: Check current goal (walking toward task)
    if (!iconKey && goal) {
      if (goal.includes("wood") || goal.includes("tree") || goal.includes("gather") && goal.includes("wood")) {
        iconKey = "citizen_lumberjack";
      } else if (goal.includes("stone") || goal.includes("mine")) {
        iconKey = "citizen_miner";
      } else if (goal.includes("build") || goal.includes("construct")) {
        iconKey = "citizen_worker";
      } else if (goal.includes("farm") || goal.includes("crop") || goal.includes("harvest")) {
        iconKey = "citizen_farmer";
      }
    }

    // Priority 4: Default to role-based icon
    if (!iconKey) {
      if (citizen.role === "farmer") {
        iconKey = "citizen_farmer";
      } else if (citizen.role === "worker") {
        iconKey = "citizen_worker";
      } else if (citizen.role === "scout") {
        iconKey = "citizen_scout";
      } else if (citizen.role === "child") {
        iconKey = "citizen_child";
      } else if (citizen.role === "warrior") {
        iconKey = "citizen_warrior";
      }
    }

    // Try to draw the specialized icon
    if (iconKey) {
      const textures = this.textures[iconKey];
      if (textures && textures.length > 0) {
        const texture = textures[0];
        if (texture && texture.complete) {
          // Preserve aspect ratio and reduce size to fit in cell
          let maxSize = hex.size * 1; // Reduced from 0.8 to 0.6

          // Make babies (child role) 40% of normal size
          if (citizen.role === "child") {
            maxSize = maxSize * 0.4;
          }

          const aspectRatio = texture.width / texture.height;

          let width, height;
          if (aspectRatio > 1) {
            // Wider than tall
            width = maxSize;
            height = maxSize / aspectRatio;
          } else {
            // Taller than wide
            height = maxSize;
            width = maxSize * aspectRatio;
          }

          ctx.drawImage(texture, center.x - width / 2, center.y - height / 2, width, height);

          // Draw blessed effect if applicable
          if (citizen.blessedUntil && citizen.age < citizen.blessedUntil) {
            ctx.strokeStyle = "#ffea00";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(center.x, center.y, hex.size * 0.7, 0, Math.PI * 2);
            ctx.stroke();
          }
          return;
        }
      }
    }

    // Fallback to existing sprite rendering
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
        // Water spring icon removed - no rendering
        break;
    }
  }

  private drawWoodCluster(cell: WorldCell, center: Vec2, cellSize: number) {
    const resource = cell.resource;
    if (!resource) return;

    // Use tree icons if available
    // Randomly choose tree 1 or 2 based on cell position
    const treeType = ((cell.x + cell.y) % 2) + 1; // 1 or 2
    const treeTextures = this.textures[`resource_tree_${treeType}`];

    if (treeTextures && treeTextures.length > 0) {
      const texture = treeTextures[0];
      if (texture && texture.complete) {
        const size = cellSize * 1.2; // Reduced by 20% (was 1.5)
        this.ctx.drawImage(texture, center.x - size / 2, center.y - size / 2, size, size);
      } else {
        drawTree(this.ctx, center.x, center.y, cellSize * 1.2);
      }
    } else {
      drawTree(this.ctx, center.x, center.y, cellSize * 1.2);
    }
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
        // Standard: Reduced by 20% + 5% -> 1.37
        // Campfire: Reduced by additional 10% -> 1.23
        // Tower: Reduced by additional 5% -> 1.30
        // Temple: Reduced by additional 10% -> 1.23
        let scale = 1.37;
        if (type === "campfire") scale = 1.23;
        if (type === "tower") scale = 1.15;
        if (type === "temple") scale = 1.20;
        const size = cellSize * scale;

        // Village: raise position by 10%
        // Tower: raise position by 5%
        // Temple: raise position by 5%
        let offsetY = 0;
        if (type === "village") offsetY = -cellSize * 0.1;
        if (type === "tower") offsetY = -cellSize * 0.08;
        if (type === "temple") offsetY = -cellSize * 0.05;

        ctx.drawImage(
          texture,
          center.x - size / 2,
          center.y - size / 2 + offsetY,
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
