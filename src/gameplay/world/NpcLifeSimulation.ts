import { EQUIPMENT_SETS, ITEM_TEMPLATES } from "../../catalogs/WorldCatalog";
import { FACTIONS, FIGHTER_TRAITS } from "../../catalogs/WorldExpansionCatalog";
import { RandomSource, nativeRandom } from "../core/RandomSource";
import {
  EnemyProfile,
  EquipmentSetDefinition,
  EquipmentSlot,
  MentorRecord,
  NpcActivity,
  NpcGoal,
  NpcRelationship,
  ItemTemplate,
} from "../core/WorldTypes";

export type NpcCareer = "active" | "legend" | "mentor" | "future-boss";
export type NpcStrategicFocus = NpcGoal | "set-collection";
export type FutureBossArchetype =
  "nemesis" | "fallen-legend" | "relic-bearer" | "dynasty-heir";

export interface NpcLifeProfile {
  fighterId: string;
  career: NpcCareer;
  nickname?: string;
  nicknameGrantedDay?: number;
  dynastyId?: string;
  revengeTargetId?: string;
  desiredSetId?: string;
  futureBossId?: string;
  lastPlanDay?: number;
  seasonsActive: number;
}

export interface NpcDynasty {
  id: string;
  name: string;
  founderId: string;
  founderName: string;
  factionId: string;
  foundedDay: number;
  memberIds: string[];
  prestige: number;
}

export interface FutureBossRecord {
  id: string;
  fighterId: string;
  name: string;
  classId: EnemyProfile["classId"];
  archetype: FutureBossArchetype;
  reason: string;
  createdDay: number;
  earliestAppearanceDay: number;
  powerLevel: number;
  status: "dormant" | "available" | "defeated";
}

export interface NpcLifeWorldState {
  version: 1;
  season: number;
  seasonStartedDay: number;
  profiles: Record<string, NpcLifeProfile>;
  dynasties: NpcDynasty[];
  futureBosses: FutureBossRecord[];
}

export interface NpcDailyPlan {
  fighterId: string;
  activity: NpcActivity;
  focus: NpcStrategicFocus;
  priority: number;
  reason: string;
  targetFighterId?: string;
  companionFighterId?: string;
  targetSetId?: string;
  targetTemplateId?: string;
  targetSlot?: EquipmentSlot;
}

export interface NpcPlanningContext {
  day: number;
  fighters: EnemyProfile[];
  eliteIds?: ReadonlySet<string>;
  mentors?: readonly MentorRecord[];
  random?: RandomSource;
  index?: NpcPlanningIndex;
}

export interface NpcPlanningIndex {
  activeById: ReadonlyMap<string, EnemyProfile>;
  arenas: ReadonlyMap<number, readonly EnemyProfile[]>;
  dynasties: ReadonlyMap<string, readonly EnemyProfile[]>;
}

export interface NpcEncounterContext {
  day: number;
  kind: "arena" | "tournament" | "duel" | "dungeon";
  lethal?: boolean;
}

export interface NpcReferenceCleanupResult {
  removedRelationships: number;
  removedStudents: number;
  removedMentorLinks: number;
  removedProfiles: number;
}

export interface NpcCareerTransition {
  kind:
    | "became-legend"
    | "left-legend-five"
    | "became-mentor"
    | "marked-future-boss";
  fighterId: string;
  description: string;
  mentorId?: string;
  dynastyId?: string;
  futureBossId?: string;
}

export interface NpcSeasonResult {
  season: number;
  transitions: NpcCareerTransition[];
  mentorsCreated: MentorRecord[];
  dynastiesCreated: NpcDynasty[];
  futureBossesCreated: FutureBossRecord[];
}

export interface NpcSeasonContext {
  day: number;
  eliteIds: readonly string[];
  random?: RandomSource;
  seasonLength?: number;
  maxRetirements?: number;
}

const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];
const MAX_RELATIONSHIPS = 24;
let templatesById: ReadonlyMap<string, ItemTemplate> | undefined;
const compatibleSetCache = new Map<
  EnemyProfile["classId"],
  EquipmentSetDefinition[]
>();

function itemTemplate(id: string): ItemTemplate | undefined {
  templatesById ??= new Map(
    ITEM_TEMPLATES.map((template) => [template.id, template]),
  );
  return templatesById.get(id);
}

