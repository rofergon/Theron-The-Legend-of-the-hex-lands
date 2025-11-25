import { clamp } from "../../core/utils";
import type { Citizen, Terrain, Vec2 } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";

/**
 * Handles pathfinding + fallback movement logic for citizens so movement
 * behavior can be reused by other systems.
 */
export class Navigator {
  constructor(private world: WorldEngine) { }

  moveCitizenTowards(citizen: Citizen, targetX: number, targetY: number) {
    const target = { x: targetX, y: targetY };
    if (this.tryFollowPath(citizen, target)) {
      return;
    }
    this.clearCitizenPath(citizen);
    this.greedyMoveTowards(citizen, targetX, targetY);
  }

  private tryFollowPath(citizen: Citizen, target: Vec2): boolean {
    if (citizen.x === target.x && citizen.y === target.y) {
      this.clearCitizenPath(citizen);
      this.clearUnreachable(citizen);
      return true;
    }

    const cacheKey = this.getPathCacheKey(target);
    if (this.isTemporarilyUnreachable(citizen, target, cacheKey)) {
      return false;
    }
    const needsPath =
      !citizen.path ||
      !citizen.pathTarget ||
      citizen.pathTarget.x !== target.x ||
      citizen.pathTarget.y !== target.y ||
      citizen.path.length === 0 ||
      citizen.pathCacheKey !== cacheKey;

    if (needsPath) {
      const nextPath = this.world.findPath({ x: citizen.x, y: citizen.y }, target, cacheKey ? { cacheKey } : undefined);
      if (!nextPath) {
        this.markTemporarilyUnreachable(citizen, target, cacheKey);
        return false;
      }
      citizen.path = [...nextPath];
      citizen.pathTarget = { x: target.x, y: target.y };
      if (cacheKey) {
        citizen.pathCacheKey = cacheKey;
      } else {
        delete citizen.pathCacheKey;
      }
      if (nextPath.length === 0) {
        return true;
      }
    }

    const nextStep = citizen.path?.[0];
    if (!nextStep) {
      return false;
    }

    if (!this.world.isWalkable(nextStep.x, nextStep.y)) {
      this.clearCitizenPath(citizen);
      this.markTemporarilyUnreachable(citizen, target, cacheKey);
      return false;
    }

    const previousPosition = { x: citizen.x, y: citizen.y };
    if (this.world.moveCitizen(citizen.id, previousPosition, nextStep)) {
      citizen.x = nextStep.x;
      citizen.y = nextStep.y;
      citizen.lastPosition = previousPosition;
      citizen.path?.shift();
      citizen.stuckCounter = 0;

      // Apply movement cost for terrain
      this.applyMovementCost(citizen, nextStep);

      if (!citizen.path || citizen.path.length === 0) {
        this.clearCitizenPath(citizen);
      }
      this.clearUnreachable(citizen);
      return true;
    }

    citizen.stuckCounter = (citizen.stuckCounter ?? 0) + 1;
    if (citizen.stuckCounter > 2) {
      this.clearCitizenPath(citizen);
    }
    return false;
  }

  private getPathCacheKey(target: Vec2): string | undefined {
    if (target.x === this.world.villageCenter.x && target.y === this.world.villageCenter.y) {
      return "special:village-center";
    }
    const cell = this.world.getCell(target.x, target.y);
    if (cell?.structure) {
      return `structure:${cell.structure}:${target.x},${target.y}`;
    }
    return undefined;
  }

  private clearCitizenPath(citizen: Citizen): void {
    delete citizen.path;
    delete citizen.pathTarget;
    delete citizen.pathCacheKey;
  }

