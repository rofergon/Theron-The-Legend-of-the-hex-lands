import type { Vec2 } from "./types";

export class InputHandler {
  private pressed = new Set<string>();
  private justPressed = new Set<string>();

  constructor(private target: Window = window) {
    this.target.addEventListener("keydown", this.onKeyDown);
    this.target.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    this.pressed.add(event.code);
    this.justPressed.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
    this.justPressed.delete(event.code);
  };

  getDirection(): Vec2 {
    const x = Number(this.isPressed("ArrowRight") || this.isPressed("KeyD")) - Number(this.isPressed("ArrowLeft") || this.isPressed("KeyA"));
    const y = Number(this.isPressed("ArrowDown") || this.isPressed("KeyS")) - Number(this.isPressed("ArrowUp") || this.isPressed("KeyW"));
    return { x, y };
  }

  consumeKey(code: string) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  consumeAny(keys: string[]) {
    return keys.some((key) => this.consumeKey(key));
  }

  isPressed(code: string) {
    return this.pressed.has(code);
  }

  flushFrame() {
    this.justPressed.clear();
  }
}
