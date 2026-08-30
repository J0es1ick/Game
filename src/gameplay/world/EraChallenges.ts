import { HeroClass } from "../core/WorldTypes";
import { RandomSource, SeededRandom } from "../core/RandomSource";

export type EnemyMutationEventType =
  "attack" | "skill-used" | "received-hit" | "incoming-status";

export interface EnemyMutationEvent {
  type: EnemyMutationEventType;
  damage?: number;
  currentHealth?: number;
  maxHealth?: number;
  targetHealthRatio?: number;
  critical?: boolean;
  statusId?: string;
}

export interface EnemyMutationState {
  counter: number;
  consumed: boolean;
  primed: boolean;
}

export interface EnemyMutationEffect {
  damageMultiplier: number;
  bonusDamageRatio: number;
  reflectedDamage: number;
  selfDamage: number;
  initiativeDelta: number;
  cooldownReduction: number;
  cancelIncomingStatus: boolean;
  preventLethal: boolean;
  applyStatusId?: string;
  detail?: string;
}

export interface EnemyClassMutationDefinition {
  id: string;
  classId: HeroClass;
  name: string;
  description: string;
  minCycle: number;
}

export interface SelectedEnemyMutation extends EnemyClassMutationDefinition {
  potency: number;
}

const MUTATIONS: readonly EnemyClassMutationDefinition[] = [
  {
    id: "iron-reprisal",
    classId: "Knight",
    name: "Железная расплата",
    description:
      "Каждый третий полученный удар возвращает часть урона атакующему.",
    minCycle: 2,
  },
  {
    id: "last-oath",
    classId: "Knight",
    name: "Последняя клятва",
    description: "Один раз за бой смертельный удар оставляет рыцарю 1 HP.",
    minCycle: 3,
  },
  {
    id: "patient-volley",
    classId: "Archer",
    name: "Терпеливый залп",
    description:
      "Каждый третий выстрел наносит больше урона и ускоряет следующий ход.",
    minCycle: 2,
  },
  {
    id: "wounded-quarry",
    classId: "Archer",
    name: "Раненая добыча",
    description:
      "Лучник усиливает каждый второй удар по цели с низким здоровьем.",
    minCycle: 3,
  },
  {
    id: "echoing-seal",
    classId: "Wizard",
    name: "Эхо печати",
    description: "Каждое третье заклинание повторяет часть нанесённого урона.",
    minCycle: 2,
  },
  {
    id: "broken-clock",
    classId: "Wizard",
    name: "Сломанные часы",
    description:
      "Каждое четвёртое заклинание сокращает перезарядки и приближает следующий ход.",
    minCycle: 3,
  },
  {
    id: "empty-step",
    classId: "Monk",
    name: "Пустой шаг",
    description:
      "Первый направленный на монаха негативный статус в бою отменяется.",
    minCycle: 2,
  },
  {
    id: "returning-palm",
    classId: "Monk",
    name: "Возвращающая ладонь",
    description:
      "Каждый третий полученный удар частично возвращается противнику.",
    minCycle: 3,
  },
  {
    id: "powder-chain",
    classId: "Gunsmith",
    name: "Пороховая цепь",
    description: "Каждая вторая атака получает дополнительный выстрел.",
    minCycle: 2,
  },
  {
    id: "overpressure",
    classId: "Gunsmith",
    name: "Избыточное давление",
    description:
      "Каждый третий залп сильнее и поджигает цель, но ранит стрелка.",
    minCycle: 3,
  },
  {
    id: "blood-rhythm",
    classId: "Swordsman",
    name: "Кровавый ритм",
    description: "При ранении каждый второй удар становится заметно сильнее.",
    minCycle: 2,
  },
  {
    id: "duelist-grudge",
    classId: "Swordsman",
    name: "Злопамятность дуэлянта",
    description: "Полученный критический удар усиливает следующий ответ.",
    minCycle: 3,
  },
];

export const ENEMY_CLASS_MUTATIONS: readonly EnemyClassMutationDefinition[] =
  MUTATIONS;

export function initialEnemyMutationState(): EnemyMutationState {
  return { counter: 0, consumed: false, primed: false };
}

function neutralEffect(): EnemyMutationEffect {
  return {
    damageMultiplier: 1,
    bonusDamageRatio: 0,
    reflectedDamage: 0,
    selfDamage: 0,
    initiativeDelta: 0,
    cooldownReduction: 0,
    cancelIncomingStatus: false,
    preventLethal: false,
  };
}

