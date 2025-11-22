import type { ClimateState, ToastNotification } from "../core/types";

export type HUDSnapshot = {
  population: { value: number; trend: number };
  climate: ClimateState;
  food: { value: number; capacity: number; trend: number };
  stone: { value: number; capacity: number; trend: number };
  wood: { value: number; capacity: number; trend: number };
  water: number;
};

export class HUDController {
  private hudScore = document.querySelector<HTMLSpanElement>("#score");
  private hudPopulation = document.querySelector<HTMLSpanElement>("#energy");
  private hudClimate = document.querySelector<HTMLSpanElement>("#time");
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
    if (this.hudPopulation) {
      const arrow = snapshot.population.trend > 0.1 ? "⬆️" : snapshot.population.trend < -0.1 ? "⬇️" : "➡️";
      this.hudPopulation.textContent = `${snapshot.population.value} habitantes ${arrow}`;
    }

    if (this.hudClimate) {
      let icon = "⛅";
      let label = "Clima templado";
      if (snapshot.climate.drought) {
        icon = "🌵";
        label = "Sequía";
      } else if (snapshot.climate.rainy) {
        icon = "🌧️";
        label = "Lluvia";
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
      this.pauseButton.textContent = running ? "⏸️ Pausar" : "▶️ Reanudar";
    }
  }

  setupHeaderButtons(onPauseToggle: () => void) {
    const btnNewGame = document.querySelector("#btn-new-game");
    const btnSave = document.querySelector("#btn-save");
    const btnLoad = document.querySelector("#btn-load");
    const btnSettings = document.querySelector("#btn-settings");
    const btnHelp = document.querySelector("#btn-help");
    const btnWallet = document.querySelector("#btn-wallet");
    const walletIcon = document.querySelector<HTMLSpanElement>("#wallet-icon");
    const walletText = document.querySelector<HTMLSpanElement>("#wallet-text");

    btnNewGame?.addEventListener("click", () => {
      if (confirm("¿Iniciar una nueva partida? Se perderá el progreso actual.")) {
        window.location.reload();
      }
    });

    btnSave?.addEventListener("click", () => {
      this.showNotification("Función de guardado próximamente disponible", "info");
    });

    btnLoad?.addEventListener("click", () => {
      this.showNotification("Función de carga próximamente disponible", "info");
    });

    btnSettings?.addEventListener("click", () => {
      this.showNotification("Configuración próximamente disponible", "info");
    });

    btnHelp?.addEventListener("click", () => {
      this.showNotification("Usa F/M/G/B para planificar áreas, [ y ] para cambiar estructuras", "info", 6000);
    });

    btnWallet?.addEventListener("click", () => {
      this.handleWalletConnection(walletIcon, walletText);
    });

    // Verificar estado inicial de la wallet
    this.updateWalletButton(walletIcon, walletText);

    this.pauseButton?.addEventListener("click", onPauseToggle);
    this.setPauseButtonState(false);
  }

  registerOverlayInstructions(onStart: () => void) {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div>
        <h1>Espíritu Guardián</h1>
        <p>Panel "Planificación" o teclas F/M/G/B para marcar cultivos, minas, recolección o construcción (usa [ y ] para cambiar edificio).</p>
        <p>Haz clic izquierdo sobre el mapa para pintar o colocar planos; arrastra para cubrir varias celdas.</p>
        <p>Rueda sobre el mapa o usa los botones +/- para acercar o alejar.</p>
        <p>Mantén el click medio y arrastra para desplazar la cámara.</p>
        <p>Observa el HUD para población, clima y recursos. Mantén viva la tribu.</p>
        <p>Presiona Enter para comenzar.</p>
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

  private async handleWalletConnection(
    iconEl: HTMLSpanElement | null,
    textEl: HTMLSpanElement | null
  ) {
    // Importar dinámicamente para evitar errores en build
    try {
      const walletConfig = await import("../wallet/walletConfig");
      
      if (!walletConfig.isOneWalletInstalled()) {
        this.showNotification(
          "OneWallet no está instalada. Por favor instálala para conectar con OneChain.",
          "warning",
          5000
        );
        // Link a la página de OneChain para descargar OneWallet
        window.open(
          "https://docs.onelabs.cc/",
          "_blank"
        );
        return;
      }

      if (walletConfig.isWalletConnected()) {
        // Desconectar
        await walletConfig.disconnectOneWallet();
        this.updateWalletButton(iconEl, textEl);
        this.showNotification("Billetera desconectada", "info");
      } else {
        // Conectar
        const result = await walletConfig.connectOneWallet();
        
        if (result.success && result.account) {
          this.updateWalletButton(iconEl, textEl);
          this.showNotification(
            `Conectado: ${this.shortenAddress(result.account.address)} | Balance: ${result.account.balance?.toFixed(4) || '0'} OCT`,
            "success",
            6000
          );
        } else {
          this.showNotification(
            `Error: ${result.error || "No se pudo conectar"}`,
            "warning"
          );
        }
      }
    } catch (error) {
      console.error("Error al cargar configuración de wallet:", error);
      this.showNotification("Error al cargar módulo de wallet", "warning");
    }
  }

  private async updateWalletButton(
    iconEl: HTMLSpanElement | null,
    textEl: HTMLSpanElement | null
  ) {
    try {
      const walletConfig = await import("../wallet/walletConfig");
      
      if (walletConfig.isWalletConnected()) {
        const accountInfo = await walletConfig.getCurrentAccountInfo();
        if (iconEl) iconEl.textContent = "✅";
        if (textEl && accountInfo) {
          textEl.textContent = this.shortenAddress(accountInfo.address);
          textEl.title = `Balance: ${accountInfo.balance?.toFixed(4) || '0'} OCT`;
        }
      } else {
        if (iconEl) iconEl.textContent = "🔗";
        if (textEl) {
          textEl.textContent = "Conectar";
          textEl.title = "Conectar OneWallet";
        }
      }
    } catch (error) {
      // Wallet config no disponible
      if (iconEl) iconEl.textContent = "🔗";
      if (textEl) textEl.textContent = "Conectar";
    }
  }

  private shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
