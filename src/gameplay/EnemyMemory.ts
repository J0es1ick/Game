import { SKILLS } from "../catalogs/WorldCatalog";
import type {
  BattleTurn,
  EnemyCountermeasureId,
  EnemyMemoryStage,
  EnemyStyleMemory,
  HeroBehaviorPattern,
  HeroClass,
  HeroProfile,
  HeroStyleSignature,
  TacticalStyle,
} from "./WorldTypes";

const MEMORY_LIMIT = 100;
const SIGNATURE_LIMIT = 8;
const FORGETTING_GRACE_DAYS = 4;

export interface EnemyMemoryStageDefinition {
  id: EnemyMemoryStage;
  name: string;
  description: string;
  minimumFamiliarity: number;
}

export interface EnemyCountermeasureDefinition {
  id: EnemyCountermeasureId;
  name: string;
  description: string;
  effect: string;
}

export interface EnemyMemoryCombatRead {
  similarity: number;
  strength: number;
  countermeasureIds: EnemyCountermeasureId[];
  signatureSkillId?: string;
}

export interface EnemyMemoryUpdate {
  previousStage: EnemyMemoryStage;
  stage: EnemyMemoryStage;
  familiarityGained: number;
  similarity: number;
  newCountermeasureIds: EnemyCountermeasureId[];
  signature: HeroStyleSignature;
}

export const MEMORY_STAGE_DEFINITIONS: EnemyMemoryStageDefinition[] = [
  { id: "unknown", name: "Не знаком", description: "Соперник ещё не знает привычек героя.", minimumFamiliarity: 0 },
  { id: "observing", name: "Наблюдает", description: "Запоминает отдельные решения, но пока не строит бой вокруг них.", minimumFamiliarity: 15 },
  { id: "familiar", name: "Узнал привычки", description: "Сопоставляет класс, тактику и часто применяемые приёмы.", minimumFamiliarity: 35 },
  { id: "adapted", name: "Подготовил контрмеры", description: "Меняет собственные решения против повторяющегося стиля.", minimumFamiliarity: 60 },
  { id: "mastered", name: "Читает стиль", description: "Очень хорошо узнаёт знакомую сборку, но его всё ещё можно удивить.", minimumFamiliarity: 82 },
];

export const ENEMY_COUNTERMEASURE_DEFINITIONS: EnemyCountermeasureDefinition[] = [
  {
    id: "guarded-opening", name: "Закрытое начало",
    description: "Соперник ожидает привычный ранний натиск.",
    effect: "Первые два атакующих действия героя наносят меньше урона, если текущий стиль узнаваем.",
  },
  {
    id: "critical-guard", name: "Страховка от критов",
    description: "Соперник перестал открываться под знакомые резкие выпады.",
    effect: "Критический шанс героя снижается пропорционально точности узнавания стиля.",
  },
  {
    id: "healing-denial", name: "Срыв восстановления",
    description: "Соперник давит именно в моменты привычного лечения.",
    effect: "Лечение героя слабее, пока он придерживается узнаваемого рисунка боя.",
  },
  {
    id: "control-discipline", name: "Дисциплина против контроля",
    description: "Соперник научился быстрее возвращаться в стойку после контроля.",
    effect: "Ослабление от контролирующих навыков героя действует мягче.",
  },
  {
    id: "signature-parry", name: "Парирование коронного приёма",
    description: "Самый часто повторяемый навык уже узнаётся по первым движениям.",
    effect: "Знакомый коронный навык может быть частично парирован.",
  },
  {
    id: "execution-watch", name: "Осторожность у черты",
    description: "На грани поражения соперник особенно внимательно ждёт добивание.",
    effect: "Добивающие атаки по раненому сопернику наносят меньше урона.",
  },
];

const BEHAVIORS: HeroBehaviorPattern[] = ["pressure", "healing", "control", "burst", "finisher"];

function clamp(value: number, minimum = 0, maximum = MEMORY_LIMIT): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number): number {
  return Math.round(clamp(value) * 10) / 10;
}

function normalizeKnowledge<T extends string>(source: Partial<Record<T, number>> | undefined): Partial<Record<T, number>> {
  return Object.fromEntries(Object.entries(source ?? {}).map(([key, value]) => [key, rounded(Number(value))])) as Partial<Record<T, number>>;
}

export function memoryStageFor(familiarity: number): EnemyMemoryStage {
  return [...MEMORY_STAGE_DEFINITIONS]
    .reverse()
    .find((definition) => familiarity >= definition.minimumFamiliarity)?.id ?? "unknown";
}

