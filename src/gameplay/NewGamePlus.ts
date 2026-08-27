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
import { FACTIONS } from "../catalogs/WorldExpansionCatalog";
import { createItem } from "../factories/ItemFactory";
import type { RandomSource } from "./RandomSource";
import { ERA_OBJECTIVES, evaluateEraObjective, type EraObjectiveProgress } from "./EraChallenges";
import { createEnemyStyleMemory, heroLoadoutSignature, normalizeEnemyStyleMemory } from "./EnemyMemory";
import { selectActiveSkills } from "./SkillLoadout";
import {
  EquipmentItem,
  EnemyStyleMemory,
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
const MAX_ARCHIVE_WITNESSES = 12;

const VALID_LAW_IDS = new Set<EraLawId>(ERA_LAWS.map((law) => law.id));
const VALID_BOON_IDS = new Set([
  "masters-school",
  "court-name",
  "hunters-notes",
  "old-map",
  "forge-tradition",
] as const);
const VALID_WORLD_ROLES = new Set<NonNullable<LegacyHeroRecord["worldRole"]>>([
  "legend",
  "boss",
  "mentor",
  "faction-founder",
]);

export type LegacyWorldRole = NonNullable<LegacyHeroRecord["worldRole"]>;

export interface LegacyWorldRoleDecision {
  role: LegacyWorldRole;
  scores: Record<LegacyWorldRole, number>;
  reason: string;
  schoolName?: string;
  factionId?: string;
  rememberedByIds: string[];
}

export interface LegacyArchiveInfluence {
  role: LegacyWorldRole;
  headline: string;
  summary: string;
  mentor?: {
    id: string;
    name: string;
    title: string;
    classId: HeroClass;
    level: number;
    rating: number;
    schoolName: string;
  };
  opponent?: {
    id: string;
    kind: "legendary-rival" | "legacy-boss";
    name: string;
    title: string;
    classId: HeroClass;
    level: number;
    rating: number;
    arenaIndex: number;
    unlockLevel: number;
    powerMultiplier: number;
  };
  factionTradition?: {
    factionId: string;
    founderName: string;
    name: string;
    inheritedReputation: number;
    contractRewardMultiplier: number;
  };
}

export interface EpochFinalGoalProfile {
  id: string;
  name: string;
  description: string;
  supportingObjectiveIds: string[];
  decisiveLawId?: EraLawId;
}

export interface EpochFinalGoalProgress extends EpochFinalGoalProfile {
  objectives: EraObjectiveProgress[];
  requirements: NewGamePlusRequirement[];
  completed: boolean;
}

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

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function archiveRoleFallback(archive: LegacyHeroRecord): LegacyWorldRole {
  if (archive.factionId) return "faction-founder";
  if ((archive.eliteRank ?? LEGEND_COUNT + 1) <= LEGEND_COUNT || archive.crownLeagueWins > 0) return "legend";
  if (archive.kills >= Math.max(5, Math.floor(archive.wins * 0.08))) return "boss";
  return "mentor";
}

function schoolName(name: string, classId: HeroClass): string {
  return `Школа «${CLASS_DEFINITIONS[classId].epithet}: ${name}»`;
}

export function determineLegacyWorldRole(save: GameSave): LegacyWorldRoleDecision {
  const rivalries = Object.values(save.hero.rivalries);
  const persistentRivalries = rivalries.filter((rivalry) => !rivalry.killed);
  const meetings = persistentRivalries.reduce((sum, rivalry) => sum + (rivalry.meetings ?? rivalry.wins + rivalry.losses), 0);
  const intenseRivalries = persistentRivalries.filter((rivalry) => (rivalry.intensity ?? 0) >= 3).length;
  const eliteIndex = save.eliteLeagueMemberIds.indexOf("hero");
  const eliteRank = eliteIndex >= 0 ? eliteIndex + 1 : undefined;
  const tournamentWins = save.hero.arenaWins.reduce((sum, wins) => sum + wins, 0) + save.hero.crownLeagueWins;
  const factionEntries = FACTIONS.map((faction) => ({
    id: faction.id,
    reputation: Math.max(0, save.hero.factionReputation[faction.id] ?? 0),
  })).sort((first, second) => second.reputation - first.reputation || first.id.localeCompare(second.id));
  const strongestFaction = factionEntries[0];
  const totalFactionReputation = factionEntries.reduce((sum, entry) => sum + entry.reputation, 0);
  const controlledArenas = Object.values(save.factionControl?.arenaControllers ?? {})
    .filter((factionId) => factionId === strongestFaction?.id).length;
  const scores: Record<LegacyWorldRole, number> = {
    legend: roundScore(
      (eliteRank ? Math.max(0, 78 - (eliteRank - 1) * 9) : 0)
      + save.hero.crownLeagueWins * 24
      + save.hero.legendDefenses * 14
      + tournamentWins * 0.65
      + save.hero.rating / 260,
    ),
    boss: roundScore(
      save.hero.kills * 11
      + save.hero.bossWins * 8
      + Math.max(0, save.hero.wins - save.hero.losses) * 0.16
      + intenseRivalries * 5
      + save.hero.level * 0.55,
    ),
    mentor: roundScore(
      persistentRivalries.length * 8
      + meetings * 0.75
      + tournamentWins * 0.85
      + save.hero.classChanges * 10
      + save.hero.level * 1.15
      + save.hero.losses * 0.2,
    ),
    "faction-founder": roundScore(
      (strongestFaction?.reputation ?? 0) * 1.35
      + totalFactionReputation * 0.18
      + ((strongestFaction?.reputation ?? 0) >= 45 ? 35 : 0)
      + controlledArenas * 4,
    ),
  };
  const roleOrder: LegacyWorldRole[] = ["legend", "faction-founder", "boss", "mentor"];
  const role = roleOrder.reduce((best, candidate) => scores[candidate] > scores[best] ? candidate : best);
  const rememberedByIds = [...new Set([
    ...persistentRivalries
      .sort((first, second) =>
        (second.meetings ?? second.wins + second.losses) - (first.meetings ?? first.wins + first.losses)
        || (second.intensity ?? 0) - (first.intensity ?? 0)
        || second.lastMetDay - first.lastMetDay)
      .map((rivalry) => rivalry.enemyId),
    ...save.eliteLeagueMemberIds.filter((id) => id !== "hero"),
    ...(role === "faction-founder"
      ? save.enemies.filter((enemy) => enemy.alive && enemy.factionId === strongestFaction?.id).map((enemy) => enemy.id)
      : []),
  ])].slice(0, MAX_ARCHIVE_WITNESSES);
  const reasons: Record<LegacyWorldRole, string> = {
    legend: "Титулы, защиты короны и положение в элите превратили героя в мерило для новых чемпионов.",
    boss: "Смертельные победы и личные вражды оставили после героя угрозу, с которой придётся столкнуться снова.",
    mentor: "Долгая турнирная карьера и множество личных встреч сложились в школу боя.",
    "faction-founder": "Высокая репутация и влияние на арены превратили имя героя во фракционную традицию.",
  };
  return {
    role,
    scores,
    reason: reasons[role],
    schoolName: role === "mentor" ? schoolName(save.hero.name, save.hero.classId) : undefined,
    factionId: role === "faction-founder" ? strongestFaction?.id : undefined,
    rememberedByIds,
  };
}

export function describeLegacyArchiveInfluence(archive: LegacyHeroRecord): LegacyArchiveInfluence {
  const role = archive.worldRole && VALID_WORLD_ROLES.has(archive.worldRole)
    ? archive.worldRole
    : archiveRoleFallback(archive);
  const common = {
    role,
    headline: "",
    summary: "",
  };
  if (role === "mentor") {
    const academy = archive.schoolName ?? schoolName(archive.name, archive.classId);
    return {
      ...common,
      headline: academy,
      summary: `${archive.name} остаётся в мире как наставник. Ученики наследуют его класс и часть боевой памяти.`,
      mentor: {
        id: `legacy-mentor-${archive.cycle}`,
        name: archive.name,
        title: archive.title,
        classId: archive.classId,
        level: Math.max(18, Math.min(40, archive.level)),
        rating: Math.max(1_800, archive.rating),
        schoolName: academy,
      },
    };
  }
  if (role === "faction-founder") {
    const factionId = archive.factionId ?? FACTIONS[0].id;
    const faction = FACTIONS.find((candidate) => candidate.id === factionId) ?? FACTIONS[0];
    return {
      ...common,
      headline: `Традиция «${archive.name}»`,
      summary: `${archive.name} вошёл в историю фракции «${faction.name}». Её контракты и отношение к наследнику изменятся.`,
      factionTradition: {
        factionId: faction.id,
        founderName: archive.name,
        name: `${faction.name} · традиция ${archive.name}`,
        inheritedReputation: 12 + Math.min(12, Math.floor(archive.tournamentWins / 3)),
        contractRewardMultiplier: roundMultiplier(1.08 + Math.min(0.12, archive.crownLeagueWins * 0.03)),
      },
    };
  }
  const boss = role === "boss";
  return {
    ...common,
    headline: boss ? `Возвращение: ${archive.name}` : `Живая легенда: ${archive.name}`,
    summary: boss
      ? `${archive.name} становится особым боссом новой эпохи и хранит следы прежней экипировки.`
      : `${archive.name} становится легендарным соперником, которого можно встретить на пути к Короне.`,
    opponent: {
      id: `legacy-${boss ? "boss" : "rival"}-${archive.cycle}`,
      kind: boss ? "legacy-boss" : "legendary-rival",
      name: archive.name,
      title: archive.title,
      classId: archive.classId,
      level: Math.max(boss ? 24 : 18, Math.min(40, archive.level)),
      rating: Math.max(boss ? 2_500 : 2_100, archive.rating),
      arenaIndex: Math.max(0, ARENAS.length - (boss ? 1 : 2)),
      unlockLevel: boss ? 24 : 18,
      powerMultiplier: boss ? 1.22 : 1.1,
    },
  };
}

export function epochFinalGoalProfile(
  cycle: number,
  lawIds: readonly EraLawId[],
  archive?: LegacyHeroRecord,
): EpochFinalGoalProfile {
  const safeCycle = positiveInteger(cycle);
  const laws = [...new Set(lawIds.filter((id) => VALID_LAW_IDS.has(id)))];
  const decisiveLawId = laws.length > 0 ? laws[(safeCycle - 1) % laws.length] : undefined;
  const role = archive?.worldRole ?? (archive ? archiveRoleFallback(archive) : undefined);
  const roleGoals: Record<LegacyWorldRole, Pick<EpochFinalGoalProfile, "name" | "description" | "supportingObjectiveIds">> = {
    legend: {
      name: "Свергнуть память Короны",
      description: "Превзойти легендарного героя прошлой эпохи и закрепить собственное имя в элите.",
      supportingObjectiveIds: ["book-of-rivals", "unbroken-road"],
    },
    boss: {
      name: "Закрыть старую рану",
      description: "Выследить опасное воплощение прежнего героя и победить его в решающем бою.",
      supportingObjectiveIds: ["break-evolution", "living-arsenal"],
    },
    mentor: {
      name: "Превзойти старую школу",
      description: "Одержать победы тремя классами и победить двенадцать постоянных соперников, доказав превосходство новой школы.",
      supportingObjectiveIds: ["many-schools", "book-of-rivals"],
    },
    "faction-founder": {
      name: "Решить судьбу старого ордена",
      description: "Объединить фракции союзной репутацией и стать чемпионом всех арен, превзойдя влияние старого ордена.",
      supportingObjectiveIds: ["common-oath", "six-banners"],
    },
  };
  const lawGoals: Partial<Record<EraLawId, Pick<EpochFinalGoalProfile, "description" | "supportingObjectiveIds">>> = {
    "age-of-steel": { description: "Финальная победа потребует полностью пробуждённого арсенала.", supportingObjectiveIds: ["living-arsenal"] },
    "hungry-lands": { description: "Путь к финалу проходит через глубочайшие подземелья эпохи.", supportingObjectiveIds: ["underworld-map"] },
    "bloody-arenas": { description: "Право на финальный бой нужно заслужить чемпионствами на всех аренах.", supportingObjectiveIds: ["six-banners"] },
    "mercenary-age": { description: "До финала нужно победить двенадцать постоянных соперников и заслужить союзную репутацию всех фракций.", supportingObjectiveIds: ["book-of-rivals", "common-oath"] },
    "ancient-awakening": { description: "До финала необходимо победить восемнадцать врагов с мутациями и полностью пробудить три реликвии.", supportingObjectiveIds: ["break-evolution", "living-arsenal"] },
    "crown-discord": { description: "Финал открывается только после длинной серии побед и защиты титула.", supportingObjectiveIds: ["unbroken-road", "six-banners"] },
  };
  const base = role ? roleGoals[role] : {
    name: "Написать финал эпохи",
    description: "Завершить цели эпохи и доказать право начать новую летопись.",
    supportingObjectiveIds: ["six-banners", "underworld-map"],
  };
  const law = decisiveLawId ? lawGoals[decisiveLawId] : undefined;
  return {
    id: `epoch-${safeCycle}-${role ?? "open"}-${decisiveLawId ?? "free"}`,
    name: base.name,
    description: law ? `${base.description} ${law.description}` : base.description,
    supportingObjectiveIds: [...new Set([...base.supportingObjectiveIds, ...(law?.supportingObjectiveIds ?? [])])],
    decisiveLawId,
  };
}

export function epochFinalGoalProgress(save: GameSave): EpochFinalGoalProgress | undefined {
  const legacy = normalizeLegacyState(save.legacy);
  if (legacy.cycle < 2) return undefined;
  const archive = legacy.archives.filter((candidate) => candidate.cycle < legacy.cycle)
    .sort((first, second) => second.cycle - first.cycle)[0];
  const profile = epochFinalGoalProfile(legacy.cycle, legacy.activeLawIds, archive);
  const state = save.eraChallengeProgress;
  const metrics = { ...(state?.cycle === legacy.cycle ? state.metrics : {}) };
  metrics.arenaChampionships = Math.max(metrics.arenaChampionships ?? 0, save.hero.arenaWins.filter((wins) => wins > 0).length);
  metrics.uniqueDungeonsCompleted = Math.max(metrics.uniqueDungeonsCompleted ?? 0, Object.keys(save.dungeonClears ?? {}).length);
  metrics.awakenedRelics = Math.max(metrics.awakenedRelics ?? 0, save.hero.inventory.filter((item) => (item.relicTier ?? 0) >= 3).length);
  metrics.alliedFactions = Math.max(metrics.alliedFactions ?? 0, Object.values(save.hero.factionReputation).filter((value) => value >= 45).length);
  const objectives = profile.supportingObjectiveIds.map((id) => ERA_OBJECTIVES.find((objective) => objective.id === id)!)
    .filter(Boolean).map((objective) => evaluateEraObjective(objective, metrics));
  const requirements: NewGamePlusRequirement[] = objectives.map((progress) => ({
    id: `epoch-goal-${progress.objective.id}`,
    label: `${profile.name}: ${progress.objective.name} (${progress.current}/${progress.target})`,
    met: progress.completed,
  }));
  if (archive && describeLegacyArchiveInfluence(archive).opponent) {
    requirements.push({
      id: "epoch-goal-predecessor",
      label: `Победить ${archive.name}, героя эпохи ${archive.cycle}, в Зале отзвуков`,
      met: (save.defeatedLegacyCycles ?? []).includes(archive.cycle),
    });
  }
  return { ...profile, objectives, requirements, completed: requirements.every((requirement) => requirement.met) };
}

function cloneItem(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    stats: { ...item.stats },
    allowedClasses: item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
    affix: item.affix ? { ...item.affix } : undefined,
    relicHistory: item.relicHistory ? [...item.relicHistory] : undefined,
    relicFeats: item.relicFeats ? [...item.relicFeats] : undefined,
    relicProperties: item.relicProperties?.map((property) => ({ ...property })),
  };
}

