import { ContractObjective, ExpeditionChoice, HeroClass, Stats, TacticalProfile } from "../gameplay/WorldTypes";

export interface FighterFeatureDefinition {
  id: string;
  name: string;
  description: string;
  stats: Partial<Stats>;
}

export interface TournamentRuleDefinition {
  id: string;
  name: string;
  description: string;
  heroStats?: Partial<Stats>;
  enemyStats?: Partial<Stats>;
  disableHealing?: boolean;
  /** Flat health granted only to the lower-level fighter. */
  lowerLevelHealthBonus?: number;
}

export interface FactionDefinition {
  id: string;
  name: string;
  motto: string;
  description: string;
  accent: string;
  objectives: ContractObjective[];
}

export interface FactionReputationTier {
  threshold: number;
  name: string;
  contractRewardBonus: number;
}

export const FIGHTER_TRAITS: FighterFeatureDefinition[] = [
  { id: "street-hardened", name: "Закалён улицей", description: "Лучше переносит затяжные драки.", stats: { health: 18, defense: 2 } },
  { id: "first-blood", name: "Первая кровь", description: "Стремится решить бой быстрым натиском.", stats: { attack: 3, crit: 3 } },
  { id: "patient-hunter", name: "Терпеливый охотник", description: "Не торопится и ждёт ошибки соперника.", stats: { defense: 3, crit: 2 } },
  { id: "light-step", name: "Лёгкий шаг", description: "Привык держать дистанцию и менять темп.", stats: { speed: 4 } },
  { id: "iron-lungs", name: "Железные лёгкие", description: "Сохраняет силы к концу поединка.", stats: { health: 12, speed: 2 } },
  { id: "arena-born", name: "Рождён ареной", description: "Увереннее чувствует себя перед публикой.", stats: { attack: 2, defense: 2, crit: 2 } },
  { id: "old-guard", name: "Старая гвардия", description: "Опыт заменяет ему молодую скорость.", stats: { defense: 5, speed: -1 } },
  { id: "reckless", name: "Безрассудный", description: "Бьёт сильнее, но чаще открывается.", stats: { attack: 5, defense: -3 } },
  { id: "duelist-eye", name: "Глаз дуэлянта", description: "Читает одиночного противника по стойке.", stats: { crit: 5 } },
  { id: "survivor", name: "Выживший", description: "Однажды уже вернулся с края смерти.", stats: { health: 26, defense: 2 } },
];

export const FIGHTER_SCARS: FighterFeatureDefinition[] = [
  { id: "scar-brow", name: "Рассечённая бровь", description: "Напоминание о проигранном финале. Взгляд стал холоднее.", stats: { crit: 2, health: -4 } },
  { id: "scar-ribs", name: "Сросшиеся рёбра", description: "Дышать тяжелее, зато боль больше не пугает.", stats: { defense: 3, speed: -1 } },
  { id: "scar-palm", name: "Шрам на ладони", description: "Хват стал жёстче после старой раны.", stats: { attack: 3 } },
  { id: "scar-shoulder", name: "Пробитое плечо", description: "Цена выживания в смертельном турнире.", stats: { attack: -1, health: 14 } },
];

export const ENEMY_ADAPTATIONS: FighterFeatureDefinition[] = [
  { id: "adapt-guard", name: "Изучил ваш натиск", description: "После прошлых поражений усилил защитную стойку.", stats: { defense: 7 } },
  { id: "adapt-tempo", name: "Поймал ваш ритм", description: "Научился перехватывать инициативу.", stats: { speed: 7 } },
  { id: "adapt-pressure", name: "Запомнил слабость", description: "Строит бой вокруг одного тяжёлого удара.", stats: { attack: 6, crit: 3 } },
];

export const DEFAULT_TACTICAL_PROFILES: TacticalProfile[] = [
  { id: "balanced", name: "Ровный бой", style: "balanced", healThreshold: 0.55, finisherThreshold: 0.42, preserveStrongSkills: false, prioritizeControl: false },
  { id: "aggressive", name: "Давление", style: "aggressive", healThreshold: 0.3, finisherThreshold: 0.58, preserveStrongSkills: false, prioritizeControl: false },
  { id: "defensive", name: "Выжидание", style: "defensive", healThreshold: 0.72, finisherThreshold: 0.35, preserveStrongSkills: true, prioritizeControl: false },
  { id: "control", name: "Срыв темпа", style: "control", healThreshold: 0.58, finisherThreshold: 0.4, preserveStrongSkills: true, prioritizeControl: true },
];

