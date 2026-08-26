export const MAX_EXPEDITION_STAMINA = 100;

/**
 * The persisted field is still named `health` for save compatibility, but its
 * gameplay meaning is the expedition's remaining stamina in percent.
 */
export function normalizeExpeditionStamina(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return MAX_EXPEDITION_STAMINA;
  return Math.max(0, Math.min(MAX_EXPEDITION_STAMINA, numeric));
}

export function expeditionBattleExertion(kind: "battle" | "elite" | "boss"): number {
  if (kind === "boss") return 6;
  if (kind === "elite") return 4;
  return 2;
}

export function expeditionStaminaAfterBattle(
  currentStamina: number,
  maximumCombatHealth: number,
  remainingCombatHealth: number,
  exertion: number,
): number {
  const maximum = Number(maximumCombatHealth);
  const remaining = Number(remainingCombatHealth);
  const damagePercent = Number.isFinite(maximum) && maximum > 0 && Number.isFinite(remaining)
    ? Math.round((maximum - Math.max(0, Math.min(maximum, remaining))) / maximum * 100)
    : MAX_EXPEDITION_STAMINA;
  return normalizeExpeditionStamina(
    normalizeExpeditionStamina(currentStamina) - damagePercent - Math.max(0, Math.round(exertion)),
  );
}
