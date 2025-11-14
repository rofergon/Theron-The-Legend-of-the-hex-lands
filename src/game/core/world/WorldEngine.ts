import { WORLD_SIZE } from "../constants";
import { clamp, hashNoise, mulberry32 } from "../utils";
import type {
  Citizen,
  ClimateState,
  PriorityMark,
  ResourceNode,
  ResourceType,
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
  private rng: () => number;

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
        
        // Múltiples octavas para humedad (diferentes frecuencias)
        const moisture = this.multiOctaveNoise(x + 1000, y + 1000, seed + 999, [
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
    const baseFrequency = 0.02; // Frecuencia base más baja para características más grandes
    
    octaves.forEach((octave, i) => {
      const frequency = baseFrequency * octave.freq;
      // Usar offsets diferentes para cada octava para evitar correlación
      const offsetX = i * 73.129;
      const offsetY = i * 41.538;
      total += hashNoise(
        (x + offsetX) * frequency,
        (y + offsetY) * frequency,
        seed + i * 1000
      ) * octave.amp;
      totalAmplitude += octave.amp;
    });
    
    // Normalizar al rango [0, 1]
    return clamp(total / totalAmplitude, 0, 1);
  }

  private determineBiome(elevation: number, moisture: number): Terrain {
    // Sistema de biomas inspirado en el diagrama de Whittaker
    // Basado en elevación (temperatura) y humedad
    
    // Océanos y costas
    if (elevation < 0.1) return "ocean";
    if (elevation < 0.15) return "beach";
    
    // Montañas altas (frío)
    if (elevation > 0.8) {
      if (moisture < 0.1) return "mountain"; // Montaña árida
      if (moisture < 0.3) return "tundra";
      return "snow"; // Picos nevados
    }
    
    // Tierras medias-altas
    if (elevation > 0.6) {
      if (moisture < 0.25) return "desert";
      if (moisture < 0.5) return "grassland";
      if (moisture < 0.75) return "forest";
      return "tundra"; // Bosque frío
    }
    
    // Tierras medias
    if (elevation > 0.3) {
      if (moisture < 0.2) return "desert";
      if (moisture < 0.4) return "grassland";
      if (moisture < 0.74) return "forest";
      return "swamp"; // Muy húmedo = pantano
    }
    
    // Tierras bajas
    if (moisture < 0.2) return "desert"; // Desierto costero
    if (moisture < 0.4) return "grassland";
    if (moisture < 0.75) return "forest";
    return "swamp"; // Pantano costero
  }

  private generateBiomeRegions(
    elevationMap: number[][],
    moistureMap: number[][],
    seed: number
  ): BiomeRegionResult {
    const approxRegionSize = Math.max(8, Math.floor(this.size / 5));
    const targetRegions = clamp(
      Math.floor((this.size * this.size) / (approxRegionSize * approxRegionSize)),
      8,
      48
    );
    const regionSeed = (seed ^ 0x9e3779b9) >>> 0;
    const regionRng = mulberry32(regionSeed);
    const regions: BiomeRegion[] = [];
    const candidateTries = 12;

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
          const jitter = this.multiOctaveNoise(
            x + region.x * 0.31,
            y + region.y * 0.27,
            seed + region.id * 997,
            jitterOctaves
          );
          const warpedDistance = distance * (0.75 + jitter * 0.5) * region.spread;
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

    this.smoothBiomeRegions(regionMap, 2);
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

          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const id = snapshot[y + dy]?.[x + dx];
              if (id === undefined) continue;
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          }

          const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          if (dominant && dominant[1] >= 5 && dominant[0] !== current) {
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
        return 0.65;
      case "beach":
        return 1.05;
      case "mountain":
      case "snow":
        return 1.25;
      case "swamp":
        return 0.95;
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
    if (regionBiome === "ocean" || regionBiome === "beach") {
      return regionBiome;
    }
    if (regionBiome === "snow") {
      return elevation > 0.7 ? "snow" : "tundra";
    }
    if (regionBiome === "mountain" && elevation < 0.55) {
      return localBiome;
    }
    if (regionBiome === "desert" && moisture > 0.55) {
      return localBiome;
    }
    if (regionBiome === "swamp" && moisture < 0.45) {
      return localBiome;
    }
    if (regionBiome === "tundra" && elevation < 0.4) {
      return "grassland";
    }
    return regionBiome;
  }

  private applyExtremeElevationBias(terrain: Terrain, elevation: number, moisture: number): Terrain {
    if (terrain !== "river") {
      if (elevation < 0.04) {
        return "ocean";
      }
      if (elevation < 0.12 && terrain !== "ocean") {
        return "beach";
      }
      if (elevation > 0.9) {
        return moisture > 0.4 ? "snow" : "mountain";
      }
      if (elevation > 0.78 && terrain !== "snow" && terrain !== "mountain") {
        return moisture > 0.55 ? "snow" : "mountain";
      }
    }
    if (terrain === "desert" && moisture > 0.65) {
      return "grassland";
    }
    if (terrain === "grassland" && moisture > 0.75) {
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
        const viewCell: (typeof cells)[number] = {
          x,
          y,
          priority: cell.priority,
          terrain: cell.terrain,
          cropReady: cell.cropProgress >= 1,
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
