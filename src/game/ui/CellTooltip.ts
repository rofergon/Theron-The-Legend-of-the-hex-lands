import type { WorldCell, Citizen, ResourceNode } from "../core/types";

export interface TooltipData {
  cell: WorldCell;
  citizens: Citizen[];
  position: { x: number; y: number };
}

export class CellTooltipController {
  private tooltipElement: HTMLElement | null = null;
  private isVisible = false;

  constructor() {
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
      pointer-events: none;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      line-height: 1.4;
    `;
    document.body.appendChild(this.tooltipElement);
  }

  show(data: TooltipData) {
    if (!this.tooltipElement) return;

    this.tooltipElement.innerHTML = this.generateTooltipContent(data);
    this.updatePosition(data.position);
    
    this.isVisible = true;
    this.tooltipElement.style.opacity = "1";
    this.tooltipElement.style.transform = "translateY(0)";
  }

  hide() {
    if (!this.tooltipElement || !this.isVisible) return;

    this.isVisible = false;
    this.tooltipElement.style.opacity = "0";
    this.tooltipElement.style.transform = "translateY(-10px)";
  }

  updatePosition(position: { x: number; y: number }) {
    if (!this.tooltipElement) return;

    // Calcular posición para evitar que se salga de la pantalla
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

  private generateTooltipContent(data: TooltipData): string {
    const { cell, citizens } = data;
    
    let html = `
      <div style="border-bottom: 1px solid rgba(233, 204, 152, 0.3); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
        <strong style="color: #f7c87d; font-size: 1rem;">
          ${this.getTerrainIcon(cell.terrain)} ${this.getTerrainName(cell.terrain)}
        </strong>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem;">
          Posición: (${cell.x}, ${cell.y})
        </div>
      </div>
    `;

    // Información del terreno
    html += `<div style="margin-bottom: 0.75rem;">`;
    html += `<div><strong>🌱 Fertilidad:</strong> ${Math.round(cell.fertility * 100)}%</div>`;
    html += `<div><strong>💧 Humedad:</strong> ${Math.round(cell.moisture * 100)}%</div>`;
    html += `</div>`;

    // Recursos
    if (cell.resource) {
      html += this.generateResourceSection(cell.resource);
    }

    // Estructura
    if (cell.structure) {
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(247, 200, 125, 0.1); border-radius: 6px;">
          <div><strong>${this.getStructureIcon(cell.structure)} ${this.getStructureName(cell.structure)}</strong></div>
        </div>
      `;
    }

