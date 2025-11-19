import { clamp, hashNoise, mulberry32 } from "../../utils";
import type { ResourceNode, Terrain, Vec2, WorldCell } from "../../types";

export class ResourceGenerator {
    private rng: () => number;
    private worldSeed: number;
    private size: number;

    constructor(size: number, seed: number) {
        this.size = size;
        this.worldSeed = seed;
        this.rng = mulberry32(seed);
    }

    public generateResource(terrain: Terrain, fertility: number, x: number, y: number): ResourceNode | undefined {
        const richnessRoll = this.rng();
        const yieldRoll = this.rng();

        switch (terrain) {
            case "grassland":
                if (this.isFoodHotspot(terrain, fertility, x, y)) {
                    const amount = 2 + Math.floor(richnessRoll * 3);
                    return { type: "food", amount, renewable: true, richness: 1 };
                }
                break;

            case "forest":
                if (this.isFoodHotspot(terrain, fertility, x, y)) {
                    const amount = 3 + Math.floor(richnessRoll * 4);
                    return { type: "food", amount, renewable: true, richness: 1.2 };
                }
                break;

            case "swamp":
                if (this.isFoodHotspot(terrain, fertility, x, y) && yieldRoll > 0.2) {
                    const amount = 1 + Math.floor(richnessRoll * 2);
                    return { type: "food", amount, renewable: true, richness: 0.8 };
                }
                break;

            case "river":
            case "ocean":
                if (yieldRoll > 0.6) {
                    return { type: "waterSpring", amount: 6, renewable: true, richness: 1.5 };
                }
                break;
        }

        return undefined;
    }

    public calculateFertility(terrain: Terrain, moisture: number): number {
        switch (terrain) {
            case "grassland":
                return clamp(0.7 + moisture * 0.3, 0, 1);
            case "forest":
                return clamp(0.6 + moisture * 0.4, 0, 1);
            case "swamp":
                return clamp(0.5 + moisture * 0.2, 0, 1);
            case "desert":
                return 0.1;
            case "beach":
                return 0.3;
            case "tundra":
                return 0.2;
            case "snow":
            case "mountain":
                return 0.05;
            case "river":
                return 0.8;
            case "ocean":
                return 0.0;
            default:
                return 0.1;
        }
    }

    public placeWoodClusters(cells: WorldCell[][]) {
        const forestPositions: Vec2[] = [];

        for (let y = 0; y < this.size; y += 1) {
            for (let x = 0; x < this.size; x += 1) {
                const cell = cells[y]?.[x];
                if (cell?.terrain === "forest") {
                    forestPositions.push({ x, y });
                }
            }
        }

        if (forestPositions.length === 0) {
            return;
        }

        const desiredClusters = clamp(
            Math.floor(forestPositions.length / 55),
            1,
            Math.max(3, Math.floor(this.size / 2))
        );
        const used = new Set<string>();
        let placedClusters = 0;
        const maxAttempts = desiredClusters * 4;

        for (let attempt = 0; attempt < maxAttempts && placedClusters < desiredClusters; attempt += 1) {
            const seedIndex = Math.floor(this.rng() * forestPositions.length);
            const seed = forestPositions[seedIndex];
            if (!seed) continue;
            const created = this.growWoodCluster(seed, cells, used);
            if (created > 0) {
                placedClusters += 1;
            }
        }
    }

    private growWoodCluster(seed: Vec2, cells: WorldCell[][], used: Set<string>): number {
        const queue: Vec2[] = [seed];
        const clusterCells: Vec2[] = [];
        const targetSize = 4 + Math.floor(this.rng() * 7);
        const neighborOffsets: Vec2[] = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
        ];

