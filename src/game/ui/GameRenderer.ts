import { clamp } from "../core/utils";
import type {
  Citizen,
  PriorityMark,
  ResourceType,
  StructureType,
  ToastNotification,
  Vec2,
  WorldCell,
} from "../core/types";
import type { PlayerSpirit } from "../core/PlayerSpirit";
import type { WorldEngine } from "../core/world/WorldEngine";

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

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    state.world.cells.forEach((row) =>
      row.forEach((cell) => {
        ctx.fillStyle = this.getTerrainColor(cell);
        ctx.fillRect(offsetX + cell.x * cellSize, offsetY + cell.y * cellSize, cellSize, cellSize);

        if (cell.priority !== "none") {
          ctx.fillStyle = this.getPriorityColor(cell.priority);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(offsetX + cell.x * cellSize, offsetY + cell.y * cellSize, cellSize, cellSize);
          ctx.globalAlpha = 1;
        }

        if (cell.structure) {
          this.drawStructure(cell.structure, cell.x, cell.y, cellSize, offsetX, offsetY);
        }

        if (cell.resource) {
          this.drawResource(cell.resource.type, cell.x, cell.y, cellSize, offsetX, offsetY);
        }
      }),
    );

    state.citizens.forEach((citizen) => {
      if (citizen.state === "dead") return;
      this.drawCitizen(citizen, cellSize, offsetX, offsetY);

      if (citizen === state.selectedCitizen) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX + citizen.x * cellSize, offsetY + citizen.y * cellSize, cellSize, cellSize);
      }
    });

    ctx.strokeStyle = "#f9dd82";
    ctx.lineWidth = 2;
    state.player.getCoveredCells().forEach(({ x, y }) => {
      ctx.strokeRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
    });

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      offsetX + (state.player.x - state.player.influenceRadius) * cellSize,
      offsetY + (state.player.y - state.player.influenceRadius) * cellSize,
      state.player.influenceRadius * 2 * cellSize,
      state.player.influenceRadius * 2 * cellSize,
    );

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
      default:
        return "transparent";
    }
  }

  private drawCitizen(citizen: Citizen, cellSize: number, offsetX: number, offsetY: number) {
    const ctx = this.ctx;
    const x = offsetX + citizen.x * cellSize;
    const y = offsetY + citizen.y * cellSize;

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
    ctx.fillRect(x + cellSize * 0.2, y + cellSize * 0.2, cellSize * 0.6, cellSize * 0.6);

    if (citizen.blessedUntil && citizen.age < citizen.blessedUntil) {
      ctx.strokeStyle = "#ffea00";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + cellSize * 0.15, y + cellSize * 0.15, cellSize * 0.7, cellSize * 0.7);
    }

    ctx.font = `${cellSize * 0.5}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(roleEmoji[citizen.role], x + cellSize * 0.5, y + cellSize * 0.5);

    if (citizen.health < 30) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(x, y, cellSize * (citizen.health / 100), cellSize * 0.1);
    }
  }

  private drawResource(type: ResourceType, x: number, y: number, cellSize: number, offsetX: number, offsetY: number) {
    const ctx = this.ctx;
    const emoji = type === "food" ? "🌾" : type === "stone" ? "🪨" : "💧";
    ctx.font = `${cellSize * 0.6}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, offsetX + x * cellSize + cellSize * 0.5, offsetY + y * cellSize + cellSize * 0.5);
  }

  private drawStructure(type: StructureType, x: number, y: number, cellSize: number, offsetX: number, offsetY: number) {
    const ctx = this.ctx;
    const emoji: Record<StructureType, string> = {
      village: "🏛️",
      granary: "🏪",
      house: "🏠",
      tower: "🗼",
      temple: "⛪",
      campfire: "🔥",
    };
    ctx.font = `${cellSize * 0.7}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji[type], offsetX + x * cellSize + cellSize * 0.5, offsetY + y * cellSize + cellSize * 0.5);
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
