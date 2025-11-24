import { clamp, hashNoise, mulberry32 } from "../../utils";
import type { Terrain, Vec2, WorldCell } from "../../types";
import { ResourceGenerator } from "./ResourceGenerator";

type BiomeRegion = {
    id: number;
    x: number;
    y: number;
    biome: Terrain;
    elevation: number;
    moisture: number;
    spread: number;
};

type BiomeRegionResult = {
    map: number[][];
    regions: BiomeRegion[];
};

export class TerrainGenerator {
    private size: number;
    private seed: number;
    private rng: () => number;
    private resourceGenerator: ResourceGenerator;

    constructor(size: number, seed: number) {
        this.size = size;
        this.seed = seed;
        this.rng = mulberry32(seed);
        this.resourceGenerator = new ResourceGenerator(size, seed);
    }

    public generateTerrain(): WorldCell[][] {
        const rows: WorldCell[][] = [];

        // Step 1: Generate elevation and moisture maps with multiple octaves
        const elevationMap: number[][] = [];
        const moistureMap: number[][] = [];

        for (let y = 0; y < this.size; y += 1) {
            elevationMap[y] = [];
            moistureMap[y] = [];
            for (let x = 0; x < this.size; x += 1) {
                // Multiple octaves for elevation (more detail)
                let elevation = this.multiOctaveNoise(x, y, this.seed, [
                    { freq: 1, amp: 1.0 },
                    { freq: 2, amp: 0.5 },
                    { freq: 4, amp: 0.25 },
                    { freq: 8, amp: 0.13 },
                    { freq: 16, amp: 0.06 }
                ]);

                // Redistribution to create flat valleys and steep mountains
                elevation = Math.pow(elevation, 2.5);
                elevationMap[y]![x] = elevation;

                // Multiple octaves for moisture with very different offsets to avoid correlation
                const moisture = this.multiOctaveNoise(x + 12345, y + 67890, this.seed + 314159, [
                    { freq: 1, amp: 1.0 },
                    { freq: 2, amp: 0.75 },
                    { freq: 4, amp: 0.33 },
                    { freq: 8, amp: 0.33 }
                ]);
                moistureMap[y]![x] = moisture;
            }
        }

        const biomeRegions = this.generateBiomeRegions(elevationMap, moistureMap, this.seed);

        // Step 2: Generate rivers from mountain peaks
        const rivers = this.generateRivers(elevationMap, moistureMap);

        // Step 3: Create cells with biomes based on elevation and moisture
        for (let y = 0; y < this.size; y += 1) {
            const row: WorldCell[] = [];
            for (let x = 0; x < this.size; x += 1) {
                const elevation = elevationMap[y]?.[x] ?? 0.5;
                const moisture = moistureMap[y]?.[x] ?? 0.5;

                const baseBiome = this.determineBiome(elevation, moisture);
                const regionId = biomeRegions.map[y]?.[x];
                const regionBiome = regionId !== undefined ? biomeRegions.regions[regionId]?.biome : undefined;

                let terrain: Terrain = baseBiome;
                if (regionBiome) {
                    terrain = this.resolveRegionTerrain(regionBiome, baseBiome, elevation, moisture);
                }
                terrain = this.applyExtremeElevationBias(terrain, elevation, moisture);

                // Overwrite with river if it exists
                if (rivers.has(`${x},${y}`)) {
                    terrain = "river";
                }

                const fertility = this.resourceGenerator.calculateFertility(terrain, moisture);
                const resource = this.resourceGenerator.generateResource(terrain, fertility, x, y);

                const cell: WorldCell = {
                    x,
                    y,
                    terrain,
                    fertility,
                    moisture,
                    inhabitants: [],
                    priority: "none",
                    cropProgress: 0,
                    cropStage: 0,
                    farmTask: null,
                };

                if (resource) {
                    cell.resource = resource;
                }

                row.push(cell);
            }
            rows.push(row);
        }
        this.processOceans(rows);
        this.processBeaches(rows);
        const mountainCluster = this.ensureMountainZone(rows, elevationMap);
        this.resourceGenerator.placeWoodClusters(rows);
        this.resourceGenerator.placeStoneClusters(rows);
        this.ensureStonePresence(rows, mountainCluster);
        return rows;
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

            // Domain warping to eliminate diagonal patterns
            const warpStrength = 8.0;
            const warpFreq = frequency * 0.5;

            const warpX = hashNoise(x * warpFreq + 1000, y * warpFreq + 2000, seed + i * 1000) * warpStrength;
            const warpY = hashNoise(x * warpFreq + 3000, y * warpFreq + 4000, seed + i * 1000) * warpStrength;

            const warpedX = x + warpX;
            const warpedY = y + warpY;

            // Use more diverse offsets and large primes to avoid correlation
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

        // Normalize to range [0, 1]
        return clamp(total / totalAmplitude, 0, 1);
    }

