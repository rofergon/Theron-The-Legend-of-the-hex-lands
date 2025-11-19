# Informe de Recolección de Recursos

Este documento describe el flujo completo de recolección de recursos dentro del juego, resaltando los componentes clave y sus responsabilidades.

## Visión general

1. **Ciudadanos y metas**: cada habitante recibe órdenes desde `CitizenBehaviorDirector` (`src/game/systems/citizen/CitizenBehaviorDirector.ts:1`). Dependiendo del rol y del contexto (por ejemplo, si existe un sitio de construcción que requiere materiales), se decide si recolecta comida, piedra o madera.
2. **Motor de recolección**: toda la lógica detallada para desplazarse al nodo, recolectar y volver al almacén está centralizada en `ResourceCollectionEngine` (`src/game/systems/resource/ResourceCollectionEngine.ts:1`).
3. **Ejecución de acciones**: `CitizenActionExecutor` (`src/game/systems/citizen/CitizenActionExecutor.ts:1`) traduce las decisiones en efectos concretos (mover, recolectar, almacenar o construir) y ajusta la moral/fatiga.
4. **Mundo y almacenes**: `WorldEngine` (`src/game/core/world/WorldEngine.ts:50`) mantiene el tablero, los nodos de recursos y el estado del stockpile con capacidades dinámicas (granero y almacén aumentan los límites).

## Motor de recolección (`ResourceCollectionEngine`)

- Mantiene un **cerebro de recolector** por ciudadano (fase `idle`, `goingToResource`, `gathering`, `goingToStorage`) y decide la siguiente acción según el estado del inventario (`ResourceCollectionEngine.ts:17-83`).
- Busca celdas con recursos adecuados dentro del `WorldView`, ponderando prioridad marcada por el jugador (gather/mine) y distancia (`ResourceCollectionEngine.ts:141-177`).
- Define límites de carga por recurso (`MAX_CARRY`) y corta la recolección cuando se alcanza la capacidad (`ResourceCollectionEngine.ts:7-36`).
- Implementa el almacenamiento: sólo celdas con estructura `village`, `granary` o `warehouse` se consideran válidas (`ResourceCollectionEngine.ts:101-137`). Al depositar se utiliza `WorldEngine.deposit`, que respeta la capacidad actual de cada recurso.
- Expone `shouldHarvestWood` para que los trabajadores prioricen madera cuando existan pedidos activos, prioridades marcadas o capacidad libre (`ResourceCollectionEngine.ts:53-105`).

## Decisiones de comportamiento

- Los campesinos usan el cerebro de recolección para comida cuando no tienen tareas agrícolas inmediatas (`CitizenBehaviorDirector.ts:250-274`).
- Los trabajadores corporizan la lógica de suministro para construcción: si el sitio requiere piedra o madera, primero recolectan el recurso faltante y solo construyen al llegar con cargas útiles (`CitizenBehaviorDirector.ts:279-315`).
- En ausencia de obras activas, los trabajadores evalúan `shouldHarvestWood` para decidir si talan o minan a fin de mantener reservas de materiales (`CitizenBehaviorDirector.ts:309-314`).

## Ejecución de acciones

- `CitizenActionExecutor.gatherResource` delega la extracción en el motor centralizado para mantener una única implementación y aplicar reglas como degradar el progreso de cultivos al cosechar (`CitizenActionExecutor.ts:70-106`).
- `storeResources` invoca `resourceEngine.storeAtCurrentCell` y registra recompensas de moral si el depósito fue exitoso (`CitizenActionExecutor.ts:108-129`).
- `constructStructure` ahora alimenta a `WorldEngine.applyConstructionWork` con los aportes simultáneos de piedra y madera y descuenta ambos de la carga del ciudadano (`CitizenActionExecutor.ts:167-190`).

## Mundo y stockpile

- `WorldEngine` mantiene `stockpile.food/stone/wood` con capacidades iniciales (80/40/30). Graneros elevan la capacidad de comida y los almacenes (warehouse) amplían piedra y madera (`WorldEngine.ts:50-76`, `WorldEngine.ts:1400-1428`).
- Cada `ConstructionSite` define requisitos de trabajo, piedra y madera; el sitio avanza únicamente cuando los tres objetivos se completan (`WorldEngine.ts:1190-1268`).
- Los depósitos y consumos soportan los tres recursos, asegurando límites y actualizando las estadísticas de tendencia (`WorldEngine.ts:1439-1453`, `SimulationSession.ts:27-314`).

## Recomendaciones de uso

- Prioriza zonas con las herramientas de planeación (gather/mine) para dirigir rápidamente a los recolectores hacia nodos específicos.
- Construye un **granero** para evitar cuellos de botella en comida y luego un **almacén** cuando empieces a extraer madera, ya que aumentará la capacidad combinada de piedra y madera.
- Supervisa las métricas del HUD (nueva pastilla de madera en `index.html:31-40` y `HUDController.ts:1-70`) para balancear la asignación de roles y mantener un flujo constante de materiales para proyectos futuros.

Este reporte se actualizará si se añaden nuevos recursos o roles que afecten el ciclo de recolección.
