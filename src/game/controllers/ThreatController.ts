import { clamp } from "../core/utils";
import type { Vec2 } from "../core/types";
import type { SimulationSession, ThreatAlert } from "../core/SimulationSession";
import type { HUDController } from "../ui/HUDController";
import type { CameraController } from "../core/CameraController";
import { ContractService } from "../wallet/contractService";
import { walletManager } from "../wallet/WalletManager";

/**
 * Dependencies required by the ThreatController
 */
interface ThreatDependencies {
  hud: HUDController;
  camera: CameraController;
  getSimulation: () => SimulationSession | null;
  onPause: () => void;
  onResume: () => void;
  onRequestRender: () => void;
  playerTribeId: number;
}

/**
 * Manages threat alerts (raids and beast attacks)
 * Handles modal display, camera focus, and HEX token blessing system
 */
export class ThreatController {
  // Modal UI elements
  private threatModal = document.querySelector<HTMLDivElement>("#threat-modal");
  private threatBackdrop = document.querySelector<HTMLDivElement>("#threat-modal-backdrop");
  private threatTitle = document.querySelector<HTMLHeadingElement>("#threat-modal-title");
  private threatSubtitle = document.querySelector<HTMLParagraphElement>("#threat-modal-subtitle");
  private threatIcons = document.querySelector<HTMLDivElement>("#threat-modal-icons");
  private threatCount = document.querySelector<HTMLSpanElement>("#threat-modal-count");
  private threatFocusButton = document.querySelector<HTMLButtonElement>("#threat-modal-focus");
  private threatCloseButton = document.querySelector<HTMLButtonElement>("#threat-modal-close");
  private threatResumeButton = document.querySelector<HTMLButtonElement>("#threat-modal-resume");
  private threatBurnButton = document.querySelector<HTMLButtonElement>("#threat-modal-burn");
  private threatBlessingStatus = document.querySelector<HTMLParagraphElement>("#threat-blessing-status");

  // Track threat location for camera focus
  private lastThreatFocus: Vec2 | null = null;
  private lastThreatAlert: ThreatAlert | null = null;
  // Warriors present when threat appeared (eligible for blessing)
  private preThreatWarriors: number[] = [];
  // Track whether blessing has been applied
  private blessingApplied = false;
  // Track ongoing burn transaction
  private burningHex = false;
  // Store bound handlers for cleanup (prevents memory leaks)
  private boundHandlers: {
    backdropClick?: () => void;
    closeClick?: () => void;
    resumeClick?: () => void;
    focusClick?: () => void;
    burnClick?: () => Promise<void>;
  } = {};

  constructor(private readonly deps: ThreatDependencies) { }

  /**
   * Initialize threat modal and event listeners
   */
  init() {
    this.setupThreatModal();
  }

  /**
   * Clean up and hide modal
   */
  destroy() {
    this.hideModal();
    // Remove all event listeners to prevent memory leaks
    if (this.boundHandlers.backdropClick) {
      this.threatBackdrop?.removeEventListener("click", this.boundHandlers.backdropClick);
    }
    if (this.boundHandlers.closeClick) {
      this.threatCloseButton?.removeEventListener("click", this.boundHandlers.closeClick);
    }
    if (this.boundHandlers.resumeClick) {
      this.threatResumeButton?.removeEventListener("click", this.boundHandlers.resumeClick);
    }
    if (this.boundHandlers.focusClick) {
      this.threatFocusButton?.removeEventListener("click", this.boundHandlers.focusClick);
    }
    if (this.boundHandlers.burnClick) {
      this.threatBurnButton?.removeEventListener("click", this.boundHandlers.burnClick);
    }
    this.boundHandlers = {};
  }

  /**
   * Handle incoming threat alert - pause game and show modal
   */
  handleThreat(alert: ThreatAlert) {
    this.burningHex = false;
    this.lastThreatAlert = alert;
    this.preThreatWarriors = this.captureWarriorIds();
    this.blessingApplied = false;
    this.deps.onPause();
    this.populateThreatModal(alert);
    this.focusOnThreat(alert);
  }