    private determineBiome(elevation: number, moisture: number): Terrain {
        // Improved biome system with more natural transitions
        // Based on elevation (temperature) and moisture

        // Oceans - stricter thresholds to avoid dispersion
        if (elevation < 0.08) return "ocean";
        // Beach generation is now handled in post-processing


        // High mountains (cold) - smoother transitions
        if (elevation > 0.85) {
            if (moisture < 0.15) return "mountain"; // Arid mountain
            if (moisture < 0.35) return "tundra";
            return "snow"; // Snowy peaks
        }

        // Highlands
        if (elevation > 0.7) {
            if (moisture < 0.2) return "mountain"; // Medium mountain
            if (moisture < 0.4) return "tundra";
            if (moisture < 0.7) return "forest";
            return "tundra"; // Cold mountain forest
        }

        // Mid-highlands
        if (elevation > 0.5) {
            if (moisture < 0.25) return "desert";
            if (moisture < 0.45) return "grassland";
            if (moisture < 0.75) return "forest";
            return "forest"; // Humid forest
        }

        // Midlands
        if (elevation > 0.25) {
            if (moisture < 0.2) return "desert";
            if (moisture < 0.4) return "grassland";
            if (moisture < 0.8) return "forest";
            return "swamp"; // Swamp in humid lowlands
        }

        // Lowlands - more coherent
        if (moisture < 0.25) return "grassland"; // Coastal grassland
        if (moisture < 0.5) return "grassland";
        if (moisture < 0.8) return "forest";
        return "swamp"; // Coastal swamp
    }

