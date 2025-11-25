import type { ClimateState, ToastNotification } from "../core/types";

export type HUDSnapshot = {
  faith: { value: number; perHour: number };
  tokens: { token1: number; token2: number };
  population: { value: number; trend: number };
  climate: ClimateState;
  food: { value: number; capacity: number; trend: number };
  stone: { value: number; capacity: number; trend: number };
  wood: { value: number; capacity: number; trend: number };
  water: number;
};

export class HUDController {
  private hudPopulation = document.querySelector<HTMLSpanElement>("#energy");
  private hudClimate = document.querySelector<HTMLSpanElement>("#time");
  private hudFaith = document.querySelector<HTMLSpanElement>("#score");
  private hudToken1 = document.querySelector<HTMLSpanElement>("#token1-value");
  private hudToken2 = document.querySelector<HTMLSpanElement>("#token2-value");
  private hudFood = document.querySelector<HTMLSpanElement>("#food");
  private hudStone = document.querySelector<HTMLSpanElement>("#stone");
  private hudWood = document.querySelector<HTMLSpanElement>("#wood");
  private hudWater = document.querySelector<HTMLSpanElement>("#water");
  private overlay = document.querySelector<HTMLDivElement>("#overlay");
  private historyList = document.querySelector<HTMLUListElement>("#history");
  private statusText = document.querySelector<HTMLParagraphElement>("#status-text");
  private pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");

  private notifications: ToastNotification[] = [];
  private nextNotificationId = 1;
  private historyEntries: string[] = [];
  private logArchive: string[] = [];

  updateHUD(snapshot: HUDSnapshot) {
    if (this.hudFaith) {
      const perHour = snapshot.faith.perHour;
      const trend = perHour > 0.01 ? "⬆️" : perHour < -0.01 ? "⬇️" : "➡️";
      this.hudFaith.textContent = `${Math.floor(snapshot.faith.value)} Faith ${trend}`;
      this.hudFaith.setAttribute("title", `Faith +${perHour.toFixed(2)}/h`);
    }

    if (this.hudToken1) {
      this.hudToken1.textContent = snapshot.tokens.token1.toFixed(2);
    }

    if (this.hudToken2) {
      this.hudToken2.textContent = snapshot.tokens.token2.toFixed(2);
    }
    if (this.hudPopulation) {
      const arrow = snapshot.population.trend > 0.1 ? "⬆️" : snapshot.population.trend < -0.1 ? "⬇️" : "➡️";
      this.hudPopulation.textContent = `${snapshot.population.value} inhabitants ${arrow}`;
    }

    if (this.hudClimate) {
      let icon = "⛅";
      let label = "Temperate climate";
      if (snapshot.climate.drought) {
        icon = "🌵";
        label = "Drought";
      } else if (snapshot.climate.rainy) {
        icon = "🌧️";
        label = "Rainy";
      }
      this.hudClimate.textContent = `${icon} ${label}`;
      this.hudClimate.setAttribute("title", label);
      this.hudClimate.setAttribute("aria-label", label);
    }

    if (this.hudFood) {
      const arrow = snapshot.food.trend > 0.5 ? "⬆️" : snapshot.food.trend < -0.5 ? "⬇️" : "➡️";
      this.hudFood.textContent = `${Math.floor(snapshot.food.value)}/${snapshot.food.capacity} ${arrow}`;
    }

    if (this.hudStone) {
      const arrow = snapshot.stone.trend > 0.2 ? "⬆️" : snapshot.stone.trend < -0.2 ? "⬇️" : "➡️";
      this.hudStone.textContent = `${Math.floor(snapshot.stone.value)}/${snapshot.stone.capacity} ${arrow}`;
    }

    if (this.hudWood) {
      const arrow = snapshot.wood.trend > 0.2 ? "⬆️" : snapshot.wood.trend < -0.2 ? "⬇️" : "➡️";
      this.hudWood.textContent = `${Math.floor(snapshot.wood.value)}/${snapshot.wood.capacity} ${arrow}`;
    }

    if (this.hudWater) {
      this.hudWater.textContent = Math.floor(snapshot.water).toString();
    }
  }

  updateStatus(text: string) {
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  appendHistory(message: string) {
    this.logArchive.push(message);
    this.historyEntries.unshift(message);
    this.historyEntries = this.historyEntries.slice(0, 12);
    if (this.historyList) {
      this.historyList.innerHTML = this.historyEntries.map((entry) => `<li>${entry}</li>`).join("");
    }
  }

  getHistoryArchive() {
    return [...this.logArchive];
  }

  showNotification(message: string, type: ToastNotification["type"] = "info", duration = 4000) {
    const notification: ToastNotification = {
      id: this.nextNotificationId++,
      message,
      type,
      timestamp: Date.now(),
      duration,
    };
    this.notifications.push(notification);
    if (this.notifications.length > 5) {
      this.notifications.shift();
    }
  }

  getNotifications() {
    return [...this.notifications];
  }

  tickNotifications() {
    const now = Date.now();
    this.notifications = this.notifications.filter((notif) => now - notif.timestamp < notif.duration);
  }

  setPauseButtonState(running: boolean) {
    if (this.pauseButton) {
      this.pauseButton.textContent = running ? "⏸️ Pause" : "▶️ Resume";
    }
  }

  setupHeaderButtons(onPauseToggle: () => void) {
    this.pauseButton?.addEventListener("click", onPauseToggle);
    this.setPauseButtonState(false);
  }

  registerOverlayInstructions(onStart: () => void) {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div>
        <h1>Guardian Spirit</h1>
        <p>Use the "Planning" panel or keys F/M/G/B to mark crops, mines, gathering, or construction (use [ and ] to change the building).</p>
        <p>Left-click on the map to paint or place blueprints; drag to cover multiple cells.</p>
        <p>Scroll on the map or use the +/- buttons to zoom in or out.</p>
        <p>Hold the middle mouse button and drag to move the camera.</p>
        <p>Watch the HUD for population, climate, and resources. Keep the tribe alive.</p>
        <p>Press Enter to start.</p>
      </div>
    `;

    const startHandler = (event: KeyboardEvent) => {
      if (event.code === "Enter") {
        this.hideOverlay();
        window.removeEventListener("keydown", startHandler);
        onStart();
      }
    };

    window.addEventListener("keydown", startHandler);
  }

  hideOverlay() {
    this.overlay?.setAttribute("hidden", "true");
  }

  showOverlay() {
    this.overlay?.removeAttribute("hidden");
  }

}