  private greedyMoveTowards(citizen: Citizen, targetX: number, targetY: number) {
    const dx = clamp(targetX - citizen.x, -1, 1);
    const dy = clamp(targetY - citizen.y, -1, 1);
    if (dx === 0 && dy === 0) {
      return;
    }

    const tries: Vec2[] = [];
    const start = { x: citizen.x, y: citizen.y };
    const pushStep = (stepX: number, stepY: number) => {
      if (stepX === 0 && stepY === 0) return;
      tries.push({ x: start.x + stepX, y: start.y + stepY });
    };

    pushStep(dx, dy);
    if (dx !== 0 && dy !== 0) {
      pushStep(dx, 0);
      pushStep(0, dy);
    }

    const currentDist = Math.abs(targetX - citizen.x) + Math.abs(targetY - citizen.y);

    if (!citizen.stuckCounter) citizen.stuckCounter = 0;
    if (citizen.lastPosition?.x === citizen.x && citizen.lastPosition?.y === citizen.y) {
      citizen.stuckCounter++;
    } else {
      citizen.stuckCounter = 0;
    }
    const isStuck = citizen.stuckCounter > 3;

    for (const next of tries) {
      if (!this.world.isWalkable(next.x, next.y)) continue;
      const nextDist = Math.abs(targetX - next.x) + Math.abs(targetY - next.y);
      if (nextDist < currentDist) {
        if (this.world.moveCitizen(citizen.id, { x: citizen.x, y: citizen.y }, next)) {
          citizen.lastPosition = { x: citizen.x, y: citizen.y };
          citizen.x = next.x;
          citizen.y = next.y;
          this.applyMovementCost(citizen, next);
          return;
        }
      }
    }

    for (const next of tries) {
      if (!this.world.isWalkable(next.x, next.y)) continue;
      const nextDist = Math.abs(targetX - next.x) + Math.abs(targetY - next.y);
      if (nextDist <= currentDist) {
        if (this.world.moveCitizen(citizen.id, { x: citizen.x, y: citizen.y }, next)) {
          citizen.lastPosition = { x: citizen.x, y: citizen.y };
          citizen.x = next.x;
          citizen.y = next.y;
          this.applyMovementCost(citizen, next);
          return;
        }
      }
    }

    if (isStuck) {
      const allDirections = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },
      ];

      for (const dir of allDirections) {
        const next = { x: citizen.x + dir.x, y: citizen.y + dir.y };
        if (!this.world.isWalkable(next.x, next.y)) continue;
        if (this.world.moveCitizen(citizen.id, { x: citizen.x, y: citizen.y }, next)) {
          citizen.lastPosition = { x: citizen.x, y: citizen.y };
          citizen.x = next.x;
          citizen.y = next.y;
          this.applyMovementCost(citizen, next);
          citizen.stuckCounter = 0;
          return;
        }
      }
    }

    citizen.lastPosition = { x: citizen.x, y: citizen.y };
  }

  private isTemporarilyUnreachable(citizen: Citizen, target: Vec2, cacheKey?: string): boolean {
    if (!citizen.unreachableCooldown || !citizen.unreachableTarget) {
      return false;
    }
    const sameTarget =
      citizen.unreachableTarget.x === target.x &&
      citizen.unreachableTarget.y === target.y &&
      citizen.unreachableCacheKey === cacheKey;
    if (!sameTarget) {
      this.clearUnreachable(citizen);
      return false;
    }
    citizen.unreachableCooldown = Math.max(0, citizen.unreachableCooldown - 1);
    if (citizen.unreachableCooldown === 0) {
      this.clearUnreachable(citizen);
      return false;
    }
    return true;
  }

  private markTemporarilyUnreachable(citizen: Citizen, target: Vec2, cacheKey?: string) {
    citizen.unreachableTarget = { x: target.x, y: target.y };
    citizen.unreachableCacheKey = cacheKey;
    citizen.unreachableCooldown = 4; // skip a few ticks before retrying to avoid hammering pathfinder
  }

  private clearUnreachable(citizen: Citizen) {
    delete citizen.unreachableTarget;
    delete citizen.unreachableCacheKey;
    delete citizen.unreachableCooldown;
  }

  private applyMovementCost(citizen: Citizen, position: Vec2) {
    const cell = this.world.getCell(position.x, position.y);
    if (!cell) return;

    // Fatigue cost per terrain type
    const terrainCost: Partial<Record<Terrain, number>> = {
      mountain: 2.0,  // Doble fatiga en montañas
      river: 1.5,     // 50% más fatiga en ríos
      swamp: 1.3,     // 30% más fatiga en pantanos
    };

    const baseFatigue = 0.5; // Fatiga base por movimiento
    const multiplier = terrainCost[cell.terrain] ?? 1.0;
    const fatigueCost = baseFatigue * multiplier;

    citizen.fatigue = clamp(citizen.fatigue + fatigueCost, 0, 100);
  }
}
