import { CLASS_DEFINITIONS } from "../../catalogs/WorldCatalog";
import type { ExpeditionShrineChoice, HeroClass } from "./WorldTypes";

export const ENEMY_NAMES = [
  "Бран",
  "Хельга",
  "Торен",
  "Сив",
  "Мартен",
  "Рута",
  "Кай",
  "Орса",
  "Флинт",
  "Лисса",
  "Гектор",
  "Нима",
  "Валлен",
  "Ингрид",
  "Кроу",
  "Мара",
  "Отис",
  "Сальма",
  "Рен",
  "Ивар",
  "Далия",
  "Бор",
  "Элин",
  "Стерн",
  "Кира",
  "Фарен",
  "Юна",
  "Грей",
  "Тиль",
  "Ада",
] as const;
export const ENEMY_TITLES = [
  "нищий с моста",
  "бывший стражник",
  "портовый стрелок",
  "ученик лекаря",
  "беглый оруженосец",
  "бродячий дуэлянт",
  "хранитель ворот",
  "последний из артели",
] as const;
export const ENEMY_ORIGINS = [
  "Нижний город",
  "Пепельная слобода",
  "Северный тракт",
  "Рыбацкий квартал",
  "Старые казармы",
  "Чёрный хребет",
] as const;
export const HERO_CLASSES = Object.keys(CLASS_DEFINITIONS) as HeroClass[];
export const VISUAL_TEST_CATALOG_CLEANUP_MIGRATION =
  "remove-visual-test-catalog-v1";
export const ELITE_SIZE = 30;
export const LEGEND_COUNT = 5;
export const EXPEDITION_SHRINE_CHOICES: readonly ExpeditionShrineChoice[] = [
  {
    id: "blood-oath",
    name: "Клятва крови",
    description:
      "Оставить часть жизненной силы алтарю и наносить больше урона до конца похода.",
    cost: "-14% запаса сил",
    benefit: "+18% к атаке в оставшихся боях",
  },
  {
    id: "guardian-vow",
    name: "Клятва хранителя",
    description:
      "Пожертвовать частью найденных монет ради защиты и более ценной добычи.",
    cost: "-20% накопленных монет",
    benefit: "+16% к защите и +12% к шансу целевой добычи",
  },
];
export const CROWN_LEAGUE_INTERVAL = 10;
export const CROWN_LEAGUE_SCHEDULE_MIGRATION =
  "crown-league-ten-day-schedule-v1";
export const CROWN_SET_ID = "crown-sovereign";
export const ARENA_POPULATION_TARGET = 16;
export const ARENA_POPULATION_BASE_FLOOR = 12;
export const ARENA_POPULATION_RESERVE = 4;
export const CROSS_ERA_RETURNING_SHARE = 0.8;
export const BACKGROUND_LETHALITY_SCALE = 0.08;
export const CONTRACT_LIFETIME = 7;
export const ACTIVE_INJURY_CHANCE = 0.24;
export const CLASS_CHANGE_GOLD_COST = 25_000;
export const CLASS_CHANGE_MARK_COST = 5;
export const TEMPERING_MARK_COSTS = [1, 2, 3, 5, 8] as const;
