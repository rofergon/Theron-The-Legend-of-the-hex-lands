# Investigación: Generación Procedural de Terreno Mejorada

## Resumen
Este documento compila técnicas avanzadas para mejorar la generación de terreno, inspiradas en sistemas como Minecraft pero adaptadas para 2D.

## Problemas Actuales
- Generación completamente aleatoria sin coherencia geográfica
- No existen biomas con sentido lógico
- Ausencia de características geográficas naturales (ríos, valles, montañas coherentes)
- Transiciones abruptas entre terrenos

## Técnicas Principales

### 1. **Ruido de Perlin/Simplex con Múltiples Octavas**
```typescript
// Combinar múltiples frecuencias para detalle fractal
elevation = 1.0 * noise(1x, 1y) +
            0.5 * noise(2x, 2y) +
            0.25 * noise(4x, 4y) +
            0.13 * noise(8x, 8y);
elevation = elevation / (1.0 + 0.5 + 0.25 + 0.13);
```

**Ventajas:**
- Grandes colinas + pequeños detalles
- Aspecto natural y fractal
- Control sobre el nivel de detalle

### 2. **Sistema de Biomas Basado en Temperatura y Humedad**
En lugar de usar solo elevación, usar dos mapas de ruido independientes:
- **Mapa de Elevación (altura)**
- **Mapa de Humedad**

```typescript
function determineBiome(elevation: number, moisture: number): Biome {
  if (elevation < 0.1) return "ocean";
  if (elevation < 0.15) return "beach";
  
  if (elevation > 0.8) {
    if (moisture < 0.1) return "scorched";
    if (moisture < 0.2) return "bare";
    if (moisture < 0.5) return "tundra";
    return "snow";
  }
  
  if (elevation > 0.6) {
    if (moisture < 0.33) return "temperateDesert";
    if (moisture < 0.66) return "shrubland";
    return "taiga";
  }
  
  if (elevation > 0.3) {
    if (moisture < 0.16) return "temperateDesert";
    if (moisture < 0.50) return "grassland";
    if (moisture < 0.83) return "temperateForest";
    return "temperateRainForest";
  }
  
  // Tierras bajas
  if (moisture < 0.16) return "subtropicalDesert";
  if (moisture < 0.33) return "grassland";
  if (moisture < 0.66) return "tropicalSeasonalForest";
  return "tropicalRainForest";
}
```

### 3. **Redistribución de Elevación (Función de Potencia)**
Para crear valles planos y picos pronunciados:
```typescript
elevation = Math.pow(elevation, exponent); // exponent ~= 2-5
```

- Exponent > 1: Empuja valores medios hacia abajo (más valles)
- Exponent < 1: Empuja valores medios hacia arriba (más mesetas)

### 4. **Generación de Ríos**
Algoritmo basado en flujo de agua descendente:

```typescript
function generateRivers(heightMap: number[][]): River[] {
  const rivers: River[] = [];
  
  // Colocar fuentes de agua en montañas altas
  const sources = findMountainPeaks(heightMap);
  
  for (const source of sources) {
    const riverPath: Vec2[] = [];
    let current = source;
    let water = INITIAL_WATER_VOLUME;
    
    while (water > 0 && !isOcean(current)) {
      riverPath.push(current);
      
      // Encontrar la celda vecina más baja
      const nextCell = findLowestNeighbor(current, heightMap);
      
      // Si no hay pendiente, el río termina (lago)
      if (heightMap[nextCell.y][nextCell.x] >= heightMap[current.y][current.x]) {
        createLake(current);
        break;
      }
      
      // Erosionar ligeramente el terreno
      heightMap[current.y][current.x] -= EROSION_AMOUNT;
      
      // El agua se evapora gradualmente
      water *= EVAPORATION_RATE;
      current = nextCell;
    }
    
    if (riverPath.length > MIN_RIVER_LENGTH) {
      rivers.push({ path: riverPath, width: water });
    }
  }
  
  return rivers;
}
```

### 5. **Erosión Hidráulica**
Simular el efecto del agua erosionando el terreno para resultados más naturales:

```typescript
function hydraulicErosion(heightMap: number[][], iterations: number) {
  for (let i = 0; i < iterations; i++) {
    // Colocar gota de agua aleatoria
    const droplet = {
      x: random(0, width),
      y: random(0, height),
      velocity: 0,
      water: 1.0,
      sediment: 0
    };
    
    for (let lifetime = 0; lifetime < MAX_LIFETIME; lifetime++) {
      // Calcular gradiente (dirección de flujo)
      const gradient = calculateGradient(heightMap, droplet.x, droplet.y);
      
      // Actualizar posición
      droplet.x += gradient.x;
      droplet.y += gradient.y;
      
      // Calcular capacidad de sedimento
      const capacity = -gradient.magnitude * droplet.velocity * droplet.water;
      
      // Erosionar o depositar
      if (droplet.sediment > capacity) {
        // Depositar
        const deposit = (droplet.sediment - capacity) * DEPOSIT_SPEED;
        heightMap[droplet.y][droplet.x] += deposit;
        droplet.sediment -= deposit;
      } else {
        // Erosionar
        const erode = Math.min((capacity - droplet.sediment) * ERODE_SPEED, gradient.magnitude);
        heightMap[droplet.y][droplet.x] -= erode;
        droplet.sediment += erode;
      }
      
      // Actualizar velocidad y evaporación
      droplet.velocity = Math.sqrt(droplet.velocity² + gradient.magnitude * GRAVITY);
      droplet.water *= (1 - EVAPORATE_SPEED);
    }
  }
}
```

