import type { CitizenSkills, Role, SkillType } from "./types";

/**
 * Configuration for the citizen skills system.
 * Skills improve with use and provide bonuses to related actions.
 */
export const SKILL_CONFIG = {
    // Valores iniciales por rol
    INITIAL_BY_ROLE: {
        farmer: { farming: 20, mining: 5, combat: 5, construction: 10, foraging: 15 },
        worker: { farming: 10, mining: 15, combat: 5, construction: 20, foraging: 10 },
        warrior: { farming: 5, mining: 5, combat: 25, construction: 5, foraging: 5 },
        scout: { farming: 5, mining: 5, combat: 10, construction: 5, foraging: 20 },
        child: { farming: 0, mining: 0, combat: 0, construction: 0, foraging: 0 },
        elder: { farming: 15, mining: 10, combat: 5, construction: 15, foraging: 10 },
    } as Record<Role, CitizenSkills>,

    // XP ganado por acción
    XP_PER_ACTION: {
        farming: 0.5,      // Por cada acción de tendCrops
        mining: 0.3,       // Por cada piedra extraída
        combat: 1.0,       // Por cada ataque realizado
        construction: 0.4, // Por cada tick de construcción
        foraging: 0.3,     // Por cada recurso recolectado
    } as Record<SkillType, number>,

    // Multiplicador de bonus por nivel (skill/100)
    BONUS_MULTIPLIER: {
        farming: 0.5,      // +50% a skill 100
        mining: 0.3,       // +30% a skill 100
        combat: 0.4,       // +40% daño/defensa a skill 100
        construction: 0.5, // +50% velocidad a skill 100
        foraging: 0.3,     // +30% cantidad a skill 100
    } as Record<SkillType, number>,

    MAX_SKILL: 100,
    MIN_SKILL: 0,

    // Variación aleatoria inicial (-5 a +5)
    INITIAL_VARIANCE: 5,
} as const;

/**
 * Calculate the bonus multiplier for a given skill level.
 * @param skill - Current skill level (0-100)
 * @param type - Type of skill
 * @returns Bonus multiplier (0 to BONUS_MULTIPLIER[type])
 */
export function getSkillBonus(skill: number, type: SkillType): number {
    const normalized = Math.max(0, Math.min(100, skill)) / 100;
    return normalized * SKILL_CONFIG.BONUS_MULTIPLIER[type];
}

/**
 * Format skill bonus as percentage string for tooltips.
 * @param skill - Current skill level (0-100)
 * @param type - Type of skill
 * @returns Formatted string like "+15%"
 */
export function formatSkillBonus(skill: number, type: SkillType): string {
    const bonus = getSkillBonus(skill, type);
    return `+${Math.round(bonus * 100)}%`;
}

/**
 * Get a description of what the skill affects for tooltips.
 */
export function getSkillDescription(type: SkillType): string {
    const descriptions: Record<SkillType, string> = {
        farming: "Aumenta velocidad y rendimiento de cultivos",
        mining: "Aumenta eficiencia de extracción de piedra",
        combat: "Aumenta daño infligido en combate",
        construction: "Aumenta velocidad de construcción",
        foraging: "Aumenta cantidad de recursos recolectados",
    };
    return descriptions[type];
}
