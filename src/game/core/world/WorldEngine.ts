import { WORLD_SIZE } from "../constants";
import { clamp, hashNoise, mulberry32 } from "../utils";
import type {
  Citizen,
  ClimateState,
  ConstructionSite,
  PriorityMark,
  ResourceNode,
  ResourceType,
  StructureBlueprint,
  StructureType,
  Terrain,
  Vec2,
  WorldCell,
  WorldView,
} from "../types";

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

type PathCacheEntry = {
  target: Vec2;
  cameFrom: Map<string, string | null>;
  updatedAt: number;
};

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

const STRUCTURE_BLUEPRINTS: Record<StructureType, StructureBlueprint> = {
  village: {
    type: "village",
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    workRequired: 60,
    costs: { stone: 30, food: 10 },
  },
  granary: {
    type: "granary",
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    workRequired: 35,
    costs: { stone: 15 },
  },
  house: {
    type: "house",
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    workRequired: 18,
    costs: { stone: 6 },
  },
  tower: {
    type: "tower",
    footprint: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    workRequired: 28,
    costs: { stone: 18 },
  },
  temple: {
    type: "temple",
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ],
    workRequired: 48,
    costs: { stone: 25, food: 5 },
  },
  campfire: {
    type: "campfire",
    footprint: [{ x: 0, y: 0 }],
    workRequired: 10,
    costs: { food: 2 },
  },
};

export class WorldEngine {
  readonly size: number;
  readonly cells: WorldCell[][];
  readonly stockpile = {
    food: 40,
    stone: 10,
    water: 20,
    foodCapacity: 80,
    stoneCapacity: 40,
  };

  readonly villageCenter: Vec2;
  private structures: Array<{ type: StructureType; x: number; y: number }> = [];
  private constructionSites = new Map<number, ConstructionSite>();
  private nextConstructionId = 1;
  private rng: () => number;
  private pathCache = new Map<string, PathCacheEntry>();

  constructor(size = WORLD_SIZE, seed = Date.now()) {
    this.size = size;
    this.rng = mulberry32(seed);
    this.cells = this.generateTerrain(seed);
    this.villageCenter = this.placeVillageCenter();
    this.buildStructure("village", this.villageCenter.x, this.villageCenter.y);
    this.placeInitialStructures();
  }

  citizenLookup?: (id: number) => Citizen | undefined;

