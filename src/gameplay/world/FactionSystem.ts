import type { Stats } from "../core/WorldTypes";

export interface FactionPerk {
  factionId: string;
  threshold: number;
  name: string;
  description: string;
  modifiers: {
    contractReward?: number;
    trainingExperience?: number;
    tournamentReward?: number;
    dungeonLootChance?: number;
    retreatRetention?: number;
    bossReward?: number;
    forgeDiscount?: number;
    injuryRecoveryDays?: number;
    combatStats?: Partial<Stats>;
  };
}

export const FACTION_PERKS: FactionPerk[] = [
  {
    factionId: "wardens",
    threshold: 8,
    name: "Доступ к лекарям",
    description:
      "Травмы проходят на один день быстрее после официальных турниров.",
    modifiers: { injuryRecoveryDays: 1 },
  },
  {
    factionId: "wardens",
    threshold: 20,
    name: "Учебные часы",
    description: "Тренировки дают на 12% больше опыта.",
    modifiers: { trainingExperience: 0.12 },
  },
  {
    factionId: "wardens",
    threshold: 45,
    name: "Знак распорядителя",
    description: "Награды официальных турниров увеличены на 15%.",
    modifiers: { tournamentReward: 0.15 },
  },
  {
    factionId: "free-company",
    threshold: 8,
    name: "Проверенные тропы",
    description: "Шанс добычи в данжах увеличен на 6%. ",
    modifiers: { dungeonLootChance: 0.06 },
  },
  {
    factionId: "free-company",
    threshold: 20,
    name: "Страховка проводника",
    description: "При отступлении сохраняется ещё 20% наград.",
    modifiers: { retreatRetention: 0.2 },
  },
  {
    factionId: "free-company",
    threshold: 45,
    name: "Доля артели",
    description: "Закалка предметов требует на 15% меньше монет.",
    modifiers: { forgeDiscount: 0.15 },
  },
  {
    factionId: "red-ledger",
    threshold: 8,
    name: "Цена имени",
    description: "Награды за особых противников увеличены на 10%.",
    modifiers: { bossReward: 0.1 },
  },
  {
    factionId: "red-ledger",
    threshold: 20,
    name: "Список слабостей",
    description: "В боях с боссами повышен критический шанс.",
    modifiers: { combatStats: { crit: 4 } },
  },
  {
    factionId: "red-ledger",
    threshold: 45,
    name: "Красная печать",
    description: "Контракты этой фракции приносят на 25% больше наград.",
    modifiers: { contractReward: 0.25 },
  },
];

export function unlockedFactionPerks(
  factionId: string,
  reputation: number,
): FactionPerk[] {
  return FACTION_PERKS.filter(
    (perk) => perk.factionId === factionId && reputation >= perk.threshold,
  );
}

export function factionModifier(
  reputation: Record<string, number>,
  modifier: keyof FactionPerk["modifiers"],
): number {
  return Object.entries(reputation).reduce(
    (total, [factionId, value]) =>
      total +
      unlockedFactionPerks(factionId, value).reduce((sum, perk) => {
        const current = perk.modifiers[modifier];
        return sum + (typeof current === "number" ? current : 0);
      }, 0),
    0,
  );
}

export function applyFactionAllegiance(
  reputation: Record<string, number>,
  supportedFactionId: string,
  gain: number,
): Record<string, number> {
  const result = { ...reputation };
  result[supportedFactionId] = Math.max(
    -20,
    (result[supportedFactionId] ?? 0) + gain,
  );
  Object.keys(result)
    .filter((id) => id !== supportedFactionId)
    .forEach((id) => {
      result[id] = Math.max(
        -20,
        result[id] - Math.max(1, Math.floor(gain * 0.18)),
      );
    });
  return result;
}
