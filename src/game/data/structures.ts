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
    displayName: "Plaza central",
    summary: "Corazón de la tribu. Funciona como almacén principal y punto de reunión para descansar y sentirse seguros.",
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
    displayName: "Granero",
    summary: "Almacén elevado que protege la cosecha de plagas y humedad. Amplía la capacidad total de comida y sirve como punto de entrega.",
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
    displayName: "Almacén",
    summary: "Depósito techado para apilar troncos y piedra. Añade capacidad para materiales y actúa como punto de entrega.",
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
    displayName: "Casa comunal",
    summary: "Refugio básico donde los habitantes pueden dormir bajo techo y recuperarse del cansancio tras largas jornadas.",
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
    displayName: "Torre vigía",
    summary: "Puesto elevado para vigilar los alrededores. Sirve como apoyo defensivo y lugar estratégico para los guerreros.",
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
    displayName: "Templo ancestral",
    summary: "Centro espiritual donde se elevan los tótems y se refuerza la fe del clan. Potencia las bendiciones del espíritu.",
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
    displayName: "Hoguera",
    summary: "Fogata sencilla para mantener el calor nocturno. Es el punto más rápido para que los aldeanos descansen y se animen.",
    requirements: {},
    footprint: [{ x: 0, y: 0 }],
    workRequired: 10,
    costs: { food: 2 },
  },
};

export const getStructureDefinition = (type: StructureType | null | undefined) =>
  (type ? STRUCTURE_DEFINITIONS[type] : undefined);