### 6. **Domain Warping (Distorsión del Dominio)**
Técnica avanzada para romper patrones repetitivos:

```typescript
function domainWarp(x: number, y: number): Vec2 {
  const offsetX = noise(x * WARP_FREQUENCY, y * WARP_FREQUENCY) * WARP_STRENGTH;
  const offsetY = noise(x * WARP_FREQUENCY + 1000, y * WARP_FREQUENCY + 1000) * WARP_STRENGTH;
  
  return {
    x: x + offsetX,
    y: y + offsetY
  };
}

// Usar en generación:
const warped = domainWarp(x, y);
const elevation = noise(warped.x, warped.y);
```

### 7. **Generación de Islas (Opcional)**
Para crear masas de tierra rodeadas de agua:

```typescript
function applyIslandMask(elevation: number, x: number, y: number, centerX: number, centerY: number): number {
  // Distancia al centro normalizada
  const dx = (x / width) * 2 - 1;
  const dy = (y / height) * 2 - 1;
  
  // Distancia euclidiana²
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // "Bump" cuadrado: 1 - (1-nx²) * (1-ny²)
  const mask = 1 - (1 - dx * dx) * (1 - dy * dy);
  
  // Mezclar con elevación original
  return elevation * (1 - mask) + (1 - mask) * 0.5;
}
```

## Parámetros Recomendados

### Octavas de Ruido
```typescript
const ELEVATION_OCTAVES = [
  { frequency: 1, amplitude: 1.0 },
  { frequency: 2, amplitude: 0.5 },
  { frequency: 4, amplitude: 0.25 },
  { frequency: 8, amplitude: 0.13 },
  { frequency: 16, amplitude: 0.06 }
];

const MOISTURE_OCTAVES = [
  { frequency: 1, amplitude: 1.0 },
  { frequency: 2, amplitude: 0.75 },
  { frequency: 4, amplitude: 0.33 },
  { frequency: 8, amplitude: 0.33 }
];
```

### Biomas Sugeridos para 2D
- **ocean** (azul oscuro)
- **beach** (amarillo arena)
- **grassland** (verde claro)
- **forest** (verde oscuro)
- **desert** (amarillo/naranja)
- **tundra** (gris claro)
- **snow** (blanco)
- **mountain** (gris oscuro)
- **swamp** (verde-marrón)

### Constantes de Erosión
```typescript
const EROSION_PARAMS = {
  numIterations: 50000,
  erosionRadius: 3,
  inertia: 0.05,          // Inercia del flujo
  sedimentCapacity: 4,     // Capacidad de carga
  minCapacity: 0.01,
  erodeSpeed: 0.3,        // Velocidad de erosión
  depositSpeed: 0.3,      // Velocidad de depósito
  evaporateSpeed: 0.01,   // Evaporación
  gravity: 4,
  maxLifetime: 30,        // Vida máxima de gota
  initialWater: 1,
  initialSpeed: 1
};
```

## Plan de Implementación

1. **Fase 1: Mejorar generación base**
   - Implementar múltiples octavas de ruido
   - Aplicar redistribución de elevación
   - Separar mapas de elevación y humedad

2. **Fase 2: Sistema de biomas**
   - Crear función de determinación de bioma basada en elevación + humedad
   - Actualizar tipos de terreno
   - Ajustar colores y propiedades

3. **Fase 3: Características geográficas**
   - Implementar generación de ríos
   - Añadir lagos
   - Crear transiciones suaves entre biomas

4. **Fase 4: Refinamiento (opcional)**
   - Erosión hidráulica
   - Domain warping
   - Generación de estructuras (cuevas, cañones)

## Referencias
- Red Blob Games - Terrain from Noise: https://www.redblobgames.com/maps/terrain-from-noise/
- Sebastian Lague - Hydraulic Erosion: https://github.com/SebLague/Hydraulic-Erosion
- Whittaker Biome Diagram (sistema de clasificación ecológica)

## Beneficios Esperados
✅ Biomas coherentes y realistas
✅ Transiciones naturales entre terrenos
✅ Ríos que fluyen lógicamente desde montañas
✅ Menos repetición y más variedad
✅ Mundo más explorable e interesante
