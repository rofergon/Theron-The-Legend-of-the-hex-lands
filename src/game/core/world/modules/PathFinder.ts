import type { Vec2 } from "../../types";

type PathCacheEntry = {
    target: Vec2;
    cameFrom: Map<string, string | null>;
    updatedAt: number;
};

const PATH_CACHE_TTL_MS = 5_000;

const PATH_NEIGHBOR_OFFSETS: Vec2[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
];

export class PathFinder {
    private size: number;
    private pathCache = new Map<string, PathCacheEntry>();
    private isWalkable: (x: number, y: number) => boolean;

    constructor(size: number, isWalkable: (x: number, y: number) => boolean) {
        this.size = size;
        this.isWalkable = isWalkable;
    }

    public findPath(start: Vec2, goal: Vec2, options?: { cacheKey?: string }): Vec2[] | null {
        const startKey = this.coordKey(start.x, start.y);
        const goalKey = this.coordKey(goal.x, goal.y);
        if (startKey === goalKey) {
            return [];
        }

        if (options?.cacheKey) {
            const cached = this.findPathFromCache(options.cacheKey, start, goal);
            if (cached) {
                return cached;
            }
        }

        return this.runAStar(start, goal);
    }

    private findPathFromCache(cacheKey: string, start: Vec2, goal: Vec2): Vec2[] | null {
        const cache = this.ensurePathCache(cacheKey, goal);
        if (!cache) {
            return null;
        }
        const startKey = this.coordKey(start.x, start.y);
        const goalKey = this.coordKey(goal.x, goal.y);
        const path = this.extractPathFromField(startKey, goalKey, cache.cameFrom);
        if (!path) {
            return null;
        }
        if (!this.pathIsWalkable(path, start, goal)) {
            this.pathCache.delete(cacheKey);
            return null;
        }
        return path;
    }

    private ensurePathCache(cacheKey: string, goal: Vec2): PathCacheEntry | null {
        const now = Date.now();
        const existing = this.pathCache.get(cacheKey);
        const targetMatches = existing && existing.target.x === goal.x && existing.target.y === goal.y;
        const fresh = existing && now - existing.updatedAt <= PATH_CACHE_TTL_MS;
        const goalWalkable = this.isWalkable(goal.x, goal.y);

        if (existing && targetMatches && fresh && goalWalkable) {
            return existing;
        }
        this.pathCache.delete(cacheKey);

        const nextCache = this.buildPathCache(goal);
        if (nextCache) {
            this.pathCache.set(cacheKey, nextCache);
        }
        return nextCache ?? null;
    }

    private buildPathCache(goal: Vec2): PathCacheEntry | null {
        if (!this.isWalkable(goal.x, goal.y)) {
            return null;
        }
        const cameFrom = new Map<string, string | null>();
        const queue: Vec2[] = [{ x: goal.x, y: goal.y }];
        const goalKey = this.coordKey(goal.x, goal.y);
        cameFrom.set(goalKey, null);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            for (const neighbor of this.getNeighborCoords(current.x, current.y)) {
                if (!this.isWalkable(neighbor.x, neighbor.y)) continue;
                const neighborKey = this.coordKey(neighbor.x, neighbor.y);
                if (cameFrom.has(neighborKey)) continue;
                cameFrom.set(neighborKey, this.coordKey(current.x, current.y));
                queue.push(neighbor);
            }
        }

