import type { Citizen } from "../core/types";

type CitizenPanelOptions = {
  onSelect: (citizenId: number) => void;
};

export class CitizenPanelController {
  private listElement = document.querySelector<HTMLDivElement>("#citizen-list");
  private detailElement = document.querySelector<HTMLDivElement>("#citizen-detail");

  constructor(private options: CitizenPanelOptions) {
    this.listElement?.addEventListener("click", this.handleListClick);
  }

  update(citizens: Citizen[], selectedCitizen: Citizen | null) {
    if (!this.listElement || !this.detailElement) return;
    const selectedId = selectedCitizen?.id ?? null;
    this.renderList(citizens, selectedId);
    this.renderDetail(selectedCitizen);
  }

  private renderList(citizens: Citizen[], selectedId: number | null) {
    if (!this.listElement) return;
    if (citizens.length === 0) {
      this.listElement.innerHTML = `<p class="citizen-list-empty">No hay habitantes disponibles.</p>`;
      return;
    }

    const ordered = [...citizens].sort((a, b) => {
      if (a.state !== b.state) {
        return a.state === "alive" ? -1 : 1;
      }
      if (a.tribeId !== b.tribeId) {
        return a.tribeId === 1 ? -1 : b.tribeId === 1 ? 1 : a.tribeId - b.tribeId;
      }
      return a.id - b.id;
    });

    this.listElement.innerHTML = ordered
      .map((citizen) => this.renderListItem(citizen, citizen.id === selectedId))
      .join("");
  }

  private renderListItem(citizen: Citizen, selected: boolean) {
    const icon = this.getRoleEmoji(citizen.role);
    const lastAction = citizen.actionHistory[0]?.description ?? "Sin actividad reciente.";
    const stateBadge = citizen.state === "dead" ? "☠️" : citizen.tribeId === 1 ? "🛖" : "⚠️";
    return `
      <button class="citizen-row ${selected ? "is-selected" : ""}" data-citizen-id="${citizen.id}">
        <span class="citizen-row-id">${stateBadge} #${citizen.id}</span>
        <span class="citizen-row-role">${icon} ${this.getRoleLabel(citizen.role)}</span>
        <span class="citizen-row-health">${Math.floor(citizen.health)}% ❤️</span>
        <span class="citizen-row-note">${lastAction}</span>
      </button>
    `;
  }

  private renderDetail(citizen: Citizen | null) {
    if (!this.detailElement) return;
    if (!citizen) {
      this.detailElement.innerHTML = `<p class="citizen-detail-empty">Selecciona un habitante para ver sus detalles.</p>`;
      return;
    }

    const inventory = `
      <div class="citizen-inventory">
        <span title="Comida transportada">🌾 ${citizen.carrying.food}</span>
        <span title="Piedra transportada">🪨 ${citizen.carrying.stone}</span>
      </div>
    `;

    const stats = `
      <div class="citizen-stats">
        ${this.renderStat("Salud", citizen.health, "salud")}
        ${this.renderStat("Hambre", citizen.hunger, "hambre")}
        ${this.renderStat("Moral", citizen.morale, "moral")}
        ${this.renderStat("Fatiga", citizen.fatigue, "fatiga")}
      </div>
    `;

    const history =
      citizen.actionHistory.length > 0
        ? `<ul class="citizen-history-list">
            ${citizen.actionHistory
              .map(
                (entry) =>
                  `<li><span class="citizen-history-time">${this.formatHours(entry.timestamp)}</span><span>${entry.description}</span></li>`,
              )
              .join("")}
          </ul>`
        : `<p class="citizen-detail-empty">Sin acciones registradas todavía.</p>`;

    this.detailElement.innerHTML = `
      <div class="citizen-detail-header">
        <div>
          <h3>Habitante #${citizen.id}</h3>
          <p>${this.getRoleLabel(citizen.role)} · ${citizen.state === "dead" ? "☠️ Muerto" : "🟢 Vivo"} · Edad ${Math.floor(
            citizen.age,
          )} · (${citizen.x}, ${citizen.y})</p>
        </div>
        <div class="citizen-detail-tags">
          <span>Tribu ${citizen.tribeId}</span>
          ${citizen.currentGoal ? `<span>${citizen.currentGoal}</span>` : ""}
        </div>
      </div>
      ${stats}
      ${inventory}
      <div class="citizen-history">
        <h4>Historial reciente</h4>
        ${history}
      </div>
    `;
  }

  private renderStat(label: string, value: number, className: string) {
    const percent = Math.max(0, Math.min(100, Math.floor(value)));
    return `
      <div class="citizen-stat citizen-stat-${className}">
        <span>${label}</span>
        <div class="citizen-stat-bar">
          <div style="width:${percent}%"></div>
        </div>
        <span class="citizen-stat-value">${percent}%</span>
      </div>
    `;
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

  private getRoleEmoji(role: Citizen["role"]) {
    const icons: Record<Citizen["role"], string> = {
      worker: "🔨",
      farmer: "👨‍🌾",
      warrior: "⚔️",
      scout: "🔍",
      child: "👶",
      elder: "👴",
    };
    return icons[role];
  }

  private formatHours(hours: number) {
    return `${hours.toFixed(1)}h`;
  }

  private handleListClick = (event: Event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-citizen-id]");
    if (!target) return;
    const id = Number.parseInt(target.dataset.citizenId ?? "", 10);
    if (Number.isNaN(id)) return;
    this.options.onSelect(id);
  };
}
