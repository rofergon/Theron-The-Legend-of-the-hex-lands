export type Vec2 = { x: number; y: number };

export type Terrain = 
  | "ocean"
  | "beach"
  | "grassland"
  | "forest"
  | "desert"
  | "tundra"
  | "snow"
  | "mountain"
  | "swamp"
  | "river";
export type ResourceType = "food" | "stone" | "waterSpring";
export type StructureType = "village" | "granary" | "house" | "tower" | "temple" | "campfire";
export type PriorityMark = "none" | "explore" | "defend" | "farm" | "mine";
export type Role = "worker" | "farmer" | "warrior" | "scout" | "child" | "elder";
export type GathererPhase = "idle" | "goingToResource" | "gathering" | "goingToStorage" | "depositing";

export interface ResourceNode {
  type: ResourceType;
  amount: number;
  renewable: boolean;
  richness: number;
}

export interface WorldCell {
  x: number;
  y: number;
  terrain: Terrain;
  fertility: number;
  moisture: number;
  resource?: ResourceNode;
  structure?: StructureType;
  inhabitants: number[];
  priority: PriorityMark;
  cropProgress: number;
}

export interface GathererBrain {
  kind: "gatherer";
  resourceType: "food" | "stone";
  phase: GathererPhase;
  target?: Vec2 | null;
}

export type CitizenBrain = GathererBrain | { kind: "none" };

export type CitizenActionLogEntry = {
  timestamp: number;
  description: string;
};

export interface Citizen {
  id: number;
  x: number;
  y: number;
  age: number;
  role: Role;
  hunger: number;
  morale: number;
  health: number;
  fatigue: number;
  tribeId: number;
  homeId?: number;
  target?: Vec2 | null;
  carrying: {
    food: number;
    stone: number;
  };
  blessedUntil?: number;
  state: "alive" | "dead";
  currentGoal?: string;
  brain?: CitizenBrain;
  lastDamageCause?: string;
  debugLastAction?: string;
  actionHistory: CitizenActionLogEntry[];
}

export interface WorldView {
  cells: Array<{ x: number; y: number; priority: PriorityMark; terrain: Terrain; resource?: ResourceNode; structure?: StructureType; cropReady: boolean }>;
  nearbyCitizens: Citizen[];
  threats: Citizen[];
  villageCenter?: Vec2;
}

export type CitizenAction =
  | { type: "move"; x: number; y: number }
  | { type: "gather"; resourceType: ResourceType }
  | { type: "attack"; targetId: number }
  | { type: "rest" }
  | { type: "idle" }
  | { type: "storeResources" }
  | { type: "mate"; partnerId: number }
  | { type: "tendCrops"; x: number; y: number };

export type CitizenAI = (citizen: Citizen, view: WorldView) => CitizenAction;

export type ClimateState = {
  drought: boolean;
  droughtTimer: number;
  rainy: boolean;
  rainyTimer: number;
};

export type ToastNotification = {
  id: number;
  message: string;
  type: "info" | "warning" | "critical" | "success";
  timestamp: number;
  duration: number;
};

export type ResourceTrend = {
  food: number;
  stone: number;
  population: number;
};