        while (queue.length && clusterCells.length < targetSize) {
            const pos = queue.shift();
            if (!pos) continue;
            const key = `${pos.x},${pos.y}`;
            if (used.has(key)) continue;
            const cell = cells[pos.y]?.[pos.x];
            if (!cell) continue;
            if (cell.terrain !== "forest") continue;
            if (cell.structure || cell.constructionSiteId) continue;
            if (cell.priority === "farm" || cell.farmTask) continue;
            if (cell.resource && cell.resource.type !== "food") continue;

            used.add(key);
            clusterCells.push(pos);

            neighborOffsets.forEach((offset) => {
                if (this.rng() < 0.2) return;
                const nx = pos.x + offset.x;
                const ny = pos.y + offset.y;
                if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) return;
                const neighborKey = `${nx},${ny}`;
                if (used.has(neighborKey)) return;
                queue.push({ x: nx, y: ny });
            });
        }

        if (clusterCells.length < 3) {
            clusterCells.forEach((pos) => used.delete(`${pos.x},${pos.y}`));
            return 0;
        }

        clusterCells.forEach((pos) => {
            const cell = cells[pos.y]?.[pos.x];
            if (!cell) return;
            const amount = 8 + Math.floor(this.rng() * 6);
            const richness = 0.8 + this.rng() * 0.4;
            cell.resource = { type: "wood", amount, renewable: true, richness };
        });

        return clusterCells.length;
    }

    public placeStoneClusters(cells: WorldCell[][]) {
        const stonePositions: Vec2[] = [];
        const validTerrains: Terrain[] = ["mountain", "tundra", "desert"];

        for (let y = 0; y < this.size; y += 1) {
            for (let x = 0; x < this.size; x += 1) {
                const cell = cells[y]?.[x];
                if (cell && validTerrains.includes(cell.terrain)) {
                    stonePositions.push({ x, y });
                }
            }
        }

        if (stonePositions.length === 0) {
            return;
        }

        // Increase density: "appear a bit more"
        // Previous logic was roughly 50% for mountain, 20% tundra, 10% desert
        // Let's aim for ~30% of valid cells having stone, but clustered
        const desiredClusters = clamp(
            Math.floor(stonePositions.length / 8), // Higher density than wood (55)
            1,
            Math.max(5, Math.floor(this.size))
        );
        const used = new Set<string>();
        let placedClusters = 0;
        const maxAttempts = desiredClusters * 4;

        for (let attempt = 0; attempt < maxAttempts && placedClusters < desiredClusters; attempt += 1) {
            const seedIndex = Math.floor(this.rng() * stonePositions.length);
            const seed = stonePositions[seedIndex];
            if (!seed) continue;
            const created = this.growStoneCluster(seed, cells, used);
            if (created > 0) {
                placedClusters += 1;
            }
        }
    }

    private growStoneCluster(seed: Vec2, cells: WorldCell[][], used: Set<string>): number {
        const queue: Vec2[] = [seed];
        const clusterCells: Vec2[] = [];
        // Max 3, min 1
        const targetSize = 1 + Math.floor(this.rng() * 3);
        const neighborOffsets: Vec2[] = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
        ];

        const validTerrains: Terrain[] = ["mountain", "tundra", "desert"];

        while (queue.length && clusterCells.length < targetSize) {
            const pos = queue.shift();
            if (!pos) continue;
            const key = `${pos.x},${pos.y}`;
            if (used.has(key)) continue;
            const cell = cells[pos.y]?.[pos.x];
            if (!cell) continue;
            if (!validTerrains.includes(cell.terrain)) continue;
            if (cell.structure || cell.constructionSiteId) continue;
            if (cell.resource) continue;

            used.add(key);
            clusterCells.push(pos);

            neighborOffsets.forEach((offset) => {
                if (this.rng() < 0.3) return; // Slightly higher spread chance
                const nx = pos.x + offset.x;
                const ny = pos.y + offset.y;
                if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) return;
                const neighborKey = `${nx},${ny}`;
                if (used.has(neighborKey)) return;
                queue.push({ x: nx, y: ny });
            });
        }

        if (clusterCells.length === 0) {
            return 0;
        }

        clusterCells.forEach((pos) => {
            const cell = cells[pos.y]?.[pos.x];
            if (!cell) return;
            // Stone amounts
            let amount = 3 + Math.floor(this.rng() * 4);
            let richness = 0.8;

            if (cell.terrain === "mountain") {
                amount += 2;
                richness = 1.3;
            } else if (cell.terrain === "desert") {
                amount = Math.max(1, amount - 1);
                richness = 0.5;
            }

            cell.resource = { type: "stone", amount, renewable: false, richness };
        });

        return clusterCells.length;
    }

    private isFoodHotspot(terrain: Terrain, fertility: number, x: number, y: number) {
        if (terrain !== "grassland" && terrain !== "forest" && terrain !== "swamp") {
            return false;
        }
        const zoneStrength = this.getFoodZoneStrength(fertility, x, y);
        return zoneStrength > 0.82;
    }

    private getFoodZoneStrength(fertility: number, x: number, y: number) {
        const hotspotNoise = this.multiOctaveNoise(
            x + 4000,
            y + 4000,
            (this.worldSeed ^ 0xb5297a4d) >>> 0,
            [
                { freq: 0.4, amp: 1 },
                { freq: 0.8, amp: 0.5 },
                { freq: 1.6, amp: 0.25 },
            ]
        );
        return clamp(hotspotNoise * 0.6 + fertility * 0.4, 0, 1);
    }

    private multiOctaveNoise(
        x: number,
        y: number,
        seed: number,
        octaves: Array<{ freq: number; amp: number }>
    ): number {
        let total = 0;
        let totalAmplitude = 0;
        const baseFrequency = 0.015;

        octaves.forEach((octave, i) => {
            const frequency = baseFrequency * octave.freq;

            const warpStrength = 8.0;
            const warpFreq = frequency * 0.5;

            const warpX = hashNoise(x * warpFreq + 1000, y * warpFreq + 2000, seed + i * 1000) * warpStrength;
            const warpY = hashNoise(x * warpFreq + 3000, y * warpFreq + 4000, seed + i * 1000) * warpStrength;

            const warpedX = x + warpX;
            const warpedY = y + warpY;

            const offsetX = i * 127.1;
            const offsetY = i * 311.7;
            const offsetSeed = seed + i * 2654435761;

            total += hashNoise(
                (warpedX + offsetX) * frequency,
                (warpedY + offsetY) * frequency,
                offsetSeed
            ) * octave.amp;
            totalAmplitude += octave.amp;
        });

        return clamp(total / totalAmplitude, 0, 1);
    }
}