function cloneFighter(fighter: LegacyFighterRecord): LegacyFighterRecord {
  return { ...fighter, heroMemory: fighter.heroMemory ? normalizeEnemyStyleMemory(fighter.heroMemory) : undefined };
}

export function inheritArchiveStyleMemory(fighter: LegacyFighterRecord, day = 1): EnemyStyleMemory {
  const source = normalizeEnemyStyleMemory(fighter.heroMemory, [], day);
  const attenuate = (knowledge: Record<string, number | undefined>): Record<string, number> => Object.fromEntries(
    Object.entries(knowledge).sort((first, second) => Number(second[1]) - Number(first[1]))
      .slice(0, 12).map(([key, value]) => [key, Math.round(Number(value) * 0.6)]),
  );
  return normalizeEnemyStyleMemory({
    ...source,
    familiarity: Math.min(60, Math.round(source.familiarity * 0.6)),
    classKnowledge: attenuate(source.classKnowledge),
    tacticalKnowledge: attenuate(source.tacticalKnowledge),
    skillKnowledge: attenuate(source.skillKnowledge),
    behaviorKnowledge: attenuate(source.behaviorKnowledge),
    recentSignatures: source.recentSignatures.slice(0, 4).map((signature) => ({ ...signature, day })),
    countermeasureIds: source.countermeasureIds.slice(0, 3),
    currentSimilarity: 0,
    lastEncounterDay: day,
    lastDecayDay: day,
  }, [], day);
}

