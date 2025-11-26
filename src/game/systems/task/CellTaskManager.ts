import type { Citizen, Vec2 } from "../../core/types";

export type CellTaskType = string;

export type CellTask = {
  x: number;
  y: number;
  type: CellTaskType;
  allowShared?: boolean;
};

export type TaskPickOptions = {
  avoidReserved?: boolean;
  desiredSpacing?: number;
  spreadWeight?: number;
  scope?: "any" | "sameType";
};

type Reservation = CellTask & { citizenId: number; timestamp: number };

const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Reusable reservation/assignment manager for cell-based tasks (farm work, gathering, etc.).
 * Ensures a single citizen owns a cell at a time and provides simple scoring helpers
 * to spread workers across available tasks.
 */
export class CellTaskManager {
  private reservations = new Map<string, Reservation>();

  claim(task: CellTask, citizenId: number): boolean {
    const reserved = this.reserve(task, citizenId);
    if (!reserved) return false;
    // A citizen should own only one cell-level task at a time; clear any previous claim.
    this.releaseForCitizen(citizenId, { except: this.key(task.x, task.y) });
    return true;
  }

  reserve(task: CellTask, citizenId: number): boolean {
    const key = this.key(task.x, task.y);
    const existing = this.reservations.get(key);
    if (existing) {
      if (existing.citizenId === citizenId) return true;
      if (existing.allowShared && task.allowShared) return true;
      return false;
    }
    this.reservations.set(key, {
      ...task,
      citizenId,
      timestamp: Date.now(),
    });
    return true;
  }

  releaseAt(x: number, y: number) {
    this.reservations.delete(this.key(x, y));
  }

  releaseForCitizen(citizenId: number, options?: { except?: string }) {
    for (const [key, reservation] of Array.from(this.reservations.entries())) {
      if (reservation.citizenId !== citizenId) continue;
      if (options?.except && key === options.except) continue;
      this.reservations.delete(key);
    }
  }

  isReservedByOther(x: number, y: number, citizenId: number) {
    const reservation = this.reservations.get(this.key(x, y));
    return Boolean(reservation && reservation.citizenId !== citizenId && !reservation.allowShared);
  }

  getReservationOwner(x: number, y: number) {
    const reservation = this.reservations.get(this.key(x, y));
    return reservation?.citizenId ?? null;
  }

  spreadPenalty(task: CellTask, citizenId: number, options?: TaskPickOptions) {
    return this.computeSpreadPenalty(task, citizenId, options);
  }

  pickTaskByPriority(citizen: Citizen, tasks: CellTask[], orderedTypes: CellTaskType[], options?: TaskPickOptions) {
    const available = this.filterTasks(citizen.id, tasks, options);
    for (const type of orderedTypes) {
      const subset = available.filter((task) => task.type === type);
      const best = this.pickBest(citizen, subset, options);
      if (best) return best;
    }
    return this.pickBest(citizen, available, options);
  }

  private filterTasks(citizenId: number, tasks: CellTask[], options?: TaskPickOptions) {
    if (options?.avoidReserved === false) return tasks;
    return tasks.filter((task) => !this.isReservedByOther(task.x, task.y, citizenId));
  }

  private pickBest(citizen: Citizen, tasks: CellTask[], options?: TaskPickOptions) {
    let best: { task: CellTask; score: number } | null = null;
    for (const task of tasks) {
      const distance = manhattan(citizen, task);
      const spreadPenalty = this.computeSpreadPenalty(task, citizen.id, options);
      const score = distance + spreadPenalty;
      if (!best || score < best.score) {
        best = { task, score };
      }
    }
    return best?.task ?? null;
  }

  private computeSpreadPenalty(task: CellTask, citizenId: number, options?: TaskPickOptions) {
    const spreadWeight = options?.spreadWeight ?? 0;
    if (spreadWeight <= 0) return 0;
    const desiredSpacing = options?.desiredSpacing ?? 4;
    const distance = this.getNearestReservationDistance(task, {
      excludeCitizenId: citizenId,
      scope: options?.scope ?? "sameType",
    });
    if (!Number.isFinite(distance)) return 0;
    if (distance >= desiredSpacing) return 0;
    return (desiredSpacing - distance) * spreadWeight;
  }

  private getNearestReservationDistance(task: CellTask, options?: { excludeCitizenId?: number; scope?: "any" | "sameType" }) {
    let best = Infinity;
    for (const reservation of this.reservations.values()) {
      if (options?.excludeCitizenId && reservation.citizenId === options.excludeCitizenId) continue;
      if (options?.scope !== "any" && reservation.type !== task.type) continue;
      const distance = Math.abs(reservation.x - task.x) + Math.abs(reservation.y - task.y);
      if (distance < best) {
        best = distance;
      }
    }
    return best;
  }

  private key(x: number, y: number) {
    return `${x},${y}`;
  }
}
