import { EQUIPMENT_SETS } from "../../catalogs/WorldCatalog";
import { FighterPowerCalculator } from "../combat/FighterPowerCalculator";
import { RandomSource } from "../core/RandomSource";
import {
  EquipmentItem,
  EquipmentSet,
  EquipmentSlot,
  HeroClass,
  Rarity,
  Stats,
} from "../core/WorldTypes";

const RARITY_COST: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 1.3,
  epic: 1.8,
  legendary: 2.6,
  mythic: 3.7,
  relic: 5.2,
};

const RARITY_VALUE: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 1.35,
  epic: 1.8,
  legendary: 2.35,
  mythic: 3.1,
  relic: 3.75,
};

export interface ReforgeCost {
  gold: number;
  temperingMarks: number;
}

export interface ReforgeRequest {
  sourceStat: keyof Stats;
  targetStat?: keyof Stats;
  attempt?: number;
}

export interface ReforgeResult {
  item: EquipmentItem;
  cost: ReforgeCost;
  sourceStat: keyof Stats;
  targetStat: keyof Stats;
  previousValue: number;
  nextValue: number;
  powerDelta: number;
}

export interface LootTarget {
  slot?: EquipmentSlot;
  setId?: string;
}

export interface LootPityState {
  targetKey: string;
  misses: number;
}

export interface TargetedLootOptions {
  baseChance?: number;
  chancePerMiss?: number;
  hardPity?: number;
}

export interface TargetedLootResult {
  item: EquipmentItem;
  matchedTarget: boolean;
  forcedByPity: boolean;
  targetChance: number;
  pity: LootPityState;
}

export interface BestEquipmentEvaluation {
  items: EquipmentItem[];
  equipment: EquipmentSet;
  score: number;
  completeSlots: number;
  setCounts: Record<string, number>;
  activeSetBonuses: string[];
}

function cloneItem(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    stats: { ...item.stats },
    affix: item.affix ? { ...item.affix } : undefined,
    allowedClasses:
      item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
    relicHistory: item.relicHistory ? [...item.relicHistory] : undefined,
  };
}

function clampedAttempt(attempt: number | undefined): number {
  return Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt!)) : 0;
}

export function reforgeCost(item: EquipmentItem, attempt = 0): ReforgeCost {
  const safeAttempt = clampedAttempt(attempt);
  const rarity = RARITY_COST[item.rarity];
  const enhancement = Math.max(0, item.enhancement ?? 0);
  const gold = Math.round(
    (110 + item.level * 42 + item.level ** 2 * 1.8) *
      rarity *
      (1 + enhancement * 0.12) *
      (1 + safeAttempt * 0.28),
  );
  const baseMarks =
    item.rarity === "common"
      ? 0
      : item.rarity === "rare"
        ? 1
        : item.rarity === "epic"
          ? 2
          : item.rarity === "legendary"
            ? 3
            : item.rarity === "mythic"
              ? 5
              : 7;
  return { gold, temperingMarks: baseMarks + Math.floor(safeAttempt / 3) };
}

function rolledStatValue(
  item: EquipmentItem,
  stat: keyof Stats,
  random: RandomSource,
): number {
  const level = Number.isFinite(item.level) ? Math.max(1, item.level) : 1;
  const rarity = RARITY_VALUE[item.rarity];
  const base =
    stat === "health"
      ? 8 + level * 3
      : stat === "crit"
        ? 2 + level * 0.24
        : 2 + level * 0.72;
  const enhancement = 1 + Math.max(0, item.enhancement ?? 0) * 0.06;
  const quality = 0.82 + random.next() * 0.38;
  return Math.max(1, Math.round(base * rarity * enhancement * quality));
}

export function reforgeProperty(
  item: EquipmentItem,
  request: ReforgeRequest,
  random: RandomSource,
): ReforgeResult {
  const previous = item.stats[request.sourceStat];
  if (previous === undefined)
    throw new RangeError(`У предмета нет свойства ${request.sourceStat}.`);
  const targetStat = request.targetStat ?? request.sourceStat;
  if (
    targetStat !== request.sourceStat &&
    item.stats[targetStat] !== undefined
  ) {
    throw new RangeError(
      `Свойство ${targetStat} уже присутствует на предмете.`,
    );
  }
  const result = cloneItem(item);
  delete result.stats[request.sourceStat];
  const nextValue = rolledStatValue(item, targetStat, random);
  result.stats[targetStat] = nextValue;
  const beforePower = FighterPowerCalculator.item(item);
  const afterPower = FighterPowerCalculator.item(result);
  return {
    item: result,
    cost: reforgeCost(item, request.attempt),
    sourceStat: request.sourceStat,
    targetStat,
    previousValue: previous,
    nextValue,
    powerDelta: Math.round((afterPower - beforePower) * 100) / 100,
  };
}

function targetKey(target: LootTarget): string {
  return `${target.slot ?? "any"}:${target.setId ?? "any"}`;
}

function matchesTarget(item: EquipmentItem, target: LootTarget): boolean {
  return (
    (!target.slot || item.slot === target.slot) &&
    (!target.setId || item.setId === target.setId)
  );
}