function scaledMultiplier(value: number, potency: number): number {
  return Math.round((1 + (value - 1) * potency) * 1_000) / 1_000;
}

function rounded(value: number): number {
  return Math.max(0, Math.round(value));
}

export function resolveEnemyMutation(
  mutation: SelectedEnemyMutation,
  state: EnemyMutationState,
  event: EnemyMutationEvent,
): { state: EnemyMutationState; effect: EnemyMutationEffect } {
  const next = { ...state };
  const effect = neutralEffect();
  const potency = Number.isFinite(mutation.potency)
    ? Math.max(1, mutation.potency)
    : 1;
  const count = () => {
    next.counter += 1;
    return next.counter;
  };
  const damage = Math.max(0, event.damage ?? 0);
  const health = Math.max(0, event.currentHealth ?? 0);
  const maxHealth = Math.max(1, event.maxHealth ?? (health || 1));

  switch (mutation.id) {
    case "iron-reprisal":
      if (event.type === "received-hit" && count() % 3 === 0) {
        effect.reflectedDamage = rounded(damage * 0.25 * potency);
        effect.detail = "Железная расплата вернула часть урона.";
      }
      break;
    case "last-oath":
      if (
        event.type === "received-hit" &&
        !next.consumed &&
        damage >= health &&
        health > 1
      ) {
        next.consumed = true;
        effect.preventLethal = true;
        effect.detail = "Последняя клятва удержала рыцаря на 1 HP.";
      }
      break;
    case "patient-volley":
      if (event.type === "attack" && count() % 3 === 0) {
        effect.damageMultiplier = scaledMultiplier(1.45, potency);
        effect.initiativeDelta = rounded(12 * potency);
        effect.detail = "Терпеливый залп перехватил темп.";
      }
      break;
    case "wounded-quarry":
      if (
        event.type === "attack" &&
        (event.targetHealthRatio ?? 1) <= 0.45 &&
        count() % 2 === 0
      ) {
        effect.damageMultiplier = scaledMultiplier(1.3, potency);
        effect.applyStatusId = "marked";
        effect.detail = "Лучник добивает раненую добычу.";
      }
      break;
    case "echoing-seal":
      if (event.type === "skill-used" && count() % 3 === 0) {
        effect.bonusDamageRatio = Math.round(0.45 * potency * 1_000) / 1_000;
        effect.detail = "Эхо печати повторило часть заклинания.";
      }
      break;
    case "broken-clock":
      if (event.type === "skill-used" && count() % 4 === 0) {
        effect.cooldownReduction = Math.max(1, rounded(2 * potency));
        effect.initiativeDelta = rounded(15 * potency);
        effect.detail = "Сломанные часы сдвинули очередь хода.";
      }
      break;
    case "empty-step":
      if (event.type === "incoming-status" && !next.consumed) {
        next.consumed = true;
        effect.cancelIncomingStatus = true;
        effect.initiativeDelta = rounded(8 * potency);
        effect.detail = "Пустой шаг рассеял негативный эффект.";
      }
      break;
    case "returning-palm":
      if (event.type === "received-hit" && count() % 3 === 0) {
        effect.reflectedDamage = rounded(damage * 0.35 * potency);
        effect.detail = "Возвращающая ладонь обратила силу удара.";
      }
      break;
    case "powder-chain":
      if (event.type === "attack" && count() % 2 === 0) {
        effect.bonusDamageRatio = Math.round(0.4 * potency * 1_000) / 1_000;
        effect.detail = "Пороховая цепь дала дополнительный выстрел.";
      }
      break;
    case "overpressure":
      if (event.type === "attack" && count() % 3 === 0) {
        effect.damageMultiplier = scaledMultiplier(1.35, potency);
        effect.selfDamage = rounded(maxHealth * 0.03 * potency);
        effect.applyStatusId = "burning";
        effect.detail = "Избыточное давление усилило залп ценой здоровья.";
      }
      break;
    case "blood-rhythm":
      if (
        event.type === "attack" &&
        health / maxHealth <= 0.5 &&
        count() % 2 === 0
      ) {
        effect.damageMultiplier = scaledMultiplier(1.4, potency);
        effect.initiativeDelta = rounded(10 * potency);
        effect.detail = "Кровавый ритм ускорил клинки.";
      }
      break;
    case "duelist-grudge":
      if (event.type === "received-hit" && event.critical) next.primed = true;
      if (event.type === "attack" && next.primed) {
        next.primed = false;
        effect.damageMultiplier = scaledMultiplier(1.32, potency);
        effect.detail = "Злопамятность усилила ответный удар.";
      }
      break;
    default:
      throw new RangeError(`Неизвестная мутация: ${mutation.id}.`);
  }
  return { state: next, effect };
}