        return {
            target: { x: goal.x, y: goal.y },
            cameFrom,
            updatedAt: Date.now(),
        };
    }

    private extractPathFromField(
        startKey: string,
        goalKey: string,
        cameFrom: Map<string, string | null>
    ): Vec2[] | null {
        if (!cameFrom.has(startKey) || !cameFrom.has(goalKey)) {
            return null;
        }
        if (startKey === goalKey) {
            return [];
        }

        const visited = new Set<string>();
        const path: Vec2[] = [];
        let currentKey = startKey;

        while (currentKey !== goalKey) {
            const nextKey = cameFrom.get(currentKey);
            if (!nextKey || visited.has(nextKey)) {
                return null;
            }
            visited.add(nextKey);
            const { x, y } = this.decodeCoordKey(nextKey);
            path.push({ x, y });
            currentKey = nextKey;
        }

        return path;
    }

    private runAStar(start: Vec2, goal: Vec2): Vec2[] | null {
        if (!this.isWalkable(goal.x, goal.y) || !this.isWalkable(start.x, start.y)) {
            return null;
        }

        const startKey = this.coordKey(start.x, start.y);
        const goalKey = this.coordKey(goal.x, goal.y);

        const openSet = new Set<string>([startKey]);
        const openList = [startKey];
        const cameFrom = new Map<string, string | null>();
        const gScore = new Map<string, number>([[startKey, 0]]);
        const fScore = new Map<string, number>([[startKey, this.heuristic(start, goal)]]);

        while (openList.length > 0) {
            let bestIndex = 0;
            let bestKey = openList[0];
            if (bestKey === undefined) {
                break;
            }
            let bestScore = fScore.get(bestKey) ?? Infinity;
            for (let i = 1; i < openList.length; i += 1) {
                const candidateKey = openList[i];
                if (candidateKey === undefined) continue;
                const score = fScore.get(candidateKey) ?? Infinity;
                if (score < bestScore) {
                    bestIndex = i;
                    bestScore = score;
                    bestKey = candidateKey;
                }
            }

            const [currentKey] = openList.splice(bestIndex, 1);
            if (!currentKey) {
                continue;
            }
            openSet.delete(currentKey);

            if (currentKey === goalKey) {
                return this.reconstructPath(cameFrom, currentKey, startKey);
            }

            const current = this.decodeCoordKey(currentKey);
            for (const neighbor of this.getNeighborCoords(current.x, current.y)) {
                if (!this.isWalkable(neighbor.x, neighbor.y)) continue;
                const neighborKey = this.coordKey(neighbor.x, neighbor.y);
                const tentative = (gScore.get(currentKey) ?? Infinity) + this.stepCost(current, neighbor);
                if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;

                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentative);
                fScore.set(neighborKey, tentative + this.heuristic(neighbor, goal));
                if (!openSet.has(neighborKey)) {
                    openSet.add(neighborKey);
                    openList.push(neighborKey);
                }
            }
        }

        return null;
    }

    private reconstructPath(
        cameFrom: Map<string, string | null>,
        currentKey: string,
        startKey: string
    ): Vec2[] | null {
        const path: Vec2[] = [];
        let walker = currentKey;

        while (walker !== startKey) {
            const previous = cameFrom.get(walker);
            if (!previous) {
                return null;
            }
            const coords = this.decodeCoordKey(walker);
            path.push(coords);
            walker = previous;
        }

        path.reverse();
        return path;
    }

    private getNeighborCoords(x: number, y: number): Vec2[] {
        const neighbors: Vec2[] = [];
        for (const offset of PATH_NEIGHBOR_OFFSETS) {
            const nx = x + offset.x;
            const ny = y + offset.y;
            if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
            neighbors.push({ x: nx, y: ny });
        }
        return neighbors;
    }

    private coordKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    private decodeCoordKey(key: string): Vec2 {
        const [xs, ys] = key.split(",");
        return { x: Number(xs), y: Number(ys) };
    }

    private heuristic(a: Vec2, b: Vec2): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    private stepCost(a: Vec2, b: Vec2): number {
        const diagonal = a.x !== b.x && a.y !== b.y;
        return diagonal ? Math.SQRT2 : 1;
    }

    private pathIsWalkable(path: Vec2[], start: Vec2, goal: Vec2): boolean {
        if (!this.isWalkable(start.x, start.y) || !this.isWalkable(goal.x, goal.y)) {
            return false;
        }
        for (const step of path) {
            if (!this.isWalkable(step.x, step.y)) {
                return false;
            }
        }
        return true;
    }
}