function archiveHeroStyleMemory(save: GameSave): EnemyStyleMemory {
  const equipped = new Set(Object.values(save.hero.equipped));
  const itemSkills = save.hero.inventory.filter((item) => equipped.has(item.id)).map((item) => item.grantedSkillId);
  const available = SKILLS.filter((skill) => skill.unlockLevel <= save.hero.level
    && (skill.classes === "all" || skill.classes.includes(save.hero.classId))
    && (!skill.equipmentOnly || itemSkills.includes(skill.id)));
  const tactics = save.hero.tacticalProfiles.find((profile) => profile.id === save.hero.activeTacticalProfileId);
  const selected = selectActiveSkills(save.hero, available, tactics).map((skill) => skill.id);
  const signature = heroLoadoutSignature(save.hero, selected, save.worldDay);
  return normalizeEnemyStyleMemory({
    ...createEnemyStyleMemory(save.worldDay),
    familiarity: 75,
    classKnowledge: { [signature.classId]: 75 },
    tacticalKnowledge: { [signature.tacticalStyle]: 75 },
    skillKnowledge: Object.fromEntries(signature.skillIds.map((id) => [id, 70])),
    behaviorKnowledge: Object.fromEntries(Object.entries(signature.behavior).map(([key, value]) => [key, Math.round(Number(value) * 70)])),
    recentSignatures: [signature],
    countermeasureIds: ["guarded-opening", "signature-parry"],
  });
}

