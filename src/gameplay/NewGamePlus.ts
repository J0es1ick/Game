import {
  ERA_LAWS,
  eraLawLimit,
  legacySealsForCompletion,
} from "../catalogs/NewGamePlusCatalog";
import {
  ARENAS,
  CLASS_DEFINITIONS,
  ITEM_TEMPLATES,
  RARITY_ORDER,
  SKILLS,
} from "../catalogs/WorldCatalog";
import { createItem } from "../factories/ItemFactory";
import type { RandomSource } from "./RandomSource";
import {
  EquipmentItem,
  EraLawId,
  GameSave,
  HeroClass,
  LegacyFighterRecord,
  LegacyHeroRecord,
  LegacyState,
  NewGamePlusRequirement,
  NewGamePlusStatus,
  Rarity,
} from "./WorldTypes";

const LEGEND_COUNT = 5;
const MAX_ARCHIVED_RIVALS = 5;
const MAX_FALLEN_NAMES = 80;

const VALID_LAW_IDS = new Set<EraLawId>(ERA_LAWS.map((law) => law.id));
const VALID_BOON_IDS = new Set([
  "masters-school",
  "court-name",
  "hunters-notes",
  "old-map",
  "forge-tradition",
] as const);

export type RewardContext =
  | "training"
  | "arena"
  | "dungeon"
  | "duel"
  | "boss"
  | "contract"
  | "crown-league"
  | "legend-hunt";

export interface EpochDifficultyModifiers {
  enemyHealthMultiplier: number;
  enemyAttackMultiplier: number;
  enemyDefenseMultiplier: number;
  experienceMultiplier: number;
}

export interface EraLawModifiers {
  allFighterDefenseFlat: number;
  enemyDefenseFlat: number;
  goldMultiplier: number;
  dungeonRaritySteps: number;
  arenaLethalityMultiplier: number;
  arenaRewardMultiplier: number;
  contractRewardMultiplier: number;
  duelRewardMultiplier: number;
  bossPowerMultiplier: number;
  bossMinimumRarity?: Rarity;
  bossBonusTemperingMarks: number;
  eliteChallengeChanceMultiplier: number;
}

export interface RewardModifiers {
  goldMultiplier: number;
  experienceMultiplier: number;
  minimumRaritySteps: number;
  forcedMinimumRarity?: Rarity;
  bonusTemperingMarks: number;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function positiveInteger(value: unknown, fallback = 1): number {
  return Math.max(1, nonNegativeInteger(value, fallback));
}

function roundMultiplier(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function cloneItem(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    stats: { ...item.stats },
    allowedClasses: item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
    affix: item.affix ? { ...item.affix } : undefined,
    relicHistory: item.relicHistory ? [...item.relicHistory] : undefined,
  };
}

function cloneFighter(fighter: LegacyFighterRecord): LegacyFighterRecord {
  return { ...fighter };
}

function cloneArchive(archive: LegacyHeroRecord): LegacyHeroRecord {
  return {
    ...archive,
    appearance: { ...archive.appearance },
    equipment: archive.equipment.map(cloneItem),
    notableFighters: archive.notableFighters.map(cloneFighter),
    fallenNames: [...archive.fallenNames],
    lawIds: [...(archive.lawIds ?? [])],
  };
}

export function defaultLegacyState(): LegacyState {
  return {
    cycle: 1,
    seals: 0,
    totalSealsEarned: 0,
    activeLawIds: [],
    discoveredSkillIds: [],
    archives: [],
  };
}

/**
 * Converts data loaded from localStorage into a complete, internally consistent
 * legacy state. Unknown ids are discarded so removed catalogue entries cannot
 * make a save impossible to open.
 */
export function normalizeLegacyState(value?: Partial<LegacyState> | null): LegacyState {
  const fallback = defaultLegacyState();
  if (!value || typeof value !== "object") return fallback;

  const cycle = positiveInteger(value.cycle, fallback.cycle);
  const laws = Array.isArray(value.activeLawIds)
    ? value.activeLawIds.filter((id, index, all): id is EraLawId =>
      VALID_LAW_IDS.has(id as EraLawId) && all.indexOf(id) === index)
    : [];
  const activeBoonId = value.activeBoonId && VALID_BOON_IDS.has(value.activeBoonId)
    ? value.activeBoonId
    : undefined;
  const seals = nonNegativeInteger(value.seals);
  const totalSealsEarned = Math.max(seals, nonNegativeInteger(value.totalSealsEarned));
  const inheritedItemId = typeof value.inheritedItemId === "string" && value.inheritedItemId.trim()
    ? value.inheritedItemId
    : undefined;
  const discoveredSkillIds = Array.isArray(value.discoveredSkillIds)
    ? [...new Set(value.discoveredSkillIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))]
    : [];
  const archives = Array.isArray(value.archives)
    ? value.archives.filter((archive): archive is LegacyHeroRecord => Boolean(
      archive
      && typeof archive === "object"
      && typeof archive.name === "string"
      && Array.isArray(archive.equipment)
      && Array.isArray(archive.notableFighters)
      && Array.isArray(archive.fallenNames),
    )).map(cloneArchive)
    : [];

