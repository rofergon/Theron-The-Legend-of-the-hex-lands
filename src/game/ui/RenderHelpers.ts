import type { HexGeometry } from "./hexGrid";
import type { StructureType, Role, Citizen } from "../core/types";
import { clamp } from "../core/utils";
import { iconLoader } from "./IconLoader";

// Icon mapping for different game elements
const ICON_MAP = {
    tree: "oak",
    stone: "stone-pile",
    food: "wheat",
    water: "water-drop",
    house: "wood-cabin",  // Changed from "wooden-cabin" to "wood-cabin"
    village: "huts-village",  // Changed from "village" to "huts-village"
    granary: "barn",
    warehouse: "warehouse",
    tower: "stone-tower",
    temple: "greek-temple",
    campfire: "campfire",
    worker: "mining",
    farmer: "farmer",
    warrior: "swordman",
    scout: "spyglass",
    child: "baby-face",
    elder: "bearded-face",
};

// Pre-load all icons when module loads
const preloadPromise = iconLoader.preloadIcons([
    { name: ICON_MAP.tree, color: "#2d5a27", size: 64 },
    { name: ICON_MAP.stone, color: "#78909c", size: 64 },
    { name: ICON_MAP.food, color: "#eab308", size: 64 },
    { name: ICON_MAP.water, color: "#3b82f6", size: 64 },
    { name: ICON_MAP.house, color: "#d4a373", size: 64 },
    { name: ICON_MAP.village, color: "#a98467", size: 64 },
    { name: ICON_MAP.granary, color: "#e6ccb2", size: 64 },
    { name: ICON_MAP.warehouse, color: "#8d6e63", size: 64 },
    { name: ICON_MAP.tower, color: "#9ca3af", size: 64 },
    { name: ICON_MAP.temple, color: "#f3f4f6", size: 64 },
    { name: ICON_MAP.campfire, color: "#ef4444", size: 64 },
    { name: ICON_MAP.worker, color: "#b45309", size: 64 },
    { name: ICON_MAP.farmer, color: "#15803d", size: 64 },
    { name: ICON_MAP.warrior, color: "#991b1b", size: 64 },
    { name: ICON_MAP.scout, color: "#0369a1", size: 64 },
    { name: ICON_MAP.child, color: "#fcd34d", size: 64 },
    { name: ICON_MAP.elder, color: "#475569", size: 64 },
]);

/**
 * Draw a tree icon or fallback to procedural drawing
 */
