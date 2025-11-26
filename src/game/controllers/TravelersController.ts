import type { Vec2 } from "../core/types";
import type { TravelerArrival } from "../core/SimulationSession";
import type { HUDController } from "../ui/HUDController";
import type { CameraController } from "../core/CameraController";

interface TravelerDependencies {
  hud: HUDController;
  camera: CameraController;
  onPause: () => void;
  onResume: () => void;
  onRequestRender: () => void;
}

export class TravelersController {
  private modal = document.querySelector<HTMLDivElement>("#travelers-modal");
  private backdrop = document.querySelector<HTMLDivElement>("#travelers-modal-backdrop");
  private title = document.querySelector<HTMLHeadingElement>("#travelers-modal-title");
  private subtitle = document.querySelector<HTMLParagraphElement>("#travelers-modal-subtitle");
  private count = document.querySelector<HTMLParagraphElement>("#travelers-modal-count");
  private focusButton = document.querySelector<HTMLButtonElement>("#travelers-modal-focus");
  private resumeButton = document.querySelector<HTMLButtonElement>("#travelers-modal-resume");
  private closeButton = document.querySelector<HTMLButtonElement>("#travelers-modal-close");
  private avatars = document.querySelector<HTMLDivElement>("#travelers-modal-avatars");

  private lastFocus: Vec2 | null = null;

  constructor(private readonly deps: TravelerDependencies) {}

  init() {
    this.setupModal();
  }

  handleArrival(arrival: TravelerArrival) {
    this.lastFocus = this.computeCenter(arrival.positions);
    this.populateModal(arrival);
    this.showModal();
    this.deps.onPause();
    this.deps.hud.updateStatus(`🛖 ${arrival.count} traveler${arrival.count === 1 ? "" : "s"} seek shelter. Game paused.`);
    this.deps.hud.showNotification(`🛖 ${arrival.count} traveler${arrival.count === 1 ? "" : "s"} arrived seeking refuge.`, "info");
  }

  private setupModal() {
    const close = (resumeAfter?: boolean) => {
      this.hideModal();
      if (resumeAfter) {
        this.deps.onResume();
      }
    };

    const focus = () => {
      if (this.lastFocus) {
        this.deps.camera.focusOn(this.lastFocus);
        this.deps.onRequestRender();
      }
    };

    this.backdrop?.addEventListener("click", () => close(false));
    this.closeButton?.addEventListener("click", () => close(false));
    this.resumeButton?.addEventListener("click", () => close(true));
    this.focusButton?.addEventListener("click", () => focus());
  }

  private populateModal(arrival: TravelerArrival) {
    this.renderAvatars(arrival.count);

    if (this.title) {
      this.title.textContent = "🛖 Travelers seeking shelter";
    }
    if (this.subtitle) {
      this.subtitle.textContent =
        arrival.attitude === "friendly"
          ? "A friendly band of travelers asks to join your tribe."
          : "A cautious group approaches, looking for refuge.";
    }
    if (this.count) {
      this.count.textContent = `+${arrival.count} villager${arrival.count === 1 ? "" : "s"} joined your tribe`;
    }
  }

  private renderAvatars(count: number) {
    if (!this.avatars) return;
    this.avatars.innerHTML = "";

    const pool = [
      "/assets/Landing/Explorer.png",
      "/assets/extracted_icons/Farmer.png",
      "/assets/Landing/Human_miner.png",
      "/assets/Landing/Lumberjack.png",
      "/assets/Landing/Worker.png",
    ];

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const showCount = Math.min(count, 5);

    for (let i = 0; i < showCount; i += 1) {
      const src = shuffled[i % shuffled.length];
      const avatar = document.createElement("div");
      avatar.className = "arrival-avatar";
      avatar.innerHTML = `<img src="${src}" alt="New villager" loading="lazy" />`;
      this.avatars.appendChild(avatar);
    }
  }

  private showModal() {
    this.modal?.classList.remove("hidden");
    this.backdrop?.classList.remove("hidden");
  }

  private hideModal() {
    this.modal?.classList.add("hidden");
    this.backdrop?.classList.add("hidden");
  }

  private computeCenter(positions: Vec2[]) {
    if (!positions || positions.length === 0) {
      return null;
    }
    const sum = positions.reduce(
      (acc, pos) => ({
        x: acc.x + pos.x,
        y: acc.y + pos.y,
      }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / positions.length,
      y: sum.y / positions.length,
    };
  }
}