  return {
    cycle,
    seals,
    totalSealsEarned,
    activeBoonId,
    activeLawIds: laws.slice(0, eraLawLimit(cycle)),
    inheritedItemId,
    discoveredSkillIds,
    archives,
  };
}

export function newGamePlusRequirements(save: GameSave): NewGamePlusRequirement[] {
  const finalArenaIndex = ARENAS.length - 1;
  const eliteIndex = save.eliteLeagueMemberIds.indexOf("hero");
  const eliteRank = eliteIndex >= 0 ? eliteIndex + 1 : undefined;

  return [
    {
      id: "final-arena",
      label: `Стать чемпионом турнира «${ARENAS[finalArenaIndex].name}»`,
      met: save.hero.highestArena >= finalArenaIndex && (save.hero.arenaWins[finalArenaIndex] ?? 0) >= 1,
    },
    {
      id: "legend-rank",
      label: "Войти в пятёрку легенд элитной лиги",
      met: eliteRank !== undefined && eliteRank <= LEGEND_COUNT,
    },
    {
      id: "crown-league",
      label: "Выиграть Лигу короны",
      met: save.hero.crownLeagueWins >= 1,
    },
    {
      id: "legend-defense",
      label: "Хотя бы один раз защитить титул легенды",
      met: save.hero.legendDefenses >= 1,
    },
    {
      id: "pending-title-defense",
      label: "Завершить текущий вызов за титул",
      met: !save.pendingEliteChallengeId,
    },
    {
      id: "active-expedition",
      label: "Завершить или покинуть текущую экспедицию",
      met: !save.activeExpedition,
    },
  ];
}

export function newGamePlusStatus(save: GameSave): NewGamePlusStatus {
  const legacy = normalizeLegacyState(save.legacy);
  const requirements = newGamePlusRequirements(save);
  const unlocked = requirements.every((requirement) => requirement.met);
  const firstMissing = requirements.find((requirement) => !requirement.met);
  const sealsAwarded = legacySealsForCompletion(legacy.cycle);

  return {
    unlocked,
    targetCycle: legacy.cycle + 1,
    sealsAwarded,
    // The seals for closing the current chronicle can immediately pay for the
    // boon selected on the transition screen.
    availableSeals: legacy.seals + sealsAwarded,
    lawLimit: eraLawLimit(legacy.cycle + 1),
    requirements,
    reason: unlocked
      ? `Все условия выполнены. Можно начать эпоху ${legacy.cycle + 1}.`
      : firstMissing?.label ?? "Новая эпоха пока недоступна.",
  };
}

function fighterRecord(save: GameSave, fighterId: string): LegacyFighterRecord | undefined {
  const enemy = save.enemies.find((candidate) => candidate.id === fighterId);
  // Death is permanent across chronicles too: the archive may remember a
  // fallen rival by name, but it must never recreate them as a veteran.
  if (!enemy?.alive) return undefined;
  return {
    name: enemy.name,
    title: enemy.title,
    classId: enemy.classId,
    level: enemy.level,
    rating: enemy.rating,
    tournamentWins: enemy.tournamentWins,
    wins: enemy.wins,
    losses: enemy.losses,
    kills: enemy.kills,
  };
}