export function memoryStageDefinition(stage: EnemyMemoryStage): EnemyMemoryStageDefinition {
  return MEMORY_STAGE_DEFINITIONS.find((definition) => definition.id === stage) ?? MEMORY_STAGE_DEFINITIONS[0];
}

export function countermeasureDefinition(id: EnemyCountermeasureId): EnemyCountermeasureDefinition | undefined {
  return ENEMY_COUNTERMEASURE_DEFINITIONS.find((definition) => definition.id === id);
}

export function createEnemyStyleMemory(day = 0): EnemyStyleMemory {
  return {
    familiarity: 0,
    stage: "unknown",
    classKnowledge: {},
    tacticalKnowledge: {},
    skillKnowledge: {},
    behaviorKnowledge: {},
    recentSignatures: [],
    countermeasureIds: [],
    lastEncounterDay: day,
    lastDecayDay: day,
    currentSimilarity: 0,
  };
}

export function normalizeEnemyStyleMemory(
  source: EnemyStyleMemory | undefined,
  legacyAdaptationIds: string[] = [],
  day = 0,
): EnemyStyleMemory {
  const memory = source ?? createEnemyStyleMemory(day);
  const legacyCounters: Partial<Record<string, EnemyCountermeasureId>> = {
    "adapt-guard": "guarded-opening",
    "adapt-tempo": "control-discipline",
    "adapt-pressure": "critical-guard",
  };
  const seededCounters = legacyAdaptationIds.map((id) => legacyCounters[id]).filter((id): id is EnemyCountermeasureId => Boolean(id));
  const seededFamiliarity = source ? Number(source.familiarity) : Math.min(68, legacyAdaptationIds.length * 18);
  const familiarity = rounded(seededFamiliarity);
  return {
    familiarity,
    stage: memoryStageFor(familiarity),
    classKnowledge: normalizeKnowledge<HeroClass>(memory.classKnowledge),
    tacticalKnowledge: normalizeKnowledge<TacticalStyle>(memory.tacticalKnowledge),
    skillKnowledge: Object.fromEntries(Object.entries(memory.skillKnowledge ?? {}).map(([id, value]) => [id, rounded(Number(value))])),
    behaviorKnowledge: normalizeKnowledge<HeroBehaviorPattern>(memory.behaviorKnowledge),
    recentSignatures: (memory.recentSignatures ?? []).slice(0, SIGNATURE_LIMIT).map((signature) => ({
      ...signature,
      skillIds: [...new Set(signature.skillIds ?? [])],
      behavior: normalizeKnowledge<HeroBehaviorPattern>(signature.behavior),
    })),
    countermeasureIds: [...new Set([...(memory.countermeasureIds ?? []), ...seededCounters])],
    lastEncounterDay: Math.max(0, Number(memory.lastEncounterDay) || day),
    lastDecayDay: Math.max(0, Number(memory.lastDecayDay) || day),
    currentSimilarity: clamp(Number(memory.currentSimilarity), 0, 1),
  };
}

function decayMap<T extends string>(source: Partial<Record<T, number>>, factor: number, trace = 0): Partial<Record<T, number>> {
  return Object.fromEntries(Object.entries(source).map(([key, raw]) => {
    const previous = Number(raw);
    const next = previous > 0 ? Math.max(trace, previous * factor) : 0;
    return [key, rounded(next)];
  })) as Partial<Record<T, number>>;
}

export function decayEnemyStyleMemory(memory: EnemyStyleMemory, currentDay: number): EnemyStyleMemory {
  const normalized = normalizeEnemyStyleMemory(memory, [], currentDay);
  if (currentDay <= normalized.lastDecayDay) return normalized;
  const decayStartsAt = Math.max(normalized.lastDecayDay, normalized.lastEncounterDay + FORGETTING_GRACE_DAYS);
  const days = Math.max(0, currentDay - decayStartsAt);
  normalized.lastDecayDay = currentDay;
  if (days === 0) return normalized;

  normalized.familiarity = rounded(normalized.familiarity * (0.965 ** days));
  normalized.classKnowledge = decayMap(normalized.classKnowledge, 0.982 ** days, 3);
  normalized.tacticalKnowledge = decayMap(normalized.tacticalKnowledge, 0.972 ** days, 2);
  normalized.skillKnowledge = decayMap(normalized.skillKnowledge, 0.955 ** days, 1) as Record<string, number>;
  normalized.behaviorKnowledge = decayMap(normalized.behaviorKnowledge, 0.962 ** days, 1);
  normalized.currentSimilarity = Math.round(clamp(normalized.currentSimilarity * (0.97 ** days), 0, 1) * 100) / 100;
  normalized.stage = memoryStageFor(normalized.familiarity);
  return normalized;
}