export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string = "#2d5a27") {
    // Try to get cached icon
    const cacheKey = `${ICON_MAP.tree}-${color}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.8;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        return;
    }

    // Fallback to procedural drawing
    ctx.save();
    ctx.translate(x, y);

    // Trunk
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(-size * 0.15, size * 0.1, size * 0.3, size * 0.4);

    // Foliage (3 circles)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -size * 0.2, size * 0.35, 0, Math.PI * 2);
    ctx.arc(-size * 0.25, size * 0.1, size * 0.3, 0, Math.PI * 2);
    ctx.arc(size * 0.25, size * 0.1, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.arc(-size * 0.1, -size * 0.25, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw a stone icon or fallback to procedural drawing
 */
export function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const color = "#78909c";
    const cacheKey = `${ICON_MAP.stone}-${color}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.8;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        return;
    }

    // Fallback to procedural drawing
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#78909c";
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.2);
    ctx.lineTo(size * 0.2, -size * 0.3);
    ctx.lineTo(size * 0.4, 0);
    ctx.lineTo(size * 0.1, size * 0.3);
    ctx.lineTo(-size * 0.35, size * 0.2);
    ctx.closePath();
    ctx.fill();

    // Highlight
    ctx.fillStyle = "#b0bec5";
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, -size * 0.1);
    ctx.lineTo(0, -size * 0.2);
    ctx.lineTo(-size * 0.1, 0);
    ctx.closePath();
    ctx.fill();

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size * 0.3);
    ctx.lineTo(size * 0.4, 0);
    ctx.lineTo(size * 0.45, size * 0.1);
    ctx.lineTo(size * 0.2, size * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/**
 * Draw a food/wheat icon or fallback to procedural drawing
 */
export function drawFood(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const color = "#eab308";
    const cacheKey = `${ICON_MAP.food}-${color}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.8;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        return;
    }

    // Fallback to procedural drawing
    ctx.save();
    ctx.translate(x, y);

    // Wheat stalks
    ctx.strokeStyle = "#eab308"; // Golden yellow
    ctx.lineWidth = size * 0.1;

    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * size * 0.2, size * 0.3);
        ctx.quadraticCurveTo(i * size * 0.3, 0, i * size * 0.4, -size * 0.3);
        ctx.stroke();

        // Grain head
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.ellipse(i * size * 0.4, -size * 0.3, size * 0.08, size * 0.15, i * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Draw a water spring icon or fallback to procedural drawing
 */
export function drawWaterSpring(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const color = "#3b82f6";
    const cacheKey = `${ICON_MAP.water}-${color}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.6;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        return;
    }

    // Fallback to procedural drawing
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw a structure icon or fallback to procedural drawing
 */
export function drawStructure(ctx: CanvasRenderingContext2D, type: StructureType, x: number, y: number, size: number) {
    const iconName = ICON_MAP[type];
    let color = "#8b7355"; // Default brownish color

    // Set colors based on structure type
    switch (type) {
        case "house":
            color = "#d4a373";
            break;
        case "village":
            color = "#a98467";
            break;
        case "granary":
            color = "#e6ccb2";
            break;
        case "warehouse":
            color = "#8d6e63";
            break;
        case "tower":
            color = "#9ca3af";
            break;
        case "temple":
            color = "#f3f4f6";
            break;
        case "campfire":
            color = "#ef4444";
            break;
    }

    const cacheKey = `${iconName}-${color}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.9;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
        return;
    }

    // Fallback to procedural drawing
    ctx.save();
    ctx.translate(x, y);

    const shadowColor = "rgba(0, 0, 0, 0.3)";

    switch (type) {
        case "house":
            // Body
            ctx.fillStyle = "#d4a373"; // Wood color
            ctx.fillRect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.5);
            // Roof
            ctx.fillStyle = "#bc4749"; // Red roof
            ctx.beginPath();
            ctx.moveTo(-size * 0.4, -size * 0.2);
            ctx.lineTo(0, -size * 0.5);
            ctx.lineTo(size * 0.4, -size * 0.2);
            ctx.closePath();
            ctx.fill();
            // Door
            ctx.fillStyle = "#4a3b2a";
            ctx.fillRect(-size * 0.1, size * 0.1, size * 0.2, size * 0.2);
            break;

        case "village":
            // Main building
            ctx.fillStyle = "#a98467";
            ctx.fillRect(-size * 0.25, -size * 0.1, size * 0.5, size * 0.4);
            ctx.fillStyle = "#6c584c";
            ctx.beginPath();
            ctx.moveTo(-size * 0.35, -size * 0.1);
            ctx.lineTo(0, -size * 0.4);
            ctx.lineTo(size * 0.35, -size * 0.1);
            ctx.closePath();
            ctx.fill();
            // Small side building
            ctx.fillStyle = "#a98467";
            ctx.fillRect(size * 0.15, size * 0.1, size * 0.3, size * 0.2);
            ctx.fillStyle = "#6c584c";
            ctx.beginPath();
            ctx.moveTo(size * 0.1, size * 0.1);
            ctx.lineTo(size * 0.3, 0);
            ctx.lineTo(size * 0.5, size * 0.1);
            ctx.closePath();
            ctx.fill();
            break;

        case "granary":
            // Silo shape
            ctx.fillStyle = "#e6ccb2";
            ctx.fillRect(-size * 0.2, -size * 0.3, size * 0.4, size * 0.6);
            // Dome roof
            ctx.fillStyle = "#ddb892";
            ctx.beginPath();
            ctx.arc(0, -size * 0.3, size * 0.2, Math.PI, 0);
            ctx.fill();
            // Lines
            ctx.strokeStyle = "#b08968";
            ctx.beginPath();
            ctx.moveTo(-size * 0.2, 0);
            ctx.lineTo(size * 0.2, 0);
            ctx.moveTo(-size * 0.2, -size * 0.15);
            ctx.lineTo(size * 0.2, -size * 0.15);
            ctx.stroke();
            break;

        case "warehouse":
            // Large rectangular building
            ctx.fillStyle = "#8d6e63";
            ctx.fillRect(-size * 0.4, -size * 0.2, size * 0.8, size * 0.5);
            // Flat roof with crates
            ctx.fillStyle = "#6d4c41";
            ctx.fillRect(-size * 0.45, -size * 0.25, size * 0.9, size * 0.1);
            // Door
            ctx.fillStyle = "#3e2723";
            ctx.fillRect(-size * 0.15, size * 0.1, size * 0.3, size * 0.2);
            break;

        case "tower":
            // Tall stone structure
            ctx.fillStyle = "#9ca3af";
            ctx.fillRect(-size * 0.15, -size * 0.5, size * 0.3, size * 0.8);
            // Battlements
            ctx.fillStyle = "#6b7280";
            ctx.fillRect(-size * 0.2, -size * 0.55, size * 0.4, size * 0.15);
            break;

        case "temple":
            // Columns
            ctx.fillStyle = "#f3f4f6";
            ctx.fillRect(-size * 0.3, -size * 0.2, size * 0.1, size * 0.5);
            ctx.fillRect(-size * 0.1, -size * 0.2, size * 0.1, size * 0.5);
            ctx.fillRect(size * 0.1, -size * 0.2, size * 0.1, size * 0.5);
            ctx.fillRect(size * 0.3, -size * 0.2, size * 0.1, size * 0.5);
            // Base and Top
            ctx.fillStyle = "#e5e7eb";
            ctx.fillRect(-size * 0.35, size * 0.3, size * 0.8, size * 0.1); // Base
            ctx.beginPath(); // Pediment
            ctx.moveTo(-size * 0.4, -size * 0.2);
            ctx.lineTo(0, -size * 0.5);
            ctx.lineTo(size * 0.45, -size * 0.2);
            ctx.closePath();
            ctx.fill();
            break;

        case "campfire":
            // Logs
            ctx.strokeStyle = "#78350f";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-size * 0.2, size * 0.2);
            ctx.lineTo(size * 0.2, -size * 0.1);
            ctx.moveTo(size * 0.2, size * 0.2);
            ctx.lineTo(-size * 0.2, -size * 0.1);
            ctx.stroke();
            // Fire
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.moveTo(-size * 0.1, 0);
            ctx.quadraticCurveTo(0, -size * 0.4, size * 0.1, 0);
            ctx.quadraticCurveTo(0, size * 0.1, -size * 0.1, 0);
            ctx.fill();
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.moveTo(-size * 0.05, 0);
            ctx.quadraticCurveTo(0, -size * 0.25, size * 0.05, 0);
            ctx.fill();
            break;
    }

    ctx.restore();
}

/**
 * Draw a citizen sprite icon or fallback to procedural drawing
 */
export function drawCitizenSprite(ctx: CanvasRenderingContext2D, citizen: Citizen, x: number, y: number, size: number) {
    const color = citizen.tribeId === 1 ? "#ffe7c7" : citizen.tribeId === 99 ? "#ff7b7b" : "#7db2ff";

    // Get role-specific icon
    const iconName = ICON_MAP[citizen.role] || ICON_MAP.worker;

    // Body/Clothes color based on role
    let clothesColor = "#64748b";
    switch (citizen.role) {
        case "worker": clothesColor = "#b45309"; break; // Brown
        case "farmer": clothesColor = "#15803d"; break; // Green
        case "warrior": clothesColor = "#991b1b"; break; // Red
        case "scout": clothesColor = "#0369a1"; break; // Blue
        case "child": clothesColor = "#fcd34d"; break; // Yellow
        case "elder": clothesColor = "#475569"; break; // Grey
    }

    const cacheKey = `${iconName}-${clothesColor}-64`;
    const cachedIcon = (iconLoader as any).imageCache.get(cacheKey);

    if (cachedIcon) {
        ctx.save();
        const iconSize = size * 0.7;
        ctx.translate(x, y);
        ctx.drawImage(cachedIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
    } else {
        // Fallback to procedural drawing
        ctx.save();
        ctx.translate(x, y);

        // Body
        ctx.fillStyle = clothesColor;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.15, size * 0.2, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = color; // Skin tone/Tribe color
        ctx.beginPath();
        ctx.arc(0, -size * 0.15, size * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Tool/Weapon (simple line)
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        if (citizen.role === "warrior") {
            ctx.beginPath();
            ctx.moveTo(size * 0.2, 0);
            ctx.lineTo(size * 0.4, -size * 0.2);
            ctx.stroke();
        } else if (citizen.role === "worker" || citizen.role === "farmer") {
            ctx.beginPath();
            ctx.moveTo(size * 0.2, size * 0.1);
            ctx.lineTo(size * 0.4, size * 0.1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Health bar if damaged (always show this)
    if (citizen.health < 30) {
        ctx.save();
        ctx.translate(x, y);

        const barWidth = size * 0.8;
        const barHeight = 3;
        const barX = -barWidth / 2;
        const barY = size * 0.5;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect(barX, barY, (barWidth * clamp(citizen.health, 0, 100)) / 100, barHeight);

        ctx.restore();
    }
}