  /**
   * Set up modal button event handlers
   */
  private setupThreatModal() {
    // Store handlers as class properties for cleanup in destroy()
    this.boundHandlers.backdropClick = () => this.hideModal();
    this.boundHandlers.closeClick = () => this.hideModal();
    this.boundHandlers.resumeClick = () => {
      this.hideModal();
      this.deps.onResume();
      this.deps.hud.updateStatus("▶️ Simulation resumed.");
    };
    this.boundHandlers.focusClick = () => {
      if (!this.lastThreatFocus && this.lastThreatAlert) {
        this.focusOnThreat(this.lastThreatAlert);
      }
      if (this.lastThreatFocus) {
        this.deps.camera.focusOn(this.lastThreatFocus);
      }
      this.deps.onRequestRender();
      this.deps.hud.updateStatus("Centered on threat. Game paused.");
    };
    this.boundHandlers.burnClick = this.handleThreatBurn;

    this.threatBackdrop?.addEventListener("click", this.boundHandlers.backdropClick);
    this.threatCloseButton?.addEventListener("click", this.boundHandlers.closeClick);
    this.threatResumeButton?.addEventListener("click", this.boundHandlers.resumeClick);
    this.threatFocusButton?.addEventListener("click", this.boundHandlers.focusClick);
    this.threatBurnButton?.addEventListener("click", this.boundHandlers.burnClick);
  }

  /**
   * Hide the threat modal
   */
  private hideModal() {
    this.threatModal?.classList.add("hidden");
    this.threatBackdrop?.classList.add("hidden");
  }

  /**
   * Populate modal with threat details and icons
   */
  private populateThreatModal(alert: ThreatAlert) {
    if (!this.threatModal || !this.threatBackdrop) return;
    this.threatModal.classList.remove("hidden");
    this.threatBackdrop.classList.remove("hidden");

    const icon = alert.flavor === "beast" ? "🐺" : alert.icon || "⚔️";

    if (this.threatTitle) {
      this.threatTitle.textContent = `${icon} ${alert.tribeName} attack`;
    }
    if (this.threatSubtitle) {
      this.threatSubtitle.textContent =
        alert.flavor === "raid"
          ? "Hostile raiders have appeared at the edge of your lands."
          : "Wild beasts have entered the valley. Prepare defenses.";
    }
    if (this.threatCount) {
      this.threatCount.textContent = `${alert.attackers} enemy units detected`;
    }
    if (this.threatIcons) {
      this.threatIcons.innerHTML = "";
      const count = Math.min(alert.attackers, 12);
      for (let i = 0; i < count; i += 1) {
        const badge = document.createElement("span");
        badge.className = "threat-icon";
        badge.textContent = icon;
        this.threatIcons.appendChild(badge);
      }
    }
    if (this.threatBurnButton) {
      this.threatBurnButton.textContent = this.blessingApplied ? "Blessing applied" : "Burn 20 HEX & bless warriors";
      this.threatBurnButton.disabled = this.blessingApplied || this.burningHex;
    }
    if (this.threatBlessingStatus) {
      this.threatBlessingStatus.textContent = "";
      this.threatBlessingStatus.classList.add("hidden");
      this.threatBlessingStatus.classList.remove("success", "error");
    }
    this.deps.hud.updateStatus("⚠️ Invasion detected. Game paused.");
  }

