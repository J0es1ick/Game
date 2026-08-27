import type { SkillDefinition } from "./WorldTypes";

export const MAX_DIRECT_DAMAGE_SHARE = 0.35;

export function combatArmorMultiplier(defense: number): number {
  return 180 / (180 + Math.max(0, defense));
}

export function combatActionRate(speed: number): number {
  const value = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  return 24 + 48 * value / (60 + value);
}

export interface CombatPressure {
  damageMultiplier: number;
  healingMultiplier: number;
}

export function combatPressure(actionsTaken: number, opponentActionsTaken: number): CombatPressure {
  const exchanges = Math.max(0, Math.min(actionsTaken, opponentActionsTaken));
  const overtime = Math.max(0, exchanges - 4);
  return {
    damageMultiplier: 1 + Math.min(3, overtime * 0.3),
    healingMultiplier: Math.max(0.25, 1 - overtime * 0.07),
  };
}

export function skillHealing(
  skill: SkillDefinition,
  level: number,
  health: number,
  maxHealth: number,
  multiplier = 1,
): number {
  const healthShare = skill.power >= 40 ? 0.08 : 0.05;
  const amount = Math.round((skill.power + level * 1.2 + maxHealth * healthShare) * Math.max(0, multiplier));
  return Math.max(0, Math.min(maxHealth - health, amount));
}
