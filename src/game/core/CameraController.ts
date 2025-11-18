import { clamp } from "./utils";
import type { Vec2 } from "./types";
import { axialToOffset, createHexGeometry, getHexCenter, getHexWorldBounds, pixelToAxial, roundAxial } from "../ui/hexGrid";
import type { ViewMetrics } from "../ui/GameRenderer";

type CameraConfig = {
  canvas: HTMLCanvasElement;
  minZoom?: number;
  maxZoom?: number;
};

type WorldProvider = () => { size: number } | null;

export class CameraController {
  private readonly canvas: HTMLCanvasElement;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private zoom = 1;
  private viewTarget: Vec2 = { x: 0.5, y: 0.5 };
  private isPanning = false;
  private lastPanPosition: { x: number; y: number } | null = null;
  private worldProvider: WorldProvider;

  constructor(config: CameraConfig, worldProvider: WorldProvider) {
    this.canvas = config.canvas;
    this.minZoom = config.minZoom ?? 0.75;
    this.maxZoom = config.maxZoom ?? 2.5;
    this.worldProvider = worldProvider;
  }

  setViewTarget(target: Vec2) {
    this.viewTarget = target;
  }

  getViewTarget() {
    return this.viewTarget;
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(value: number, anchor?: Vec2) {
    const previous = this.zoom;
    this.zoom = clamp(value, this.minZoom, this.maxZoom);
    if (anchor) {
      this.focusOn(anchor);
    } else if (previous <= 1 && this.zoom > 1) {
      this.focusOn(this.viewTarget);
    }
  }

  adjustZoom(delta: number, anchor?: Vec2 | null) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const nextZoom = clamp(this.zoom + delta, this.minZoom, this.maxZoom);
    this.setZoom(nextZoom, anchor ?? undefined);
  }

  focusOn(point: Vec2) {
    const world = this.worldProvider();
    if (!world) {
      return;
    }
    this.viewTarget = {
      x: clamp(point.x, 0.5, world.size - 0.5),
      y: clamp(point.y, 0.5, world.size - 0.5),
    };
  }

  startPanning(start: { x: number; y: number }) {
    this.isPanning = true;
    this.lastPanPosition = start;
  }

  stopPanning() {
    this.isPanning = false;
    this.lastPanPosition = null;
  }

  pan(to: { x: number; y: number }) {
    if (!this.isPanning || !this.lastPanPosition) return;
    if (this.zoom <= 1) {
      this.lastPanPosition = to;
      return;
    }
    const dx = to.x - this.lastPanPosition.x;
    const dy = to.y - this.lastPanPosition.y;
    if (dx === 0 && dy === 0) return;
    const { cellSize } = this.getViewMetrics();
    if (cellSize <= 0) return;
    const hex = createHexGeometry(cellSize);
    const nextTarget = {
      x: this.viewTarget.x - dx / hex.horizontalSpacing,
      y: this.viewTarget.y - dy / hex.verticalSpacing,
    };
    this.focusOn(nextTarget);
    this.lastPanPosition = to;
  }

  getWorldPosition(event: MouseEvent | WheelEvent): Vec2 | null {
    const cell = this.getCellUnderPointer(event);
    if (!cell) {
      return null;
    }
    return { x: cell.x + 0.5, y: cell.y + 0.5 };
  }

  getCellUnderPointer(event: MouseEvent | WheelEvent): Vec2 | null {
    const world = this.worldProvider();
    if (!world) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { cellSize, offsetX, offsetY } = this.getViewMetrics();
    if (cellSize <= 0) return null;
    const hex = createHexGeometry(cellSize);
    const localX = px - offsetX;
    const localY = py - offsetY;
    const axial = pixelToAxial(localX, localY, hex);
    const rounded = roundAxial(axial);
    const cell = axialToOffset(rounded);
    const cellX = Math.round(cell.x);
    const cellY = Math.round(cell.y);
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) {
      return null;
    }
    if (cellX < 0 || cellY < 0 || cellX >= world.size || cellY >= world.size) {
      return null;
    }
    return { x: cellX, y: cellY };
  }

  getViewMetrics(): ViewMetrics {
    const worldSize = this.worldProvider()?.size ?? 0;
    const widthFactor = Math.sqrt(3) * (worldSize + 0.5);
    const heightFactor = 1.5 * worldSize + 0.5;
    const baseCell = Math.min(this.canvas.width / Math.max(widthFactor, 1), this.canvas.height / Math.max(heightFactor, 1));
    const cellSize = baseCell * this.zoom;
    const hex = createHexGeometry(cellSize);
    const targetPixel = getHexCenter(this.viewTarget.x, this.viewTarget.y, hex, 0, 0);
    const bounds = getHexWorldBounds(worldSize, hex);
    const halfW = this.canvas.width / 2;
    const halfH = this.canvas.height / 2;
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;

    let centerX = targetPixel.x;
    let centerY = targetPixel.y;

    if (worldWidth <= this.canvas.width || this.zoom <= 1) {
      centerX = (bounds.minX + bounds.maxX) / 2;
    } else {
      centerX = clamp(centerX, bounds.minX + halfW, bounds.maxX - halfW);
    }

    if (worldHeight <= this.canvas.height || this.zoom <= 1) {
      centerY = (bounds.minY + bounds.maxY) / 2;
    } else {
      centerY = clamp(centerY, bounds.minY + halfH, bounds.maxY - halfH);
    }

    const offsetX = this.canvas.width / 2 - centerX;
    const offsetY = this.canvas.height / 2 - centerY;
    return { cellSize, offsetX, offsetY, center: this.viewTarget };
  }
}
