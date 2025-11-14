# 🌟 Espíritu Guardián - Simulación Tribal

Un juego de simulación tribal donde controlas a un espíritu guardián que guía y protege a una civilización en desarrollo. Observa cómo tu tribu crece, trabaja, sobrevive y prospera en un mundo proceduralmente generado.

![Versión](https://img.shields.io/badge/versión-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![Vite](https://img.shields.io/badge/Vite-7.2.2-purple)

## 📋 Descripción

Espíritu Guardián es un juego de simulación y gestión tribal donde juegas como una entidad divina que supervisa una pequeña comunidad. Tu objetivo es guiar a tus ciudadanos, gestionar recursos, asignar roles y protegerlos de amenazas naturales y externas.

### Características Principales

- 🗺️ **Generación Procedural de Mundos**: Cada partida ofrece un mundo único con diferentes biomas, recursos y desafíos
- 👥 **Simulación de Ciudadanos**: Cada aldeano tiene sus propias necesidades, roles y comportamientos
- 🌾 **Sistema de Recursos**: Gestiona comida, piedra y agua para mantener tu civilización viva
- ⚔️ **Eventos Dinámicos**: Enfrenta sequías, lluvias, migraciones y amenazas de bestias salvajes
- 🏛️ **Construcción de Estructuras**: Desarrolla tu aldea con graneros, casas, torres y templos
- 🎯 **Sistema de Prioridades**: Marca áreas para explorar, defender, farmear o minar
- 🌟 **Poderes Divinos**: Bendice a tus ciudadanos e invoca tótems para aumentar su poder

## 🎮 Controles

### Movimiento y Navegación
- **WASD** o **Flechas**: Mover el espíritu guardián (3×3 celdas)
- **Rueda del ratón**: Acercar/Alejar zoom
- **Botones +/-**: Control de zoom alternativo
- **Click medio + Arrastrar**: Desplazar el mapa
- **Click izquierdo**: Seleccionar ciudadano o celda

### Marcadores de Prioridad
- **1**: Marcar área para explorar
- **2**: Marcar área para defender
- **3**: Marcar área para farmear
- **4**: Marcar área para minar
- **0**: Limpiar prioridad

### Poderes del Espíritu
- **E** o **Espacio**: Bendecir ciudadano cercano
- **T**: Invocar tótem protector

### Interfaz
- **Enter**: Comenzar el juego desde el menú
- **Pausar/Reanudar**: Control del flujo del tiempo

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js (versión 16 o superior)
- npm o yarn

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/rofergon/carpeta-con-juan.git
   cd carpeta-con-juan
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Ejecutar en modo desarrollo**
   ```bash
   npm run dev
   ```
   El juego estará disponible en `http://localhost:5173`

4. **Compilar para producción**
   ```bash
   npm run build
   ```

5. **Previsualizar build de producción**
   ```bash
   npm run preview
   ```

## 🎯 Cómo Jugar

### Inicio del Juego

1. **Configuración del Mundo**
   - Elige o genera una semilla aleatoria
   - Selecciona el tamaño del mundo (Pequeño, Normal, Grande)
   - Elige la dificultad (Fácil, Normal, Difícil)
   - Visualiza una vista previa del mundo generado

2. **Primeros Pasos**
   - Observa tu aldea inicial con el centro de la tribu
   - Revisa tus ciudadanos iniciales y sus roles
   - Verifica tus recursos iniciales en el HUD

### Gestión de la Tribu

#### Roles de Ciudadanos

- **👨‍🌾 Granjero**: Cultiva campos y recolecta comida
- **🛠️ Trabajador**: Recolecta piedra y construye estructuras
- **⚔️ Guerrero**: Defiende la aldea de amenazas
- **🔍 Explorador**: Descubre nuevas áreas del mapa
- **👶 Niño**: Crece hasta convertirse en adulto
- **👴 Anciano**: Miembros retirados de la tribu

Usa los controles deslizantes en el panel derecho para reasignar roles según las necesidades.

#### Recursos Esenciales

- **🌾 Comida**: Mantiene a los ciudadanos alimentados
- **🪨 Piedra**: Necesaria para construcciones
- **💧 Agua**: Recurso vital para la supervivencia

### Estrategias

1. **Balance de Roles**: Mantén un equilibrio entre productores de recursos y defensores
2. **Expansión Gradual**: Marca áreas para explorar antes de expandirte
3. **Gestión de Recursos**: Construye graneros para aumentar tu capacidad de almacenamiento
4. **Preparación para Eventos**: Mantén reservas para sequías y otros desastres
5. **Uso de Bendiciones**: Bendice ciudadanos estratégicos para aumentar su eficiencia

## 🏗️ Arquitectura del Proyecto

```
src/
├── main.ts                    # Punto de entrada principal
├── style.css                  # Estilos globales
├── game/
│   ├── game.ts               # Clase principal del juego
│   ├── core/
│   │   ├── constants.ts      # Constantes del juego
│   │   ├── InputHandler.ts   # Manejo de entrada del usuario
│   │   ├── PlayerSpirit.ts   # Lógica del espíritu guardián
│   │   ├── types.ts          # Tipos TypeScript compartidos
│   │   ├── utils.ts          # Utilidades generales
│   │   └── world/
│   │       └── WorldEngine.ts # Generación y gestión del mundo
│   ├── systems/
│   │   └── CitizenSystem.ts  # Sistema de simulación de ciudadanos
│   └── ui/
│       ├── CitizenPanel.ts   # Panel de información de ciudadanos
│       ├── GameRenderer.ts   # Renderizado del canvas
│       ├── HUDController.ts  # Control de la interfaz
│       └── MainMenu.ts       # Menú principal y configuración
```

## 🌍 Sistema de Generación de Mundo

El motor de generación procedural crea mundos únicos con:

### Biomas
- 🌊 **Océano**: Grandes cuerpos de agua
- 🏖️ **Playa**: Costas y áreas ribereñas
- 🌱 **Pradera**: Terreno fértil para agricultura
- 🌲 **Bosque**: Rica en recursos naturales
- 🏜️ **Desierto**: Árido y desafiante
- ❄️ **Tundra**: Frío y desolado
- ⛰️ **Montaña**: Terreno elevado e imponente
- 🏔️ **Nieve**: Picos helados
- 🌿 **Pantano**: Húmedo y fértil
- 🌊 **Río**: Fuentes de agua dulce

### Características del Terreno
- **Elevación**: Determina el tipo de terreno base
- **Humedad**: Afecta la vegetación y fertilidad
- **Fertilidad**: Influye en el crecimiento de cultivos
- **Recursos**: Nodos de comida, piedra y manantiales

## 🎨 Tecnologías Utilizadas

- **TypeScript**: Lenguaje de programación tipado
- **Vite**: Build tool y servidor de desarrollo rápido
- **Canvas API**: Renderizado gráfico 2D
- **Algoritmos de Ruido Perlin**: Generación procedural de terrenos

## 📊 Sistema de Puntuación

- **Fe (Poder Divino)**: Se regenera con el tiempo y se usa para bendiciones
- **Población**: Número de ciudadanos vivos en tu tribu
- **Tendencias**: Indicadores de crecimiento o declive de recursos

## 🐛 Debug y Desarrollo

El juego incluye herramientas de depuración:
- **Botón de Exportación Debug**: Descarga un log completo de eventos
- **Historial de Acciones**: Cada ciudadano mantiene un registro de sus actividades
- **Panel de Crónica**: Muestra eventos importantes en tiempo real

## 🔮 Próximas Características

- 💾 Sistema de guardado y carga
- ⚙️ Menú de configuración avanzada
- 🎵 Música y efectos de sonido
- 🏆 Sistema de logros
- 📈 Estadísticas detalladas
- 🌐 Múltiples tribus e interacciones diplomáticas

## 🤝 Contribuir

Las contribuciones son bienvenidas. Si deseas mejorar el juego:

1. Fork el repositorio
2. Crea una rama para tu característica (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'Añadir nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## 📝 Documentación Adicional

- [Investigación de Generación de Terreno](docs/terrain-generation-research.md)
- [Resumen de Mejoras de Terreno](docs/terrain-improvements-summary.md)

## 📄 Licencia

ISC License

## 👥 Autores

Desarrollado con ❤️ para crear una experiencia de simulación tribal única.

---

**¿Disfrutas el juego?** ¡Dale una estrella ⭐ al repositorio!