    private generateBiomeRegions(
        elevationMap: number[][],
        moistureMap: number[][],
        seed: number
    ): BiomeRegionResult {
        const approxRegionSize = Math.max(12, Math.floor(this.size / 4)); // Larger regions
        const targetRegions = clamp(
            Math.floor((this.size * this.size) / (approxRegionSize * approxRegionSize)),
            6,
            32 // Fewer regions for greater cohesion
        );
        const regionSeed = (seed ^ 0x9e3779b9) >>> 0;
        const regionRng = mulberry32(regionSeed);
        const regions: BiomeRegion[] = [];
        const candidateTries = 15; // More attempts for better distribution

        for (let i = 0; i < targetRegions; i += 1) {
            let bestCandidate: Vec2 | undefined;
            let bestScore = -Infinity;

            for (let attempt = 0; attempt < candidateTries; attempt += 1) {
                const candidate: Vec2 = {
                    x: Math.floor(regionRng() * this.size),
                    y: Math.floor(regionRng() * this.size),
                };
                let minDist = this.size;
                if (regions.length > 0) {
                    regions.forEach((region) => {
                        const distance = Math.hypot(candidate.x - region.x, candidate.y - region.y);
                        if (distance < minDist) {
                            minDist = distance;
                        }
                    });
                }
                const coastalBuffer = Math.min(
                    candidate.x,
                    candidate.y,
                    this.size - 1 - candidate.x,
                    this.size - 1 - candidate.y
                );
                const coastalWeight = coastalBuffer < this.size * 0.08 ? 0.85 : 1;
                const score = minDist * coastalWeight;
                if (score > bestScore || !bestCandidate) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }

            const selected = bestCandidate ?? {
                x: Math.floor(regionRng() * this.size),
                y: Math.floor(regionRng() * this.size),
            };
            const baseElevation = elevationMap[selected.y]?.[selected.x] ?? 0.5;
            const baseMoisture = moistureMap[selected.y]?.[selected.x] ?? 0.5;
            const biome = this.determineBiome(baseElevation, baseMoisture);

            regions.push({
                id: i,
                x: selected.x,
                y: selected.y,
                biome,
                elevation: baseElevation,
                moisture: baseMoisture,
                spread: this.getBiomeSpread(biome),
            });
        }

        const regionMap = Array.from({ length: this.size }, () => Array.from({ length: this.size }, () => 0));

        for (let y = 0; y < this.size; y += 1) {
            const row = regionMap[y];
            if (!row) continue;
            for (let x = 0; x < this.size; x += 1) {
                const elevation = elevationMap[y]?.[x] ?? 0.5;
                const moisture = moistureMap[y]?.[x] ?? 0.5;
                let bestScore = Infinity;
                let bestRegion = 0;

                regions.forEach((region) => {
                    const dx = x - region.x;
                    const dy = y - region.y;
                    const distance = Math.hypot(dx, dy);

                    // Improved jitter using domain warping to break diagonal patterns
                    const warpX = hashNoise(x * 0.01 + 5000, y * 0.01 + 6000, seed + region.id * 997) * 12;
                    const warpY = hashNoise(x * 0.01 + 7000, y * 0.01 + 8000, seed + region.id * 997) * 12;

                    const jitterX = hashNoise(
                        (x + warpX) * 0.02 + region.x * 0.31,
                        (y + warpY) * 0.02 + region.y * 0.27,
                        seed + region.id * 1009
                    );
                    const jitterY = hashNoise(
                        (x + warpX + 1000) * 0.02 + region.x * 0.31,
                        (y + warpY + 1000) * 0.02 + region.y * 0.27,
                        seed + region.id * 1009
                    );

                    const jitterMagnitude = Math.sqrt(jitterX * jitterX + jitterY * jitterY);
                    const warpedDistance = distance * (0.7 + jitterMagnitude * 0.6) * region.spread;

                    const climateDiff =
                        Math.abs(elevation - region.elevation) * 90 +
                        Math.abs(moisture - region.moisture) * 70;
                    const score = warpedDistance + climateDiff;
                    if (score < bestScore) {
                        bestScore = score;
                        bestRegion = region.id;
                    }
                });

                row[x] = bestRegion;
            }
        }

        this.smoothBiomeRegions(regionMap, 3); // More smoothing iterations
        return { map: regionMap, regions };
    }

