import { SKILLS } from "../../catalogs/WorldCatalog";
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
} from "../core/WorldTypes";

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
  recognizedOpening?: boolean;
  expectedHealing?: boolean;
  expectedDefense?: boolean;
  expectedCombo?: string;
  evidence?: string[];
}

export type HeroStyleFingerprint = NonNullable<
  HeroStyleSignature["fingerprint"]
>;

export interface DetailedHeroStyleSignature extends HeroStyleSignature {
  fingerprint?: HeroStyleFingerprint;
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
  {
    id: "unknown",
    name: "Не знаком",
    description: "Соперник ещё не знает привычек героя.",
    minimumFamiliarity: 0,
  },
  {
    id: "observing",
    name: "Наблюдает",
    description:
      "Запоминает отдельные решения, но пока не строит бой вокруг них.",
    minimumFamiliarity: 15,
  },
  {
    id: "familiar",
    name: "Узнал привычки",
    description: "Сопоставляет класс, тактику и часто применяемые приёмы.",
    minimumFamiliarity: 35,
  },
  {
    id: "adapted",
    name: "Подготовил контрмеры",
    description: "Меняет собственные решения против повторяющегося стиля.",
    minimumFamiliarity: 60,
  },
  {
    id: "mastered",
    name: "Читает стиль",
    description:
      "Очень хорошо узнаёт знакомую сборку, но его всё ещё можно удивить.",
    minimumFamiliarity: 82,
  },
];

export const ENEMY_COUNTERMEASURE_DEFINITIONS: EnemyCountermeasureDefinition[] =
  [
    {
      id: "guarded-opening",
      name: "Закрытое начало",
      description: "Соперник ожидает привычный ранний натиск.",
      effect:
        "Первые два атакующих действия героя наносят меньше урона, если текущий стиль узнаваем.",
    },
    {
      id: "critical-guard",
      name: "Страховка от критов",
      description: "Соперник перестал открываться под знакомые резкие выпады.",
      effect:
        "Критический шанс героя снижается пропорционально точности узнавания стиля.",
    },
    {
      id: "healing-denial",
      name: "Срыв восстановления",
      description: "Соперник давит именно в моменты привычного лечения.",
      effect:
        "Лечение героя слабее, пока он придерживается узнаваемого рисунка боя.",
    },
    {
      id: "control-discipline",
      name: "Дисциплина против контроля",
      description:
        "Соперник научился быстрее возвращаться в стойку после контроля.",
      effect: "Ослабление от контролирующих навыков героя действует мягче.",
    },
    {
      id: "signature-parry",
      name: "Парирование коронного приёма",
      description:
        "Самый часто повторяемый навык уже узнаётся по первым движениям.",
      effect: "Знакомый коронный навык может быть частично парирован.",
    },
    {
      id: "execution-watch",
      name: "Осторожность у черты",
      description:
        "На грани поражения соперник особенно внимательно ждёт добивание.",
      effect: "Добивающие атаки по раненому сопернику наносят меньше урона.",
    },
  ];

const BEHAVIORS: HeroBehaviorPattern[] = [
  "pressure",
  "healing",
  "control",
  "burst",
  "finisher",
];

function clamp(value: number, minimum = 0, maximum = MEMORY_LIMIT): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number): number {
  return Math.round(clamp(value) * 10) / 10;
}

function normalizeKnowledge<T extends string>(
  source: Partial<Record<T, number>> | undefined,
): Partial<Record<T, number>> {
  return Object.fromEntries(
    Object.entries(source ?? {}).map(([key, value]) => [
      key,
      rounded(Number(value)),
    ]),
  ) as Partial<Record<T, number>>;
}

function normalizeFingerprint(
  source: HeroStyleFingerprint | undefined,
): HeroStyleFingerprint | undefined {
  if (!source) return undefined;
  return {
    openingActionIds: (source.openingActionIds ?? [])
      .filter(Boolean)
      .slice(0, 4),
    defensiveRatio:
      Math.round(clamp(Number(source.defensiveRatio), 0, 1) * 100) / 100,
    healingRatio:
      Math.round(clamp(Number(source.healingRatio), 0, 1) * 100) / 100,
    healingUrgency:
      Math.round(clamp(Number(source.healingUrgency), 0, 1) * 100) / 100,
    comboPatterns: (source.comboPatterns ?? []).filter(Boolean).slice(0, 6),
    repetitionRatio:
      Math.round(clamp(Number(source.repetitionRatio), 0, 1) * 100) / 100,
  };
}

