import { clamp } from "../../core/utils";
import type { Citizen, CitizenAction, ResourceType, Role } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";
import type { CitizenSystemEvent } from "../CitizenSystem";
import { CitizenRepository } from "./CitizenRepository";
import { Navigator } from "./Navigator";
import type { BehaviorDecision } from "./CitizenBehaviorDirector";

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
    private hooks: ActionHooks,
  ) {}

  execute(citizen: Citizen, decision: BehaviorDecision, tickHours: number, context: ExecutionContext) {
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
      case "rest":
        citizen.fatigue = clamp(citizen.fatigue - 3 * tickHours, 0, 100);
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
    }
  }

  private gatherResource(citizen: Citizen, type: ResourceType) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    if (!cell || !cell.resource || cell.resource.type !== type) return;
    const amount = clamp(cell.resource.amount, 0, 3);
    if (amount <= 0) return;
    const efficiency = type === "food" && citizen.role === "farmer" ? 1.1 : 1;
    const gathered = Math.min(1, cell.resource.amount);
    cell.resource.amount = clamp(cell.resource.amount - gathered, 0, 10);
    if (type === "food") {
      citizen.carrying.food += Math.floor(gathered * efficiency);
      if (cell.cropProgress >= 1) {
        cell.cropProgress = 0;
      }
    } else if (type === "stone") {
      citizen.carrying.stone += gathered;
    }
    // Depositing now happens via the gatherer brain's state machine.
  }

  private storeResources(citizen: Citizen) {
    const cell = this.world.getCell(citizen.x, citizen.y);
    const atStorage = cell?.structure === "village" || cell?.structure === "granary";
    if (!atStorage) {
      const target = this.world.villageCenter;
      this.navigator.moveCitizenTowards(citizen, target.x, target.y);
      return;
    }
    let deposited = false;
    if (citizen.carrying.food > 0) {
      const stored = this.world.deposit("food", citizen.carrying.food);
      citizen.carrying.food -= stored;
      deposited = stored > 0;
    }
    if (citizen.carrying.stone > 0) {
      const stored = this.world.deposit("stone", citizen.carrying.stone);
      citizen.carrying.stone -= stored;
      deposited = deposited || stored > 0;
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
    const damage = attacker.role === "warrior" ? 15 : 5;
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
    this.hooks.emit({ type: "log", message: "Ha nacido un nuevo niño en la tribu." });
  }

  private tendCrop(citizen: Citizen, x: number, y: number, tickHours: number) {
    const cell = this.world.getCell(x, y);
    if (!cell) return;
    if (citizen.x !== x || citizen.y !== y) return;
    cell.cropProgress = clamp(cell.cropProgress + 0.11 * tickHours, 0, 1.2);
    citizen.fatigue = clamp(citizen.fatigue + 1, 0, 100);
    if (cell.cropProgress >= 1 && !cell.resource) {
      cell.resource = { type: "food", amount: 2, renewable: true, richness: cell.fertility };
    }
  }

  private logCitizenAction(citizen: Citizen, action: CitizenAction, source: string, context: ExecutionContext) {
    if (!context.debugLogging) return;
    const signature = `${source}|${this.getActionSignature(action)}`;
    if (citizen.debugLastAction === signature) return;
    citizen.debugLastAction = signature;

    const description = this.describeAction(action);
    const brainPhase = citizen.brain?.kind === "gatherer" ? ` fase:${citizen.brain.phase}` : "";
    const carrying = `F${citizen.carrying.food}/P${citizen.carrying.stone}`;
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
}

const formatCoords = (x: number, y: number) => `(${x},${y})`;
