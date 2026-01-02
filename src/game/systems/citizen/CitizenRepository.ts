import type { Citizen, CitizenSkills, Role, SkillType } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";
import { SKILL_CONFIG } from "../../core/skillConstants";
import { clamp } from "../../core/utils";

const CITIZEN_NAMES = [
  "Alden", "Bael", "Cira", "Doran", "Elda", "Fael", "Goran", "Hilda", "Iona", "Jace",
  "Kael", "Lyra", "Mira", "Nolan", "Orin", "Phaedra", "Quinn", "Rael", "Sora", "Thane",
  "Ura", "Vael", "Wren", "Xara", "Yael", "Zane", "Aria", "Boren", "Caelum", "Dara"
];

/**
 * Encapsulates storage, lookup and lifecycle helpers for citizens so the main
 * system can focus on simulation and behaviors.
 */
export class CitizenRepository {
  private citizens: Citizen[] = [];
  private citizenById = new Map<number, Citizen>();
  private nextCitizenId = 1;

  constructor(private world: WorldEngine) { }

  createCitizen(role: Role, x: number, y: number, tribeId: number): Citizen {
    const id = this.nextCitizenId++;
    const name = CITIZEN_NAMES[Math.floor(Math.random() * CITIZEN_NAMES.length)] + " " + id;

    const skills: CitizenSkills = {
      farming: 0,
      mining: 0,
      combat: 0,
      construction: 0,
      foraging: 0,
    };

    // Initialize skills based on role
    const config = SKILL_CONFIG.INITIAL_BY_ROLE[role];
    const skillTypes: SkillType[] = ["farming", "mining", "combat", "construction", "foraging"];

    skillTypes.forEach(skill => {
      const base = config[skill] ?? 0;
      const variance = SKILL_CONFIG.INITIAL_VARIANCE;
      skills[skill] = clamp(base + (Math.random() - 0.5) * 2 * variance, 0, 100);
    });

    const citizen: Citizen = {
      id,
      name,
      x,
      y,
      age: role === "child" ? 2 : role === "elder" ? 60 : 20,
      tribeId,
      role,
      hunger: 30,
      morale: 65,
      health: 80,
      fatigue: 20,
      state: "alive",
      carrying: { food: 0, stone: 0, wood: 0 },
      actionHistory: [],
      skills
    };

    return citizen;
  }

  addCitizen(citizen: Citizen) {
    this.citizens.push(citizen);
    this.citizenById.set(citizen.id, citizen);
    this.world.addCitizen(citizen.id, citizen.x, citizen.y);
  }

  removeLookup(citizen: Citizen) {
    this.citizenById.delete(citizen.id);
  }

  getCitizens() {
    return this.citizens;
  }

  pruneDeadCitizens() {
    this.citizens = this.citizens.filter((citizen) => citizen.state !== "dead");
  }

  getCitizenById(id: number) {
    return this.citizenById.get(id);
  }

  getPopulationCount(filter?: (citizen: Citizen) => boolean) {
    if (!filter) {
      return this.citizens.filter((citizen) => citizen.state === "alive").length;
    }
    return this.citizens.filter(filter).length;
  }

  getAssignablePopulationCount(tribeId?: number) {
    return this.citizens.filter(
      (citizen) =>
        citizen.state === "alive" &&
        citizen.role !== "child" &&
        citizen.role !== "elder" &&
        (tribeId === undefined || citizen.tribeId === tribeId),
    ).length;
  }

  getRoleCounts(tribeId?: number) {
    const counts: Record<Role, number> = {
      worker: 0,
      farmer: 0,
      warrior: 0,
      scout: 0,
      child: 0,
      elder: 0,
    };
    this.citizens.forEach((citizen) => {
      if (citizen.state !== "alive") return;
      if (tribeId !== undefined && citizen.tribeId !== tribeId) return;
      counts[citizen.role] += 1;
    });
    return counts;
  }

  getAssignableCitizens(tribeId?: number) {
    return this.citizens.filter(
      (citizen) =>
        citizen.state === "alive" &&
        citizen.role !== "child" &&
        citizen.role !== "elder" &&
        (tribeId === undefined || citizen.tribeId === tribeId),
    );
  }
}