function tacticalStyle(hero: HeroProfile): TacticalStyle {
  return hero.tacticalProfiles.find((profile) => profile.id === hero.activeTacticalProfileId)?.style
    ?? hero.tacticalProfiles[0]?.style
    ?? "balanced";
}

function normalizedBehavior(values: Partial<Record<HeroBehaviorPattern, number>>): Partial<Record<HeroBehaviorPattern, number>> {
  return Object.fromEntries(BEHAVIORS.map((id) => [id, Math.round(clamp(values[id] ?? 0, 0, 1) * 100) / 100]));
}

export function heroLoadoutSignature(hero: HeroProfile, skillIds: string[], day = 0): HeroStyleSignature {
  const definitions = skillIds.map((id) => SKILLS.find((skill) => skill.id === id)).filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  const total = Math.max(1, definitions.length);
  const style = tacticalStyle(hero);
  return {
    day,
    classId: hero.classId,
    tacticalStyle: style,
    skillIds: [...new Set(skillIds)],
    dominantSkillId: definitions.sort((a, b) => b.priority - a.priority)[0]?.id,
    behavior: normalizedBehavior({
      pressure: definitions.filter((skill) => skill.kind === "attack").length / total,
      healing: definitions.filter((skill) => skill.kind === "heal").length / total,
      control: definitions.filter((skill) => skill.kind === "control").length / total,
      burst: style === "aggressive" ? 0.65 : definitions.filter((skill) => skill.kind === "attack" && skill.power >= 1.5).length / total,
      finisher: definitions.some((skill) => skill.id === "execution") ? 0.5 : 0,
    }),
  };
}

export function heroBattleSignature(hero: HeroProfile, turns: BattleTurn[], day: number): HeroStyleSignature {
  const heroTurns = turns.filter((turn) => turn.actorId === hero.id);
  const useCounts: Record<string, number> = {};
  const behaviorCounts: Partial<Record<HeroBehaviorPattern, number>> = {};
  heroTurns.forEach((turn) => {
    const skill = turn.skillId ? SKILLS.find((candidate) => candidate.id === turn.skillId) : undefined;
    if (turn.skillId) useCounts[turn.skillId] = (useCounts[turn.skillId] ?? 0) + 1;
    if (!skill || skill.kind === "attack") behaviorCounts.pressure = (behaviorCounts.pressure ?? 0) + 1;
    if (skill?.kind === "heal") behaviorCounts.healing = (behaviorCounts.healing ?? 0) + 1;
    if (skill?.kind === "control") behaviorCounts.control = (behaviorCounts.control ?? 0) + 1;
    if (turn.critical) behaviorCounts.burst = (behaviorCounts.burst ?? 0) + 1;
    if (turn.skillId === "execution") behaviorCounts.finisher = (behaviorCounts.finisher ?? 0) + 1;
  });
  const total = Math.max(1, heroTurns.length);
  const skillIds = Object.keys(useCounts);
  const dominantSkillId = skillIds.sort((first, second) => useCounts[second] - useCounts[first])[0];
  return {
    day,
    classId: hero.classId,
    tacticalStyle: tacticalStyle(hero),
    skillIds,
    dominantSkillId,
    behavior: normalizedBehavior(Object.fromEntries(BEHAVIORS.map((id) => [id, (behaviorCounts[id] ?? 0) / total]))),
  };
}

function jaccard(first: string[], second: string[]): number {
  const left = new Set(first); const right = new Set(second);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  return [...left].filter((id) => right.has(id)).length / union.size;
}

export function styleSimilarity(first: HeroStyleSignature, second: HeroStyleSignature): number {
  const behaviorSimilarity = 1 - BEHAVIORS.reduce((sum, id) => sum + Math.abs((first.behavior[id] ?? 0) - (second.behavior[id] ?? 0)), 0) / BEHAVIORS.length;
  const result = (first.classId === second.classId ? 0.25 : 0)
    + (first.tacticalStyle === second.tacticalStyle ? 0.2 : 0)
    + jaccard(first.skillIds, second.skillIds) * 0.35
    + clamp(behaviorSimilarity, 0, 1) * 0.2;
  return Math.round(clamp(result, 0, 1) * 100) / 100;
}