export function selectEnemyMutation(
  classId: HeroClass,
  cycle: number,
  random: RandomSource = new SeededRandom(`enemy-mutation:${cycle}:${classId}`),
): SelectedEnemyMutation | undefined {
  const safeCycle = Number.isFinite(cycle) ? Math.max(1, Math.floor(cycle)) : 1;
  if (safeCycle < 2) return undefined;
  const eligible = MUTATIONS.filter(
    (mutation) =>
      mutation.classId === classId && mutation.minCycle <= safeCycle,
  );
  if (eligible.length === 0) return undefined;
  const mutation = random.pick(eligible);
  return {
    ...mutation,
    potency: Math.round((1 + Math.min(6, safeCycle - 2) * 0.05) * 100) / 100,
  };
}

export type EraObjectiveMetric =
  | "arenaChampionships"
  | "uniqueDungeonsCompleted"
  | "uniqueRivalsDefeated"
  | "awakenedRelics"
  | "alliedFactions"
  | "mutationVictories"
  | "longestWinStreak"
  | "classesMastered";

export interface EraObjectiveRequirement {
  metric: EraObjectiveMetric;
  target: number;
}

export interface EraObjectiveDefinition {
  id: string;
  name: string;
  description: string;
  requirements: EraObjectiveRequirement[];
  optional: true;
  rewardDescription: string;
}

export interface EraObjectiveProgress {
  objective: EraObjectiveDefinition;
  current: number;
  target: number;
  ratio: number;
  completed: boolean;
}

export interface EraChallenge {
  cycle: number;
  name: string;
  mutations: Record<HeroClass, SelectedEnemyMutation>;
  objectives: EraObjectiveDefinition[];
}

export interface EraChallengeProgressState {
  cycle: number;
  metrics: Partial<Record<EraObjectiveMetric, number>>;
  completedObjectiveIds: string[];
  rewardedObjectiveIds: string[];
  currentWinStreak: number;
  masteredClassIds: HeroClass[];
  defeatedRivalIds: string[];
}

export function createEraChallengeProgress(
  cycle: number,
): EraChallengeProgressState {
  return {
    cycle: Math.max(1, Math.floor(Number(cycle) || 1)),
    metrics: {},
    completedObjectiveIds: [],
    rewardedObjectiveIds: [],
    currentWinStreak: 0,
    masteredClassIds: [],
    defeatedRivalIds: [],
  };
}

export function normalizeEraChallengeProgress(
  value: Partial<EraChallengeProgressState> | undefined,
  cycle: number,
): EraChallengeProgressState {
  const expectedCycle = Math.max(1, Math.floor(Number(cycle) || 1));
  if (!value || value.cycle !== expectedCycle)
    return createEraChallengeProgress(expectedCycle);
  const metrics = Object.fromEntries(
    Object.entries(value.metrics ?? {})
      .filter(([, current]) => Number.isFinite(current))
      .map(([metric, current]) => [
        metric,
        Math.max(0, Math.floor(Number(current))),
      ]),
  ) as Partial<Record<EraObjectiveMetric, number>>;
  return {
    cycle: expectedCycle,
    metrics,
    completedObjectiveIds: [...new Set(value.completedObjectiveIds ?? [])],
    rewardedObjectiveIds: [...new Set(value.rewardedObjectiveIds ?? [])],
    currentWinStreak: Math.max(
      0,
      Math.floor(Number(value.currentWinStreak) || 0),
    ),
    masteredClassIds: [...new Set(value.masteredClassIds ?? [])].filter(
      (classId): classId is HeroClass => CLASSES.includes(classId as HeroClass),
    ),
    defeatedRivalIds: [...new Set(value.defeatedRivalIds ?? [])].filter(
      (id) => typeof id === "string",
    ),
  };
}

