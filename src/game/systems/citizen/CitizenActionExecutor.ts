import { clamp } from "../../core/utils";
import type { Citizen, CitizenAction, ResourceType, Role } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";
import type { CitizenSystemEvent } from "../CitizenSystem";
import { CitizenRepository } from "./CitizenRepository";
import { Navigator } from "./Navigator";
import type { BehaviorDecision } from "./CitizenBehaviorDirector";
import { FOOD_SELF_RESERVE, FOOD_STORE_THRESHOLD, ResourceCollectionEngine } from "../resource/ResourceCollectionEngine";
import { CellTaskManager } from "../task/CellTaskManager";

type BusyAction = Extract<CitizenAction["type"], "gather" | "construct" | "tendCrops" | "attack" | "mate">;
const BUSY_ACTIONS: readonly BusyAction[] = ["gather", "construct", "tendCrops", "attack", "mate"];

interface ExecutionContext {
  debugLogging: boolean;
  elapsedHours: number;
}

type ActionHooks = {
  emit: (event: CitizenSystemEvent) => void;
  finalizeCitizenDeath: (citizen: Citizen) => void;
  createCitizen: (role: Role, x: number, y: number, tribeId: number) => Citizen;
  addCitizen: (citizen: Citizen) => void;
};

/**
 * Applies the effects of a citizen action (including logging) so the main
 * system can stay agnostic of the concrete implementations.
 */
export class CitizenActionExecutor {
  constructor(
    private world: WorldEngine,
    private repository: CitizenRepository,
    private navigator: Navigator,
    private resourceEngine: ResourceCollectionEngine,
    private taskManager: CellTaskManager,
    private hooks: ActionHooks,
  ) { }

  execute(citizen: Citizen, decision: BehaviorDecision, tickHours: number, context: ExecutionContext) {
    this.updateActiveTask(citizen, decision.action);
    this.logCitizenAction(citizen, decision.action, decision.source, context);
    this.applyCitizenAction(citizen, decision.action, tickHours);
  }

  private applyCitizenAction(citizen: Citizen, action: CitizenAction, tickHours: number) {
    switch (action.type) {
      case "move":
        this.navigator.moveCitizenTowards(citizen, action.x, action.y);
        break;
      case "gather":
        this.gatherResource(citizen, action.resourceType);
        break;
      case "storeResources":
        this.storeResources(citizen);
        break;
      case "refillFood":
        this.refillFood(citizen, action.amount);
        break;
      case "rest":
        // 50% faster fatigue recovery: -3 * 1.25 * 1.5 = -5.625 per tick
        citizen.fatigue = clamp(citizen.fatigue - 3 * 1.25 * 1.5 * tickHours, 0, 100);
        citizen.hunger = clamp(citizen.hunger - 0.5 * tickHours, 0, 100);
        citizen.morale = clamp(citizen.morale + 2 * tickHours, 0, 100);
        break;
      case "idle":
        citizen.fatigue = clamp(citizen.fatigue - 1 * tickHours, 0, 100);
        break;
      case "attack":
        this.handleAttack(citizen, action.targetId);
        break;
      case "mate":
        this.handleReproduction(citizen, action.partnerId);
        break;
      case "tendCrops":
        this.tendCrop(citizen, action.x, action.y, tickHours);
        break;
      case "construct":
        this.constructStructure(citizen, action.siteId, tickHours);
        break;
    }
  }

  private gatherResource(citizen: Citizen, type: ResourceType) {
    if (type === "food" || type === "stone" || type === "wood") {
      this.resourceEngine.gather(citizen, type);
    }
  }