export function buildLegacyArchive(save: GameSave, completedAt = Date.now()): LegacyHeroRecord {
  const legacy = normalizeLegacyState(save.legacy);
  const equippedIds = new Set(Object.values(save.hero.equipped));
  const equipment = save.hero.inventory.filter((item) => equippedIds.has(item.id)).map(cloneItem);
  const eliteIndex = save.eliteLeagueMemberIds.indexOf("hero");
  const eliteRank = eliteIndex >= 0 ? eliteIndex + 1 : undefined;
  const notableFighters = Object.values(save.hero.rivalries)
    .filter((rivalry) => !rivalry.killed)
    .sort((first, second) =>
      (second.meetings ?? second.wins + second.losses) - (first.meetings ?? first.wins + first.losses)
      || (second.intensity ?? 0) - (first.intensity ?? 0)
      || second.lastMetDay - first.lastMetDay)
    .map((rivalry) => fighterRecord(save, rivalry.enemyId))
    .filter((fighter): fighter is LegacyFighterRecord => Boolean(fighter))
    .slice(0, MAX_ARCHIVED_RIVALS);
  const fallenNames = [...new Set(save.enemies
    .filter((enemy) => !enemy.alive)
    .map((enemy) => enemy.name))]
    .slice(-MAX_FALLEN_NAMES);
  const title = eliteRank && eliteRank <= LEGEND_COUNT
    ? eliteRank === 1 ? "Первая корона" : `Легенда #${eliteRank}`
    : CLASS_DEFINITIONS[save.hero.classId].epithet;

  return {
    cycle: legacy.cycle,
    worldDay: save.worldDay,
    name: save.hero.name,
    title,
    classId: save.hero.classId,
    level: save.hero.level,
    rating: save.hero.rating,
    tournamentWins: save.hero.arenaWins.reduce((sum, wins) => sum + wins, 0) + save.hero.crownLeagueWins,
    wins: save.hero.wins,
    losses: save.hero.losses,
    kills: save.hero.kills,
    eliteRank,
    crownLeagueWins: save.hero.crownLeagueWins,
    legendDefenses: save.hero.legendDefenses,
    boonId: legacy.activeBoonId,
    lawIds: [...legacy.activeLawIds],
    inheritedItemName: legacy.inheritedItemId
      ? save.hero.inventory.find((item) => item.id === legacy.inheritedItemId)?.name
      : undefined,
    appearance: { ...save.hero.appearance },
    equipment,
    notableFighters,
    fallenNames,
    completedAt,
  };
}

/** Moderate numerical growth: later worlds gain mechanics from laws, not only HP. */
export function epochDifficultyModifiers(cycle: number): EpochDifficultyModifiers {
  const completedCycles = Math.min(5, Math.max(0, positiveInteger(cycle) - 1));
  return {
    enemyHealthMultiplier: roundMultiplier(1 + completedCycles * 0.08),
    enemyAttackMultiplier: roundMultiplier(1 + completedCycles * 0.03),
    enemyDefenseMultiplier: roundMultiplier(1 + completedCycles * 0.03),
    experienceMultiplier: roundMultiplier(1 + completedCycles * 0.03),
  };
}

export function eraLawModifiers(lawIds: readonly EraLawId[]): EraLawModifiers {
  const modifiers: EraLawModifiers = {
    allFighterDefenseFlat: 0,
    enemyDefenseFlat: 0,
    goldMultiplier: 1,
    dungeonRaritySteps: 0,
    arenaLethalityMultiplier: 1,
    arenaRewardMultiplier: 1,
    contractRewardMultiplier: 1,
    duelRewardMultiplier: 1,
    bossPowerMultiplier: 1,
    bossBonusTemperingMarks: 0,
    eliteChallengeChanceMultiplier: 1,
  };

  new Set(lawIds.filter((id) => VALID_LAW_IDS.has(id))).forEach((id) => {
    switch (id) {
      case "age-of-steel":
        modifiers.allFighterDefenseFlat += 6;
        modifiers.enemyDefenseFlat += 3;
        break;
      case "hungry-lands":
        modifiers.goldMultiplier *= 0.7;
        modifiers.dungeonRaritySteps += 1;
        break;
      case "bloody-arenas":
        modifiers.arenaLethalityMultiplier *= 1.25;
        modifiers.arenaRewardMultiplier *= 1.25;
        break;
      case "mercenary-age":
        modifiers.contractRewardMultiplier *= 1.25;
        modifiers.duelRewardMultiplier *= 1.2;
        break;
      case "ancient-awakening":
        modifiers.bossPowerMultiplier *= 1.22;
        modifiers.bossMinimumRarity = "mythic";
        modifiers.bossBonusTemperingMarks += 1;
        break;
      case "crown-discord":
        modifiers.eliteChallengeChanceMultiplier *= 2;
        break;
    }
  });

  modifiers.goldMultiplier = roundMultiplier(modifiers.goldMultiplier);
  modifiers.arenaLethalityMultiplier = roundMultiplier(modifiers.arenaLethalityMultiplier);
  modifiers.arenaRewardMultiplier = roundMultiplier(modifiers.arenaRewardMultiplier);
  modifiers.contractRewardMultiplier = roundMultiplier(modifiers.contractRewardMultiplier);
  modifiers.duelRewardMultiplier = roundMultiplier(modifiers.duelRewardMultiplier);
  modifiers.bossPowerMultiplier = roundMultiplier(modifiers.bossPowerMultiplier);
  modifiers.eliteChallengeChanceMultiplier = roundMultiplier(modifiers.eliteChallengeChanceMultiplier);
  return modifiers;
}

