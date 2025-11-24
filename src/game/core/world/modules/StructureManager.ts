import { STRUCTURE_DEFINITIONS } from "../../../data/structures";
import { clamp } from "../../utils";
import type { ConstructionSite, StructureType, Terrain, Vec2, WorldCell } from "../../types";

export class StructureManager {
    private size: number;
    private cells: WorldCell[][];
    private structures: Array<{ type: StructureType; x: number; y: number }> = [];
    private constructionSites = new Map<number, ConstructionSite>();
    private nextConstructionId = 1;

    constructor(size: number, cells: WorldCell[][]) {
        this.size = size;
        this.cells = cells;
    }

    public getStructures() {
        return this.structures;
    }

    public getStructureCount(type: StructureType) {
        return this.structures.reduce((total, structure) => total + (structure.type === type ? 1 : 0), 0);
    }

    public getConstructionSites() {
        return this.constructionSites;
    }

    public placeVillageCenter(): Vec2 {
        let best = { x: Math.floor(this.size / 2), y: Math.floor(this.size / 2), score: -Infinity };
        const goodTerrains: Terrain[] = ["grassland", "forest", "beach"];

        for (let y = 8; y < this.size - 8; y += 1) {
            for (let x = 8; x < this.size - 8; x += 1) {
                const cell = this.cells[y]?.[x];
                if (!cell || !goodTerrains.includes(cell.terrain)) continue;

                // Prefer areas near rivers but not on them
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

    public placeInitialStructures(villageCenter: Vec2, isWalkable: (x: number, y: number) => boolean) {
        const offsets = [
            { type: "granary" as StructureType, dx: 1, dy: 0 },
            { type: "warehouse" as StructureType, dx: -1, dy: 0 },
            { type: "house" as StructureType, dx: -2, dy: 1 },
            { type: "house" as StructureType, dx: 2, dy: 1 },
            { type: "temple" as StructureType, dx: 0, dy: -2 },
            { type: "tower" as StructureType, dx: -3, dy: -1 },
            { type: "campfire" as StructureType, dx: 3, dy: -1 },
        ];
        offsets.forEach(({ type, dx, dy }) => {
            const x = clamp(villageCenter.x + dx, 0, this.size - 1);
            const y = clamp(villageCenter.y + dy, 0, this.size - 1);
            if (isWalkable(x, y)) {
                this.buildStructure(type, x, y);
            }
        });
    }

    public buildStructure(type: StructureType, x: number, y: number) {
        const cell = this.cells[y]?.[x];
        if (!cell) return false;
        cell.structure = type;
        this.structures.push({ type, x, y });
        return true;
    }

    public hasStructure(type: StructureType) {
        return this.structures.some((structure) => structure.type === type);
    }

    public planStructure(type: StructureType, anchor: Vec2, isWalkable: (x: number, y: number) => boolean) {
        const blueprint = STRUCTURE_DEFINITIONS[type];
        if (!blueprint) {
            return { ok: false as const, reason: "Unknown structure." };
        }
        const occupiedCells = blueprint.footprint.map((offset: Vec2) => ({
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
        }));

        const seen = new Set<string>();
        for (const pos of occupiedCells) {
            const key = `${pos.x},${pos.y}`;
            if (seen.has(key)) {
                return { ok: false as const, reason: "Invalid blueprint." };
            }
            seen.add(key);
            const cell = this.cells[pos.y]?.[pos.x];
            if (!cell) {
                return { ok: false as const, reason: "Out of bounds." };
            }
            if (!isWalkable(pos.x, pos.y)) {
                return { ok: false as const, reason: "Unsuitable terrain." };
            }
            if (cell.structure || cell.constructionSiteId) {
                return { ok: false as const, reason: "Already occupied." };
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
            woodRequired: blueprint.costs.wood ?? 0,
            woodDelivered: 0,
            state: "planned",
            phase: "foundation",
        };
        this.constructionSites.set(site.id, site);

        occupiedCells.forEach(({ x, y }: Vec2) => {
            const cell = this.cells[y]?.[x];
            if (cell) {
                cell.constructionSiteId = site.id;
                cell.priority = "build";
            }
        });

        return { ok: true as const, site };
    }

    public cancelConstruction(siteId: number, options?: { refundMaterials?: boolean; clearPriority?: boolean }) {
        const site = this.constructionSites.get(siteId);
        if (!site) {
            return { ok: false as const, refunded: { stone: 0, wood: 0 } };
        }
        const refundMaterials = options?.refundMaterials ?? false;
        const refunded = {
            stone: refundMaterials ? site.stoneDelivered : 0,
            wood: refundMaterials ? site.woodDelivered : 0,
        };
        site.footprint.forEach(({ x, y }: Vec2) => {
            const cell = this.cells[y]?.[x];
            if (cell?.constructionSiteId === siteId) {
                cell.constructionSiteId = undefined;
                if (options?.clearPriority && cell.priority === "build") {
                    cell.priority = "none";
                }
            }
        });
        this.constructionSites.delete(siteId);
        return { ok: true as const, refunded };
    }

    public applyConstructionWork(siteId: number, labor: number, delivered: { stone: number; wood: number }) {
        const site = this.constructionSites.get(siteId);
        if (!site || site.state !== "planned") {
            return { applied: false as const };
        }
        let acceptedStone = 0;
        let acceptedWood = 0;
        if (delivered.stone > 0) {
            const neededStone = Math.max(site.stoneRequired - site.stoneDelivered, 0);
            acceptedStone = Math.min(neededStone, delivered.stone);
            site.stoneDelivered += acceptedStone;
        }
        if (delivered.wood > 0) {
            const neededWood = Math.max(site.woodRequired - site.woodDelivered, 0);
            acceptedWood = Math.min(neededWood, delivered.wood);
            site.woodDelivered += acceptedWood;
        }

        // Only allow construction work if all materials are delivered
        const materialsComplete =
            site.stoneDelivered >= site.stoneRequired &&
            site.woodDelivered >= site.woodRequired;

        if (materialsComplete && labor > 0) {
            site.workDone = clamp(site.workDone + labor, 0, site.workRequired);

            // Update phase based on progress
            const progress = site.workDone / site.workRequired;
            if (progress < 0.33) {
                site.phase = "foundation";
            } else if (progress < 0.66) {
                site.phase = "structure";
            } else {
                site.phase = "finishing";
            }
        }

        if (
            site.workDone >= site.workRequired &&
            materialsComplete
        ) {
            this.completeConstruction(site);
            return {
                applied: true as const,
                completed: true as const,
                site,
                stoneUsed: acceptedStone,
                woodUsed: acceptedWood,
            };
        }
        return { applied: true as const, completed: false as const, site, stoneUsed: acceptedStone, woodUsed: acceptedWood };
    }

    private completeConstruction(site: ConstructionSite) {
        site.state = "completed";
        site.footprint.forEach(({ x, y }: Vec2) => {
            const cell = this.cells[y]?.[x];
            if (cell) {
                cell.structure = site.type;
                cell.constructionSiteId = undefined;
                cell.priority = cell.priority === "build" ? "none" : cell.priority;
            }
        });
        this.structures.push({ type: site.type, x: site.anchor.x, y: site.anchor.y });
        this.constructionSites.delete(site.id);
    }

    public getConstructionSite(siteId: number) {
        return this.constructionSites.get(siteId);
    }

    public getActiveConstructionSites() {
        return Array.from(this.constructionSites.values()).filter((site) => site.state === "planned");
    }

    public findClosestConstructionCell(origin: Vec2, heuristic: (a: Vec2, b: Vec2) => number) {
        let best: { site: ConstructionSite; cell: Vec2; distance: number } | null = null;
        for (const site of this.getActiveConstructionSites()) {
            for (const cell of site.footprint) {
                const distance = heuristic(origin, cell);
                if (!best || distance < best.distance) {
                    best = { site, cell, distance };
                }
            }
        }
        return best;
    }
}