function cloneArchive(archive: LegacyHeroRecord): LegacyHeroRecord {
  const worldRole = archive.worldRole && VALID_WORLD_ROLES.has(archive.worldRole)
    ? archive.worldRole
    : archiveRoleFallback(archive);
  const safeSchoolName = typeof archive.schoolName === "string" && archive.schoolName.trim()
    ? archive.schoolName.trim()
    : worldRole === "mentor" ? schoolName(archive.name, archive.classId) : undefined;
  const safeFactionId = worldRole === "faction-founder"
    && typeof archive.factionId === "string"
    && FACTIONS.some((faction) => faction.id === archive.factionId)
    ? archive.factionId
    : undefined;
  return {
    ...archive,
    heroMemory: archive.heroMemory ? normalizeEnemyStyleMemory(archive.heroMemory) : undefined,
    worldRole: worldRole === "faction-founder" && !safeFactionId ? "mentor" : worldRole,
    schoolName: worldRole === "faction-founder" && !safeFactionId
      ? schoolName(archive.name, archive.classId)
      : safeSchoolName,
    factionId: safeFactionId,
    rememberedByIds: [...new Set((archive.rememberedByIds ?? [])
      .filter((id): id is string => typeof id === "string" && Boolean(id.trim())))].slice(0, MAX_ARCHIVE_WITNESSES),
    appearance: {
      hairStyle: [0, 1, 2].includes(archive.appearance?.hairStyle) ? archive.appearance.hairStyle : 0,
      faceStyle: [0, 1, 2].includes(archive.appearance?.faceStyle) ? archive.appearance.faceStyle : 0,
    },
    equipment: (archive.equipment ?? []).map(cloneItem),
    notableFighters: (archive.notableFighters ?? []).map(cloneFighter),
    fallenNames: [...(archive.fallenNames ?? [])],
    lawIds: [...new Set((archive.lawIds ?? []).filter((id) => VALID_LAW_IDS.has(id)))],
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
    ...(epochFinalGoalProgress(save)?.requirements ?? []),
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
    heroMemory: normalizeEnemyStyleMemory(enemy.heroMemory),
  };
}

export function buildLegacyArchive(save: GameSave, completedAt = Date.now()): LegacyHeroRecord {
  const legacy = normalizeLegacyState(save.legacy);
  const worldIdentity = determineLegacyWorldRole(save);
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
    .filter((enemy) => !enemy.alive && !enemy.retiredDay)
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
    heroMemory: archiveHeroStyleMemory(save),
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
    worldRole: worldIdentity.role,
    schoolName: worldIdentity.schoolName,
    factionId: worldIdentity.factionId,
    rememberedByIds: worldIdentity.rememberedByIds,
    completedAt,
  };
}

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