export function rewardModifiers(
  cycle: number,
  lawIds: readonly EraLawId[],
  context: RewardContext,
): RewardModifiers {
  const epoch = epochDifficultyModifiers(cycle);
  const laws = eraLawModifiers(lawIds);
  let activityMultiplier = 1;
  if (context === "arena" || context === "crown-league") activityMultiplier *= laws.arenaRewardMultiplier;
  if (context === "contract") activityMultiplier *= laws.contractRewardMultiplier;
  if (context === "duel") activityMultiplier *= laws.duelRewardMultiplier;

  return {
    goldMultiplier: roundMultiplier(laws.goldMultiplier * activityMultiplier),
    experienceMultiplier: roundMultiplier(epoch.experienceMultiplier * activityMultiplier),
    minimumRaritySteps: context === "dungeon" ? laws.dungeonRaritySteps : 0,
    forcedMinimumRarity: context === "boss" ? laws.bossMinimumRarity : undefined,
    bonusTemperingMarks: context === "boss" ? laws.bossBonusTemperingMarks : 0,
  };
}

export function improveMinimumRarity(rarity: Rarity, steps: number): Rarity {
  const index = RARITY_ORDER.indexOf(rarity);
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, Math.max(0, index + nonNegativeInteger(steps)))];
}

export function inheritedSkillSupportsClass(item: EquipmentItem, targetClass: HeroClass): boolean {
  if (!item.grantedSkillId) return true;
  const skill = SKILLS.find((candidate) => candidate.id === item.grantedSkillId);
  return Boolean(skill && (skill.classes === "all" || skill.classes.includes(targetClass)));
}

/**
 * Recreates an inherited item at level one through ItemFactory. This deliberately
 * avoids carrying late-game stats, forge upgrades and relic growth into a fresh
 * world while preserving the visual template, history and compatible unique skill.
 */
export function prepareInheritedItem(
  source: EquipmentItem,
  targetClass: HeroClass,
  completedCycle: number,
  formerOwner: string,
  randomSource?: RandomSource,
): EquipmentItem {
  const template = ITEM_TEMPLATES.find((candidate) => candidate.id === source.templateId);
  if (!template) throw new Error("Этот предмет больше не существует в каталоге и не может стать наследием.");
  if (source.isVisualTestItem) throw new Error("Тестовый предмет нельзя перенести в новую эпоху.");
  if (template.exclusiveToElite || source.setId === "crown-sovereign") {
    throw new Error("Регалии Живой короны принадлежат титулу, а не владельцу, и не могут стать наследием.");
  }
  if (template.allowedClasses !== "all" && !template.allowedClasses.includes(targetClass)) {
    throw new Error("Выбранное наследие несовместимо с классом героя новой эпохи.");
  }
  if (!inheritedSkillSupportsClass(source, targetClass)) {
    throw new Error("Навык выбранного наследия несовместим с классом героя новой эпохи.");
  }

  const inherited = createItem(1, {
    classId: targetClass,
    templateId: template.id,
    rarity: "rare",
    randomSource,
  });
  inherited.name = source.relicName ?? `Наследие «${template.name}»`;
  inherited.grantedSkillId = source.grantedSkillId;
  inherited.enhancement = 0;
  inherited.relicRenown = 0;
  inherited.relicTier = 0;
  inherited.relicPath = undefined;
  inherited.relicName = source.relicName;
  inherited.relicHistory = [
    ...(source.relicHistory ?? []),
    `Эпоха ${completedCycle + 1}: ${formerOwner} передал предмет наследнику.`,
  ];
  inherited.inheritedFromCycle = positiveInteger(completedCycle);
  return inherited;
}