export const TOURNAMENT_RULES: TournamentRuleDefinition[] = [
  { id: "open-floor", name: "Открытая площадка", description: "Скорость и инициатива важнее обычного.", heroStats: { speed: 5 }, enemyStats: { speed: 5 } },
  { id: "iron-oath", name: "Железная клятва", description: "Доспехи проверяют на прочность: защита всех бойцов выше.", heroStats: { defense: 8 }, enemyStats: { defense: 8 } },
  { id: "first-blood-rule", name: "Право первой крови", description: "Удары опаснее: повышен критический шанс.", heroStats: { crit: 8 }, enemyStats: { crit: 8 } },
  { id: "dry-ring", name: "Сухой круг", description: "Лечебные приёмы запрещены правилами турнира.", disableHealing: true },
  { id: "challenger-favor", name: "Фора претендента", description: "Боец с меньшим уровнем получает дополнительную стойкость.", lowerLevelHealthBonus: 14 },
  { id: "heavy-sand", name: "Тяжёлый песок", description: "Темп ниже, зато каждый точный удар весомее.", heroStats: { speed: -2, attack: 4 }, enemyStats: { speed: -2, attack: 4 } },
];

export const FACTIONS: FactionDefinition[] = [
  { id: "wardens", name: "Смотрители круга", motto: "Порядок переживёт чемпиона", description: "Судьи, лекаря и распорядители официальных арен.", accent: "#58715d", objectives: ["training", "tournament", "duel"] },
  { id: "free-company", name: "Вольная рота", motto: "Дорога платит смелым", description: "Наёмники и проводники, знающие ходы в старые подземелья.", accent: "#9a754b", objectives: ["dungeon", "duel", "boss"] },
  { id: "red-ledger", name: "Красная книга", motto: "Каждый долг имеет имя", description: "Закрытый круг заказчиков, охотящихся за громкими победами.", accent: "#964a3e", objectives: ["duel", "boss", "tournament"] },
];

export const FACTION_REPUTATION_TIERS: FactionReputationTier[] = [
  { threshold: 0, name: "Посторонний", contractRewardBonus: 0 },
  { threshold: 8, name: "Знакомое имя", contractRewardBonus: 0.05 },
  { threshold: 20, name: "Союзник", contractRewardBonus: 0.12 },
  { threshold: 45, name: "Доверенное лицо", contractRewardBonus: 0.2 },
];

export function factionReputationTier(reputation: number): FactionReputationTier {
  return [...FACTION_REPUTATION_TIERS]
    .reverse()
    .find((tier) => reputation >= tier.threshold) ?? FACTION_REPUTATION_TIERS[0];
}

export const EXPEDITION_CHOICES: ExpeditionChoice[] = [
  { id: "safe", name: "Проверенный проход", description: "Обычный бой и надёжная часть награды.", danger: "умеренная", reward: "стабильная" },
  { id: "risk", name: "Следы хранителя", description: "Сильный противник, но выше редкость и шанс печати.", danger: "высокая", reward: "повышенная" },
  { id: "rest", name: "Разбить лагерь", description: "Перевести дух и закрепить найденное без нового боя.", danger: "нет", reward: "восстановление" },
];

export const RELIC_TIER_THRESHOLDS = [0, 4, 12, 26] as const;

export const RELIC_PATHS = [
  { id: "might" as const, name: "Путь силы", description: "+атака и критический шанс", stats: { attack: 6, crit: 3 } as Partial<Stats> },
  { id: "guard" as const, name: "Путь стража", description: "+здоровье и защита", stats: { health: 28, defense: 5 } as Partial<Stats> },
  { id: "tempo" as const, name: "Путь темпа", description: "+скорость и точность удара", stats: { speed: 6, crit: 2 } as Partial<Stats> },
];

export const CLASS_RELIC_EPITHETS: Record<HeroClass, string[]> = {
  Knight: ["Клятва", "Страж", "Бастион"], Archer: ["След", "Тетива", "Зоркость"],
  Wizard: ["Печать", "Искра", "Отголосок"], Monk: ["Покой", "Круг", "Дыхание"],
  Gunsmith: ["Приговор", "Искра", "Залп"], Swordsman: ["Грань", "Ритм", "Клятва"],
};
