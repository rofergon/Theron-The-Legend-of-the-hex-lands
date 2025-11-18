# Diagnóstico

- **`CitizenSystem` (src/game/systems/CitizenSystem.ts)**  
    - Unifica persistencia de habitantes, actualización de necesidades, IA de roles, pathfinding, combate y logging.  
    - El método `update` (líneas 76-122) concentra la lógica y llama helpers privados (`evaluateUrgentNeed`, 256-299), complicando el aislamiento de errores y nuevas interacciones.  
    - Contiene también la lógica de movimiento (`moveCitizenTowards`, 325-529), recursos (`gatherResource`, `storeResources`, 533-574) y depuración (`logCitizenAction`, 623-642), dificultando la reutilización.

- **`Game` (src/game/game.ts)**  
    - Actúa como god object: el constructor enlaza listeners y crea mundo, HUD y menú (76-159).  
    - `runTick` mezcla simulación, UI y lógica de negocio (378-404), haciendo casi imposible probar la simulación sin DOM.  
    - Sistemas de entrada, cámara y zoom se mezclan con la lógica del juego (`handleRealtimeInput`, 356-375; `adjustZoom`/`focusOn`, 788-838).  
    - El HUD se recalcula cada tick (`updateHUD`, 527-548) pese a que la mayoría de datos varían lentamente.  
    - La progresión del jugador depende sólo de eventos aleatorios (`triggerRandomEvent`, 477-495) y sliders de roles; no hay objetivos explícitos.

# Plan de refactorización — `CitizenSystem`

1. **CitizenRepository**  
     - Encapsular altas/bajas, `citizenById` y conteos (líneas 27-193).  
     - El resto de servicios dependerá de esta interfaz en lugar de arrays/mapas directos.

2. **CitizenNeedsSimulator**  
     - Recibir `citizen`, `cell` y `tickHours`, devolviendo flags de acciones urgentes (lógica actual de `update` y `evaluateUrgentNeed`, 76-299).  
     - Permite testear balance sin arrastrar movimiento ni IA.

3. **BehaviorDirector**  
    - Mover IA de roles y metas (`warriorAI`, `farmerAI`, `GOAL_BEHAVIOR_MAP`, 700+) a `systems/ai/...`.  
    - Definir `BehaviorDirector.selectAction(citizen, context)` para priorizar rol, metas y urgencias sin tocar el núcleo.

4. **Navigator reutilizable**  
     - Abarcar path caching, greedy fallback y liberación de rutas (325-529).  
     - `CitizenSystem` sólo solicitará “mueve al ciudadano a X,Y”.

5. **CitizenActionExecutor**  
     - Agrupar acciones con efectos en mundo/recursos (`gatherResource`, `storeResources`, `handleAttack`, `tendCrop`, `handleReproduction`, 533-619).  
     - Facilita compartir ejecuciones con otros sistemas (p. ej. bestias con IA distinta).

6. **CitizenTelemetry**  
     - Sustituir `logCitizenAction`, `appendCitizenHistory`, `getActionSignature` (623-698).  
     - Incluir niveles conmutables (silencio, info, debug) configurables desde config/HUD.

# Plan de refactorización — Juego y UI

1. **SimulationSession**  
     - Contener `world`, `player`, `citizenSystem`, clima y reloj.  
     - Delegar `runTick`/`updateEvents` (378-475) para habilitar simulaciones headless.

2. **PlayerInteractionController**  
     - Encapsular teclado, prioridades y habilidades (`handleRealtimeInput`, `applyPriority`, `blessNearestCitizen`, `dropTotem`, 356-450).  
     - La sesión recibe comandos de alto nivel.

3. **CameraController / ViewState**  
     - Gestionar zoom, panning y métricas (`viewTarget`, `adjustZoom`, `focusOn`, `getViewMetrics`, 65-210 y 788-871).  
     - Otros componentes solicitarán la vista sin manipular el DOM.

4. **HudPresenter**  
     - Construir `HUDSnapshot` y notificaciones (`updateHUD`, `logEvent`, 527-617).  
     - Refrescos agrupados (p. ej. cada 0.5 s) y pruebas de colorización sin `WorldEngine`.

5. **WorldEventDirector**  
     - Extraer `updateEvents`/`triggerRandomEvent` (452-495).  
     - Recibir feedback del sistema de misiones y exponer hooks (`onEvent`) para UI o audio.

6. **Componentes DOM reutilizables**  
     - `RoleControlPanel`, `SpeedControlPanel`, `TooltipLayer` para sliders, botones de velocidad, zoom y tooltips (211-342 y 620-760).  
     - `Game` sólo instancia y pasa datos.

# Nueva mecánica: Mandatos del Espíritu

- **Definición y gestión**  
    - `Mandate` = conjunto de objetivos concretos (ej. “acumula 40 comida antes de la próxima sequía”, “explora 15 hexes nuevos”, “construye 2 tótems”).  
    - Director junto al `WorldEventDirector`, actualizado en `SimulationSession.runTick`.

- **Generación contextual**  
    - Usar recursos (`world.stockpile`), clima (`this.climate`), población (`citizenSystem.getRoleCounts`).  
    - Ejemplo: tendencia negativa en `resourceHistory` (`trackResourceTrends`, 503-520) → mandato agrícola.

- **Integración con el HUD**  
    - Extender `HUDSnapshot` con `{ objective: { description, progress, deadlineHours } }`.  
    - Renderizar junto a recursos (`updateHUD`, 527-548) y disparar notificación especial al completarlo.

- **Consecuencias**  
    - Éxito: otorga `player.power`, morale o desbloqueos.  
    - Fracaso: reduce morale o activa eventos climáticos más duros.  
    - Refuerza el loop “elige prioridad → observa progreso → cobra recompensa” y mitiga la sensación difusa del juego.

Con estas piezas se logrará una arquitectura modular (simulación, IA, entrada, UI) y un objetivo explícito que guía al jugador, facilitando nuevas mecánicas futuras.