export function recordEraMetric(
  state: EraChallengeProgressState,
  metric: EraObjectiveMetric,
  amount = 1,
  mode: "add" | "max" = "add",
): EraChallengeProgressState {
  const current = Math.max(0, Math.floor(state.metrics[metric] ?? 0));
  const incoming = Math.max(0, Math.floor(Number(amount) || 0));
  const metrics = {
    ...state.metrics,
    [metric]: mode === "max" ? Math.max(current, incoming) : current + incoming,
  };
  return { ...state, metrics };
}

const OBJECTIVE_REWARD = "1 печать наследия, 1 печать закалки и золото эпохи";

export const ERA_OBJECTIVES: readonly EraObjectiveDefinition[] = [
  {
    id: "six-banners",
    name: "Шесть знамён",
    description: "Стать чемпионом разных обычных арен.",
    requirements: [{ metric: "arenaChampionships", target: 6 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "underworld-map",
    name: "Карта подземного мира",
    description: "Завершить уникальные подземелья.",
    requirements: [{ metric: "uniqueDungeonsCompleted", target: 5 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "book-of-rivals",
    name: "Книга соперников",
    description: "Победить разных постоянных соперников.",
    requirements: [{ metric: "uniqueRivalsDefeated", target: 12 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "living-arsenal",
    name: "Живой арсенал",
    description: "Полностью пробудить несколько реликвий.",
    requirements: [{ metric: "awakenedRelics", target: 3 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "common-oath",
    name: "Общая клятва",
    description: "Достичь союзного статуса у всех фракций.",
    requirements: [{ metric: "alliedFactions", target: 3 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "break-evolution",
    name: "Сломать эволюцию",
    description: "Побеждать врагов с мутациями текущей эпохи.",
    requirements: [{ metric: "mutationVictories", target: 18 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "unbroken-road",
    name: "Непрерывная дорога",
    description: "Собрать длинную серию побед в любых опасных активностях.",
    requirements: [{ metric: "longestWinStreak", target: 15 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
  {
    id: "many-schools",
    name: "Множество школ",
    description: "Добиться побед, используя несколько классов героя.",
    requirements: [{ metric: "classesMastered", target: 3 }],
    optional: true,
    rewardDescription: OBJECTIVE_REWARD,
  },
];

const ERA_NAMES = [
  "Эпоха ответных клятв",
  "Эпоха охотников",
  "Эпоха расколотых печатей",
  "Эпоха живого железа",
  "Эпоха долгой памяти",
];
const CLASSES: HeroClass[] = [
  "Knight",
  "Archer",
  "Wizard",
  "Monk",
  "Gunsmith",
  "Swordsman",
];

export function eraChallengeFor(cycle: number): EraChallenge {
  const safeCycle = Number.isFinite(cycle) ? Math.max(2, Math.floor(cycle)) : 2;
  const objectiveRandom = new SeededRandom(`era-objectives:${safeCycle}`);
  const objectiveCount = safeCycle >= 4 ? 3 : 2;
  const mutations = Object.fromEntries(
    CLASSES.map((classId) => [
      classId,
      selectEnemyMutation(
        classId,
        safeCycle,
        new SeededRandom(`era-class:${safeCycle}:${classId}`),
      )!,
    ]),
  ) as Record<HeroClass, SelectedEnemyMutation>;
  return {
    cycle: safeCycle,
    name: ERA_NAMES[
      new SeededRandom(`era-name:${safeCycle}`).int(0, ERA_NAMES.length - 1)
    ],
    mutations,
    objectives: objectiveRandom
      .shuffle(ERA_OBJECTIVES)
      .slice(0, objectiveCount),
  };
}

export function evaluateEraObjective(
  objective: EraObjectiveDefinition,
  progress: Partial<Record<EraObjectiveMetric, number>>,
): EraObjectiveProgress {
  const values = objective.requirements.map((requirement) => ({
    current: Math.max(0, Math.floor(progress[requirement.metric] ?? 0)),
    target: requirement.target,
  }));
  const current = values.reduce(
    (sum, value) => sum + Math.min(value.current, value.target),
    0,
  );
  const target = values.reduce((sum, value) => sum + value.target, 0);
  return {
    objective,
    current,
    target,
    ratio:
      target > 0
        ? Math.round(Math.min(1, current / target) * 1_000) / 1_000
        : 1,
    completed: values.every((value) => value.current >= value.target),
  };
}
