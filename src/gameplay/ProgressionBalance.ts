export const WORLD_RATING_ARENA_BAND = 900;

export function heroExperienceRequirement(level: number): number {
  const completedLevels = Math.max(0, level - 1);
  return Math.round(100 + completedLevels * 45 + completedLevels ** 2 * 3.2);
}

export function enemyExperienceRequirement(level: number): number {
  const completedLevels = Math.max(0, level - 1);
  return Math.round(85 + completedLevels * 38 + completedLevels ** 2 * 2.4);
}

/** Total experience consumed before the hero enters the requested level. */
export function cumulativeHeroExperience(targetLevel: number): number {
  const safeTarget = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let level = 1; level < safeTarget; level += 1) total += heroExperienceRequirement(level);
  return total;
}

export function normalizeExperienceProgress(
  experience: number,
  previousRequirement: number,
  nextRequirement: number,
): number {
  if (nextRequirement <= 1) return 0;
  const progress = Math.max(0, Math.min(0.999, experience / Math.max(1, previousRequirement)));
  return Math.min(nextRequirement - 1, Math.round(progress * nextRequirement));
}
