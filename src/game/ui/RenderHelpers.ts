import type { HexGeometry } from "./hexGrid";
import type { StructureType, Role, Citizen } from "../core/types";
import { clamp } from "../core/utils";

export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string = "#2d5a27") {
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

export function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
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

export function drawFood(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
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

export function drawWaterSpring(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
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


export function drawStructure(ctx: CanvasRenderingContext2D, type: StructureType, x: number, y: number, size: number) {
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

export function drawCitizenSprite(ctx: CanvasRenderingContext2D, citizen: Citizen, x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);

    const color = citizen.tribeId === 1 ? "#ffe7c7" : citizen.tribeId === 99 ? "#ff7b7b" : "#7db2ff";

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

    // Health bar if damaged
    if (citizen.health < 30) {
        const barWidth = size * 0.8;
        const barHeight = 3;
        const barX = -barWidth / 2;
        const barY = size * 0.5;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect(barX, barY, (barWidth * clamp(citizen.health, 0, 100)) / 100, barHeight);
    }

    ctx.restore();
}