function bestSimilarity(memory: EnemyStyleMemory, signature: HeroStyleSignature): number {
  if (memory.recentSignatures.length === 0) return 0;
  return memory.recentSignatures.reduce((best, remembered, index) => {
    const recency = Math.max(0.68, 1 - index * 0.045);
    return Math.max(best, styleSimilarity(signature, remembered) * recency);
  }, 0);
}

function stageStrength(stage: EnemyMemoryStage): number {
  return { unknown: 0, observing: 0.12, familiar: 0.38, adapted: 0.7, mastered: 1 }[stage];
}

export function readEnemyStyleMemory(memory: EnemyStyleMemory, current: HeroStyleSignature): EnemyMemoryCombatRead {
  const similarity = bestSimilarity(memory, current);
  const knownSkill = Object.entries(memory.skillKnowledge)
    .filter(([id]) => current.skillIds.includes(id))
    .sort((a, b) => b[1] - a[1])[0];
  const recognition = clamp((0.25 + similarity * 0.75) * stageStrength(memory.stage), 0, 1);
  return {
    similarity: Math.round(similarity * 100) / 100,
    strength: Math.round(recognition * 100) / 100,
    countermeasureIds: [...memory.countermeasureIds],
    signatureSkillId: knownSkill?.[1] >= 32 ? knownSkill[0] : undefined,
  };
}

function increment<T extends string>(target: Partial<Record<T, number>>, key: T, value: number): void {
  target[key] = rounded((target[key] ?? 0) + value);
}

function unlockedCountermeasures(memory: EnemyStyleMemory): EnemyCountermeasureId[] {
  const result: EnemyCountermeasureId[] = [];
  if ((memory.behaviorKnowledge.pressure ?? 0) >= 24 && memory.familiarity >= 35) result.push("guarded-opening");
  if ((memory.behaviorKnowledge.burst ?? 0) >= 20 && memory.familiarity >= 35) result.push("critical-guard");
  if ((memory.behaviorKnowledge.healing ?? 0) >= 18 && memory.familiarity >= 35) result.push("healing-denial");
  if ((memory.behaviorKnowledge.control ?? 0) >= 18 && memory.familiarity >= 35) result.push("control-discipline");
  if ((memory.behaviorKnowledge.finisher ?? 0) >= 12 && memory.familiarity >= 35) result.push("execution-watch");
  if (Object.values(memory.skillKnowledge).some((knowledge) => knowledge >= 32) && memory.familiarity >= 60) result.push("signature-parry");
  return result;
}

export function recordEnemyStyleMemory(
  memorySource: EnemyStyleMemory,
  hero: HeroProfile,
  turns: BattleTurn[],
  day: number,
): { memory: EnemyStyleMemory; update: EnemyMemoryUpdate } {
  const memory = decayEnemyStyleMemory(memorySource, day);
  const signature = heroBattleSignature(hero, turns, day);
  const similarity = bestSimilarity(memory, signature);
  const previousStage = memory.stage;
  const previousCounters = new Set(memory.countermeasureIds);
  const recallBonus = (memory.classKnowledge[signature.classId] ?? 0) > 0 ? 4 : 0;
  const familiarityGained = Math.round(10 + similarity * 8 + recallBonus);

  memory.familiarity = rounded(memory.familiarity + familiarityGained);
  increment(memory.classKnowledge, signature.classId, 14 + recallBonus);
  increment(memory.tacticalKnowledge, signature.tacticalStyle, 11 + similarity * 3);
  signature.skillIds.forEach((id) => increment(memory.skillKnowledge, id, 7 + (id === signature.dominantSkillId ? 5 : 0)));
  BEHAVIORS.forEach((id) => increment(memory.behaviorKnowledge, id, (signature.behavior[id] ?? 0) * 13));
  memory.recentSignatures = [signature, ...memory.recentSignatures].slice(0, SIGNATURE_LIMIT);
  memory.lastEncounterDay = day;
  memory.lastDecayDay = day;
  memory.currentSimilarity = Math.round(similarity * 100) / 100;
  memory.stage = memoryStageFor(memory.familiarity);
  memory.countermeasureIds = [...new Set([...memory.countermeasureIds, ...unlockedCountermeasures(memory)])];
  const newCountermeasureIds = memory.countermeasureIds.filter((id) => !previousCounters.has(id));

  return {
    memory,
    update: {
      previousStage,
      stage: memory.stage,
      familiarityGained,
      similarity: memory.currentSimilarity,
      newCountermeasureIds,
      signature,
    },
  };
}