  /**
   * Focus camera on threat spawn location
   */
  private focusOnThreat(alert: ThreatAlert) {
    if (!alert.spawn || alert.spawn.length === 0) {
      this.lastThreatFocus = null;
      return;
    }
    const center = alert.spawn.reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 },
    );
    const focusPoint = {
      x: center.x / alert.spawn.length,
      y: center.y / alert.spawn.length,
    };
    this.lastThreatFocus = focusPoint;
    this.deps.camera.focusOn(focusPoint);
    this.deps.onRequestRender();
  }

  /**
   * Handle HEX token burn to bless warriors
   * Burns 20 HEX tokens on-chain to grant resistance boost
   */
  private handleThreatBurn = async () => {
    if (this.burningHex || this.blessingApplied) return;

    const resetBurnButton = () => {
      if (this.threatBurnButton) {
        this.threatBurnButton.textContent = this.blessingApplied ? "Blessing applied" : "Burn 20 HEX & bless warriors";
        this.threatBurnButton.disabled = this.blessingApplied;
      }
    };

    this.burningHex = true;
    if (this.threatBurnButton) {
      this.threatBurnButton.disabled = true;
      this.threatBurnButton.textContent = "Burning 20 HEX...";
    }

    // Ensure Wallet is connected before attempting the burn
    if (!walletManager.isConnected()) {
      this.deps.hud.updateStatus("Opening wallet for blessing...");
      walletManager.openModal();

      // Since connection is async via modal, we reset and wait for user to click again after connecting
      // Ideally we would wait for connection, but for simplicity in this flow:
      this.deps.hud.showNotification("Connect wallet and try again", "warning");
      this.burningHex = false;
      resetBurnButton();
      return;
    }

    // UI Updates during process
    if (this.deps.hud) {
      this.deps.hud.updateStatus("Initiating HEX burn transaction...");
    }

    const result = await ContractService.burnHex(20);

    this.burningHex = false;

    if (!result.success) {
      resetBurnButton();
      this.deps.hud.updateStatus(result.error ?? "HEX burn failed.");
      this.deps.hud.showNotification(result.error ?? "HEX burn failed", "critical");
      if (this.threatBlessingStatus) {
        this.threatBlessingStatus.textContent = result.error ?? "HEX burn failed.";
        this.threatBlessingStatus.classList.remove("hidden", "success");
        this.threatBlessingStatus.classList.add("error");
      }
      return;
    }

    // Success flow
    const blessing = this.applyWarriorBlessing();
    resetBurnButton();
    const blessedCount = blessing.boosted;
    const message =
      blessedCount > 0
        ? `✨ Transaction confirmed • ${blessedCount} warrior${blessedCount === 1 ? "" : "s"} blessed with +20% resistance.`
        : "✨ Transaction confirmed • Warriors ready, but no eligible units were present.";
    this.deps.hud.updateStatus(message);
    this.deps.hud.showNotification(message, "success", 6000);
    if (this.threatBlessingStatus) {
      const list =
        blessing.boostedIds.length > 0
          ? `IDs: ${blessing.boostedIds.slice(0, 5).map((id) => `#${id}`).join(", ")}${blessing.boostedIds.length > 5 ? "..." : ""}`
          : "";
      this.threatBlessingStatus.textContent = `${message}${list ? ` • ${list}` : ""}`;
      this.threatBlessingStatus.classList.remove("hidden", "error");
      this.threatBlessingStatus.classList.add("success");
    }
    this.showBlessingToast(message);
  };

  /**
   * Capture IDs of all current warriors for blessing eligibility
   */
  private captureWarriorIds() {
    const simulation = this.deps.getSimulation();
    if (!simulation) return [];
    return simulation
      .getCitizenSystem()
      .getCitizens()
      .filter((c) => c.state === "alive" && c.role === "warrior" && c.tribeId === this.deps.playerTribeId)
      .map((c) => c.id);
  }

  /**
   * Apply resistance blessing to warriors that existed before threat
   * Grants +20% damage resistance and health boost
   */
  private applyWarriorBlessing(): { boosted: number; boostedIds: number[] } {
    const simulation = this.deps.getSimulation();
    if (!simulation) return { boosted: 0, boostedIds: [] as number[] };
    const citizens = simulation.getCitizenSystem().getCitizens();
    let boosted = 0;
    const boostedIds: number[] = [];
    for (const citizen of citizens) {
      if (citizen.state !== "alive") continue;
      if (citizen.role !== "warrior") continue;
      if (!this.preThreatWarriors.includes(citizen.id)) continue;
      citizen.damageResistance = Math.max(citizen.damageResistance ?? 0, 0.2);
      citizen.health = clamp(citizen.health * 1.2, -50, 100);
      citizen.hexBlessed = true;
      boosted += 1;
      boostedIds.push(citizen.id);
    }
    this.deps.hud.updateStatus(
      boosted > 0
        ? `🔥 Warriors blessed: ${boosted} reinforced with +20% resistance.`
        : "No existing warriors to bless.",
    );
    this.blessingApplied = boosted > 0;
    return { boosted, boostedIds };
  }

  /**
   * Lightweight in-game toast for blessing success
   */
  private showBlessingToast(message: string) {
    const overlay = document.createElement("div");
    overlay.className = "floating-toast blessing-toast";

    // Create elements safely without innerHTML to prevent XSS
    const iconDiv = document.createElement("div");
    iconDiv.className = "toast-icon";
    iconDiv.textContent = "🛡️";

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "toast-body";

    const titleDiv = document.createElement("div");
    titleDiv.className = "toast-title";
    titleDiv.textContent = "Blessing Applied";

    const messageDiv = document.createElement("div");
    messageDiv.className = "toast-message";
    messageDiv.textContent = message;

    bodyDiv.appendChild(titleDiv);
    bodyDiv.appendChild(messageDiv);
    overlay.appendChild(iconDiv);
    overlay.appendChild(bodyDiv);

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add("show"), 50);
    setTimeout(() => overlay.classList.remove("show"), 4200);
    setTimeout(() => overlay.remove(), 4700);
  }
}