export function memoryStageFor(familiarity: number): EnemyMemoryStage {
  return (
    [...MEMORY_STAGE_DEFINITIONS]
      .reverse()
      .find((definition) => familiarity >= definition.minimumFamiliarity)?.id ??
    "unknown"
  );
}

export function memoryStageDefinition(
  stage: EnemyMemoryStage,
): EnemyMemoryStageDefinition {
  return (
    MEMORY_STAGE_DEFINITIONS.find((definition) => definition.id === stage) ??
    MEMORY_STAGE_DEFINITIONS[0]
  );
}

export function countermeasureDefinition(
  id: EnemyCountermeasureId,
): EnemyCountermeasureDefinition | undefined {
  return ENEMY_COUNTERMEASURE_DEFINITIONS.find(
    (definition) => definition.id === id,
  );
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
  const seededCounters = legacyAdaptationIds
    .map((id) => legacyCounters[id])
    .filter((id): id is EnemyCountermeasureId => Boolean(id));
  const seededFamiliarity = source
    ? Number(source.familiarity)
    : Math.min(68, legacyAdaptationIds.length * 18);
  const familiarity = rounded(seededFamiliarity);
  return {
    familiarity,
    stage: memoryStageFor(familiarity),
    classKnowledge: normalizeKnowledge<HeroClass>(memory.classKnowledge),
    tacticalKnowledge: normalizeKnowledge<TacticalStyle>(
      memory.tacticalKnowledge,
    ),
    skillKnowledge: Object.fromEntries(
      Object.entries(memory.skillKnowledge ?? {}).map(([id, value]) => [
        id,
        rounded(Number(value)),
      ]),
    ),
    behaviorKnowledge: normalizeKnowledge<HeroBehaviorPattern>(
      memory.behaviorKnowledge,
    ),
    recentSignatures: (memory.recentSignatures ?? [])
      .slice(0, SIGNATURE_LIMIT)
      .map((signature) => {
        const detailed = signature as DetailedHeroStyleSignature;
        const fingerprint = normalizeFingerprint(detailed.fingerprint);
        return {
          ...signature,
          skillIds: [...new Set(signature.skillIds ?? [])],
          behavior: normalizeKnowledge<HeroBehaviorPattern>(signature.behavior),
          ...(fingerprint ? { fingerprint } : {}),
        } as DetailedHeroStyleSignature;
      }),
    countermeasureIds: [
      ...new Set([...(memory.countermeasureIds ?? []), ...seededCounters]),
    ],
    lastEncounterDay: Math.max(0, Number(memory.lastEncounterDay) || day),
    lastDecayDay: Math.max(0, Number(memory.lastDecayDay) || day),
    currentSimilarity: clamp(Number(memory.currentSimilarity), 0, 1),
  };
}

function decayMap<T extends string>(
  source: Partial<Record<T, number>>,
  factor: number,
  trace = 0,
): Partial<Record<T, number>> {
  return Object.fromEntries(
    Object.entries(source).map(([key, raw]) => {
      const previous = Number(raw);
      const next = previous > 0 ? Math.max(trace, previous * factor) : 0;
      return [key, rounded(next)];
    }),
  ) as Partial<Record<T, number>>;
}

export function decayEnemyStyleMemory(
  memory: EnemyStyleMemory,
  currentDay: number,
): EnemyStyleMemory {
  const normalized = normalizeEnemyStyleMemory(memory, [], currentDay);
  if (currentDay <= normalized.lastDecayDay) return normalized;
  const decayStartsAt = Math.max(
    normalized.lastDecayDay,
    normalized.lastEncounterDay + FORGETTING_GRACE_DAYS,
  );
  const days = Math.max(0, currentDay - decayStartsAt);
  normalized.lastDecayDay = currentDay;
  if (days === 0) return normalized;

  normalized.familiarity = rounded(normalized.familiarity * 0.965 ** days);
  normalized.classKnowledge = decayMap(
    normalized.classKnowledge,
    0.982 ** days,
    3,
  );
  normalized.tacticalKnowledge = decayMap(
    normalized.tacticalKnowledge,
    0.972 ** days,
    2,
  );
  normalized.skillKnowledge = decayMap(
    normalized.skillKnowledge,
    0.955 ** days,
    1,
  ) as Record<string, number>;
  normalized.behaviorKnowledge = decayMap(
    normalized.behaviorKnowledge,
    0.962 ** days,
    1,
  );
  normalized.currentSimilarity =
    Math.round(clamp(normalized.currentSimilarity * 0.97 ** days, 0, 1) * 100) /
    100;
  normalized.stage = memoryStageFor(normalized.familiarity);
  return normalized;
}