export function createNpcPlanningContext(
  context: NpcPlanningContext,
  state: NpcLifeWorldState,
): NpcPlanningContext {
  const activeById = new Map<string, EnemyProfile>();
  const arenas = new Map<number, EnemyProfile[]>();
  const dynasties = new Map<string, EnemyProfile[]>();
  context.fighters.forEach((fighter) => {
    if (!fighter.alive) return;
    activeById.set(fighter.id, fighter);
    const arena = arenas.get(fighter.arenaIndex) ?? [];
    arena.push(fighter);
    arenas.set(fighter.arenaIndex, arena);
    const dynastyId = state.profiles[fighter.id]?.dynastyId;
    if (!dynastyId) return;
    const dynasty = dynasties.get(dynastyId) ?? [];
    dynasty.push(fighter);
    dynasties.set(dynastyId, dynasty);
  });
  return { ...context, index: { activeById, arenas, dynasties } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeInteger(value: unknown, fallback: number, min = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(min, Math.floor(numeric))
    : fallback;
}

function profileFor(
  state: NpcLifeWorldState,
  fighterId: string,
): NpcLifeProfile {
  return (state.profiles[fighterId] ??= {
    fighterId,
    career: "active",
    seasonsActive: 0,
  });
}

function compatibleSets(enemy: EnemyProfile): EquipmentSetDefinition[] {
  const cached = compatibleSetCache.get(enemy.classId);
  if (cached) return cached;
  const sets = EQUIPMENT_SETS.filter(
    (set) =>
      (set.classes === "all" || set.classes.includes(enemy.classId)) &&
      set.pieces.every((id) => {
        const template = itemTemplate(id);
        return (
          template &&
          !template.exclusiveToBoss &&
          !template.exclusiveToElite &&
          !template.exclusiveToFaction
        );
      }),
  );
  compatibleSetCache.set(enemy.classId, sets);
  return sets;
}

function equippedItems(enemy: EnemyProfile) {
  const ids = new Set(
    Object.values(enemy.equipped).filter((id): id is string => Boolean(id)),
  );
  return enemy.equipment.filter((item) => ids.has(item.id));
}

function ownedSetPieces(enemy: EnemyProfile, setId: string): Set<string> {
  return new Set(
    enemy.equipment
      .filter((item) => item.setId === setId)
      .map((item) => item.templateId),
  );
}

function equippedSetCount(enemy: EnemyProfile, setId: string): number {
  return equippedItems(enemy).filter((item) => item.setId === setId).length;
}

function setMissingPiece(
  enemy: EnemyProfile,
  set: EquipmentSetDefinition,
): { templateId: string; slot: EquipmentSlot } | undefined {
  const owned = ownedSetPieces(enemy, set.id);
  const templateId = set.pieces.find((id) => !owned.has(id));
  if (!templateId) return undefined;
  const template = itemTemplate(templateId);
  return template ? { templateId, slot: template.slot } : undefined;
}

function selectDesiredSet(
  enemy: EnemyProfile,
  profile: NpcLifeProfile,
): EquipmentSetDefinition | undefined {
  const sets = compatibleSets(enemy);
  const current = sets.find(
    (set) => set.id === profile.desiredSetId && setMissingPiece(enemy, set),
  );
  if (current) return current;
  const ranked = sets
    .map((set) => ({
      set,
      owned: ownedSetPieces(enemy, set.id).size,
      equipped: equippedSetCount(enemy, set.id),
    }))
    .filter((entry) => entry.owned > 0)
    .sort(
      (first, second) =>
        second.equipped - first.equipped ||
        second.owned - first.owned ||
        first.set.id.localeCompare(second.set.id),
    );
  const selected = ranked[0]?.set;
  if (selected) {
    profile.desiredSetId = selected.id;
    return selected;
  }
  if (enemy.goal !== "relic" || enemy.level < 6) {
    profile.desiredSetId = undefined;
    return undefined;
  }
  const aspirational = sets.filter((set) =>
    set.pieces.some(
      (piece) => !enemy.equipment.some((item) => item.templateId === piece),
    ),
  );
  if (aspirational.length === 0) return undefined;
  const identity = [...enemy.id].reduce(
    (total, character) => total + character.charCodeAt(0),
    enemy.level,
  );
  const target = aspirational[identity % aspirational.length];
  profile.desiredSetId = target.id;
  return target;
}

function activeRival(
  enemy: EnemyProfile,
  active: ReadonlyMap<string, EnemyProfile>,
): EnemyProfile | undefined {
  let best: NpcRelationship | undefined;
  Object.values(enemy.relationships ?? {}).forEach((relationship) => {
    if (
      relationship.kind !== "rival" ||
      !active.get(relationship.fighterId)?.alive
    )
      return;
    if (
      !best ||
      relationship.intensity > best.intensity ||
      (relationship.intensity === best.intensity &&
        relationship.lastChangedDay > best.lastChangedDay)
    )
      best = relationship;
  });
  return best ? active.get(best.fighterId) : undefined;
}

function closestArenaOpponent(
  enemy: EnemyProfile,
  fighters: readonly EnemyProfile[],
): EnemyProfile | undefined {
  let closest: EnemyProfile | undefined;
  let closestDifference = Infinity;
  fighters.forEach((candidate) => {
    if (
      !candidate.alive ||
      candidate.id === enemy.id ||
      candidate.arenaIndex !== enemy.arenaIndex
    )
      return;
    const difference = Math.abs(candidate.rating - enemy.rating);
    if (difference < closestDifference) {
      closest = candidate;
      closestDifference = difference;
    }
  });
  return closest;
}

function activityScores(
  enemy: EnemyProfile,
  profile: NpcLifeProfile,
  desiredSet: EquipmentSetDefinition | undefined,
  rival: EnemyProfile | undefined,
): Record<NpcActivity, number> {
  const scores: Record<NpcActivity, number> = {
    training: 12,
    arena: 12,
    dungeon: 10,
    shopping: 8,
    forging: 8,
    rest: 2,
  };
  const injuries = enemy.injuries.filter((injury) => injury.remainingDays > 0);
  if (injuries.length > 0)
    scores.rest +=
      150 +
      injuries.reduce((total, injury) => total + injury.remainingDays * 6, 0);
  const missingSlots = EQUIPMENT_SLOTS.filter(
    (slot) => !enemy.equipped[slot],
  ).length;
  const improvable = equippedItems(enemy).filter(
    (item) => (item.enhancement ?? 0) < 5,
  ).length;
  if (missingSlots > 0) scores.shopping += 28 + missingSlots * 8;
  if ((enemy.gold ?? 0) < Math.max(120, enemy.level * 60)) scores.dungeon += 30;
  if ((enemy.gold ?? 0) >= 180 && improvable > 0)
    scores.forging += 18 + improvable * 2;
  if (enemy.mentorId) scores.training += 24;
  if (profile.dynastyId) {
    scores.training += 15;
    scores.dungeon += 8;
  }
  if (profile.career === "future-boss") {
    scores.arena += 25;
    scores.dungeon += 15;
  }
  if (desiredSet && setMissingPiece(enemy, desiredSet)) {
    scores.dungeon += 42;
    scores.shopping += (enemy.gold ?? 0) >= 120 ? 34 : 8;
  }
  if (rival)
    scores.arena +=
      35 + Math.round((enemy.relationships?.[rival.id]?.intensity ?? 0) * 0.7);
  const goal = enemy.goal ?? "champion";
  if (goal === "champion") {
    scores.arena += 48;
    scores.training += 30;
  } else if (goal === "wealth") {
    scores.shopping += 44;
    scores.dungeon += 40;
  } else if (goal === "relic") {
    scores.dungeon += 58;
    scores.forging += 32;
    scores.shopping += 20;
  } else if (goal === "vengeance") {
    scores.arena += rival ? 75 : 30;
    scores.training += 38;
  } else {
    scores.arena += 64;
    scores.training += 34;
    scores.forging += 22;
  }
  if (profile.career === "legend") scores.arena += 22;
  return scores;
}

function chooseScoredActivity(
  scores: Record<NpcActivity, number>,
  random: RandomSource,
): { activity: NpcActivity; priority: number } {
  const ranked = (Object.entries(scores) as Array<[NpcActivity, number]>)
    .map(([activity, score]) => ({
      activity,
      score: score + random.next() * 6,
    }))
    .sort((first, second) => second.score - first.score);
  return {
    activity: ranked[0].activity,
    priority: Math.round(ranked[0].score),
  };
}

function planningReason(
  activity: NpcActivity,
  enemy: EnemyProfile,
  rival: EnemyProfile | undefined,
  set: EquipmentSetDefinition | undefined,
): string {
  if (activity === "arena" && rival)
    return `Ищет встречу с ${rival.name}, чтобы продолжить личное соперничество.`;
  if ((activity === "dungeon" || activity === "shopping") && set)
    return `Ищет недостающую часть комплекта «${set.name}».`;
  if (activity === "rest")
    return "Восстанавливается перед следующей серией боёв.";
  if (activity === "training" && enemy.mentorId)
    return "Отрабатывает приёмы своей школы с наставником.";
  if (activity === "training")
    return "Закрывает отставание в уровне и готовится к следующей арене.";
  if (activity === "forging")
    return "Усиливает наиболее слабую часть надетого снаряжения.";
  if (activity === "shopping")
    return "Ищет предмет, который действительно улучшит текущую сборку.";
  if (activity === "dungeon") return "Рискует ради денег и редкой экипировки.";
  return "Ищет подходящий турнир и соперника своего уровня.";
}

function strategicFocus(
  enemy: EnemyProfile,
  desiredSet: EquipmentSetDefinition | undefined,
): NpcStrategicFocus {
  if (desiredSet && setMissingPiece(enemy, desiredSet)) return "set-collection";
  return enemy.goal ?? "champion";
}

function relationshipRank(relationship: NpcRelationship): number {
  const kind =
    relationship.kind === "mentor"
      ? 300
      : relationship.kind === "rival"
        ? 200
        : 100;
  return kind + relationship.intensity;
}

function trimRelationships(
  enemy: EnemyProfile,
  maximum = MAX_RELATIONSHIPS,
): void {
  const entries = Object.entries(enemy.relationships ?? {})
    .sort(
      ([, first], [, second]) =>
        relationshipRank(second) - relationshipRank(first) ||
        second.lastChangedDay - first.lastChangedDay,
    )
    .slice(0, maximum);
  enemy.relationships = Object.fromEntries(entries);
}

function updateRelationship(
  owner: EnemyProfile,
  target: EnemyProfile,
  kind: NpcRelationship["kind"],
  day: number,
  increase: number,
): NpcRelationship {
  owner.relationships ??= {};
  const current = owner.relationships[target.id];
  const protectedKind =
    current?.kind === "mentor"
      ? "mentor"
      : current?.kind === "rival" && current.intensity >= 30 && kind === "ally"
        ? "rival"
        : kind;
  const relationship: NpcRelationship = {
    fighterId: target.id,
    kind: protectedKind,
    intensity: clamp((current?.intensity ?? 0) + increase, 1, 100),
    lastChangedDay: day,
  };
  owner.relationships[target.id] = relationship;
  trimRelationships(owner);
  return relationship;
}

function fighterStem(name: string): string {
  return (
    name
      .replace(/\s+[A-ZА-ЯЁ]\.$/u, "")
      .trim()
      .split(/\s+/u)[0] || "Безымянного"
  );
}

function fullSet(enemy: EnemyProfile): EquipmentSetDefinition | undefined {
  return compatibleSets(enemy).find((set) =>
    set.pieces.every((piece) =>
      enemy.equipment.some((item) => item.templateId === piece),
    ),
  );
}

function nicknameFor(enemy: EnemyProfile): string | undefined {
  const relic = equippedItems(enemy).find((item) => item.worldRelicId);
  if (relic) return `Хранитель ${relic.relicName ?? "реликвии"}`;
  const set = fullSet(enemy);
  if (set && enemy.tournamentWins >= 4) return `Знамя комплекта «${set.name}»`;
  if (enemy.kills >= 10) return "Несущий пепел";
  if (enemy.tournamentWins >= 12) return "Железная корона";
  if (enemy.wins >= 60 && enemy.wins >= enemy.losses * 2) return "Гроза арены";
  if (enemy.losses >= 25 && enemy.wins >= 30) return "Вернувшийся из праха";
  return undefined;
}

function dynastyName(founder: EnemyProfile, profile: NpcLifeProfile): string {
  const identity = profile.nickname ?? fighterStem(founder.name);
  return `Школа «${identity}»`;
}

function mentorIdFor(enemy: EnemyProfile, day: number): string {
  return `mentor-${enemy.id}-${day}`;
}

function dynastyIdFor(enemy: EnemyProfile, day: number): string {
  return `dynasty-${enemy.id}-${day}`;
}

function futureBossIdFor(
  enemy: EnemyProfile,
  archetype: FutureBossArchetype,
): string {
  return `future-boss-${enemy.id}-${archetype}`;
}

function strongestRivalry(enemy: EnemyProfile): NpcRelationship | undefined {
  return Object.values(enemy.relationships ?? {})
    .filter((relationship) => relationship.kind === "rival")
    .sort((first, second) => second.intensity - first.intensity)[0];
}

function futureBossArchetype(
  enemy: EnemyProfile,
  profile: NpcLifeProfile,
): FutureBossArchetype | undefined {
  if (
    strongestRivalry(enemy)?.intensity &&
    strongestRivalry(enemy)!.intensity >= 70
  )
    return "nemesis";
  if (enemy.legendSinceDay && profile.career !== "legend")
    return "fallen-legend";
  if (equippedItems(enemy).some((item) => item.worldRelicId))
    return "relic-bearer";
  if (profile.dynastyId && enemy.tournamentWins >= 6) return "dynasty-heir";
  return undefined;
}

function futureBossReason(
  enemy: EnemyProfile,
  archetype: FutureBossArchetype,
): string {
  if (archetype === "nemesis")
    return `${enemy.name} превратил многолетнее соперничество в личную охоту.`;
  if (archetype === "fallen-legend")
    return `${enemy.name} потерял место легенды, но не отказался от возвращения.`;
  if (archetype === "relic-bearer")
    return `${enemy.name} подчинил мировую реликвию и стал опаснее обычных чемпионов.`;
  return `${enemy.name} продолжил школу наставника и превзошёл прежнее поколение.`;
}

function mentorCandidates(
  enemy: EnemyProfile,
  fighters: EnemyProfile[],
  assigned: ReadonlySet<string>,
): EnemyProfile[] {
  return fighters
    .filter(
      (candidate) =>
        candidate.alive &&
        candidate.id !== enemy.id &&
        !assigned.has(candidate.id) &&
        (candidate.classId === enemy.classId ||
          candidate.factionId === enemy.factionId),
    )
    .sort(
      (first, second) =>
        first.level - second.level || first.rating - second.rating,
    )
    .slice(0, 3);
}

function retirementChance(enemy: EnemyProfile, day: number): number {
  const age = day - (enemy.joinedDay ?? day);
  const ageBonus = Math.max(0, age - 90) / 500;
  const weariness = enemy.losses > enemy.wins ? 0.08 : 0;
  const achievement = Math.min(0.12, enemy.tournamentWins * 0.008);
  return clamp(0.04 + ageBonus + weariness + achievement, 0.04, 0.34);
}

function keepsCompetingAsMentor(enemy: EnemyProfile): boolean {
  return (
    (enemy.goal === "champion" || enemy.goal === "elite") &&
    enemy.level >= 24 &&
    enemy.wins >= Math.max(8, Math.round(enemy.losses * 0.75))
  );
}

export function createNpcLifeWorldState(day = 1): NpcLifeWorldState {
  return {
    version: 1,
    season: 1,
    seasonStartedDay: Math.max(1, Math.floor(day)),
    profiles: {},
    dynasties: [],
    futureBosses: [],
  };
}

export function normalizeNpcLifeWorldState(
  value: unknown,
  fighters: readonly EnemyProfile[],
  day: number,
): NpcLifeWorldState {
  const source =
    value && typeof value === "object"
      ? (value as Partial<NpcLifeWorldState>)
      : {};
  const futureBosses = Array.isArray(source.futureBosses)
    ? source.futureBosses
        .filter((entry): entry is FutureBossRecord =>
          Boolean(entry?.id && entry.fighterId),
        )
        .map((entry) => ({
          ...entry,
          status: (["dormant", "available", "defeated"].includes(entry.status)
            ? entry.status
            : "dormant") as FutureBossRecord["status"],
          powerLevel: safeInteger(entry.powerLevel, 1, 1),
          earliestAppearanceDay: safeInteger(
            entry.earliestAppearanceDay,
            day,
            1,
          ),
        }))
        .reduce<FutureBossRecord[]>((records, entry) => {
          const duplicateIndex = records.findIndex(
            (candidate) =>
              candidate.id === entry.id ||
              candidate.fighterId === entry.fighterId,
          );
          if (duplicateIndex < 0) {
            records.push(entry);
            return records;
          }
          const statusRank: Record<FutureBossRecord["status"], number> = {
            dormant: 0,
            available: 1,
            defeated: 2,
          };
          if (
            statusRank[entry.status] >=
            statusRank[records[duplicateIndex].status]
          )
            records[duplicateIndex] = entry;
          return records;
        }, [])
    : [];
  const state: NpcLifeWorldState = {
    version: 1,
    season: safeInteger(source.season, 1, 1),
    seasonStartedDay: safeInteger(source.seasonStartedDay, day, 1),
    profiles: {},
    dynasties: Array.isArray(source.dynasties)
      ? source.dynasties
          .filter((entry): entry is NpcDynasty =>
            Boolean(entry?.id && entry.founderId),
          )
          .map((entry) => ({
            ...entry,
            memberIds: [...new Set(entry.memberIds ?? [])],
            prestige: safeInteger(entry.prestige, 0),
          }))
      : [],
    futureBosses,
  };
  const rawProfiles =
    source.profiles && typeof source.profiles === "object"
      ? source.profiles
      : {};
  Object.entries(rawProfiles).forEach(([id, rawValue]) => {
    if (!rawValue || typeof rawValue !== "object") return;
    const raw = rawValue as Partial<NpcLifeProfile>;
    const career: NpcCareer = [
      "active",
      "legend",
      "mentor",
      "future-boss",
    ].includes(raw.career as string)
      ? (raw.career as NpcCareer)
      : "active";
    state.profiles[id] = {
      fighterId: id,
      career,
      nickname: raw.nickname,
      nicknameGrantedDay: raw.nicknameGrantedDay,
      dynastyId: raw.dynastyId,
      revengeTargetId: raw.revengeTargetId,
      desiredSetId: raw.desiredSetId,
      futureBossId: raw.futureBossId,
      lastPlanDay: raw.lastPlanDay,
      seasonsActive: safeInteger(raw.seasonsActive, 0),
    };
  });
  fighters.forEach((fighter) => {
    const raw = rawProfiles[fighter.id] as Partial<NpcLifeProfile> | undefined;
    const career: NpcCareer =
      raw &&
      ["active", "legend", "mentor", "future-boss"].includes(
        raw.career as string,
      )
        ? (raw.career as NpcCareer)
        : fighter.retiredDay
          ? "mentor"
          : fighter.legendSinceDay
            ? "legend"
            : "active";
    state.profiles[fighter.id] = {
      fighterId: fighter.id,
      career,
      nickname: raw?.nickname,
      nicknameGrantedDay: raw?.nicknameGrantedDay,
      dynastyId: raw?.dynastyId,
      revengeTargetId: raw?.revengeTargetId,
      desiredSetId: raw?.desiredSetId,
      futureBossId: raw?.futureBossId,
      lastPlanDay: raw?.lastPlanDay,
      seasonsActive: safeInteger(raw?.seasonsActive, 0),
    };
  });
  state.futureBosses
    .filter((boss) => boss.status === "defeated")
    .forEach((boss) => {
      const profile = state.profiles[boss.fighterId];
      if (
        !profile ||
        (profile.futureBossId !== boss.id && profile.career !== "future-boss")
      )
        return;
      profile.futureBossId = undefined;
      if (profile.career === "future-boss")
        profile.career = fighters.find(
          (fighter) => fighter.id === boss.fighterId,
        )?.legendSinceDay
          ? "legend"
          : "active";
    });
  return state;
}

export function planNpcDay(
  enemy: EnemyProfile,
  state: NpcLifeWorldState,
  context: NpcPlanningContext,
): NpcDailyPlan {
  const random = context.random ?? nativeRandom;
  const profile = profileFor(state, enemy.id);
  const index =
    context.index ?? createNpcPlanningContext(context, state).index!;
  const rival = activeRival(enemy, index.activeById);
  if (rival && (enemy.relationships?.[rival.id]?.intensity ?? 0) >= 30) {
    profile.revengeTargetId = rival.id;
    enemy.goal = "vengeance";
  } else if (
    profile.revengeTargetId &&
    !index.activeById.get(profile.revengeTargetId)?.alive
  ) {
    profile.revengeTargetId = undefined;
  }
  const desiredSet = selectDesiredSet(enemy, profile);
  const scores = activityScores(enemy, profile, desiredSet, rival);
  const selected = chooseScoredActivity(scores, random);
  const target =
    selected.activity === "arena"
      ? (rival ??
        closestArenaOpponent(enemy, index.arenas.get(enemy.arenaIndex) ?? []))
      : undefined;
  const ally = Object.values(enemy.relationships ?? {})
    .filter((relationship) => relationship.kind === "ally")
    .sort((first, second) => second.intensity - first.intensity)
    .map((relationship) => index.activeById.get(relationship.fighterId))
    .find((candidate): candidate is EnemyProfile => Boolean(candidate?.alive));
  const dynastyCompanion = profile.dynastyId
    ? index.dynasties
        .get(profile.dynastyId)
        ?.find((candidate) => candidate.alive && candidate.id !== enemy.id)
    : undefined;
  const companion =
    selected.activity === "dungeon" || selected.activity === "training"
      ? (ally ?? dynastyCompanion)
      : undefined;
  const missing = desiredSet ? setMissingPiece(enemy, desiredSet) : undefined;
  profile.lastPlanDay = context.day;
  return {
    fighterId: enemy.id,
    activity: selected.activity,
    focus: strategicFocus(enemy, desiredSet),
    priority: selected.priority,
    reason: planningReason(selected.activity, enemy, target, desiredSet),
    targetFighterId: target?.id,
    companionFighterId: companion?.id,
    targetSetId: desiredSet?.id,
    targetTemplateId: missing?.templateId,
    targetSlot: missing?.slot,
  };
}

export function chooseNpcArenaOpponent(
  plan: NpcDailyPlan,
  fighter: EnemyProfile,
  candidates: readonly EnemyProfile[],
): EnemyProfile | undefined {
  let closest: EnemyProfile | undefined;
  let target: EnemyProfile | undefined;
  let closestDifference = Infinity;
  candidates.forEach((candidate) => {
    if (!candidate.alive || candidate.id === fighter.id) return;
    if (candidate.id === plan.targetFighterId) target = candidate;
    const difference = Math.abs(candidate.rating - fighter.rating);
    if (difference < closestDifference) {
      closest = candidate;
      closestDifference = difference;
    }
  });
  return target ?? closest;
}

export function isNpcDesiredLoot(
  plan: NpcDailyPlan,
  enemy: EnemyProfile,
  templateId: string,
  slot: EquipmentSlot,
): boolean {
  if (plan.targetTemplateId === templateId) return true;
  if (plan.targetSetId && itemTemplate(templateId)?.setId === plan.targetSetId)
    return true;
  return !enemy.equipped[slot];
}

export function recordNpcEncounter(
  state: NpcLifeWorldState,
  winner: EnemyProfile,
  loser: EnemyProfile,
  context: NpcEncounterContext,
): void {
  if (context.kind === "duel") {
    winner.duelWins = (winner.duelWins ?? 0) + 1;
    loser.duelLosses = (loser.duelLosses ?? 0) + 1;
  }
  const increase =
    context.kind === "tournament"
      ? 12
      : context.kind === "duel"
        ? 10
        : context.kind === "arena"
          ? 7
          : 4;
  const loserRelation = updateRelationship(
    loser,
    winner,
    "rival",
    context.day,
    increase + (context.lethal ? 10 : 0),
  );
  updateRelationship(
    winner,
    loser,
    "rival",
    context.day,
    Math.max(3, increase - 2),
  );
  const loserProfile = profileFor(state, loser.id);
  if (loserRelation.intensity >= 30 && loser.alive) {
    loser.goal = "vengeance";
    loserProfile.revengeTargetId = winner.id;
  }
  refreshNpcIdentity(state, winner, context.day);
  refreshNpcIdentity(state, loser, context.day);
}

export function recordNpcAlliance(
  state: NpcLifeWorldState,
  first: EnemyProfile,
  second: EnemyProfile,
  day: number,
  intensity = 12,
): void {
  updateRelationship(first, second, "ally", day, intensity);
  updateRelationship(second, first, "ally", day, intensity);
  profileFor(state, first.id);
  profileFor(state, second.id);
}

export function evolveNpcRelationships(
  fighters: EnemyProfile[],
  state: NpcLifeWorldState,
  day: number,
): number {
  const activeById = new Map(
    fighters
      .filter((fighter) => fighter.alive)
      .map((fighter) => [fighter.id, fighter]),
  );
  const active = new Set(["hero", ...activeById.keys()]);
  let removed = 0;
  fighters.forEach((fighter) => {
    const profile = profileFor(state, fighter.id);
    const entries = Object.entries(fighter.relationships ?? {}).flatMap(
      ([id, relationship]) => {
        if (!active.has(id) && relationship.kind !== "mentor") {
          removed += 1;
          return [];
        }
        const age = Math.max(0, day - relationship.lastChangedDay);
        const targetProfile = state.profiles[id];
        const sameDynasty = Boolean(
          profile.dynastyId && profile.dynastyId === targetProfile?.dynastyId,
        );
        const decay =
          relationship.kind === "mentor" || sameDynasty
            ? 0
            : Math.floor(age / 28);
        const dynastyBond = relationship.kind === "ally" && sameDynasty ? 2 : 0;
        const intensity = clamp(
          relationship.intensity - decay + dynastyBond,
          0,
          100,
        );
        if (intensity <= 0) {
          removed += 1;
          return [];
        }
        return [
          [id, { ...relationship, intensity }] as [string, NpcRelationship],
        ];
      },
    );
    fighter.relationships = Object.fromEntries(entries);
    trimRelationships(fighter);
    const rival = activeRival(fighter, activeById);
    if (rival && (fighter.relationships[rival.id]?.intensity ?? 0) >= 30) {
      profile.revengeTargetId = rival.id;
      fighter.goal = "vengeance";
    } else if (
      profile.revengeTargetId &&
      !active.has(profile.revengeTargetId)
    ) {
      profile.revengeTargetId = undefined;
    }
  });
  return removed;
}

export function recordNpcPlanOutcome(
  state: NpcLifeWorldState,
  enemy: EnemyProfile,
  plan: NpcDailyPlan,
  outcome: { day: number; success: boolean; acquiredTemplateId?: string },
): void {
  const profile = profileFor(state, enemy.id);
  profile.lastPlanDay = outcome.day;
  if (
    plan.targetSetId &&
    outcome.acquiredTemplateId === plan.targetTemplateId
  ) {
    const set = EQUIPMENT_SETS.find(
      (candidate) => candidate.id === plan.targetSetId,
    );
    if (set && !setMissingPiece(enemy, set)) profile.desiredSetId = undefined;
  }
  if (
    plan.targetFighterId &&
    outcome.success &&
    profile.revengeTargetId === plan.targetFighterId
  ) {
    profile.revengeTargetId = undefined;
    const relationship = enemy.relationships?.[plan.targetFighterId];
    if (relationship?.kind === "rival")
      relationship.intensity = Math.max(1, relationship.intensity - 18);
    if (enemy.goal === "vengeance")
      enemy.goal = enemy.arenaIndex >= 4 ? "elite" : "champion";
  }
}

export function refreshNpcIdentity(
  state: NpcLifeWorldState,
  enemy: EnemyProfile,
  day: number,
): string | undefined {
  const profile = profileFor(state, enemy.id);
  if (enemy.alive && enemy.traitIds.length < 3) {
    const careerDays = Math.max(0, day - (enemy.joinedDay ?? day));
    const duelWins = enemy.duelWins ?? 0;
    const duelLosses = enemy.duelLosses ?? 0;
    const achievements: [string, boolean, string][] = [
      ["arena-born", enemy.tournamentWins >= 4, "четыре выигранных турнира"],
      [
        "duelist-eye",
        duelWins >= 6 && duelWins + duelLosses >= 12,
        "двенадцать дуэлей и шесть побед",
      ],
      [
        "survivor",
        careerDays >= 60 && enemy.losses >= 12 && enemy.wins >= 12,
        "долгая карьера после двенадцати поражений и двенадцати побед",
      ],
      [
        "old-guard",
        careerDays >= 120 && enemy.wins + enemy.losses >= 60,
        "сто двадцать дней карьеры и шестьдесят боёв",
      ],
    ];
    for (const [id, earned, reason] of achievements) {
      if (!earned || enemy.traitIds.includes(id) || enemy.traitIds.length >= 3)
        continue;
      const trait = FIGHTER_TRAITS.find((candidate) => candidate.id === id);
      if (!trait) continue;
      enemy.traitIds.push(id);
      enemy.history.push(
        `День ${day}: заслужил черту «${trait.name}» — ${reason}.`,
      );
      enemy.history = enemy.history.slice(-50);
    }
  }
  const nickname = nicknameFor(enemy);
  if (nickname && nickname !== profile.nickname) {
    profile.nickname = nickname;
    profile.nicknameGrantedDay = day;
  }
  return profile.nickname;
}

export function npcReferenceRetentionIds(
  fighters: readonly EnemyProfile[],
  mentors: readonly MentorRecord[],
  state: NpcLifeWorldState,
): Set<string> {
  const retained = new Set<string>();
  mentors.forEach((mentor) =>
    mentor.studentIds.forEach((id) => retained.add(id)),
  );
  Object.values(state.profiles).forEach((profile) => {
    if (profile.revengeTargetId) retained.add(profile.revengeTargetId);
    if (profile.career === "future-boss") retained.add(profile.fighterId);
  });
  state.dynasties.forEach((dynasty) =>
    dynasty.memberIds.forEach((id) => retained.add(id)),
  );
  state.futureBosses
    .filter((boss) => boss.status !== "defeated")
    .forEach((boss) => retained.add(boss.fighterId));
  fighters.forEach((fighter) => {
    Object.values(fighter.relationships ?? {})
      .filter(
        (relationship) =>
          relationship.kind === "mentor" || relationship.intensity >= 70,
      )
      .forEach((relationship) => retained.add(relationship.fighterId));
  });
  return retained;
}

export function cleanupNpcLifeReferences(
  fighters: EnemyProfile[],
  mentors: MentorRecord[],
  state: NpcLifeWorldState,
): NpcReferenceCleanupResult {
  const fighterIds = new Set(fighters.map((fighter) => fighter.id));
  const livingIds = new Set(
    fighters.filter((fighter) => fighter.alive).map((fighter) => fighter.id),
  );
  const mentorIds = new Set(mentors.map((mentor) => mentor.id));
  const mentorFighterIds = new Set(mentors.map((mentor) => mentor.fighterId));
  const validRelationshipIds = new Set([
    "hero",
    ...fighterIds,
    ...mentorFighterIds,
  ]);
  let removedRelationships = 0;
  let removedStudents = 0;
  let removedMentorLinks = 0;
  fighters.forEach((fighter) => {
    const relationships = Object.entries(fighter.relationships ?? {});
    const validEntries = relationships.filter(([id, relationship]) => {
      const keep =
        validRelationshipIds.has(id) &&
        validRelationshipIds.has(relationship.fighterId);
      if (!keep) removedRelationships += 1;
      return keep;
    });
    const entries = validEntries
      .sort(
        ([, first], [, second]) =>
          relationshipRank(second) - relationshipRank(first) ||
          second.lastChangedDay - first.lastChangedDay,
      )
      .slice(0, MAX_RELATIONSHIPS);
    removedRelationships += validEntries.length - entries.length;
    fighter.relationships = Object.fromEntries(entries);
    if (fighter.mentorId && !mentorIds.has(fighter.mentorId)) {
      fighter.mentorId = undefined;
      removedMentorLinks += 1;
    }
  });
  mentors.forEach((mentor) => {
    const previous = mentor.studentIds.length;
    mentor.studentIds = [...new Set(mentor.studentIds)].filter((id) =>
      livingIds.has(id),
    );
    removedStudents += previous - mentor.studentIds.length;
  });
  Object.values(state.profiles).forEach((profile) => {
    if (profile.revengeTargetId && !livingIds.has(profile.revengeTargetId))
      profile.revengeTargetId = undefined;
    if (
      profile.dynastyId &&
      !state.dynasties.some((dynasty) => dynasty.id === profile.dynastyId)
    )
      profile.dynastyId = undefined;
  });
  state.dynasties = state.dynasties
    .map((dynasty) => ({
      ...dynasty,
      memberIds: [...new Set(dynasty.memberIds)].filter(
        (id) => fighterIds.has(id) || mentorFighterIds.has(id),
      ),
    }))
    .filter(
      (dynasty) =>
        fighterIds.has(dynasty.founderId) ||
        mentorFighterIds.has(dynasty.founderId) ||
        dynasty.memberIds.length > 0,
    );
  const protectedProfileIds = new Set([
    ...fighterIds,
    ...mentorFighterIds,
    ...state.futureBosses
      .filter((boss) => boss.status !== "defeated")
      .map((boss) => boss.fighterId),
    ...state.dynasties.flatMap((dynasty) => dynasty.memberIds),
  ]);
  const beforeProfiles = Object.keys(state.profiles).length;
  state.profiles = Object.fromEntries(
    Object.entries(state.profiles).filter(([id]) =>
      protectedProfileIds.has(id),
    ),
  );
  return {
    removedRelationships,
    removedStudents,
    removedMentorLinks,
    removedProfiles: beforeProfiles - Object.keys(state.profiles).length,
  };
}

export function refreshFutureBossAvailability(
  state: NpcLifeWorldState,
  day: number,
): FutureBossRecord[] {
  const unlocked: FutureBossRecord[] = [];
  state.futureBosses.forEach((boss) => {
    if (boss.status !== "dormant" || day < boss.earliestAppearanceDay) return;
    boss.status = "available";
    unlocked.push(boss);
  });
  return unlocked;
}

export function advanceNpcCareerSeason(
  fighters: EnemyProfile[],
  mentors: MentorRecord[],
  state: NpcLifeWorldState,
  context: NpcSeasonContext,
): NpcSeasonResult {
  const random = context.random ?? nativeRandom;
  const seasonLength = Math.max(7, context.seasonLength ?? 28);
  const result: NpcSeasonResult = {
    season: state.season,
    transitions: [],
    mentorsCreated: [],
    dynastiesCreated: [],
    futureBossesCreated: [],
  };
  refreshFutureBossAvailability(state, context.day);
  if (context.day - state.seasonStartedDay < seasonLength) return result;
  state.season += 1;
  state.seasonStartedDay = context.day;
  result.season = state.season;
  Object.values(state.profiles).forEach((profile) => {
    profile.seasonsActive += 1;
  });
  const legends = new Set(context.eliteIds.slice(0, 5));
  fighters
    .filter((fighter) => fighter.alive)
    .forEach((fighter) => {
      const profile = profileFor(state, fighter.id);
      refreshNpcIdentity(state, fighter, context.day);
      if (profile.career === "mentor") return;
      if (legends.has(fighter.id) && profile.career !== "legend") {
        profile.career = "legend";
        fighter.legendSinceDay ??= context.day;
        result.transitions.push({
          kind: "became-legend",
          fighterId: fighter.id,
          description: `${fighter.name} вошёл в пятёрку легенд нового сезона.`,
        });
      } else if (!legends.has(fighter.id) && profile.career === "legend") {
        profile.career = "active";
        result.transitions.push({
          kind: "left-legend-five",
          fighterId: fighter.id,
          description: `${fighter.name} покинул действующую пятёрку легенд и начал путь возвращения.`,
        });
      }
    });
  const assigned = new Set([
    ...mentors.map((mentor) => mentor.fighterId),
    ...mentors.flatMap((mentor) => mentor.studentIds),
  ]);
  const retirementCandidates = fighters
    .filter(
      (fighter) =>
        fighter.alive &&
        !legends.has(fighter.id) &&
        profileFor(state, fighter.id).career !== "mentor" &&
        context.day - (fighter.joinedDay ?? context.day) >= 90 &&
        fighter.level >= 18 &&
        fighter.tournamentWins >= 2 &&
        random.chance(retirementChance(fighter, context.day)),
    )
    .sort(
      (first, second) =>
        second.losses - first.losses ||
        second.tournamentWins - first.tournamentWins,
    )
    .slice(0, Math.max(0, context.maxRetirements ?? 2));
  retirementCandidates.forEach((fighter) => {
    const profile = profileFor(state, fighter.id);
    const students = mentorCandidates(fighter, fighters, assigned);
    students.forEach((student) => assigned.add(student.id));
    const mentorId = mentorIdFor(fighter, context.day);
    const dynastyId = dynastyIdFor(fighter, context.day);
    const mentor: MentorRecord = {
      id: mentorId,
      fighterId: fighter.id,
      name: fighter.name,
      classId: fighter.classId,
      factionId: fighter.factionId ?? FACTIONS[0].id,
      goal: fighter.goal ?? "champion",
      level: fighter.level,
      rating: fighter.rating,
      retiredDay: context.day,
      studentIds: students.map((student) => student.id),
      legacy: `${fighter.tournamentWins} турнирных побед, прозвище «${profile.nickname ?? fighter.title}».`,
      schoolName: dynastyName(fighter, profile),
      competes: keepsCompetingAsMentor(fighter),
      dynastyId,
    };
    const dynasty: NpcDynasty = {
      id: dynastyId,
      name: dynastyName(fighter, profile),
      founderId: fighter.id,
      founderName: fighter.name,
      factionId: fighter.factionId ?? FACTIONS[0].id,
      foundedDay: context.day,
      memberIds: [fighter.id, ...mentor.studentIds],
      prestige: Math.max(
        1,
        fighter.tournamentWins * 10 +
          fighter.kills * 5 +
          Math.round(fighter.rating / 100),
      ),
    };
    fighter.alive = mentor.competes === true;
    fighter.retiredDay = context.day;
    profile.career = "mentor";
    profile.dynastyId = dynasty.id;
    students.forEach((student) => {
      const studentProfile = profileFor(state, student.id);
      studentProfile.dynastyId = dynasty.id;
      student.mentorId = mentor.id;
      student.relationships ??= {};
      student.relationships[fighter.id] = {
        fighterId: fighter.id,
        kind: "mentor",
        intensity: 70,
        lastChangedDay: context.day,
      };
    });
    mentors.unshift(mentor);
    state.dynasties.unshift(dynasty);
    result.mentorsCreated.push(mentor);
    result.dynastiesCreated.push(dynasty);
    result.transitions.push({
      kind: "became-mentor",
      fighterId: fighter.id,
      mentorId: mentor.id,
      dynastyId: dynasty.id,
      description: `${fighter.name} завершил карьеру и основал ${dynasty.name}.`,
    });
  });
  fighters
    .filter((fighter) => fighter.alive)
    .forEach((fighter) => {
      const profile = profileFor(state, fighter.id);
      if (profile.career === "mentor") return;
      const archetype = futureBossArchetype(fighter, profile);
      if (
        !archetype ||
        state.futureBosses.some((boss) => boss.fighterId === fighter.id)
      )
        return;
      const boss: FutureBossRecord = {
        id: futureBossIdFor(fighter, archetype),
        fighterId: fighter.id,
        name: profile.nickname
          ? `${fighter.name}, ${profile.nickname}`
          : fighter.name,
        classId: fighter.classId,
        archetype,
        reason: futureBossReason(fighter, archetype),
        createdDay: context.day,
        earliestAppearanceDay: context.day + 14,
        powerLevel: Math.max(
          fighter.level,
          Math.round(
            fighter.level + fighter.tournamentWins / 3 + fighter.kills / 2,
          ),
        ),
        status: "dormant",
      };
      state.futureBosses.push(boss);
      profile.career = "future-boss";
      profile.futureBossId = boss.id;
      result.futureBossesCreated.push(boss);
      result.transitions.push({
        kind: "marked-future-boss",
        fighterId: fighter.id,
        futureBossId: boss.id,
        description: boss.reason,
      });
    });
  state.futureBosses.forEach((boss) => {
    if (boss.status === "dormant" && context.day >= boss.earliestAppearanceDay)
      boss.status = "available";
  });
  evolveNpcRelationships(fighters, state, context.day);
  cleanupNpcLifeReferences(fighters, mentors, state);
  return result;
}