    private smoothBiomeRegions(regionMap: number[][], iterations: number) {
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            const snapshot = regionMap.map((row) => [...row]);
            for (let y = 1; y < this.size - 1; y += 1) {
                for (let x = 1; x < this.size - 1; x += 1) {
                    const snapshotRow = snapshot[y];
                    if (!snapshotRow) continue;
                    const current = snapshotRow[x];
                    if (current === undefined) continue;
                    const counts = new Map<number, number>();

                    // Use a larger radius for greater smoothing
                    const radius = iteration === 0 ? 1 : 2;
                    for (let dy = -radius; dy <= radius; dy += 1) {
                        for (let dx = -radius; dx <= radius; dx += 1) {
                            const id = snapshot[y + dy]?.[x + dx];
                            if (id === undefined) continue;
                            // Give more weight to closer cells
                            const distance = Math.abs(dx) + Math.abs(dy);
                            const weight = distance === 0 ? 3 : distance === 1 ? 2 : 1;
                            counts.set(id, (counts.get(id) ?? 0) + weight);
                        }
                    }

                    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
                    const threshold = iteration === 0 ? 8 : 12; // Higher threshold for greater stability
                    if (dominant && dominant[1] >= threshold && dominant[0] !== current) {
                        const row = regionMap[y];
                        if (!row) continue;
                        row[x] = dominant[0];
                    }
                }
            }
        }
    }

    private getBiomeSpread(biome: Terrain): number {
        switch (biome) {
            case "ocean":
                return 0.5; // More concentrated to avoid dispersion
            case "beach":
                return 0.8; // More cohesive around the ocean
            case "mountain":
            case "snow":
                return 1.4; // Greater expansion for mountains
            case "desert":
                return 1.3; // More extensive deserts
            case "forest":
                return 1.1; // Slightly expansive forests
            case "swamp":
                return 0.7; // More localized swamps
            case "river":
                return 0.3; // Very localized rivers
            default:
                return 1;
        }
    }

    private resolveRegionTerrain(
        regionBiome: Terrain,
        localBiome: Terrain,
        elevation: number,
        moisture: number
    ): Terrain {
        if (regionBiome === localBiome) {
            return localBiome;
        }

        // Aquatic biomes have absolute priority to avoid dispersion
        if (regionBiome === "ocean" || regionBiome === "beach") {
            return regionBiome;
        }

        // More natural transitions for mountains
        if (regionBiome === "snow") {
            if (elevation > 0.75) return "snow";
            if (elevation > 0.6) return "tundra";
            return localBiome; // Gradual transition
        }

        if (regionBiome === "mountain") {
            if (elevation > 0.7) return "mountain";
            if (elevation > 0.5) return elevation > 0.6 ? "tundra" : "grassland";
            return localBiome;
        }

        // Smoother transitions for deserts
        if (regionBiome === "desert") {
            if (moisture > 0.6) return "grassland"; // Transition to grassland
            if (moisture > 0.4 && elevation < 0.3) return "grassland";
            return regionBiome;
        }

        // Swamps require specific conditions
        if (regionBiome === "swamp") {
            if (moisture < 0.4 || elevation > 0.5) return localBiome;
            return regionBiome;
        }

        // Tundra with improved transitions
        if (regionBiome === "tundra") {
            if (elevation < 0.3) return "grassland";
            if (elevation < 0.5 && moisture > 0.6) return "forest";
            return regionBiome;
        }

        // Forests with natural transitions
        if (regionBiome === "forest") {
            if (moisture < 0.2) return "grassland";
            if (elevation > 0.8) return "tundra";
            return regionBiome;
        }

        return regionBiome;
    }

    private applyExtremeElevationBias(terrain: Terrain, elevation: number, moisture: number): Terrain {
        // Do not modify rivers
        if (terrain === "river") {
            return terrain;
        }

        // Oceans more concentrated and coherent
        if (elevation < 0.06) {
            return "ocean";
        }
        // Beach forcing removed to rely on adjacency


        // Mountains with more natural transitions
        if (elevation > 0.9) {
            return moisture > 0.3 ? "snow" : "mountain";
        }
        if (elevation > 0.8) {
            if (terrain === "ocean" || terrain === "beach") {
                return terrain; // Maintain aquatic characteristics
            }
            return moisture > 0.5 ? "snow" : moisture > 0.3 ? "tundra" : "mountain";
        }

        // Corrections for humid biome coherence
        if (terrain === "desert" && moisture > 0.6) {
            return "grassland";
        }
        if (terrain === "grassland" && moisture > 0.8 && elevation < 0.7) {
            return "forest";
        }
        if (terrain === "tundra" && elevation < 0.4 && moisture > 0.5) {
            return "forest";
        }

        return terrain;
    }

    private generateRivers(elevationMap: number[][], moistureMap: number[][]): Set<string> {
        const riverCells = new Set<string>();

        // Find mountain peaks to place river sources
        const peaks: Vec2[] = [];
        for (let y = 2; y < this.size - 2; y += 1) {
            for (let x = 2; x < this.size - 2; x += 1) {
                const elevation = elevationMap[y]?.[x];
                if (elevation === undefined) continue;

                // Only high mountains
                if (elevation < 0.7) continue;

                // Check if it is a local maximum
                let isPeak = true;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const neighborElev = elevationMap[y + dy]?.[x + dx];
                        if (neighborElev !== undefined && neighborElev > elevation) {
                            isPeak = false;
                            break;
                        }
                    }
                    if (!isPeak) break;
                }

                const moisture = moistureMap[y]?.[x] ?? 0;
                if (isPeak && moisture > 0.34) {
                    peaks.push({ x, y });
                }
            }
        }

        // Generate rivers from each peak
        for (const peak of peaks) {
            let current = { ...peak };
            let waterVolume = 1.0;
            const visitedCells = new Set<string>();
            const riverPath: Vec2[] = [];

            // Follow the river downhill
            for (let steps = 0; steps < 100; steps++) {
                const key = `${current.x},${current.y}`;

                // Avoid loops
                if (visitedCells.has(key)) break;
                visitedCells.add(key);
                riverPath.push({ ...current });

                const currentElevation = elevationMap[current.y]?.[current.x];
                if (currentElevation === undefined) break;

                // If we reach the ocean, terminate
                if (currentElevation < 0.15) {
                    break;
                }

                // Find the lowest neighbor
                let lowest: Vec2 | null = null;
                let lowestElevation = currentElevation;

                const neighbors = [
                    { x: current.x - 1, y: current.y },
                    { x: current.x + 1, y: current.y },
                    { x: current.x, y: current.y - 1 },
                    { x: current.x, y: current.y + 1 },
                ];

                for (const neighbor of neighbors) {
                    const neighborElevation = elevationMap[neighbor.y]?.[neighbor.x];
                    if (neighborElevation !== undefined && neighborElevation < lowestElevation) {
                        lowestElevation = neighborElevation;
                        lowest = neighbor;
                    }
                }

                // If there is no slope, create lake/terminate
                if (!lowest || lowestElevation >= currentElevation * 0.98) {
                    break;
                }

                // Water evaporates gradually
                waterVolume *= 0.95;
                if (waterVolume < 0.1) break;

                current = lowest;
            }

            // Only add rivers that are long enough
            if (riverPath.length >= 5) {
                riverPath.forEach(pos => {
                    riverCells.add(`${pos.x},${pos.y}`);
                    // Add adjacent cells for wider rivers at low elevations
                    const posElev = elevationMap[pos.y]?.[pos.x];
                    if (posElev !== undefined && posElev < 0.38) {
                        riverCells.add(`${pos.x + 1},${pos.y}`);
                        riverCells.add(`${pos.x},${pos.y + 1}`);
                    }
                });
            }
        }

        return riverCells;
    }

    private processOceans(rows: WorldCell[][]) {
        const visited = new Set<string>();
        const oceanGroups: { cells: Vec2[]; isValid: boolean }[] = [];
        const minOceanSize = 100; // Minimum size to be considered an ocean

        // Identify all ocean groups
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const cell = rows[y]?.[x];
                if (cell && cell.terrain === "ocean" && !visited.has(`${x},${y}`)) {
                    const group: Vec2[] = [];
                    const queue: Vec2[] = [{ x, y }];
                    visited.add(`${x},${y}`);

                    while (queue.length > 0) {
                        const current = queue.shift()!;
                        group.push(current);

                        const neighbors = [
                            { x: current.x + 1, y: current.y },
                            { x: current.x - 1, y: current.y },
                            { x: current.x, y: current.y + 1 },
                            { x: current.x, y: current.y - 1 },
                        ];

                        for (const n of neighbors) {
                            const neighborCell = rows[n.y]?.[n.x];
                            if (
                                neighborCell &&
                                neighborCell.terrain === "ocean" &&
                                !visited.has(`${n.x},${n.y}`)
                            ) {
                                visited.add(`${n.x},${n.y}`);
                                queue.push(n);
                            }
                        }
                    }

                    oceanGroups.push({ cells: group, isValid: group.length >= minOceanSize });
                }
            }
        }

        // Convert small ocean groups to rivers
        for (const group of oceanGroups) {
            if (!group.isValid) {
                for (const pos of group.cells) {
                    const cell = rows[pos.y]?.[pos.x];
                    if (cell) {
                        cell.terrain = "river";
                    }
                }
            }
        }
    }

    private processBeaches(rows: WorldCell[][]) {
        // Iterate through all cells to find land cells adjacent to ocean
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const cell = rows[y]?.[x];
                if (!cell) continue;

                // Skip if already water
                if (cell.terrain === "ocean" || cell.terrain === "river") continue;

                let hasOceanNeighbor = false;
                const neighbors = [
                    { x: x + 1, y: y },
                    { x: x - 1, y: y },
                    { x: x, y: y + 1 },
                    { x: x, y: y - 1 },
                    // Check diagonals for smoother beaches
                    { x: x + 1, y: y + 1 },
                    { x: x - 1, y: y - 1 },
                    { x: x + 1, y: y - 1 },
                    { x: x - 1, y: y + 1 },
                ];

                for (const n of neighbors) {
                    const neighborCell = rows[n.y]?.[n.x];
                    if (
                        neighborCell &&
                        neighborCell.terrain === "ocean"
                    ) {
                        hasOceanNeighbor = true;
                        break;
                    }
                }

                if (hasOceanNeighbor) {
                    cell.terrain = "beach";
                }
            }
        }
    }

    private ensureMountainZone(rows: WorldCell[][], elevationMap: number[][]): Vec2[] {
        const mountainCells: Vec2[] = [];
        rows.forEach((row) =>
            row.forEach((cell) => {
                if (cell.terrain === "mountain") {
                    mountainCells.push({ x: cell.x, y: cell.y });
                }
            })
        );

        let anchor: Vec2 | null = null;
        if (mountainCells.length > 0) {
            anchor =
                mountainCells
                    .map((pos) => ({ pos, elevation: elevationMap[pos.y]?.[pos.x] ?? 0 }))
                    .sort((a, b) => b.elevation - a.elevation)[0]?.pos ?? null;
        } else {
            anchor = this.findBestMountainAnchor(rows, elevationMap);
        }

        if (!anchor) {
            return [];
        }

        const cluster = this.buildMountainCluster(anchor, rows, elevationMap);
        cluster.forEach((pos) => {
            const cell = rows[pos.y]?.[pos.x];
            if (!cell) return;
            cell.terrain = "mountain";
            cell.fertility = this.resourceGenerator.calculateFertility("mountain", cell.moisture);
            cell.resource = undefined;
            cell.cropProgress = 0;
            cell.cropStage = 0;
            cell.farmTask = null;
        });

        return cluster;
    }

    private findBestMountainAnchor(rows: WorldCell[][], elevationMap: number[][]): Vec2 | null {
        let bestPos: Vec2 | null = null;
        let bestScore = -Infinity;
        const center = (this.size - 1) / 2;

        for (let y = 0; y < this.size; y += 1) {
            for (let x = 0; x < this.size; x += 1) {
                const cell = rows[y]?.[x];
                const elevation = elevationMap[y]?.[x];
                if (!cell || elevation === undefined) continue;
                if (cell.terrain === "ocean" || cell.terrain === "river") continue;

                const distanceToCenter = Math.hypot(x - center, y - center);
                const normalizedDistance = distanceToCenter / this.size;
                const coastalBuffer = Math.min(x, y, this.size - 1 - x, this.size - 1 - y);
                const coastalPenalty = coastalBuffer < Math.max(3, Math.floor(this.size * 0.06)) ? 0.85 : 1;

                const score = elevation * coastalPenalty - normalizedDistance * 0.08;
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = { x, y };
                }
            }
        }

        return bestPos;
    }

    private buildMountainCluster(anchor: Vec2, rows: WorldCell[][], elevationMap: number[][]): Vec2[] {
        const cluster: Vec2[] = [];
        const queue: Vec2[] = [anchor];
        const visited = new Set<string>();
        const neighborOffsets: Vec2[] = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
        ];
        const targetSize = clamp(Math.floor(this.size / 6), 5, 10);

        while (queue.length && cluster.length < targetSize) {
            const pos = queue.shift();
            if (!pos) continue;
            const key = `${pos.x},${pos.y}`;
            if (visited.has(key)) continue;
            const cell = rows[pos.y]?.[pos.x];
            const elevation = elevationMap[pos.y]?.[pos.x];
            if (!cell || elevation === undefined) continue;
            if (cell.terrain === "ocean" || cell.terrain === "river") continue;

            visited.add(key);
            cluster.push(pos);

            const neighbors = neighborOffsets
                .map((offset) => {
                    const nx = pos.x + offset.x;
                    const ny = pos.y + offset.y;
                    const neighborElevation = elevationMap[ny]?.[nx];
                    return { x: nx, y: ny, elevation: neighborElevation ?? -1 };
                })
                .filter(({ x, y, elevation }) => x >= 0 && y >= 0 && x < this.size && y < this.size && elevation >= 0.12)
                .sort((a, b) => b.elevation - a.elevation);

            neighbors.forEach((neighbor) => {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                if (visited.has(neighborKey)) return;
                if (cluster.length + queue.length >= targetSize * 2) return;
                if (this.rng() < 0.15 && cluster.length > 2) return;
                queue.push({ x: neighbor.x, y: neighbor.y });
            });
        }

        return cluster;
    }

    private ensureStonePresence(rows: WorldCell[][], cluster: Vec2[]) {
        if (!cluster || cluster.length === 0) return;

        const mountainCells = cluster
            .map((pos) => rows[pos.y]?.[pos.x])
            .filter((cell): cell is WorldCell => Boolean(cell && cell.terrain === "mountain"));

        let stoneCells = mountainCells.filter((cell) => cell.resource?.type === "stone");
        const needed = Math.max(0, 2 - stoneCells.length);

        if (needed === 0) return;

        const candidates = mountainCells.filter((cell) => !cell.structure && !cell.constructionSiteId && !cell.resource);
        for (let i = 0; i < needed && candidates.length > 0; i += 1) {
            const idx = Math.floor(this.rng() * candidates.length);
            const cell = candidates.splice(idx, 1)[0];
            if (!cell) continue;
            const amount = 6 + Math.floor(this.rng() * 4);
            const richness = 1.25;
            cell.resource = { type: "stone", amount, renewable: false, richness };
            stoneCells = [...stoneCells, cell];
        }

        // If resources are missing because all cells are occupied, try to replace non-stone resources
        if (stoneCells.length < 2) {
            const fallback = mountainCells.filter((cell) => !cell.structure && !cell.constructionSiteId);
            for (let i = stoneCells.length; i < 2 && fallback.length > 0; i += 1) {
                const idx = Math.floor(this.rng() * fallback.length);
                const cell = fallback.splice(idx, 1)[0];
                if (!cell) continue;
                const amount = 6 + Math.floor(this.rng() * 4);
                const richness = 1.2;
                cell.resource = { type: "stone", amount, renewable: false, richness };
            }
        }
    }
}
