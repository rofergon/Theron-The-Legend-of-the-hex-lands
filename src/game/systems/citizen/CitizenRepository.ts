import type { Citizen, Role } from "../../core/types";
import type { WorldEngine } from "../../core/world/WorldEngine";

/**
 * Encapsulates storage, lookup and lifecycle helpers for citizens so the main
 * system can focus on simulation and behaviors.
 */
export class CitizenRepository {
  private citizens: Citizen[] = [];
  private citizenById = new Map<number, Citizen>();
  private nextCitizenId = 1;

  constructor(private world: WorldEngine) {}

  createCitizen(role: Role, x: number, y: number, tribeId: number): Citizen {
    return {
      id: this.nextCitizenId++,
      x,
      y,
      age: role === "child" ? 2 : role === "elder" ? 60 : 20,
      role,
      hunger: 30,
      morale: 65,
      health: 80,
      fatigue: 20,
      tribeId,
      carrying: { food: 0, stone: 0, wood: 0 },
      state: "alive",
      actionHistory: [],
    };
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
