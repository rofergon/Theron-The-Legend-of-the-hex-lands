# Informe de bucle, mundo y aldeanos

## Bucle del juego
- El bucle principal vive en `src/game/game.ts:844`. Arranca con `requestAnimationFrame`, detiene el delta cuando el menú está abierto y reanuda el conteo al cerrar el menú.
- Cada cuadro convierte el tiempo real en horas de simulación: suma `deltaSeconds * HOURS_PER_SECOND * speedMultiplier` y procesa ticks de tamaño fijo `TICK_HOURS` (0.25 h, 1 hora en ~4 segundos reales). Dentro del `while` se llama a `runTick`.
- `runTick` delega en `SimulationSession.runTick`, que aplica prioridades pendientes, actualiza eventos y clima, avanza el mundo (`WorldEngine.updateEnvironment`) y ejecuta el sistema de ciudadanos. Después sincroniza HUD, panel de ciudadanos y selección de estructuras.
- El render se hace al final de cada cuadro con `GameRenderer.render`, recibiendo vista de cámara, entidades, notificaciones y cell hover/selección.
- La entrada en tiempo real captura atajos de prioridad (`PRIORITY_KEYMAP`), modos de planificación (farm/mine/gather/build), ciclo de edificio, zoom y velocidad.

## Generador de mundo
- `WorldEngine` (`src/game/core/world/WorldEngine.ts`) construye el mapa. Usa `TerrainGenerator` para producir grillas de `WorldCell` con terreno, fertilidad, humedad y recursos iniciales; luego coloca el centro de aldea y estructuras iniciales vía `StructureManager`.
- Navegación y movimiento usan `PathFinder`, con celdas caminables salvo océano/nieve. `addCitizen/moveCitizen` mantienen los inhabitantes por celda.
- `TerrainGenerator` (`src/game/core/world/modules/TerrainGenerator.ts`):
  - Genera mapas de elevación y humedad con ruido multi-octava y warping.
  - Forma regiones de biomas suavizadas, ríos desde picos, océanos coherentes y playas adyacentes al mar.
  - Garantiza un núcleo montañoso (y reubica recursos ahí) y aplica sesgos de altura/humedad para resolver el bioma final por celda.
- `ResourceGenerator` decide fertilidad por terreno y reparte recursos:
  - Hotspots de comida renovable en praderas/bosques/pantanos según fertilidad; manantiales en ríos/océano.
  - Clusters de madera renovable en bosques y clusters de piedra no renovable en montaña/tundra/desierto, asegurando al menos piedra en la zona montañosa.
- Estado global de stockpile: comida/piedra/madera con capacidades base; `updateEnvironment` ajusta capacidades si hay granero/almacén, hace crecer recursos renovables y avanza cultivos por etapas según clima (sequía/lluvia).
- Prioridades de celda (`setPriorityAt`) pintan farm/mine/gather/explore/defend. Al marcar farm inicia `farmTask = sow` y resetea progreso si se desmarca.

## Sistema de aldeanos, roles y recursos
- `SimulationSession` (`src/game/core/SimulationSession.ts`) instancia `WorldEngine` y `CitizenSystem`, crea la tribu inicial según dificultad y propaga eventos/clima cada tick.
- `CitizenSystem` (`src/game/systems/CitizenSystem.ts`) orquesta:
  - `CitizenNeedsSimulator` aplica hambre/fatiga/moral y muertes.
  - `CitizenBehaviorDirector` decide acciones por rol/meta, priorizando necesidades urgentes (comer, huir, descansar).
  - `Navigator` mueve por pathfinding, `CitizenActionExecutor` aplica efectos (recolección, construcción, combate, cuidado de cultivos, descanso, almacenamiento) y loggea acciones.
  - `ResourceCollectionEngine` implementa el “cerebro” recolector: fases ir al recurso → recolectar → ir a almacén, con capacidad de carga por tipo. Deposita en celdas con `village/granary/warehouse`.
- Roles clave:
  - `farmer`: prioriza tareas de cultivo en celdas farm (sow/fertilize/harvest), luego usa el cerebro recolector de comida como fallback.
  - `worker`: sigue directivas de construcción (llevar piedra/madera desde stockpile, trabajar en el sitio). Si no hay obra o falta material, pasa a recolectar piedra/madera según stock/capacidad.
  - `warrior`: busca amenazas (`threats` del `WorldView`), defiende o patrulla el centro.
  - `scout`: sigue marcas de `explore` o deambula.
  - `child/elder`: pasivos; niño puede madurar a worker, elder sufre daño por edad.
- Flujo de recursos: recolectores consumen nodos (renovables decrecen pero vuelven a crecer con clima), llevan carga a almacenes, `deposit/consume` del mundo ajusta stock y afecta moral/vida por hambre; construcción consume stock entregado por workers.

## Cómo se relaciona con las acciones del jugador
- Roles: sliders en HUD (`Game.handleRoleSliderInput`) rebalancean poblaciones asignables llamando a `CitizenSystem.rebalanceRoles`; los cambios se aplican en caliente cuando el aldeano no está “busy”.
- Planificación: botones/atajos activan modos farm/mine/gather/build. Arrastrar sobre el mapa llama a `WorldEngine.setPriorityAt`, pintando celdas que las IA usan para escoger recursos o definir tareas de cultivo.
- Construcción: en modo build se selecciona estructura desbloqueada (depende de población en `SimulationSession.getAvailableStructures`), se coloca blueprint (`planConstruction`). `StructureManager` crea sitios; `workerAI` lleva materiales del stockpile y aplica trabajo hasta completar, lo que a su vez amplía capacidades (granero/almacén) y habilita defensa/fe (torre/templo).
- Ritmo temporal: el jugador ajusta `speedMultiplier` o pausa; esto modifica cuántos ticks se ejecutan por cuadro pero no cambia la lógica de IA por tick.
- Selección y enfoque: clic/tap selecciona aldeano o muestra tooltip de celda; la cámara puede enfocarse en un aldeano desde el panel, pero la IA sigue autónoma.