    const isFarmCell = cell.priority === "farm" || cell.cropStage > 0 || Boolean(cell.farmTask);
    if (isFarmCell) {
      const progress = Math.round(cell.cropProgress * 100);
      const stageLabel = this.getCropStageLabel(cell.cropStage ?? 0);
      const taskLabel = cell.farmTask ? this.getFarmTaskName(cell.farmTask) : cell.cropStage === 3 ? "Cosecha lista" : "Creciendo sin ayuda";
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.1); border-radius: 6px;">
          <div><strong>🌾 Cultivo:</strong> ${progress}% (${stageLabel})</div>
          <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem;">${taskLabel}</div>
        </div>
      `;
    } else if (cell.cropProgress > 0) {
      const progress = Math.round(cell.cropProgress * 100);
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.1); border-radius: 6px;">
          <div><strong>🌾 Vegetación:</strong> ${progress}%</div>
        </div>
      `;
    }

    // Prioridad
    if (cell.priority !== "none") {
      html += `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
          <div><strong>🎯 Prioridad:</strong> ${this.getPriorityName(cell.priority)}</div>
        </div>
      `;
    }

    // Ciudadanos en la celda
    if (citizens.length > 0) {
      html += this.generateCitizensSection(citizens);
    }

    // Información adicional según el tipo de terreno
    html += this.generateTerrainInfo(cell);

    return html;
  }

  private generateResourceSection(resource: ResourceNode): string {
    const amount = Math.round(resource.amount);
    const richness = Math.round(resource.richness * 100);
    const renewable = resource.renewable ? "Renovable" : "No renovable";
    
    return `
      <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.15); border-radius: 6px;">
        <div><strong>${this.getResourceIcon(resource.type)} ${this.getResourceName(resource.type)}</strong></div>
        <div style="font-size: 0.8rem; margin-top: 0.3rem; color: #94a3b8;">
          <div>Cantidad: ${amount}</div>
          <div>Riqueza: ${richness}%</div>
          <div>Tipo: ${renewable}</div>
        </div>
      </div>
    `;
  }

  private generateCitizensSection(citizens: Citizen[]): string {
    let html = `
      <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(147, 51, 234, 0.1); border-radius: 6px;">
        <div><strong>👥 Ciudadanos en la celda (${citizens.length}):</strong></div>
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
            ${this.getRoleName(citizen.role)} • Edad: ${Math.floor(citizen.age)}
            ${citizen.carrying.food > 0 || citizen.carrying.stone > 0 ? 
              ` • Carga: ${citizen.carrying.food}🌾 ${citizen.carrying.stone}🪨` : ''}
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
        <div><strong>Propiedades del terreno:</strong></div>
        <div style="margin-top: 0.3rem;">
          <div>Caminable: ${walkable ? "✅ Sí" : "❌ No"}</div>
          <div>Cultivable: ${canFarm ? "✅ Sí" : "❌ No"}</div>
        </div>
    `;

    // Información específica del terreno
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
      ocean: "Océano",
      beach: "Playa",
      grassland: "Pradera",
      forest: "Bosque",
      desert: "Desierto",
      tundra: "Tundra",
      snow: "Nieve",
      mountain: "Montaña",
      swamp: "Pantano",
      river: "Río"
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
      food: "Comida",
      stone: "Piedra",
      waterSpring: "Manantial",
      wood: "Madera"
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
      campfire: "🔥"
    };
    return icons[structure] || "🏗️";
  }

  private getStructureName(structure: string): string {
    const names: Record<string, string> = {
      village: "Aldea",
      granary: "Granero",
      house: "Casa",
      tower: "Torre",
      temple: "Templo",
      campfire: "Fogata"
    };
    return names[structure] || structure;
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
      worker: "Trabajador",
      farmer: "Granjero",
      warrior: "Guerrero",
      scout: "Explorador",
      child: "Niño",
      elder: "Anciano"
    };
    return names[role] || role;
  }

  private getPriorityName(priority: string): string {
    const names: Record<string, string> = {
      explore: "Explorar",
      defend: "Defender",
      farm: "Farmear",
      mine: "Minar",
      none: "Ninguna"
    };
    return names[priority] || priority;
  }

  private getCropStageLabel(stage: number): string {
    const labels: Record<number, string> = {
      0: "Barbecho",
      1: "Germinando",
      2: "Madurando",
      3: "Listo para cosechar",
    };
    return labels[stage] ?? "Desconocido";
  }

  private getFarmTaskName(task: string): string {
    const names: Record<string, string> = {
      sow: "Siembra necesaria",
      fertilize: "Requiere fertilización",
      harvest: "Requiere cosecha",
    };
    return names[task] ?? task;
  }

  private isWalkable(terrain: string): boolean {
    const unwalkable = ["ocean", "mountain", "snow"];
    return !unwalkable.includes(terrain);
  }

  private getSpecificTerrainInfo(terrain: string): string | null {
    const info: Record<string, string> = {
      ocean: "Proporciona recursos acuáticos. No se puede caminar.",
      beach: "Zona costera con baja fertilidad.",
      grassland: "Ideal para agricultura y pastoreo.",
      forest: "Rica en recursos alimentarios y madera.",
      desert: "Seco y árido, difícil para la vida.",
      tundra: "Frío y poco fértil, recursos limitados.",
      snow: "Zona helada e intransitable.",
      mountain: "Rica en minerales pero intransitable.",
      swamp: "Húmedo y pantanoso, moderadamente fértil.",
      river: "Fuente de agua fresca, navegable."
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
