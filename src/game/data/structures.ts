import type { StructureBlueprint, StructureType } from "../core/types";

export type StructureRequirements = {
  population?: number;
  structures?: StructureType[];
};

export type StructureDefinition = StructureBlueprint & {
  icon: string;
  displayName: string;
  summary: string;
  requirements: StructureRequirements;
};

export const STRUCTURE_DEFINITIONS: Record<StructureType, StructureDefinition> = {
  village: {
    type: "village",
    icon: "🏛️",
    displayName: "Central Plaza",
    summary: "Heart of the tribe. Functions as the main storage and gathering point to rest and feel safe.",
    requirements: {},
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
    icon: "🏪",
    displayName: "Granary",
    summary: "Elevated storage that protects the harvest from pests and moisture. Increases total food capacity and serves as a delivery point.",
    requirements: { population: 5 },
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    workRequired: 35,
    costs: { stone: 15 },
  },
  warehouse: {
    type: "warehouse",
    icon: "📦",
    displayName: "Warehouse",
    summary: "Roofed depot for stacking logs and stone. Adds capacity for materials and acts as a delivery point.",
    requirements: { population: 6 },
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    workRequired: 32,
    costs: { stone: 12, wood: 10 },
  },
  house: {
    type: "house",
    icon: "🏠",
    displayName: "Communal House",
    summary: "Basic shelter where inhabitants can sleep under a roof and recover from fatigue after long days.",
    requirements: {},
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    workRequired: 18,
    costs: { stone: 6 },
  },
  tower: {
    type: "tower",
    icon: "🗼",
    displayName: "Watchtower",
    summary: "Elevated post to watch the surroundings. Serves as defensive support and a strategic place for warriors.",
    requirements: { population: 8 },
    footprint: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    workRequired: 28,
    costs: { stone: 18 },
  },
  temple: {
    type: "temple",
    icon: "⛪",
    displayName: "Ancestral Temple",
    summary: "Spiritual center where totems are raised and the clan's faith is strengthened. Enhances the spirit's blessings.",
    requirements: { population: 12 },
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
    icon: "🔥",
    displayName: "Campfire",
    summary: "Simple bonfire to keep warm at night. It's the fastest spot for villagers to rest and cheer up.",
    requirements: {},
    footprint: [{ x: 0, y: 0 }],
    workRequired: 10,
    costs: { food: 2 },
  },
};

export const getStructureDefinition = (type: StructureType | null | undefined) =>
  (type ? STRUCTURE_DEFINITIONS[type] : undefined);
