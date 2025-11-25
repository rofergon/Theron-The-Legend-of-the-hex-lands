import type { WorldCell, Citizen, ResourceNode, ConstructionSite, Vec2 } from "../core/types";

export interface TooltipData {
  cell: WorldCell;
  citizens: Citizen[];
  position: { x: number; y: number };
  constructionSite?: ConstructionSite | null;
}

export type TooltipActionHandlers = {
  onCancelConstruction?: (siteId: number) => void;
  onClearPriority?: (cell: Vec2) => void;
};

export class CellTooltipController {
  private tooltipElement: HTMLElement | null = null;
  private isVisible = false;
  private handlers: TooltipActionHandlers;
  private currentData: TooltipData | null = null;

  constructor(handlers: TooltipActionHandlers = {}) {
    this.handlers = handlers;
    this.createTooltipElement();
  }

  private createTooltipElement() {
    this.tooltipElement = document.createElement("div");
    this.tooltipElement.id = "cell-tooltip";
    this.tooltipElement.className = "cell-tooltip";
    this.tooltipElement.style.cssText = `
      position: absolute;
      background: rgba(8, 11, 15, 0.96);
      border: 2px solid rgba(233, 204, 152, 0.4);
      border-radius: 12px;
      padding: 1rem;
      color: #f0e7dc;
      font-family: inherit;
      font-size: 0.85rem;
      min-width: 250px;
      max-width: 320px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      z-index: 1000;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      line-height: 1.4;
    `;
    document.body.appendChild(this.tooltipElement);
    this.tooltipElement.addEventListener("click", this.handleActionClick);
  }

  show(data: TooltipData) {
    if (!this.tooltipElement) return;

    this.currentData = data;
    this.tooltipElement.innerHTML = this.generateTooltipContent(data);
    this.updatePosition(data.position);

    this.isVisible = true;
    this.tooltipElement.style.opacity = "1";
    this.tooltipElement.style.transform = "translateY(0)";
  }

  hide() {
    if (!this.tooltipElement || !this.isVisible) return;

    this.isVisible = false;
    this.currentData = null;
    this.tooltipElement.style.opacity = "0";
    this.tooltipElement.style.transform = "translateY(-10px)";
  }

  isPointerOver(target?: EventTarget | null) {
    if (!this.tooltipElement) return false;
    if (target && target instanceof Node) {
      return this.tooltipElement.contains(target);
    }
    return false;
  }

  updatePosition(position: { x: number; y: number }) {
    if (!this.tooltipElement) return;

    // Calculate position to prevent tooltip from going off-screen
    const rect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x + 15; // Offset desde el cursor
    let y = position.y - 10;

    // Ajustar si se sale por la derecha
    if (x + rect.width > viewportWidth) {
      x = position.x - rect.width - 15;
    }

    // Ajustar si se sale por abajo
    if (y + rect.height > viewportHeight) {
      y = position.y - rect.height - 15;
    }

    // Asegurar que no se salga por arriba o izquierda
    x = Math.max(10, x);
    y = Math.max(10, y);

    this.tooltipElement.style.left = `${x}px`;
    this.tooltipElement.style.top = `${y}px`;
  }

  private handleActionClick = (event: MouseEvent) => {
    if (!this.currentData) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tooltip-action]");
    if (!target) return;
    const action = target.dataset.tooltipAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();

    if (action === "cancel-construction") {
      const siteId = Number(target.dataset.siteId ?? "-1");
      if (Number.isFinite(siteId) && siteId >= 0) {
        this.handlers.onCancelConstruction?.(siteId);
      }
      return;
    }

