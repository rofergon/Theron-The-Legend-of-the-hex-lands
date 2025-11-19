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
import type { PlayerSpirit } from "../core/PlayerSpirit";
import type { WorldEngine } from "../core/world/WorldEngine";
import { createHexGeometry, getHexCenter, traceHexPath } from "./hexGrid";
import type { HexGeometry } from "./hexGrid";

export type ViewMetrics = {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  center: Vec2;
};

export type RenderState = {
  world: WorldEngine;
  citizens: Citizen[];
  player: PlayerSpirit;
  selectedCitizen: Citizen | null;
  hoveredCell: Vec2 | null;
  notifications: ToastNotification[];
  view: ViewMetrics;
};

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo obtener el contexto 2D.");
    }
    this.ctx = ctx;
  }

  getCanvas() {
    return this.canvas;
  }

  render(state: RenderState) {
    const { ctx } = this;
    const { cellSize, offsetX, offsetY } = state.view;
    const hex = createHexGeometry(cellSize);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    state.world.cells.forEach((row) =>
      row.forEach((cell) => {
        const center = getHexCenter(cell.x, cell.y, hex, offsetX, offsetY);
        this.fillHex(center, hex, this.getTerrainColor(cell));

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

    ctx.strokeStyle = "#f9dd82";
    ctx.lineWidth = 2;
    state.player.getCoveredCells().forEach(({ x, y }) => {
      const center = getHexCenter(x, y, hex, offsetX, offsetY);
      traceHexPath(ctx, center, hex);
      ctx.stroke();
    });

    this.drawInfluenceBoundary(state.player, hex, offsetX, offsetY);

    this.drawNotifications(state.notifications);
    this.drawContextPanel(state.selectedCitizen);
    this.drawLegend();
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

  private drawCitizen(citizen: Citizen, center: Vec2, hex: HexGeometry) {
    const ctx = this.ctx;
    const roleEmoji: Record<Citizen["role"], string> = {
      worker: "🔨",
      farmer: "👨‍🌾",
      warrior: "⚔️",
      scout: "🔍",
      child: "👶",
      elder: "👴",
    };

    const color = citizen.tribeId === 1 ? "#ffe7c7" : citizen.tribeId === 99 ? "#ff7b7b" : "#7db2ff";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center.x, center.y, hex.size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (citizen.blessedUntil && citizen.age < citizen.blessedUntil) {
      ctx.strokeStyle = "#ffea00";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y, hex.size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = `${hex.size * 0.9}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(roleEmoji[citizen.role], center.x, center.y + 1);

    if (citizen.health < 30) {
      const barWidth = hex.width * 0.55;
      const barHeight = 4;
      const barX = center.x - barWidth / 2;
      const barY = center.y + hex.size * 0.75;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(barX, barY, (barWidth * clamp(citizen.health, 0, 100)) / 100, barHeight);
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
    let emoji = "📦";
    switch (resource.type) {
      case "food":
        emoji = "🌾";
        break;
      case "stone":
        emoji = "🪨";
        break;
      case "waterSpring":
        emoji = "💧";
        break;
    }
    ctx.font = `${cellSize * 0.9}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, center.x, center.y);
  }

  private drawWoodCluster(cell: WorldCell, center: Vec2, cellSize: number) {
    const ctx = this.ctx;
    const resource = cell.resource;
    if (!resource) return;
    const fullness = clamp(resource.amount / 12, 0.2, 1);
    const maxTrees = 4;
    const treeCount = clamp(Math.round(fullness * maxTrees), 1, maxTrees);
    const offsets = this.getWoodOffsets(cell, maxTrees);

    ctx.save();
    ctx.font = `${cellSize * 0.75}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < treeCount; i += 1) {
      const offset = offsets[i];
      const x = center.x + offset.x * cellSize;
      const y = center.y + offset.y * cellSize;
      ctx.globalAlpha = clamp(0.5 + fullness * 0.5 - i * 0.08, 0.35, 1);
      ctx.fillText("🌲", x, y);
    }

    ctx.restore();
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
      arranged.push(offsets[(start + i) % offsets.length]);
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
    const fontSize = cellSize * sizeByStage[stage];

    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.95;
    ctx.fillText("🌾", center.x, center.y);
    ctx.restore();
  }

  private drawStructure(type: StructureType, center: Vec2, cellSize: number) {
    const ctx = this.ctx;
    const emoji: Record<StructureType, string> = {
      village: "🏛️",
      granary: "🏪",
      house: "🏠",
      tower: "🗼",
      temple: "⛪",
      campfire: "🔥",
    };
    ctx.font = `${cellSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji[type], center.x, center.y);
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
    const pct = site.workRequired > 0 ? clamp(site.workDone / site.workRequired, 0, 1) : 0;
    this.drawProgressOverlay(center, hex, pct, "#facc15");
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

  private drawInfluenceBoundary(player: PlayerSpirit, hex: HexGeometry, offsetX: number, offsetY: number) {
    const ctx = this.ctx;
    const radius = player.influenceRadius;
    const topLeft = getHexCenter(player.x - radius, player.y - radius, hex, offsetX, offsetY);
    const bottomRight = getHexCenter(player.x + radius, player.y + radius, hex, offsetX, offsetY);
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x - hex.halfWidth, topLeft.y - hex.size, width + hex.width, height + hex.height);
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

  private drawContextPanel(selectedCitizen: Citizen | null) {
    if (!selectedCitizen || selectedCitizen.state === "dead") return;

    const ctx = this.ctx;
    const c = selectedCitizen;
    const panelWidth = 280;
    const panelHeight = 200;
    const x = this.canvas.width - panelWidth - 16;
    const y = 16;

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(x, y, panelWidth, panelHeight);

    ctx.strokeStyle = "rgba(233, 204, 152, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, panelWidth, panelHeight);

    ctx.fillStyle = "#f0e7dc";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`CIUDADANO #${c.id} - ${this.getRoleLabel(c.role)}`, x + 12, y + 20);

    let lineY = y + 45;
    const lineHeight = 28;

    this.drawStatBar("❤️ Salud", c.health, x + 12, lineY, panelWidth - 24, "#ef4444");
    lineY += lineHeight;
    this.drawStatBar("🍖 Hambre", 100 - c.hunger, x + 12, lineY, panelWidth - 24, "#f59e0b");
    lineY += lineHeight;
    this.drawStatBar("😊 Moral", c.morale, x + 12, lineY, panelWidth - 24, "#3b82f6");
    lineY += lineHeight;
    this.drawStatBar("💤 Fatiga", 100 - c.fatigue, x + 12, lineY, panelWidth - 24, "#8b5cf6");
    lineY += lineHeight;

    ctx.font = "11px Arial";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`📍 Pos: (${c.x}, ${c.y})  🎂 Edad: ${Math.floor(c.age)}`, x + 12, lineY);
    lineY += 16;
    ctx.fillText(`📦 Carga: ${c.carrying.food}🌾 ${c.carrying.stone}🪨`, x + 12, lineY);
  }

  private drawStatBar(label: string, value: number, x: number, y: number, width: number, color: string) {
    const ctx = this.ctx;
    ctx.font = "11px Arial";
    ctx.fillStyle = "#cbd5e1";
    ctx.textAlign = "left";
    ctx.fillText(label, x, y - 4);

    ctx.fillStyle = "rgba(30, 41, 59, 0.8)";
    ctx.fillRect(x, y + 2, width, 10);

    const percent = clamp(value, 0, 100) / 100;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 2, width * percent, 10);

    ctx.font = "9px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(value)}%`, x + width - 4, y + 10);
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

  private getRoleLabel(role: Citizen["role"]) {
    const labels: Record<Citizen["role"], string> = {
      worker: "Trabajador",
      farmer: "Granjero",
      warrior: "Guerrero",
      scout: "Explorador",
      child: "Niño",
      elder: "Anciano",
    };
    return labels[role];
  }
}