export function rollTargetedLoot(
  pool: readonly EquipmentItem[],
  target: LootTarget,
  previousPity: LootPityState | undefined,
  random: RandomSource,
  options: TargetedLootOptions = {},
): TargetedLootResult {
  if (pool.length === 0) throw new RangeError("Пул добычи пуст.");
  if (!target.slot && !target.setId)
    throw new RangeError("Для целевой охоты нужен слот или комплект.");
  const matching = pool.filter((item) => matchesTarget(item, target));
  if (matching.length === 0)
    throw new RangeError("В пуле нет предметов выбранной цели.");
  const key = targetKey(target);
  const previousMisses = previousPity?.misses;
  const misses =
    previousPity?.targetKey === key && Number.isFinite(previousMisses)
      ? Math.max(0, Math.floor(previousMisses!))
      : 0;
  const baseChance = Number.isFinite(options.baseChance)
    ? Math.max(0, Math.min(1, options.baseChance!))
    : 0.18;
  const chancePerMiss = Number.isFinite(options.chancePerMiss)
    ? Math.max(0, Math.min(1, options.chancePerMiss!))
    : 0.09;
  const hardPity = Number.isFinite(options.hardPity)
    ? Math.max(1, Math.floor(options.hardPity!))
    : 7;
  const targetChance = Math.min(0.95, baseChance + misses * chancePerMiss);
  const forcedByPity = misses + 1 >= hardPity;
  const matchedTarget = forcedByPity || random.chance(targetChance);
  const nonMatching = pool.filter((item) => !matchesTarget(item, target));
  const source =
    matchedTarget || nonMatching.length === 0 ? matching : nonMatching;
  const item = cloneItem(random.pick(source));
  const obtainedTarget = matchesTarget(item, target);
  return {
    item,
    matchedTarget: obtainedTarget,
    forcedByPity,
    targetChance,
    pity: { targetKey: key, misses: obtainedTarget ? 0 : misses + 1 },
  };
}

function classAllows(item: EquipmentItem, classId?: HeroClass): boolean {
  return (
    !classId ||
    item.allowedClasses === "all" ||
    item.allowedClasses.includes(classId)
  );
}

export function evaluateBestEquipment(
  inventory: readonly EquipmentItem[],
  options: {
    classId?: HeroClass;
    beamWidth?: number;
    candidatesPerSlot?: number;
  } = {},
): BestEquipmentEvaluation {
  const slots: EquipmentSlot[] = [
    "weapon",
    "offhand",
    "head",
    "chest",
    "hands",
    "feet",
  ];
  const beamWidth = Number.isFinite(options.beamWidth)
    ? Math.max(16, Math.floor(options.beamWidth!))
    : 256;
  const perSlot = Number.isFinite(options.candidatesPerSlot)
    ? Math.max(4, Math.floor(options.candidatesPerSlot!))
    : 16;
  let beam: EquipmentItem[][] = [[]];

  slots.forEach((slot) => {
    const compatible = inventory.filter(
      (item) => item.slot === slot && classAllows(item, options.classId),
    );
    const individuallyBest = [...compatible]
      .sort(
        (first, second) =>
          FighterPowerCalculator.item(second) -
          FighterPowerCalculator.item(first),
      )
      .slice(0, perSlot);
    const bestFromEachSet = [
      ...new Set(compatible.map((item) => item.setId).filter(Boolean)),
    ].map(
      (setId) =>
        compatible
          .filter((item) => item.setId === setId)
          .sort(
            (first, second) =>
              FighterPowerCalculator.item(second) -
              FighterPowerCalculator.item(first),
          )[0],
    );
    const candidates = [
      ...new Map(
        [...individuallyBest, ...bestFromEachSet]
          .filter(Boolean)
          .map((item) => [item.id, item]),
      ).values(),
    ];
    const choices: Array<EquipmentItem | undefined> =
      candidates.length > 0 ? candidates : [undefined];
    beam = beam
      .flatMap((loadout) =>
        choices.map((choice) => (choice ? [...loadout, choice] : loadout)),
      )
      .sort(
        (first, second) =>
          FighterPowerCalculator.equipment(second) -
          FighterPowerCalculator.equipment(first),
      )
      .slice(0, beamWidth);
  });

  const items = beam[0] ?? [];
  const setCounts = items.reduce<Record<string, number>>((counts, item) => {
    if (item.setId) counts[item.setId] = (counts[item.setId] ?? 0) + 1;
    return counts;
  }, {});
  const activeSetBonuses = EQUIPMENT_SETS.flatMap((set) =>
    set.bonuses
      .filter((bonus) => (setCounts[set.id] ?? 0) >= bonus.pieces)
      .map((bonus) => `${set.name}, ${bonus.pieces} ч.: ${bonus.description}`),
  );
  return {
    items: items.map(cloneItem),
    equipment: Object.fromEntries(items.map((item) => [item.slot, item.id])),
    score: FighterPowerCalculator.equipment(items),
    completeSlots: items.length,
    setCounts,
    activeSetBonuses,
  };
}
