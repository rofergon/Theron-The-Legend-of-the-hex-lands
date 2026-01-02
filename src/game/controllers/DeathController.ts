import type { Role, Vec2 } from "../core/types";
import type { HUDController } from "../ui/HUDController";
import type { CameraController } from "../core/CameraController";

export interface DeathEvent {
    citizenId: number;
    name: string;
    role: Role;
    cause: string;
    position: Vec2;
}

interface DeathDependencies {
    hud: HUDController;
    camera: CameraController;
    onPause: () => void;
    onResume: () => void;
    onRequestRender: () => void;
}

export class DeathController {
    private modal = document.querySelector<HTMLDivElement>("#death-modal");
    private backdrop = document.querySelector<HTMLDivElement>("#death-modal-backdrop");
    private nameEl = document.querySelector<HTMLElement>("#death-modal-name");
    private roleEl = document.querySelector<HTMLElement>("#death-modal-role");
    private causeEl = document.querySelector<HTMLElement>("#death-modal-cause");
    private focusButton = document.querySelector<HTMLButtonElement>("#death-modal-focus");
    private resumeButton = document.querySelector<HTMLButtonElement>("#death-modal-resume");
    private closeButton = document.querySelector<HTMLButtonElement>("#death-modal-close");

    private lastPosition: Vec2 | null = null;

    constructor(private readonly deps: DeathDependencies) { }

    init() {
        this.setupModal();
    }

    handleDeath(event: DeathEvent) {
        this.lastPosition = event.position;
        this.populateModal(event);
        this.showModal();
        this.deps.onPause();

        // Also notification in HUD
        this.deps.hud.updateStatus(`💀 ${event.name} has died. Game paused.`);
        this.deps.hud.showNotification(`💀 ${event.name} (${event.role}) died of ${event.cause}.`, "critical");
    }

    private setupModal() {
        const close = (resumeAfter?: boolean) => {
            this.hideModal();
            if (resumeAfter) {
                this.deps.onResume();
            }
        };

        const focus = () => {
            if (this.lastPosition) {
                this.deps.camera.focusOn({ x: this.lastPosition.x + 0.5, y: this.lastPosition.y + 0.5 });
                this.deps.onRequestRender();
            }
        };

        this.backdrop?.addEventListener("click", () => close(false));
        this.closeButton?.addEventListener("click", () => close(false));
        this.resumeButton?.addEventListener("click", () => close(true));
        this.focusButton?.addEventListener("click", () => focus());
    }

    private populateModal(event: DeathEvent) {
        if (this.nameEl) {
            this.nameEl.textContent = event.name;
        }
        if (this.roleEl) {
            this.roleEl.textContent = event.role;
        }
        if (this.causeEl) {
            this.causeEl.textContent = event.cause;
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

    destroy() {
        this.hideModal();
    }
}
