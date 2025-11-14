import { clamp } from "./utils";
import type { Vec2 } from "./types";
import type { WorldEngine } from "./world/WorldEngine";

export class PlayerSpirit {
  x: number;
  y: number;
  readonly size = 3;
  power = 45;
  influenceRadius = 6;
  blessingCost = 8;

  constructor(private worldSize: number) {
    this.x = Math.floor(worldSize / 2);
    this.y = Math.floor(worldSize / 2);
  }

  move(dx: number, dy: number, world: WorldEngine) {
    if (dx === 0 && dy === 0) return;
    const nextX = clamp(this.x + dx, 1, this.worldSize - 2);
    const nextY = clamp(this.y + dy, 1, this.worldSize - 2);
    if (!world.isWalkable(nextX, nextY)) {
      return;
    }
    this.x = nextX;
    this.y = nextY;
  }

  getCoveredCells() {
    const cells: Vec2[] = [];
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        cells.push({ x: this.x + ox, y: this.y + oy });
      }
    }
    return cells;
  }

  spendPower(amount: number) {
    if (this.power < amount) return false;
    this.power -= amount;
    return true;
  }
}
