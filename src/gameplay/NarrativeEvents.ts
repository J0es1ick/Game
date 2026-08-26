import type { HeroClass } from "./WorldTypes";

export interface NarrativeContext {
  day: number;
  heroLevel: number;
  classId: HeroClass;
  gold: number;
  highestArena: number;
  injuries: number;
  rivalries: number;
}

export interface NarrativeEffect {
  gold?: number;
  experience?: number;
  reputation?: Record<string, number>;
  injuryRecovery?: number;
  rivalryIntensity?: number;
  temperingMarks?: number;
}

export interface NarrativeChoice {
  id: string;
  label: string;
  description: string;
  effect: NarrativeEffect;
}

export interface NarrativeEventDefinition {
  id: string;
  title: string;
  description: string;
  minimumDay: number;
  minimumLevel?: number;
  minimumArena?: number;
  classes?: HeroClass[];
  requiresInjury?: boolean;
  requiresRivalry?: boolean;
  choices: NarrativeChoice[];
}

export const NARRATIVE_EVENTS: NarrativeEventDefinition[] = [
  {
    id: "rival-mercy", title: "Побеждённый соперник", description: "Старый противник просит оставить ему имя и оружие.", minimumDay: 12, requiresRivalry: true,
    choices: [
      { id: "mercy", label: "Оставить в живых", description: "Уважение может однажды превратиться в помощь.", effect: { rivalryIntensity: -8, reputation: { wardens: 3, "red-ledger": -1 } } },
      { id: "claim", label: "Потребовать выкуп", description: "Немедленная выгода усилит вражду.", effect: { gold: 650, rivalryIntensity: 12, reputation: { "red-ledger": 2 } } },
    ],
  },
  {
    id: "risky-forge", title: "Ночная кузня", description: "Мастер предлагает закалить любимое оружие составом, который ещё никто не испытывал.", minimumDay: 20, minimumArena: 2,
    choices: [
      { id: "attempt", label: "Принять риск", description: "Получить редкую печать, но заплатить за работу.", effect: { gold: -900, temperingMarks: 1 } },
      { id: "decline", label: "Отказаться", description: "Сохранить деньги и не испытывать судьбу.", effect: {} },
    ],
  },
  {
    id: "field-healer", title: "Лекарь без знамени", description: "Странствующий лекарь предлагает помощь перед следующим тяжёлым днём.", minimumDay: 8, requiresInjury: true,
    choices: [
      { id: "pay", label: "Заплатить лекарю", description: "Сократить восстановление от травм.", effect: { gold: -320, injuryRecovery: 2 } },
      { id: "endure", label: "Терпеть", description: "Боль останется, зато кошель не опустеет.", effect: { experience: 80 } },
    ],
  },
  {
    id: "faction-demand", title: "Цена покровительства", description: "Две фракции требуют публично выбрать сторону перед турниром.", minimumDay: 30, minimumArena: 3,
    choices: [
      { id: "order", label: "Поддержать Смотрителей", description: "Порядок ценит верность, Красная книга — нет.", effect: { reputation: { wardens: 6, "red-ledger": -4 } } },
      { id: "freedom", label: "Поддержать Вольную роту", description: "Проводники откроют новые пути в обмен на доверие судей.", effect: { reputation: { "free-company": 6, wardens: -3 } } },
      { id: "neutral", label: "Не выбирать", description: "Никто не станет союзником, но и врагов не прибавится.", effect: { reputation: { wardens: -1, "free-company": -1, "red-ledger": -1 } } },
    ],
  },
  {
    id: "street-apprentice", title: "Ученик у ворот", description: "Юный боец просит оплатить ему первый настоящий клинок.", minimumDay: 5,
    choices: [
      { id: "sponsor", label: "Оплатить клинок", description: "Смотрители запомнят поступок, но кошель станет легче.", effect: { gold: -90, reputation: { wardens: 2 } } },
      { id: "lesson", label: "Дать урок вместо денег", description: "Короткая тренировка принесёт немного опыта обоим.", effect: { experience: 35, reputation: { "free-company": 1 } } },
    ],
  },
  {
    id: "broken-banner", title: "Знамя без отряда", description: "На дороге найдено знамя исчезнувшей роты. За ним придут сразу несколько хозяев.", minimumDay: 15, minimumArena: 1,
    choices: [
      { id: "return", label: "Вернуть Смотрителям", description: "Официальная благодарность важнее случайной наживы.", effect: { reputation: { wardens: 4, "free-company": -1 }, gold: 120 } },
      { id: "sell", label: "Продать Вольной роте", description: "Проводники платят больше и не задают вопросов.", effect: { reputation: { "free-company": 4, wardens: -2 }, gold: 340 } },
    ],
  },
  {
    id: "smugglers-map", title: "Карта контрабандистов", description: "Проводник предлагает безопасный путь в глубины, но требует долю заранее.", minimumDay: 18, minimumLevel: 5, minimumArena: 1,
    choices: [
      { id: "buy", label: "Купить маршрут", description: "Знак проводника пригодится для закалки и походов.", effect: { gold: -420, temperingMarks: 1, reputation: { "free-company": 3 } } },
      { id: "report", label: "Передать карту страже", description: "Смотрители оценят законопослушание.", effect: { reputation: { wardens: 5, "free-company": -3 }, gold: 160 } },
    ],
  },
  {
    id: "ring-physician", title: "Врач из-под трибун", description: "Старый врач знает, как вернуть бойца в строй, но работает только за услугу.", minimumDay: 16, minimumLevel: 6, requiresInjury: true,
    choices: [
      { id: "favor", label: "Пообещать услугу", description: "Травмы отступят, а Красная книга запомнит долг.", effect: { injuryRecovery: 3, reputation: { "red-ledger": 3, wardens: -1 } } },
      { id: "practice", label: "Восстанавливаться самому", description: "Медленнее, зато перенесённая боль закалит героя.", effect: { experience: 120 } },
    ],
  },
  {
    id: "weapon-oath", title: "Клятва оружию", description: "Мастер предлагает навсегда вписать имя героя в сталь перед следующим большим турниром.", minimumDay: 28, minimumLevel: 12, minimumArena: 2,
    choices: [
      { id: "engrave", label: "Принести клятву", description: "Дорогая гравировка оставит печать для будущей перековки.", effect: { gold: -1100, temperingMarks: 2, reputation: { wardens: 2 } } },
      { id: "plain", label: "Оставить клинок без имени", description: "Слава принадлежит бойцу, а не вещи.", effect: { experience: 180, rivalryIntensity: 4 } },
    ],
  },
  {
    id: "powder-shortage", title: "Последний ящик пороха", description: "Оружейники спорят с караулом за редкие припасы перед турниром.", minimumDay: 24, minimumLevel: 9, classes: ["Gunsmith", "Archer"],
    choices: [
      { id: "fighters", label: "Поддержать бойцов", description: "Вольная рота вознаградит тех, кто защищает ремесло.", effect: { reputation: { "free-company": 4, wardens: -2 }, experience: 80 } },
      { id: "guard", label: "Отдать припасы караулу", description: "Порядок важнее личного преимущества.", effect: { reputation: { wardens: 4, "free-company": -1 }, gold: 260 } },
    ],
  },
  {
    id: "silent-chapel", title: "Час в пустой часовне", description: "Перед рассветом герой может посвятить время дисциплине или тайному знанию.", minimumDay: 22, minimumLevel: 9, classes: ["Knight", "Wizard", "Monk", "Swordsman"],
    choices: [
      { id: "discipline", label: "Повторить старые приёмы", description: "Спокойная практика укрепляет привычную технику.", effect: { experience: 150, reputation: { wardens: 1 } } },
      { id: "forbidden", label: "Прочесть запрещённую запись", description: "Знание оставит след в Красной книге.", effect: { temperingMarks: 1, reputation: { "red-ledger": 3, wardens: -1 } } },
    ],
  },
  {
    id: "champions-table", title: "Место за столом чемпионов", description: "Прежние победители проверяют, умеет ли новое имя делиться славой.", minimumDay: 42, minimumLevel: 18, minimumArena: 4, requiresRivalry: true,
    choices: [
      { id: "toast", label: "Поднять кубок за соперников", description: "Уважение ослабит старую вражду и укрепит связи.", effect: { rivalryIntensity: -12, reputation: { wardens: 2, "free-company": 2 } } },
      { id: "challenge", label: "Потребовать лучший бой", description: "Открытый вызов сделает противостояние опаснее, но принесёт опыт.", effect: { rivalryIntensity: 15, experience: 260, reputation: { "red-ledger": 2 } } },
    ],
  },
];

export function availableNarrativeEvents(context: NarrativeContext, seenIds: readonly string[]): NarrativeEventDefinition[] {
  const seen = new Set(seenIds);
  return NARRATIVE_EVENTS.filter((event) => !seen.has(event.id)
    && context.day >= event.minimumDay
    && context.heroLevel >= (event.minimumLevel ?? 0)
    && context.highestArena >= (event.minimumArena ?? 0)
    && (!event.classes || event.classes.includes(context.classId))
    && (!event.requiresInjury || context.injuries > 0)
    && (!event.requiresRivalry || context.rivalries > 0));
}