  private generateTerrain(seed: number) {
    const rows: WorldCell[][] = [];
    
    // Paso 1: Generar mapas de elevación y humedad con múltiples octavas
    const elevationMap: number[][] = [];
    const moistureMap: number[][] = [];
    
    for (let y = 0; y < this.size; y += 1) {
      elevationMap[y] = [];
      moistureMap[y] = [];
      for (let x = 0; x < this.size; x += 1) {
        // Múltiples octavas para elevación (más detalle)
        let elevation = this.multiOctaveNoise(x, y, seed, [
          { freq: 1, amp: 1.0 },
          { freq: 2, amp: 0.5 },
          { freq: 4, amp: 0.25 },
          { freq: 8, amp: 0.13 },
          { freq: 16, amp: 0.06 }
        ]);
        
        // Redistribución para crear valles planos y montañas pronunciadas
        elevation = Math.pow(elevation, 2.5);
        elevationMap[y]![x] = elevation;
        
        // Múltiples octavas para humedad con offsets muy diferentes para evitar correlación
        const moisture = this.multiOctaveNoise(x + 12345, y + 67890, seed + 314159, [
          { freq: 1, amp: 1.0 },
          { freq: 2, amp: 0.75 },
          { freq: 4, amp: 0.33 },
          { freq: 8, amp: 0.33 }
        ]);
        moistureMap[y]![x] = moisture;
      }
    }
    
    const biomeRegions = this.generateBiomeRegions(elevationMap, moistureMap, seed);

    // Paso 2: Generar ríos desde picos de montañas
    const rivers = this.generateRivers(elevationMap, moistureMap);
    
    // Paso 3: Crear celdas con biomas basados en elevación y humedad
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

        // Sobrescribir con río si existe
        if (rivers.has(`${x},${y}`)) {
          terrain = "river";
        }
        
        const fertility = this.calculateFertility(terrain, moisture);
        const resource = this.generateResource(terrain, x, y);

        const cell: WorldCell = {
          x,
          y,
          terrain,
          fertility,
          moisture,
          inhabitants: [],
          priority: "none",
          cropProgress: 0,
        };

        if (resource) {
          cell.resource = resource;
        }

        row.push(cell);
      }
      rows.push(row);
    }
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
    const baseFrequency = 0.015; // Frecuencia aún más baja para características más grandes y coherentes
    
    octaves.forEach((octave, i) => {
      const frequency = baseFrequency * octave.freq;
      
      // Domain warping para eliminar patrones diagonales
      const warpStrength = 8.0;
      const warpFreq = frequency * 0.5;
      
      const warpX = hashNoise(x * warpFreq + 1000, y * warpFreq + 2000, seed + i * 1000) * warpStrength;
      const warpY = hashNoise(x * warpFreq + 3000, y * warpFreq + 4000, seed + i * 1000) * warpStrength;
      
      const warpedX = x + warpX;
      const warpedY = y + warpY;
      
      // Usar offsets más diversos y primos grandes para evitar correlación
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
    
    // Normalizar al rango [0, 1]
    return clamp(total / totalAmplitude, 0, 1);
  }

  private determineBiome(elevation: number, moisture: number): Terrain {
    // Sistema de biomas mejorado con transiciones más naturales
    // Basado en elevación (temperatura) y humedad
    
    // Océanos - umbrales más estrictos para evitar dispersión
    if (elevation < 0.08) return "ocean";
    if (elevation < 0.12) return "beach";
    
    // Montañas altas (frío) - transiciones más suaves
    if (elevation > 0.85) {
      if (moisture < 0.15) return "mountain"; // Montaña árida
      if (moisture < 0.35) return "tundra";
      return "snow"; // Picos nevados
    }
    
    // Tierras altas
    if (elevation > 0.7) {
      if (moisture < 0.2) return "mountain"; // Montaña media
      if (moisture < 0.4) return "tundra";
      if (moisture < 0.7) return "forest";
      return "tundra"; // Bosque frío de montaña
    }
    
    // Tierras medias-altas
    if (elevation > 0.5) {
      if (moisture < 0.25) return "desert";
      if (moisture < 0.45) return "grassland";
      if (moisture < 0.75) return "forest";
      return "forest"; // Bosque húmedo
    }
    
    // Tierras medias
    if (elevation > 0.25) {
      if (moisture < 0.2) return "desert";
      if (moisture < 0.4) return "grassland";
      if (moisture < 0.8) return "forest";
      return "swamp"; // Pantano en tierras bajas húmedas
    }
    
    // Tierras bajas - más coherentes
    if (moisture < 0.25) return "grassland"; // Pradera costera
    if (moisture < 0.5) return "grassland";
    if (moisture < 0.8) return "forest";
    return "swamp"; // Pantano costero
  }

  private generateBiomeRegions(
    elevationMap: number[][],
    moistureMap: number[][],
    seed: number
  ): BiomeRegionResult {
    const approxRegionSize = Math.max(12, Math.floor(this.size / 4)); // Regiones más grandes
    const targetRegions = clamp(
      Math.floor((this.size * this.size) / (approxRegionSize * approxRegionSize)),
      6,
      32 // Menos regiones para mayor cohesión
    );
    const regionSeed = (seed ^ 0x9e3779b9) >>> 0;
    const regionRng = mulberry32(regionSeed);
    const regions: BiomeRegion[] = [];
    const candidateTries = 15; // Más intentos para mejor distribución

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
    const jitterOctaves = [
      { freq: 0.5, amp: 1 },
      { freq: 1, amp: 0.5 },
      { freq: 2, amp: 0.25 },
    ];

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

    this.smoothBiomeRegions(regionMap, 3); // Más iteraciones de suavizado
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

          // Usar un radio más grande para mayor suavizado
          const radius = iteration === 0 ? 1 : 2;
          for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
              const id = snapshot[y + dy]?.[x + dx];
              if (id === undefined) continue;
              // Dar más peso a celdas más cercanas
              const distance = Math.abs(dx) + Math.abs(dy);
              const weight = distance === 0 ? 3 : distance === 1 ? 2 : 1;
              counts.set(id, (counts.get(id) ?? 0) + weight);
            }
          }

          const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          const threshold = iteration === 0 ? 8 : 12; // Umbral más alto para mayor estabilidad
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
        return 0.5; // Más concentrado para evitar dispersión
      case "beach":
        return 0.8; // Más cohesivo alrededor del océano
      case "mountain":
      case "snow":
        return 1.4; // Mayor expansión para montañas
      case "desert":
        return 1.3; // Desiertos más extensos
      case "forest":
        return 1.1; // Bosques ligeramente expansivos
      case "swamp":
        return 0.7; // Pantanos más localizados
      case "river":
        return 0.3; // Ríos muy localizados
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
    
    // Biomas acuáticos tienen prioridad absoluta para evitar dispersión
    if (regionBiome === "ocean" || regionBiome === "beach") {
      return regionBiome;
    }
    
    // Transiciones más naturales para montañas
    if (regionBiome === "snow") {
      if (elevation > 0.75) return "snow";
      if (elevation > 0.6) return "tundra";
      return localBiome; // Transición gradual
    }
    
    if (regionBiome === "mountain") {
      if (elevation > 0.7) return "mountain";
      if (elevation > 0.5) return elevation > 0.6 ? "tundra" : "grassland";
      return localBiome;
    }
    
    // Transiciones más suaves para desiertos
    if (regionBiome === "desert") {
      if (moisture > 0.6) return "grassland"; // Transición a pradera
      if (moisture > 0.4 && elevation < 0.3) return "grassland";
      return regionBiome;
    }
    
    // Pantanos requieren condiciones específicas
    if (regionBiome === "swamp") {
      if (moisture < 0.4 || elevation > 0.5) return localBiome;
      return regionBiome;
    }
    
    // Tundra con transiciones mejoradas
    if (regionBiome === "tundra") {
      if (elevation < 0.3) return "grassland";
      if (elevation < 0.5 && moisture > 0.6) return "forest";
      return regionBiome;
    }
    
    // Bosques con transiciones naturales
    if (regionBiome === "forest") {
      if (moisture < 0.2) return "grassland";
      if (elevation > 0.8) return "tundra";
      return regionBiome;
    }
    
    return regionBiome;
  }

  private applyExtremeElevationBias(terrain: Terrain, elevation: number, moisture: number): Terrain {
    // No modificar ríos
    if (terrain === "river") {
      return terrain;
    }
    
    // Océanos más concentrados y coherentes
    if (elevation < 0.06) {
      return "ocean";
    }
    if (elevation < 0.1 && (terrain === "ocean" || terrain === "beach")) {
      return "beach";
    }
    
    // Montañas con transiciones más naturales
    if (elevation > 0.9) {
      return moisture > 0.3 ? "snow" : "mountain";
    }
    if (elevation > 0.8) {
      if (terrain === "ocean" || terrain === "beach") {
        return terrain; // Mantener características acuáticas
      }
      return moisture > 0.5 ? "snow" : moisture > 0.3 ? "tundra" : "mountain";
    }
    
    // Correcciones para coherencia de biomas húmedos
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

  private generateResource(terrain: Terrain, x: number, y: number): ResourceNode | undefined {
    const roll = this.rng();
    
    switch (terrain) {
      case "grassland":
        if (roll > 0.65) {
          return { type: "food", amount: 3 + Math.floor(roll * 4), renewable: true, richness: 1 };
        }
        break;
      
      case "forest":
        if (roll > 0.5) {
          return { type: "food", amount: 4 + Math.floor(roll * 6), renewable: true, richness: 1.2 };
        }
        break;
      
      case "swamp":
        if (roll > 0.7) {
          return { type: "food", amount: 2 + Math.floor(roll * 3), renewable: true, richness: 0.8 };
        }
        break;
      
      case "mountain":
        if (roll > 0.5) {
          return { type: "stone", amount: 5 + Math.floor(roll * 8), renewable: false, richness: 1.3 };
        }
        break;
      
      case "tundra":
        if (roll > 0.8) {
          return { type: "stone", amount: 3 + Math.floor(roll * 4), renewable: false, richness: 0.8 };
        }
        break;
      
      case "desert":
        if (roll > 0.9) {
          return { type: "stone", amount: 2, renewable: false, richness: 0.4 };
        }
        break;
      
      case "river":
      case "ocean":
        if (roll > 0.6) {
          return { type: "waterSpring", amount: 6, renewable: true, richness: 1.5 };
        }
        break;
    }
    
    return undefined;
  }

  private calculateFertility(terrain: Terrain, moisture: number): number {
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
  
  private generateRivers(elevationMap: number[][], moistureMap: number[][]): Set<string> {
    const riverCells = new Set<string>();
    
    // Encontrar picos de montañas para colocar fuentes de ríos
    const peaks: Vec2[] = [];
    for (let y = 2; y < this.size - 2; y += 1) {
      for (let x = 2; x < this.size - 2; x += 1) {
        const elevation = elevationMap[y]?.[x];
        if (elevation === undefined) continue;
        
        // Solo montañas altas
        if (elevation < 0.7) continue;
        
        // Verificar si es un máximo local
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
    
    // Generar ríos desde cada pico
    for (const peak of peaks) {
      let current = { ...peak };
      let waterVolume = 1.0;
      const visitedCells = new Set<string>();
      const riverPath: Vec2[] = [];
      
      // Seguir el río cuesta abajo
      for (let steps = 0; steps < 100; steps++) {
        const key = `${current.x},${current.y}`;
        
        // Evitar bucles
        if (visitedCells.has(key)) break;
        visitedCells.add(key);
        riverPath.push({ ...current });
        
        const currentElevation = elevationMap[current.y]?.[current.x];
        if (currentElevation === undefined) break;
        
        // Si llegamos al océano, terminar
        if (currentElevation < 0.15) {
          break;
        }
        
        // Encontrar el vecino más bajo
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
        
        // Si no hay pendiente, crear lago/terminar
        if (!lowest || lowestElevation >= currentElevation * 0.98) {
          break;
        }
        
        // El agua se evapora gradualmente
        waterVolume *= 0.95;
        if (waterVolume < 0.1) break;
        
        current = lowest;
      }
      
      // Solo añadir ríos que sean lo suficientemente largos
      if (riverPath.length >= 5) {
        riverPath.forEach(pos => {
          riverCells.add(`${pos.x},${pos.y}`);
          // Añadir celdas adyacentes para ríos más anchos en elevaciones bajas
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
  
  private placeVillageCenter(): Vec2 {
    let best = { x: Math.floor(this.size / 2), y: Math.floor(this.size / 2), score: -Infinity };
    const goodTerrains: Terrain[] = ["grassland", "forest", "beach"];
    
    for (let y = 8; y < this.size - 8; y += 1) {
      for (let x = 8; x < this.size - 8; x += 1) {
        const cell = this.cells[y]?.[x];
        if (!cell || !goodTerrains.includes(cell.terrain)) continue;
        
        // Preferir áreas cerca de ríos pero no en ellos
        let nearRiver = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const neighbor = this.cells[y + dy]?.[x + dx];
            if (neighbor?.terrain === "river") {
              nearRiver += 1;
            }
          }
        }
        
        const score = 
          cell.fertility * 2 + 
          cell.moisture + 
          Math.min(nearRiver * 0.5, 2) -
          Math.abs(x - this.size / 2) * 0.01 - 
          Math.abs(y - this.size / 2) * 0.01;
          
        if (score > best.score) {
          best = { x, y, score };
        }
      }
    }
    return { x: best.x, y: best.y };
  }

  private placeInitialStructures() {
    const offsets = [
      { type: "granary" as StructureType, dx: 1, dy: 0 },
      { type: "house" as StructureType, dx: -2, dy: 1 },
      { type: "house" as StructureType, dx: 2, dy: 1 },
      { type: "temple" as StructureType, dx: 0, dy: -2 },
      { type: "tower" as StructureType, dx: -3, dy: -1 },
      { type: "campfire" as StructureType, dx: 3, dy: -1 },
    ];
    offsets.forEach(({ type, dx, dy }) => {
      const x = clamp(this.villageCenter.x + dx, 0, this.size - 1);
      const y = clamp(this.villageCenter.y + dy, 0, this.size - 1);
      if (this.isWalkable(x, y)) {
        this.buildStructure(type, x, y);
      }
    });
  }

  isWalkable(x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return false;
    
    // Terrenos no caminables
    const unwalkable: Terrain[] = ["ocean", "mountain", "snow"];
    if (unwalkable.includes(cell.terrain)) return false;
    
    // Los ríos son caminables pero lentos
    return true;
  }

  getCell(x: number, y: number) {
    return this.cells[y]?.[x];
  }

  addCitizen(citizenId: number, x: number, y: number) {
    const cell = this.cells[y]?.[x];
    if (!cell) return;
    cell.inhabitants.push(citizenId);
  }

  moveCitizen(citizenId: number, from: Vec2, to: Vec2) {
    const fromCell = this.getCell(from.x, from.y);
    const toCell = this.getCell(to.x, to.y);
    if (!toCell || !this.isWalkable(to.x, to.y)) {
      return false;
    }
    if (fromCell) {
      fromCell.inhabitants = fromCell.inhabitants.filter((id) => id !== citizenId);
    }
    toCell.inhabitants.push(citizenId);
    return true;
  }

  findPath(start: Vec2, goal: Vec2, options?: { cacheKey?: string }): Vec2[] | null {
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
    return this.extractPathFromField(startKey, goalKey, cache.cameFrom);
  }

  private ensurePathCache(cacheKey: string, goal: Vec2): PathCacheEntry | null {
    const existing = this.pathCache.get(cacheKey);
    if (existing && existing.target.x === goal.x && existing.target.y === goal.y) {
      return existing;
    }
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

  removeCitizen(citizenId: number, position: Vec2) {
    const cell = this.getCell(position.x, position.y);
    if (cell) {
      cell.inhabitants = cell.inhabitants.filter((id) => id !== citizenId);
    }
  }

  setPriorityAt(x: number, y: number, priority: PriorityMark) {
    const cell = this.getCell(x, y);
    if (cell) {
      cell.priority = priority;
    }
  }

  planStructure(type: StructureType, anchor: Vec2) {
    const blueprint = STRUCTURE_BLUEPRINTS[type];
    if (!blueprint) {
      return { ok: false as const, reason: "Estructura desconocida." };
    }
    const occupiedCells = blueprint.footprint.map((offset) => ({
      x: anchor.x + offset.x,
      y: anchor.y + offset.y,
    }));

    const seen = new Set<string>();
    for (const pos of occupiedCells) {
      const key = this.coordKey(pos.x, pos.y);
      if (seen.has(key)) {
        return { ok: false as const, reason: "Plano inválido." };
      }
      seen.add(key);
      const cell = this.getCell(pos.x, pos.y);
      if (!cell) {
        return { ok: false as const, reason: "Fuera de los límites." };
      }
      if (!this.isWalkable(pos.x, pos.y)) {
        return { ok: false as const, reason: "Terreno no apto." };
      }
      if (cell.structure || cell.constructionSiteId) {
        return { ok: false as const, reason: "Ya ocupado." };
      }
    }

    const site: ConstructionSite = {
      id: this.nextConstructionId++,
      type,
      footprint: occupiedCells,
      anchor: { ...anchor },
      workRequired: blueprint.workRequired,
      workDone: 0,
      stoneRequired: blueprint.costs.stone ?? 0,
      stoneDelivered: 0,
      state: "planned",
    };
    this.constructionSites.set(site.id, site);

    occupiedCells.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.constructionSiteId = site.id;
        cell.priority = "build";
      }
    });

    return { ok: true as const, site };
  }

  cancelConstruction(siteId: number) {
    const site = this.constructionSites.get(siteId);
    if (!site) {
      return false;
    }
    site.footprint.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell?.constructionSiteId === siteId) {
        cell.constructionSiteId = undefined;
      }
    });
    this.constructionSites.delete(siteId);
    return true;
  }

  applyConstructionWork(siteId: number, labor: number, stoneDelivered: number) {
    const site = this.constructionSites.get(siteId);
    if (!site || site.state !== "planned") {
      return { applied: false as const };
    }
    let acceptedStone = 0;
    if (stoneDelivered > 0) {
      const neededStone = Math.max(site.stoneRequired - site.stoneDelivered, 0);
      acceptedStone = Math.min(neededStone, stoneDelivered);
      site.stoneDelivered += acceptedStone;
    }
    if (labor > 0) {
      site.workDone = clamp(site.workDone + labor, 0, site.workRequired);
    }

    if (site.workDone >= site.workRequired && site.stoneDelivered >= site.stoneRequired) {
      this.completeConstruction(site);
      return { applied: true as const, completed: true as const, site, stoneUsed: acceptedStone };
    }
    return { applied: true as const, completed: false as const, site, stoneUsed: acceptedStone };
  }

  getConstructionSite(siteId: number) {
    return this.constructionSites.get(siteId);
  }

  getActiveConstructionSites() {
    return Array.from(this.constructionSites.values()).filter((site) => site.state === "planned");
  }

  findClosestConstructionCell(origin: Vec2) {
    let best: { site: ConstructionSite; cell: Vec2; distance: number } | null = null;
    for (const site of this.getActiveConstructionSites()) {
      for (const cell of site.footprint) {
        const distance = this.heuristic(origin, cell);
        if (!best || distance < best.distance) {
          best = { site, cell, distance };
        }
      }
    }
    return best;
  }

  private completeConstruction(site: ConstructionSite) {
    site.state = "completed";
    site.footprint.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.structure = site.type;
        cell.constructionSiteId = undefined;
        cell.priority = cell.priority === "build" ? "none" : cell.priority;
      }
    });
    this.structures.push({ type: site.type, x: site.anchor.x, y: site.anchor.y });
    this.constructionSites.delete(site.id);
  }

  getCitizenIdsNear(cells: Vec2[]) {
    const ids = new Set<number>();
    cells.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.inhabitants.forEach((id) => ids.add(id));
      }
    });
    return Array.from(ids);
  }

  getView(origin: Citizen, radius: number): WorldView {
    const cells: WorldView["cells"] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const cell = this.getCell(x, y);
        if (!cell) continue;
        const isFarmPlot = cell.priority === "farm" || cell.cropProgress > 0;
        const hasStandingCrop =
          isFarmPlot && cell.resource?.type === "food" && (cell.resource.amount ?? 0) > 0;
        const viewCell: (typeof cells)[number] = {
          x,
          y,
          priority: cell.priority,
          terrain: cell.terrain,
          cropReady: cell.cropProgress >= 1 || hasStandingCrop,
        };
        if (cell.resource) {
          viewCell.resource = cell.resource;
        }
        if (cell.structure) {
          viewCell.structure = cell.structure;
        }
        cells.push(viewCell);
      }
    }

    const nearbyIds = this.getCitizenIdsNear([{ x: origin.x, y: origin.y }]);
    const nearbyCitizens = nearbyIds
      .map((id) => this.citizenLookup?.(id))
      .filter((cit): cit is Citizen => {
        if (!cit) return false;
        return true;
      });

    const threats = nearbyCitizens.filter((citizen) => citizen.tribeId !== origin.tribeId && citizen.role === "warrior");

    return {
      cells,
      nearbyCitizens,
      threats,
      villageCenter: this.villageCenter,
    };
  }

  updateEnvironment(climate: ClimateState, tickHours: number) {
    const fertileTerrains: Terrain[] = ["grassland", "forest", "swamp", "river"];
    
    this.cells.forEach((row) => {
      row.forEach((cell) => {
        // Actualizar humedad según clima
        if (fertileTerrains.includes(cell.terrain)) {
          cell.moisture = clamp(
            cell.moisture + (climate.rainy ? 0.02 : climate.drought ? -0.03 : -0.005),
            0,
            1
          );
          
          // Regeneración de recursos en biomas fértiles
          if (!cell.resource && Math.random() < cell.fertility * 0.001) {
            cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
          }
        }

        // Crecimiento de recursos renovables
        if (cell.resource?.type === "food" && cell.resource.renewable) {
          const climateModifier = (climate.rainy ? 0.5 : 0) - (climate.drought ? 0.8 : 0);
          const growth = (cell.fertility + climateModifier) * 0.02;
          const maxAmount = cell.terrain === "forest" ? 8 : 6;
          cell.resource.amount = clamp(cell.resource.amount + growth * tickHours, 0, maxAmount);
        }

        // Crecimiento de cultivos
        if (cell.cropProgress > 0) {
          const cropGrowth = cell.fertility * 0.05 * tickHours;
          cell.cropProgress = clamp(cell.cropProgress + cropGrowth, 0, 1.5);
        }
      });
    });

    if (this.hasStructure("granary")) {
      this.stockpile.foodCapacity = 150;
    }
  }

  hasStructure(type: StructureType) {
    return this.structures.some((structure) => structure.type === type);
  }

  buildStructure(type: StructureType, x: number, y: number) {
    const cell = this.getCell(x, y);
    if (!cell) return false;
    cell.structure = type;
    this.structures.push({ type, x, y });
    return true;
  }

  deposit(type: "food" | "stone", amount: number) {
    const capacityKey = type === "food" ? "foodCapacity" : "stoneCapacity";
    const current = this.stockpile[type];
    const capacity = this.stockpile[capacityKey];
    const accepted = Math.min(amount, Math.max(capacity - current, 0));
    this.stockpile[type] += accepted;
    return accepted;
  }

  consume(type: "food" | "stone", amount: number) {
    const available = this.stockpile[type];
    const used = Math.min(amount, available);
    this.stockpile[type] -= used;
    return used;
  }
}