  private storeResources(citizen: Citizen) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!this.resourceEngine.isStorageCell(cell)) {
      const target = this.world.villageCenter;
      this.navigator.moveCitizenTowards(citizen, target.x, target.y);
      return;
    }
    const shouldReserveFood = citizen.pendingFoodReserve || citizen.carrying.food >= FOOD_STORE_THRESHOLD;
    const reserveFood = shouldReserveFood ? FOOD_SELF_RESERVE : 0;
    const deposited = this.resourceEngine.storeAtCurrentCell(citizen, { reserveFood });
    if (citizen.pendingFoodReserve) {
      delete citizen.pendingFoodReserve;
    }
    if (deposited) {
      citizen.morale = clamp(citizen.morale + 4, 0, 100);
    }
  }

  private handleAttack(attacker: Citizen, targetId: number) {
    const target = this.repository.getCitizenById(targetId);
    if (!target || target.state === "dead") return;
    const distance = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);
    if (distance > 1) {
      this.navigator.moveCitizenTowards(attacker, target.x, target.y);
      return;
    }
    const baseDamage = attacker.role === "warrior" ? 15 : 5;
    const reduction = target.damageResistance && target.damageResistance > 0 ? Math.max(0, Math.min(target.damageResistance, 0.9)) : 0;
    const damage = Math.max(0, Math.floor(baseDamage * (1 - reduction)));
    target.health = clamp(target.health - damage, -50, 100);
    target.lastDamageCause = `combate con ${attacker.id}`;
    attacker.fatigue = clamp(attacker.fatigue + 5, 0, 100);
    if (target.health <= 0) {
      this.hooks.finalizeCitizenDeath(target);
      if (target.tribeId !== attacker.tribeId) {
        this.hooks.emit({ type: "powerGain", amount: 2 });
      }
    }
  }

  private handleReproduction(citizen: Citizen, partnerId: number) {
    const partner = this.repository.getCitizenById(partnerId);
    if (!partner || partner.state === "dead") return;
    const near = Math.abs(citizen.x - partner.x) <= 1 && Math.abs(citizen.y - partner.y) <= 1;
    if (!near) return;
    if (this.world.stockpile.food < 10) return;
    if (citizen.role === "child" || partner.role === "child") return;
    if (citizen.role === "elder" || partner.role === "elder") return;
    this.world.consume("food", 10);
    const spawn = this.hooks.createCitizen("child", citizen.x, citizen.y, citizen.tribeId);
    spawn.hunger = 10;
    this.hooks.addCitizen(spawn);
    this.hooks.emit({ type: "log", message: "A new child has been born in the tribe." });
  }

  private tendCrop(citizen: Citizen, x: number, y: number, tickHours: number) {
    const cell = this.world.getCell(x, y);
    if (!cell) return;
    if (citizen.x !== x || citizen.y !== y) return;
    citizen.fatigue = clamp(citizen.fatigue + 1.2 * tickHours, 0, 100);

    if (cell.priority !== "farm") {
      cell.cropProgress = clamp(cell.cropProgress + 0.05 * tickHours, 0, 1);
      return;
    }

    const task = cell.farmTask ?? null;
    if (!task) {
      return;
    }

    if (task === "sow") {
      cell.cropStage = 1;
      cell.cropProgress = 0.1;
      cell.farmTask = null;
      citizen.morale = clamp(citizen.morale + 0.5, 0, 100);
      this.taskManager.releaseAt(x, y);
      return;
    }

    if (task === "fertilize") {
      cell.cropStage = 2;
      cell.cropProgress = Math.max(cell.cropProgress, 0.5);
      cell.farmTask = null;
      citizen.morale = clamp(citizen.morale + 0.5, 0, 100);
      this.taskManager.releaseAt(x, y);
      return;
    }

    if (task === "harvest") {
      const harvestYield = Math.max(1, Math.round(1 + cell.fertility));
      citizen.carrying.food += harvestYield;
      cell.cropStage = 0;
      cell.cropProgress = 0;
      cell.farmTask = cell.priority === "farm" ? "sow" : null;
      citizen.morale = clamp(citizen.morale + 1.5, 0, 100);
      this.taskManager.releaseAt(x, y);
    }
  }

  private refillFood(citizen: Citizen, requested?: number) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!cell || !this.resourceEngine.isStorageCell(cell)) {
      return;
    }
    const desired = Math.max(0, requested ?? 3);
    const needed = Math.max(0, desired - citizen.carrying.food);
    if (needed <= 0) return;
    const taken = this.world.consume("food", needed);
    citizen.carrying.food += taken;
  }

  private constructStructure(citizen: Citizen, siteId: number, tickHours: number) {
    const labor = 3 * tickHours;
    const availableStone = citizen.carrying.stone;
    const stoneSpend = availableStone > 0 ? Math.min(1, availableStone) : 0;
    const availableWood = citizen.carrying.wood;
    const woodSpend = availableWood > 0 ? Math.min(1, availableWood) : 0;
    const result = this.world.applyConstructionWork(siteId, labor, { stone: stoneSpend, wood: woodSpend });
    if (!result.applied) {
      citizen.fatigue = clamp(citizen.fatigue + 0.5 * tickHours, 0, 100);
      return;
    }
    if (result.stoneUsed && result.stoneUsed > 0) {
      citizen.carrying.stone = Math.max(0, citizen.carrying.stone - result.stoneUsed);
    }
    if (result.woodUsed && result.woodUsed > 0) {
      citizen.carrying.wood = Math.max(0, citizen.carrying.wood - result.woodUsed);
    }
    citizen.fatigue = clamp(citizen.fatigue + 2 * tickHours, 0, 100);
    citizen.morale = clamp(citizen.morale + 0.2, 0, 100);
    if (result.completed && result.site) {
      const location = formatCoords(result.site.anchor.x, result.site.anchor.y);
      this.hooks.emit({
        type: "log",
        message: `Se completó ${result.site.type} en ${location}.`,
        notificationType: "success",
      });
    }
  }

  private logCitizenAction(citizen: Citizen, action: CitizenAction, source: string, context: ExecutionContext) {
    if (!context.debugLogging) return;
    const signature = `${source}|${this.getActionSignature(action)}`;
    if (citizen.debugLastAction === signature) return;
    citizen.debugLastAction = signature;

    const description = this.describeAction(action);
    const brainPhase = citizen.brain?.kind === "gatherer" ? ` fase:${citizen.brain.phase}` : "";
    const carrying = `F${citizen.carrying.food}/P${citizen.carrying.stone}/M${citizen.carrying.wood}`;
    const hunger = `hambre ${citizen.hunger.toFixed(0)}`;
    const logMessage = `[DEBUG] Habitante ${citizen.id} (${citizen.role}) ${description} via ${source}${brainPhase} @${formatCoords(
      citizen.x,
      citizen.y,
    )} | ${carrying} | ${hunger}`;
    this.hooks.emit({
      type: "log",
      message: logMessage,
    });
    this.appendCitizenHistory(citizen, `${description} via ${source}${brainPhase} @${formatCoords(citizen.x, citizen.y)} | ${carrying} | ${hunger}`, context.elapsedHours);
  }

  private appendCitizenHistory(citizen: Citizen, details: string, elapsedHours: number) {
    citizen.actionHistory.unshift({
      timestamp: elapsedHours,
      description: details,
    });
    if (citizen.actionHistory.length > 15) {
      citizen.actionHistory.length = 15;
    }
  }

  private describeAction(action: CitizenAction): string {
    switch (action.type) {
      case "move":
        return `se mueve hacia ${formatCoords(action.x, action.y)}`;
      case "gather":
        return `recolecta ${action.resourceType}`;
      case "storeResources":
        return "deposita recursos";
      case "refillFood":
        return "repone raciones";
      case "rest":
        return "descansa";
      case "idle":
        return "permanece inactivo";
      case "attack":
        return `ataca al objetivo ${action.targetId}`;
      case "mate":
        return `busca pareja ${action.partnerId}`;
      case "tendCrops":
        return `atiende cultivos en ${formatCoords(action.x, action.y)}`;
      default:
        return "acción desconocida";
    }
  }

  private getActionSignature(action: CitizenAction): string {
    switch (action.type) {
      case "move":
        return `move:${action.x},${action.y}`;
      case "gather":
        return `gather:${action.resourceType}`;
      case "storeResources":
        return "store";
      case "refillFood":
        return "refillFood";
      case "rest":
        return "rest";
      case "idle":
        return "idle";
      case "attack":
        return `attack:${action.targetId}`;
      case "mate":
        return `mate:${action.partnerId}`;
      case "tendCrops":
        return `tend:${action.x},${action.y}`;
      default:
        return "unknown";
    }
  }

  private updateActiveTask(citizen: Citizen, action: CitizenAction) {
    if (isBusyAction(action.type)) {
      citizen.activeTask = action.type;
      return;
    }
    delete citizen.activeTask;
  }
}

const formatCoords = (x: number, y: number) => `(${x},${y})`;

const isBusyAction = (actionType: CitizenAction["type"]): actionType is BusyAction =>
  BUSY_ACTIONS.includes(actionType as BusyAction);
