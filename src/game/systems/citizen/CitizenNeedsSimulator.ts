import { clamp } from "../../core/utils";
import type { Citizen } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";

const GAME_HOURS_PER_YEAR = 24; // 1 in-game day equals 1 citizen year for balance pacing
type RandomFn = () => number;

type NeedsHooks = {
  inflictDamage: (citizen: Citizen, amount: number, cause: string) => void;
  tryEatFromStockpile: (citizen: Citizen) => void;
};

export interface NeedSimulationResult {
  died: boolean;
}

/**
 * Applies needs simulation (edad, hambre, fatiga, moral, etc.) keeping the
 * logic isolated from the main system loop. RNG can be injected to keep
 * reproducibility (e.g. seeded tests) instead of relying on global Math.random.
 */
export class CitizenNeedsSimulator {
  constructor(private world: WorldEngine, private hooks: NeedsHooks, private rng: RandomFn = Math.random) {}

  advance(citizen: Citizen, tickHours: number): NeedSimulationResult {
    const cell = this.world.getCell(citizen.x, citizen.y);
    const hungerRate = cell?.terrain === "desert" ? 1.5 : 1;
    citizen.age += tickHours / GAME_HOURS_PER_YEAR;
    citizen.hunger = clamp(citizen.hunger + hungerRate * 0.864 * tickHours, 0, 100);
    citizen.fatigue = clamp(citizen.fatigue + 0.8 * tickHours, 0, 100);
    citizen.morale = clamp(citizen.morale - 0.2 * tickHours, 0, 100);

    // Eat before resolving hunger damage to avoid instant death when food is available
    if (citizen.hunger > 70) {
      this.hooks.tryEatFromStockpile(citizen);
    }

    if (citizen.hunger > 80) this.hooks.inflictDamage(citizen, 4, "hunger");
    if (citizen.fatigue > 80) this.hooks.inflictDamage(citizen, 2, "exhaustion");
    if (citizen.morale < 20) {
      citizen.currentGoal = "passive";
    } else if (citizen.currentGoal === "passive" && citizen.morale > 35) {
      delete citizen.currentGoal; // recover once morale stabilizes to avoid permanent lock-in
    }

    if (citizen.age > 70 && this.rng() < tickHours * 0.02) this.hooks.inflictDamage(citizen, 5, "old age");

    if (citizen.health <= 0) {
      return { died: true };
    }

    return { died: false };
  }
}