    if (action === "clear-priority") {
      this.handlers.onClearPriority?.({ x: this.currentData.cell.x, y: this.currentData.cell.y });
      return;
    }
  };

  private generateTooltipContent(data: TooltipData): string {
    const { cell, citizens, constructionSite } = data;

    let html = `
      <div style="border-bottom: 1px solid rgba(233, 204, 152, 0.3); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
        <strong style="color: #f7c87d; font-size: 1rem;">
          ${this.getTerrainIcon(cell.terrain)} ${this.getTerrainName(cell.terrain)}
        </strong>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem;">
          Position: (${cell.x}, ${cell.y})
        </div>
      </div>
    `;

    // Terrain information
    html += `<div style="margin-bottom: 0.75rem;">`;
    html += `<div><strong>🌱 Fertility:</strong> ${Math.round(cell.fertility * 100)}%</div>`;
    html += `<div><strong>💧 Moisture:</strong> ${Math.round(cell.moisture * 100)}%</div>`;
    html += `</div>`;

    // Resources
    if (cell.resource) {
      html += this.generateResourceSection(cell.resource);
    }

    // Structure
    if (cell.structure) {
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(247, 200, 125, 0.1); border-radius: 6px;">
          <div><strong>${this.getStructureIcon(cell.structure)} ${this.getStructureName(cell.structure)}</strong></div>
        </div>
      `;
    } else if (constructionSite) {
      const progress = Math.round((constructionSite.workDone / constructionSite.workRequired) * 100);
      const stone = `${constructionSite.stoneDelivered}/${constructionSite.stoneRequired}`;
      const wood = `${constructionSite.woodDelivered}/${constructionSite.woodRequired}`;
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.6rem; background: rgba(255, 170, 65, 0.08); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${this.getStructureIcon(constructionSite.type)} ${this.getStructureName(constructionSite.type)}</strong>
            <span style="font-size: 0.8rem; color: #facc15;">${progress}%</span>
          </div>
          <div style="margin-top: 0.35rem; font-size: 0.82rem; color: #f8fafc;">Phase: ${this.getConstructionPhase(constructionSite.phase)}</div>
          <div style="margin-top: 0.35rem; font-size: 0.82rem; color: #94a3b8;">Stone: ${stone} • Wood: ${wood}</div>
          <div style="display:flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap;">
            <button data-tooltip-action="cancel-construction" data-site-id="${constructionSite.id}" style="background: #b91c1c; color: #fff; border: none; padding: 0.45rem 0.6rem; border-radius: 6px; cursor: pointer; font-weight: 700; letter-spacing: 0.02em;">Cancel construction</button>
          </div>
        </div>
      `;
    }

    const isFarmCell = cell.priority === "farm" || cell.cropStage > 0 || Boolean(cell.farmTask);
    if (isFarmCell) {
      const progress = Math.round(cell.cropProgress * 100);
      const stageLabel = this.getCropStageLabel(cell.cropStage ?? 0);
      const taskLabel = cell.farmTask ? this.getFarmTaskName(cell.farmTask) : cell.cropStage === 3 ? "Harvest ready" : "Growing without help";
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.1); border-radius: 6px;">
          <div><strong>🌾 Crop:</strong> ${progress}% (${stageLabel})</div>
          <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem;">${taskLabel}</div>
        </div>
      `;
    } else if (cell.cropProgress > 0) {
      const progress = Math.round(cell.cropProgress * 100);
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.1); border-radius: 6px;">
          <div><strong>🌾 Vegetation:</strong> ${progress}%</div>
        </div>
      `;
    }

    // Priority
    if (cell.priority !== "none") {
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
          <div><strong>🎯 Priority:</strong> ${this.getPriorityName(cell.priority)}</div>
          <div style="margin-top: 0.5rem;">
            <button data-tooltip-action="clear-priority" style="background: transparent; color: #f8fafc; border: 1px solid rgba(255,255,255,0.3); padding: 0.35rem 0.6rem; border-radius: 6px; cursor: pointer;">Remove designation</button>
          </div>
        </div>
      `;
    }

    // Citizens in the cell
    if (citizens.length > 0) {
      html += this.generateCitizensSection(citizens);
    }

    // Additional information depending on terrain type
    html += this.generateTerrainInfo(cell);

    return html;
  }

  private generateResourceSection(resource: ResourceNode): string {
    const amount = Math.round(resource.amount);
    const richness = Math.round(resource.richness * 100);
    const renewable = resource.renewable ? "Renewable" : "Non-renewable";

    return `
      <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.15); border-radius: 6px;">
        <div><strong>${this.getResourceIcon(resource.type)} ${this.getResourceName(resource.type)}</strong></div>
        <div style="font-size: 0.8rem; margin-top: 0.3rem; color: #94a3b8;">
          <div>Amount: ${amount}</div>
          <div>Richness: ${richness}%</div>
          <div>Type: ${renewable}</div>
        </div>
      </div>
    `;
  }

  private generateCitizensSection(citizens: Citizen[]): string {
    let html = `
      <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(147, 51, 234, 0.1); border-radius: 6px;">
        <div><strong>👥 Citizens in cell (${citizens.length}):</strong></div>
        <div style="margin-top: 0.5rem;">
    `;

    citizens.forEach(citizen => {
      const health = Math.round(citizen.health);
      const healthColor = health > 70 ? "#22c55e" : health > 40 ? "#f59e0b" : "#ef4444";

      html += `
        <div style="margin-bottom: 0.3rem; padding: 0.3rem; background: rgba(0, 0, 0, 0.2); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span><strong>${this.getRoleIcon(citizen.role)} #${citizen.id}</strong></span>
            <span style="color: ${healthColor}; font-size: 0.8rem;">${health}% ❤️</span>
          </div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem;">
            ${this.getRoleName(citizen.role)} • Age: ${Math.floor(citizen.age)}
            ${citizen.carrying.food > 0 || citizen.carrying.stone > 0 || citizen.carrying.wood > 0 ?
          ` • Carrying: ${citizen.carrying.food}🌾 ${citizen.carrying.stone}🪨 ${citizen.carrying.wood}🌲` : ''}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    return html;
  }

  private generateTerrainInfo(cell: WorldCell): string {
    const walkable = this.isWalkable(cell.terrain);
    const canFarm = ["grassland", "forest"].includes(cell.terrain);

    let html = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(233, 204, 152, 0.2); font-size: 0.8rem; color: #94a3b8;">
        <div><strong>Terrain properties:</strong></div>
        <div style="margin-top: 0.3rem;">
          <div>Walkable: ${walkable ? "✅ Yes" : "❌ No"}</div>
          <div>Farmable: ${canFarm ? "✅ Yes" : "❌ No"}</div>
        </div>
    `;

    // Specific terrain info
    const terrainInfo = this.getSpecificTerrainInfo(cell.terrain);
    if (terrainInfo) {
      html += `<div style="margin-top: 0.5rem; font-style: italic; color: #cbd5e1;">${terrainInfo}</div>`;
    }

    html += `</div>`;
    return html;
  }

  private getTerrainIcon(terrain: string): string {
    const icons: Record<string, string> = {
      ocean: "🌊",
      beach: "🏖️",
      grassland: "🌿",
      forest: "🌲",
      desert: "🏜️",
      tundra: "🏔️",
      snow: "🏔️",
      mountain: "⛰️",
      swamp: "🪴",
      river: "🏞️"
    };
    return icons[terrain] || "🗺️";
  }

  private getTerrainName(terrain: string): string {
    const names: Record<string, string> = {
      ocean: "Ocean",
      beach: "Beach",
      grassland: "Grassland",
      forest: "Forest",
      desert: "Desert",
      tundra: "Tundra",
      snow: "Snow",
      mountain: "Mountain",
      swamp: "Swamp",
      river: "River"
    };
    return names[terrain] || terrain;
  }

  private getResourceIcon(resourceType: string): string {
    const icons: Record<string, string> = {
      food: "🌾",
      stone: "🪨",
      waterSpring: "💧",
      wood: "🌲"
    };
    return icons[resourceType] || "📦";
  }

  private getResourceName(resourceType: string): string {
    const names: Record<string, string> = {
      food: "Food",
      stone: "Stone",
      waterSpring: "Spring",
      wood: "Wood"
    };
    return names[resourceType] || resourceType;
  }

  private getStructureIcon(structure: string): string {
    const icons: Record<string, string> = {
      village: "🏛️",
      granary: "🏪",
      house: "🏠",
      tower: "🗼",
      temple: "⛪",
      campfire: "🔥",
      warehouse: "📦",
    };
    return icons[structure] || "🏗️";
  }

  private getStructureName(structure: string): string {
    const names: Record<string, string> = {
      village: "Village",
      granary: "Granary",
      house: "House",
      tower: "Tower",
      temple: "Temple",
      campfire: "Campfire",
      warehouse: "Warehouse",
    };
    return names[structure] || structure;
  }

  private getConstructionPhase(phase: ConstructionSite["phase"]): string {
    const labels: Record<ConstructionSite["phase"], string> = {
      foundation: "Foundation",
      structure: "Structure",
      finishing: "Finishing",
    };
    return labels[phase] ?? phase;
  }

  private getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      worker: "🔨",
      farmer: "👨‍🌾",
      warrior: "⚔️",
      scout: "🔍",
      child: "👶",
      elder: "👴"
    };
    return icons[role] || "👤";
  }

  private getRoleName(role: string): string {
    const names: Record<string, string> = {
      worker: "Worker",
      farmer: "Farmer",
      warrior: "Warrior",
      scout: "Scout",
      child: "Child",
      elder: "Elder"
    };
    return names[role] || role;
  }

  private getPriorityName(priority: string): string {
    const names: Record<string, string> = {
      explore: "Explore",
      defend: "Defend",
      farm: "Farm",
      mine: "Mine",
      none: "None"
    };
    return names[priority] || priority;
  }

  private getCropStageLabel(stage: number): string {
    const labels: Record<number, string> = {
      0: "Fallow",
      1: "Germinating",
      2: "Maturing",
      3: "Ready to harvest",
    };
    return labels[stage] ?? "Unknown";
  }

  private getFarmTaskName(task: string): string {
    const names: Record<string, string> = {
      sow: "Sowing needed",
      fertilize: "Needs fertilization",
      harvest: "Needs harvest",
    };
    return names[task] ?? task;
  }

  private isWalkable(terrain: string): boolean {
    const unwalkable = ["ocean", "snow"];
    return !unwalkable.includes(terrain);
  }

  private getSpecificTerrainInfo(terrain: string): string | null {
    const info: Record<string, string> = {
      ocean: "Provides aquatic resources. Not walkable.",
      beach: "Coastal area with low fertility.",
      grassland: "Ideal for agriculture and grazing.",
      forest: "Rich in food and wood resources.",
      desert: "Dry and arid, difficult for life.",
      tundra: "Cold and infertile, limited resources.",
      snow: "Frozen and impassable area.",
      mountain: "Rich in minerals. Walkable but more exhausting (2x fatigue).",
      swamp: "Wet and swampy, moderately fertile. Slow movement (1.3x fatigue).",
      river: "Source of fresh water. Slow movement (1.5x fatigue)."
    };
    return info[terrain] || null;
  }

  destroy() {
    if (this.tooltipElement) {
      document.body.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }
  }
}