function tacticalStyle(hero: HeroProfile): TacticalStyle {
  return (
    hero.tacticalProfiles.find(
      (profile) => profile.id === hero.activeTacticalProfileId,
    )?.style ??
    hero.tacticalProfiles[0]?.style ??
    "balanced"
  );
}

function normalizedBehavior(
  values: Partial<Record<HeroBehaviorPattern, number>>,
): Partial<Record<HeroBehaviorPattern, number>> {
  return Object.fromEntries(
    BEHAVIORS.map((id) => [
      id,
      Math.round(clamp(values[id] ?? 0, 0, 1) * 100) / 100,
    ]),
  );
}

export function heroLoadoutSignature(
  hero: HeroProfile,
  skillIds: string[],
  day = 0,
): DetailedHeroStyleSignature {
  const definitions = skillIds
    .map((id) => SKILLS.find((skill) => skill.id === id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  const total = Math.max(1, definitions.length);
  const style = tacticalStyle(hero);
  const ordered = [...definitions].sort(
    (first, second) => second.priority - first.priority,
  );
  const tacticalProfile = hero.tacticalProfiles.find(
    (profile) => profile.id === hero.activeTacticalProfileId,
  );
  if (tacticalProfile?.preferredOpeningSkillId) {
    const preferred = ordered.findIndex(
      (skill) => skill.id === tacticalProfile.preferredOpeningSkillId,
    );
    if (preferred > 0) ordered.unshift(...ordered.splice(preferred, 1));
  }
  const openingActionIds = ordered.slice(0, 3).map((skill) => skill.id);
  return {
    day,
    classId: hero.classId,
    tacticalStyle: style,
    skillIds: [...new Set(skillIds)],
    dominantSkillId: ordered[0]?.id,
    behavior: normalizedBehavior({
      pressure:
        definitions.filter((skill) => skill.kind === "attack").length / total,
      healing:
        definitions.filter((skill) => skill.kind === "heal").length / total,
      control:
        definitions.filter((skill) => skill.kind === "control").length / total,
      burst:
        style === "aggressive"
          ? 0.65
          : definitions.filter(
              (skill) => skill.kind === "attack" && skill.power >= 1.5,
            ).length / total,
      finisher: definitions.some((skill) => skill.id === "execution") ? 0.5 : 0,
    }),
    fingerprint: {
      openingActionIds,
      defensiveRatio:
        definitions.filter(
          (skill) => skill.kind === "buff" || skill.kind === "control",
        ).length / total,
      healingRatio:
        definitions.filter((skill) => skill.kind === "heal").length / total,
      healingUrgency:
        style === "defensive" ? 0.72 : style === "aggressive" ? 0.3 : 0.55,
      comboPatterns: openingActionIds
        .slice(0, -1)
        .map((id, index) => `${id}>${openingActionIds[index + 1]}`),
      repetitionRatio: 0,
    },
  };
}

export function heroBattleSignature(
  hero: HeroProfile,
  turns: BattleTurn[],
  day: number,
): DetailedHeroStyleSignature {
  const heroTurns = turns.filter((turn) => turn.actorId === hero.id);
  const useCounts: Record<string, number> = {};
  const behaviorCounts: Partial<Record<HeroBehaviorPattern, number>> = {};
  heroTurns.forEach((turn) => {
    const skill = turn.skillId
      ? SKILLS.find((candidate) => candidate.id === turn.skillId)
      : undefined;
    if (turn.skillId)
      useCounts[turn.skillId] = (useCounts[turn.skillId] ?? 0) + 1;
    if (!skill || skill.kind === "attack")
      behaviorCounts.pressure = (behaviorCounts.pressure ?? 0) + 1;
    if (skill?.kind === "heal")
      behaviorCounts.healing = (behaviorCounts.healing ?? 0) + 1;
    if (skill?.kind === "control")
      behaviorCounts.control = (behaviorCounts.control ?? 0) + 1;
    if (turn.critical) behaviorCounts.burst = (behaviorCounts.burst ?? 0) + 1;
    if (turn.skillId === "execution")
      behaviorCounts.finisher = (behaviorCounts.finisher ?? 0) + 1;
  });
  const total = Math.max(1, heroTurns.length);
  const skillIds = Object.keys(useCounts);
  const dominantSkillId = skillIds.sort(
    (first, second) => useCounts[second] - useCounts[first],
  )[0];
  const actionIds = heroTurns.map((turn) => turn.skillId ?? "basic");
  const patternCounts: Record<string, number> = {};
  actionIds.slice(0, -1).forEach((id, index) => {
    const pattern = `${id}>${actionIds[index + 1]}`;
    patternCounts[pattern] = (patternCounts[pattern] ?? 0) + 1;
  });
  const comboPatterns = Object.entries(patternCounts)
    .sort(
      (first, second) =>
        second[1] - first[1] || first[0].localeCompare(second[0]),
    )
    .slice(0, 6)
    .map(([pattern]) => pattern);
  const defensiveActions = heroTurns.filter((turn) => {
    const skill = turn.skillId
      ? SKILLS.find((candidate) => candidate.id === turn.skillId)
      : undefined;
    return skill?.kind === "buff" || skill?.kind === "control";
  }).length;
  const incoming = turns.filter(
    (turn) => turn.targetId === hero.id && turn.actorId !== hero.id,
  );
  const defensiveReactions = incoming.filter((turn) =>
    /защит|парир|поглот|эгид|стойк/i.test(turn.detail),
  ).length;
  const observedMaximumHealth = Math.max(
    1,
    ...turns.flatMap((turn) => [
      turn.actorId === hero.id ? turn.actorHealth : 0,
      turn.targetId === hero.id ? turn.targetHealth : 0,
    ]),
  );
  const healingTurns = heroTurns.filter((turn) => turn.healing > 0);
  const healingUrgency =
    healingTurns.length === 0
      ? 0
      : healingTurns.reduce(
          (sum, turn) =>
            sum + (1 - Math.min(1, turn.actorHealth / observedMaximumHealth)),
          0,
        ) / healingTurns.length;
  const repeatedTransitions = actionIds
    .slice(1)
    .filter((id, index) => id === actionIds[index]).length;
  return {
    day,
    classId: hero.classId,
    tacticalStyle: tacticalStyle(hero),
    skillIds,
    dominantSkillId,
    behavior: normalizedBehavior(
      Object.fromEntries(
        BEHAVIORS.map((id) => [id, (behaviorCounts[id] ?? 0) / total]),
      ),
    ),
    fingerprint: {
      openingActionIds: actionIds.slice(0, 4),
      defensiveRatio: Math.max(
        defensiveActions / total,
        defensiveReactions / Math.max(1, incoming.length),
      ),
      healingRatio: healingTurns.length / total,
      healingUrgency,
      comboPatterns,
      repetitionRatio: repeatedTransitions / Math.max(1, actionIds.length - 1),
    },
  };
}

function jaccard(first: string[], second: string[]): number {
  const left = new Set(first);
  const right = new Set(second);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  return [...left].filter((id) => right.has(id)).length / union.size;
}

function openingSimilarity(first: string[], second: string[]): number {
  const length = Math.max(first.length, second.length);
  if (length === 0) return 1;
  let matched = 0;
  for (let index = 0; index < length; index += 1) {
    if (first[index] && first[index] === second[index]) matched += 1;
  }
  return matched / length;
}

export function styleSimilarity(
  first: HeroStyleSignature,
  second: HeroStyleSignature,
): number {
  const behaviorSimilarity =
    1 -
    BEHAVIORS.reduce(
      (sum, id) =>
        sum + Math.abs((first.behavior[id] ?? 0) - (second.behavior[id] ?? 0)),
      0,
    ) /
      BEHAVIORS.length;
  const firstFingerprint = (first as DetailedHeroStyleSignature).fingerprint;
  const secondFingerprint = (second as DetailedHeroStyleSignature).fingerprint;
  const result =
    firstFingerprint && secondFingerprint
      ? (first.classId === second.classId ? 0.15 : 0) +
        (first.tacticalStyle === second.tacticalStyle ? 0.12 : 0) +
        jaccard(first.skillIds, second.skillIds) * 0.18 +
        clamp(behaviorSimilarity, 0, 1) * 0.18 +
        openingSimilarity(
          firstFingerprint.openingActionIds,
          secondFingerprint.openingActionIds,
        ) *
          0.14 +
        (1 -
          Math.abs(
            firstFingerprint.defensiveRatio - secondFingerprint.defensiveRatio,
          )) *
          0.06 +
        (1 -
          Math.abs(
            firstFingerprint.healingRatio - secondFingerprint.healingRatio,
          )) *
          0.06 +
        (1 -
          Math.abs(
            firstFingerprint.healingUrgency - secondFingerprint.healingUrgency,
          )) *
          0.04 +
        jaccard(
          firstFingerprint.comboPatterns,
          secondFingerprint.comboPatterns,
        ) *
          0.05 +
        (1 -
          Math.abs(
            firstFingerprint.repetitionRatio -
              secondFingerprint.repetitionRatio,
          )) *
          0.02
      : (first.classId === second.classId ? 0.25 : 0) +
        (first.tacticalStyle === second.tacticalStyle ? 0.2 : 0) +
        jaccard(first.skillIds, second.skillIds) * 0.35 +
        clamp(behaviorSimilarity, 0, 1) * 0.2;
  return Math.round(clamp(result, 0, 1) * 100) / 100;
}

function bestMatch(
  memory: EnemyStyleMemory,
  signature: HeroStyleSignature,
): { similarity: number; signature?: DetailedHeroStyleSignature } {
  if (memory.recentSignatures.length === 0) return { similarity: 0 };
  return memory.recentSignatures.reduce<{
    similarity: number;
    signature?: DetailedHeroStyleSignature;
  }>(
    (best, remembered, index) => {
      const recency = Math.max(0.68, 1 - index * 0.045);
      const similarity = styleSimilarity(signature, remembered) * recency;
      return similarity > best.similarity
        ? { similarity, signature: remembered as DetailedHeroStyleSignature }
        : best;
    },
    { similarity: 0 },
  );
}

function bestSimilarity(
  memory: EnemyStyleMemory,
  signature: HeroStyleSignature,
): number {
  return bestMatch(memory, signature).similarity;
}

function stageStrength(stage: EnemyMemoryStage): number {
  return {
    unknown: 0,
    observing: 0.12,
    familiar: 0.38,
    adapted: 0.7,
    mastered: 1,
  }[stage];
}

export function readEnemyStyleMemory(
  memory: EnemyStyleMemory,
  current: HeroStyleSignature,
): EnemyMemoryCombatRead {
  const match = bestMatch(memory, current);
  const similarity = match.similarity;
  const knownSkill = Object.entries(memory.skillKnowledge)
    .filter(([id]) => current.skillIds.includes(id))
    .sort((a, b) => b[1] - a[1])[0];
  const recognition = clamp(
    (0.25 + similarity * 0.75) * stageStrength(memory.stage),
    0,
    1,
  );
  const currentFingerprint = (current as DetailedHeroStyleSignature)
    .fingerprint;
  const rememberedFingerprint = match.signature?.fingerprint;
  const opening =
    currentFingerprint && rememberedFingerprint
      ? openingSimilarity(
          currentFingerprint.openingActionIds,
          rememberedFingerprint.openingActionIds,
        )
      : 0;
  const expectedHealing = Boolean(
    rememberedFingerprint && rememberedFingerprint.healingRatio >= 0.12,
  );
  const expectedDefense = Boolean(
    rememberedFingerprint && rememberedFingerprint.defensiveRatio >= 0.28,
  );
  const expectedCombo = rememberedFingerprint?.comboPatterns[0];
  const evidence: string[] = [];
  if (opening >= 0.66) evidence.push("узнаны первые ходы");
  if (expectedHealing) evidence.push("запомнен момент лечения");
  if (expectedDefense) evidence.push("изучена защитная реакция");
  if (expectedCombo)
    evidence.push(`ожидается связка ${expectedCombo.replace(">", " → ")}`);
  return {
    similarity: Math.round(similarity * 100) / 100,
    strength: Math.round(recognition * 100) / 100,
    countermeasureIds: [...memory.countermeasureIds],
    signatureSkillId: knownSkill?.[1] >= 32 ? knownSkill[0] : undefined,
    recognizedOpening: opening >= 0.66,
    expectedHealing,
    expectedDefense,
    expectedCombo,
    evidence,
  };
}

function increment<T extends string>(
  target: Partial<Record<T, number>>,
  key: T,
  value: number,
): void {
  target[key] = rounded((target[key] ?? 0) + value);
}

function unlockedCountermeasures(
  memory: EnemyStyleMemory,
): EnemyCountermeasureId[] {
  const result: EnemyCountermeasureId[] = [];
  const fingerprints = memory.recentSignatures
    .map((signature) => (signature as DetailedHeroStyleSignature).fingerprint)
    .filter((fingerprint): fingerprint is HeroStyleFingerprint =>
      Boolean(fingerprint),
    );
  const average = (
    select: (fingerprint: HeroStyleFingerprint) => number,
  ): number =>
    fingerprints.length === 0
      ? 0
      : fingerprints.reduce(
          (sum, fingerprint) => sum + select(fingerprint),
          0,
        ) / fingerprints.length;
  const openingPressure = average((fingerprint) => {
    if (fingerprint.openingActionIds.length === 0) return 0;
    return (
      fingerprint.openingActionIds.filter((id) => {
        const kind = SKILLS.find((skill) => skill.id === id)?.kind;
        return id === "basic" || kind === "attack" || kind === "control";
      }).length / fingerprint.openingActionIds.length
    );
  });
  const patternFrequency = new Map<string, number>();
  fingerprints.forEach((fingerprint) =>
    fingerprint.comboPatterns.forEach((pattern) => {
      patternFrequency.set(pattern, (patternFrequency.get(pattern) ?? 0) + 1);
    }),
  );
  const repeatedCombo = [...patternFrequency.values()].some(
    (count) => count >= Math.min(2, fingerprints.length),
  );
  if (
    ((memory.behaviorKnowledge.pressure ?? 0) >= 24 ||
      openingPressure >= 0.66) &&
    memory.familiarity >= 35
  )
    result.push("guarded-opening");
  if ((memory.behaviorKnowledge.burst ?? 0) >= 20 && memory.familiarity >= 35)
    result.push("critical-guard");
  if (
    ((memory.behaviorKnowledge.healing ?? 0) >= 18 ||
      average((fingerprint) => fingerprint.healingRatio) >= 0.15) &&
    memory.familiarity >= 35
  )
    result.push("healing-denial");
  if (
    ((memory.behaviorKnowledge.control ?? 0) >= 18 ||
      average((fingerprint) => fingerprint.defensiveRatio) >= 0.42) &&
    memory.familiarity >= 35
  )
    result.push("control-discipline");
  if (
    (memory.behaviorKnowledge.finisher ?? 0) >= 12 &&
    memory.familiarity >= 35
  )
    result.push("execution-watch");
  if (
    (Object.values(memory.skillKnowledge).some(
      (knowledge) => knowledge >= 32,
    ) ||
      repeatedCombo) &&
    memory.familiarity >= 60
  )
    result.push("signature-parry");
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
  const recallBonus =
    (memory.classKnowledge[signature.classId] ?? 0) > 0 ? 4 : 0;
  const familiarityGained = Math.round(10 + similarity * 8 + recallBonus);

  memory.familiarity = rounded(memory.familiarity + familiarityGained);
  increment(memory.classKnowledge, signature.classId, 14 + recallBonus);
  increment(
    memory.tacticalKnowledge,
    signature.tacticalStyle,
    11 + similarity * 3,
  );
  signature.skillIds.forEach((id) =>
    increment(
      memory.skillKnowledge,
      id,
      7 + (id === signature.dominantSkillId ? 5 : 0),
    ),
  );
  BEHAVIORS.forEach((id) =>
    increment(memory.behaviorKnowledge, id, (signature.behavior[id] ?? 0) * 13),
  );
  memory.recentSignatures = [signature, ...memory.recentSignatures].slice(
    0,
    SIGNATURE_LIMIT,
  );
  memory.lastEncounterDay = day;
  memory.lastDecayDay = day;
  memory.currentSimilarity = Math.round(similarity * 100) / 100;
  memory.stage = memoryStageFor(memory.familiarity);
  memory.countermeasureIds = [
    ...new Set([
      ...memory.countermeasureIds,
      ...unlockedCountermeasures(memory),
    ]),
  ];
  const newCountermeasureIds = memory.countermeasureIds.filter(
    (id) => !previousCounters.has(id),
  );

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
