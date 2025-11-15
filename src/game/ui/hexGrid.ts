import type { Vec2 } from "../core/types";

export type HexGeometry = {
  size: number;
  width: number;
  height: number;
  halfWidth: number;
  verticalSpacing: number;
  horizontalSpacing: number;
};

export type Axial = { q: number; r: number };

export const createHexGeometry = (size: number): HexGeometry => {
  const height = size * 2;
  const width = Math.sqrt(3) * size;
  return {
    size,
    width,
    height,
    halfWidth: width / 2,
    verticalSpacing: (3 / 2) * size,
    horizontalSpacing: width,
  };
};

export const getRowOffset = (row: number, geom: HexGeometry) => {
  if (!Number.isFinite(row)) return 0;
  const base = Math.floor(row);
  const fraction = row - base;
  const baseOffset = base % 2 !== 0 ? geom.halfWidth : 0;
  const nextOffset = (base + 1) % 2 !== 0 ? geom.halfWidth : 0;
  return baseOffset + (nextOffset - baseOffset) * fraction;
};

export const getHexCenter = (col: number, row: number, geom: HexGeometry, offsetX: number, offsetY: number): Vec2 => {
  return {
    x: offsetX + col * geom.horizontalSpacing + getRowOffset(row, geom),
    y: offsetY + row * geom.verticalSpacing,
  };
};

export const getHexCorners = (center: Vec2, geom: HexGeometry): Vec2[] => {
  const corners: Vec2[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    corners.push({
      x: center.x + geom.size * Math.cos(angle),
      y: center.y + geom.size * Math.sin(angle),
    });
  }
  return corners;
};

export const traceHexPath = (ctx: CanvasRenderingContext2D, center: Vec2, geom: HexGeometry) => {
  const corners = getHexCorners(center, geom);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i += 1) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
};

export const pixelToAxial = (x: number, y: number, geom: HexGeometry): Axial => {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / geom.size;
  const r = ((2 / 3) * y) / geom.size;
  return { q, r };
};

export const roundAxial = ({ q, r }: Axial): Axial => {
  let x = q;
  let z = r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
};

export const axialToOffset = ({ q, r }: Axial): Vec2 => {
  const row = r;
  const col = q + (r - (r & 1)) / 2;
  return { x: col, y: row };
};

export const getHexWorldBounds = (worldSize: number, geom: HexGeometry) => {
  const minX = -geom.halfWidth;
  const maxX = geom.horizontalSpacing * worldSize;
  const minY = -geom.size;
  const maxY = geom.verticalSpacing * (worldSize - 1) + geom.size;
  return { minX, maxX, minY, maxY };
};
