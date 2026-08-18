import {
  ArenaDefinition,
  BossDefinition,
  ClassDefinition,
  DuelDefinition,
  DungeonDefinition,
  EndgameActivityDefinition,
  EquipmentSlot,
  EquipmentSetDefinition,
  HeroClass,
  ItemTemplate,
  Rarity,
  SkillDefinition,
  Stats,
} from "../gameplay/WorldTypes";
import { TournamentArena } from "../arenas/TournamentArena";

export const CLASS_DEFINITIONS: Record<HeroClass, ClassDefinition> = {
  Knight: {
    id: "Knight", name: "Рыцарь", epithet: "щит перед строем",
    description: "Меч и щит. Медленно изматывает противника и лучше всех держит удар.",
    passive: "Блокирует 18% входящего урона, пока здоровье выше 25%.",
    startingStats: { health: 164, attack: 15, defense: 15, speed: 7, crit: 5 },
    startingWeapon: "Учебный меч", startingOffhand: "Дубовый щит", accent: "#a65743",
  },
  Archer: {
    id: "Archer", name: "Лучник", epithet: "дальний прицел",
    description: "Быстрый стрелок. Накапливает темп и усиливает каждый третий выстрел.",
    passive: "Каждая третья обычная атака наносит на 45% больше урона.",
    startingStats: { health: 132, attack: 17, defense: 8, speed: 14, crit: 12 },
    startingWeapon: "Тисовый лук", accent: "#668152",
  },
  Wizard: {
    id: "Wizard", name: "Маг", epithet: "хранитель печатей",
    description: "Использует сильные заклинания и восстанавливается после каждого навыка.",
    passive: "После применения активного навыка восстанавливает 5% максимального HP.",
    startingStats: { health: 124, attack: 21, defense: 7, speed: 10, crit: 9 },
    startingWeapon: "Ясеневый посох", accent: "#645c91",
  },
  Monk: {
    id: "Monk", name: "Монах", epithet: "пустые ладони",
    description: "Сражается без оружия, уклоняется и усиливает следующие друг за другом удары.",
    passive: "Имеет 14% шанс уклониться; каждый успешный удар усиливает комбо.",
    startingStats: { health: 142, attack: 16, defense: 10, speed: 15, crit: 8 },
    startingWeapon: "Льняные бинты", accent: "#b17a3b",
  },
  Gunsmith: {
    id: "Gunsmith", name: "Оружейник", epithet: "двойной выстрел",
    description: "Носит два пистолета. Обычная атака состоит из двух менее сильных попаданий.",
    passive: "Обычная атака наносит второй выстрел силой 55% от первого.",
    startingStats: { health: 136, attack: 18, defense: 8, speed: 13, crit: 11 },
    startingWeapon: "Левый кремнёвый пистолет", startingOffhand: "Правый кремнёвый пистолет", accent: "#4e7480",
  },
  Swordsman: {
    id: "Swordsman", name: "Мечник", epithet: "две стали",
    description: "Атакует двумя мечами и чаще наносит критические удары после ранения.",
    passive: "При здоровье ниже 50% получает +12% критического шанса и второй удар.",
    startingStats: { health: 146, attack: 19, defense: 9, speed: 12, crit: 10 },
    startingWeapon: "Короткий меч", startingOffhand: "Парный короткий меч", accent: "#7d604d",
  },
};

const sharedSkills: SkillDefinition[] = [
  { id: "second-wind", name: "Второе дыхание", description: "Восстанавливает часть здоровья.", classes: "all", unlockLevel: 3, kind: "heal", power: 24, cooldown: 5, priority: 8 },
  { id: "measured-strike", name: "Выверенный удар", description: "Надёжная усиленная атака.", classes: "all", unlockLevel: 5, kind: "attack", power: 1.28, cooldown: 3, priority: 5 },
  { id: "battle-focus", name: "Боевой настрой", description: "Усиливает следующую атаку.", classes: "all", unlockLevel: 8, kind: "buff", power: 0.32, cooldown: 5, priority: 6 },
  { id: "break-rhythm", name: "Сбить ритм", description: "Ослабляет следующий удар противника.", classes: "all", unlockLevel: 12, kind: "control", power: 0.25, cooldown: 6, priority: 7 },
  { id: "survivor-instinct", name: "Инстинкт выжившего", description: "Сильное лечение при низком HP.", classes: "all", unlockLevel: 18, kind: "heal", power: 42, cooldown: 7, priority: 10 },
  { id: "execution", name: "Добивание", description: "Усиленный удар по раненой цели.", classes: "all", unlockLevel: 25, kind: "attack", power: 1.75, cooldown: 6, priority: 9 },
];

const classSkills: Record<HeroClass, Array<[string, string, number, "attack" | "heal" | "buff" | "control", number, number]>> = {
  Knight: [
    ["shield-bash", "Удар щитом", 1, "control", 0.85, 3], ["riposte", "Ответный выпад", 2, "attack", 1.25, 3],
    ["iron-stance", "Железная стойка", 4, "buff", 0.38, 5], ["oath-strike", "Удар клятвы", 7, "attack", 1.55, 4],
    ["aegis", "Живая эгида", 11, "heal", 32, 6], ["last-bastion", "Последний бастион", 16, "buff", 0.62, 7],
  ],
  Archer: [
    ["quick-shot", "Быстрый выстрел", 1, "attack", 1.15, 2], ["pinning-arrow", "Сковывающая стрела", 2, "control", 0.8, 4],
    ["hawk-eye", "Глаз ястреба", 4, "buff", 0.4, 5], ["split-arrow", "Расщеплённая стрела", 7, "attack", 1.6, 4],
    ["forest-remedy", "Лесное средство", 11, "heal", 30, 6], ["arrow-rain", "Дождь стрел", 16, "attack", 2.05, 7],
  ],
  Wizard: [
    ["ember", "Тлеющая искра", 1, "attack", 1.2, 2], ["frost-seal", "Печать мороза", 2, "control", 0.82, 4],
    ["arcane-flow", "Поток маны", 4, "buff", 0.42, 5], ["chain-lightning", "Цепная молния", 7, "attack", 1.68, 4],
    ["time-fold", "Складка времени", 11, "heal", 34, 6], ["falling-star", "Падающая звезда", 16, "attack", 2.2, 7],
  ],
  Monk: [
    ["palm", "Толчок ладонью", 1, "attack", 1.18, 2], ["sweep", "Подсечка", 2, "control", 0.78, 4],
    ["inner-breath", "Внутреннее дыхание", 4, "heal", 27, 5], ["hundred-hands", "Сто ладоней", 7, "attack", 1.62, 4],
    ["still-water", "Тихая вода", 11, "buff", 0.5, 6], ["dragon-step", "Шаг дракона", 16, "attack", 2.0, 6],
  ],
  Gunsmith: [
    ["snap-shot", "Выстрел навскидку", 1, "attack", 1.17, 2], ["powder-flash", "Пороховая вспышка", 2, "control", 0.8, 4],
    ["calibration", "Калибровка", 4, "buff", 0.45, 5], ["crossfire", "Перекрёстный огонь", 7, "attack", 1.7, 4],
    ["field-repair", "Полевая починка", 11, "heal", 31, 6], ["full-cylinder", "Полный барабан", 16, "attack", 2.1, 7],
  ],
  Swordsman: [
    ["double-cut", "Двойной порез", 1, "attack", 1.2, 2], ["blade-catch", "Перехват клинка", 2, "control", 0.84, 4],
    ["edge-dance", "Танец лезвий", 4, "buff", 0.43, 5], ["cross-cut", "Крестовый разрез", 7, "attack", 1.65, 4],
    ["red-tempo", "Красный темп", 11, "heal", 29, 6], ["eight-cuts", "Восемь разрезов", 16, "attack", 2.12, 7],
  ],
};

export const EQUIPMENT_SKILLS: SkillDefinition[] = [
  { id: "relic-blood-pact", name: "Клятва крови", description: "Мощный удар, усиливающийся редкой реликвией.", classes: "all", unlockLevel: 0, kind: "attack", power: 1.72, cooldown: 6, priority: 10, equipmentOnly: true },
  { id: "relic-guardian-echo", name: "Эхо хранителя", description: "Восстанавливает здоровье владельцу древнего предмета.", classes: "all", unlockLevel: 0, kind: "heal", power: 38, cooldown: 7, priority: 11, equipmentOnly: true },
  { id: "relic-chrono-step", name: "Украденная секунда", description: "Усиливает следующую атаку и меняет темп боя.", classes: "all", unlockLevel: 0, kind: "buff", power: 0.56, cooldown: 7, priority: 9, equipmentOnly: true },
  { id: "relic-shatter", name: "Излом печати", description: "Наносит урон и ослабляет ответный удар противника.", classes: "all", unlockLevel: 0, kind: "control", power: 1.05, cooldown: 7, priority: 10, equipmentOnly: true },
  { id: "relic-aegis", name: "Ответ бастиона", description: "Тяжёлый ответный удар древнего щита.", classes: ["Knight"], unlockLevel: 0, kind: "attack", power: 1.95, cooldown: 7, priority: 11, equipmentOnly: true },
  { id: "relic-ghost-volley", name: "Призрачный залп", description: "Серия стрел, выпущенных почти одновременно.", classes: ["Archer"], unlockLevel: 0, kind: "attack", power: 2.0, cooldown: 7, priority: 11, equipmentOnly: true },
  { id: "relic-starfall", name: "Падение звезды", description: "Редкое разрушительное заклинание экипировки.", classes: ["Wizard"], unlockLevel: 0, kind: "attack", power: 2.12, cooldown: 8, priority: 12, equipmentOnly: true },
  { id: "relic-empty-mind", name: "Пустой разум", description: "Глубокое восстановление между сериями ударов.", classes: ["Monk"], unlockLevel: 0, kind: "heal", power: 52, cooldown: 8, priority: 12, equipmentOnly: true },
  { id: "relic-ricochet", name: "Королевский рикошет", description: "Пуля меняет направление и наносит усиленный урон.", classes: ["Gunsmith"], unlockLevel: 0, kind: "attack", power: 2.08, cooldown: 8, priority: 12, equipmentOnly: true },
  { id: "relic-final-dance", name: "Последний танец", description: "Рискованная серия двух клинков.", classes: ["Swordsman"], unlockLevel: 0, kind: "attack", power: 2.16, cooldown: 8, priority: 12, equipmentOnly: true },
];

export const SKILLS: SkillDefinition[] = [
  ...sharedSkills,
  ...Object.entries(classSkills).flatMap(([classId, skills]) => skills.map(([id, name, unlockLevel, kind, power, cooldown], index) => ({
    id,
    name,
    description: kind === "attack" ? "Автоматически применяется для усиленной атаки."
      : kind === "heal" ? "Автоматически применяется при снижении здоровья."
        : kind === "buff" ? "Усиливает следующую атаку."
          : "Ослабляет следующую атаку противника.",
    classes: [classId as HeroClass], unlockLevel, kind, power, cooldown, priority: 7 + index,
  }))),
  ...EQUIPMENT_SKILLS,
];

const ARENA_DEFINITIONS: ArenaDefinition[] = [
  { id: "yard", kind: "arena", name: "Кубок Нижнего города", place: "Двор новичков", description: "Нелетальная сетка для тех, кто только ищет имя.", minLevel: 1, enemyLevel: [1, 4], winsToAdvance: 2, rewardGold: 150, rewardExperience: 170, lethalChance: 0, tournamentInterval: 2, participants: 8, prestige: "local", accent: "#718c64" },
  { id: "quarry", kind: "arena", name: "Каменный кубок", place: "Старая каменоломня", description: "Региональный турнир, где поражение иногда становится последним.", minLevel: 3, enemyLevel: [3, 7], winsToAdvance: 3, rewardGold: 320, rewardExperience: 310, lethalChance: 0.05, tournamentInterval: 3, participants: 8, prestige: "regional", accent: "#9a7655" },
  { id: "harbor", kind: "arena", name: "Турнир Медного причала", place: "Туманный порт", description: "Шестнадцать наёмников, дуэлянтов и беглых капитанов.", minLevel: 6, enemyLevel: [6, 11], winsToAdvance: 3, rewardGold: 620, rewardExperience: 540, lethalChance: 0.08, tournamentInterval: 4, participants: 16, prestige: "regional", accent: "#527a7b" },
  { id: "red-hall", kind: "arena", name: "Игры Красного зала", place: "Крепость наместника", description: "Большое событие: шестнадцать бойцов и титул наместника.", minLevel: 10, enemyLevel: [10, 16], winsToAdvance: 4, rewardGold: 1050, rewardExperience: 850, lethalChance: 0.12, tournamentInterval: 6, participants: 16, prestige: "grand", accent: "#9c5044" },
  { id: "glass", kind: "arena", name: "Стеклянный гран-при", place: "Верхний город", description: "Редкий турнир на тридцать два переживших десятки боёв имени.", minLevel: 15, enemyLevel: [15, 23], winsToAdvance: 4, rewardGold: 1900, rewardExperience: 1450, lethalChance: 0.16, tournamentInterval: 9, participants: 32, prestige: "grand", accent: "#756b9a" },
  { id: "crown", kind: "arena", name: "Королевский турнир", place: "Сердце столицы", description: "Главное событие мира: тридцать два сильнейших и одна Корона.", minLevel: 22, enemyLevel: [22, 35], winsToAdvance: 5, rewardGold: 4200, rewardExperience: 2900, lethalChance: 0.2, tournamentInterval: 14, participants: 32, prestige: "royal", accent: "#b68a35" },
];

export const ARENAS: TournamentArena[] = ARENA_DEFINITIONS.map((definition) => new TournamentArena(definition));

export const DUNGEONS: DungeonDefinition[] = [
  { id: "cellar", kind: "dungeon", name: "Затопленный подвал", place: "За трактиром", description: "Короткая вылазка за монетами и простым снаряжением.", minLevel: 2, requiredArena: 0, requiredWorldDay: 2, enemyLevel: [2, 5], rewardGold: 80, rewardExperience: 70, minimumRarity: "common", cooldownDays: 2, accent: "#567c73" },
  { id: "catacombs", kind: "dungeon", name: "Катакомбы звонаря", place: "Старое кладбище", description: "Редкие вещи остаются у тех, кто не вернулся наверх.", minLevel: 5, requiredArena: 1, requiredWorldDay: 7, enemyLevel: [5, 9], rewardGold: 145, rewardExperience: 125, minimumRarity: "rare", cooldownDays: 3, accent: "#6d6959" },
  { id: "forge", kind: "dungeon", name: "Погасшая кузня", place: "Чёрный хребет", description: "Механизмы кузни охраняют оружие прежних мастеров.", minLevel: 9, requiredArena: 2, requiredWorldDay: 15, enemyLevel: [9, 15], rewardGold: 245, rewardExperience: 210, minimumRarity: "rare", cooldownDays: 4, accent: "#9b573f" },
  { id: "archive", kind: "dungeon", name: "Архив без имён", place: "Под башней магов", description: "Эпические реликвии меняют правила боя владельца.", minLevel: 14, requiredArena: 3, requiredWorldDay: 28, enemyLevel: [14, 22], rewardGold: 390, rewardExperience: 330, minimumRarity: "epic", cooldownDays: 5, accent: "#625d91" },
  { id: "vault", kind: "dungeon", name: "Хранилище первого короля", place: "За Северными воротами", description: "Источник легендарных и мифических предметов.", minLevel: 21, requiredArena: 4, requiredWorldDay: 45, enemyLevel: [21, 34], rewardGold: 680, rewardExperience: 520, minimumRarity: "legendary", cooldownDays: 7, accent: "#b38b38" },
];

export const DUEL_TIERS: DuelDefinition[] = [
  { id: "sparring", kind: "duel", name: "Вольный спарринг", place: "Двор оружейников", description: "Нелетальный бой с соперником близкой силы. Основной способ набрать опыт дуэлянта.", minLevel: 1, requiredDuelWins: 0, requiredArena: 0, enemyLevelOffset: [-1, 1], rewardGold: 55, rewardExperience: 70, accent: "#718c64" },
  { id: "licensed", kind: "duel", name: "Лицензированная дуэль", place: "Дом секундантов", description: "Более опытные противники, лучшие выплаты и строгий подбор по снаряжению.", minLevel: 6, requiredDuelWins: 8, requiredArena: 1, enemyLevelOffset: [0, 2], rewardGold: 150, rewardExperience: 155, accent: "#9a7655" },
  { id: "master", kind: "duel", name: "Круг мастеров", place: "Закрытый фехтовальный зал", description: "Сильные дуэлянты с редкой экипировкой и полным набором классовых навыков.", minLevel: 12, requiredDuelWins: 24, requiredArena: 3, enemyLevelOffset: [1, 4], rewardGold: 360, rewardExperience: 330, accent: "#756b9a" },
  { id: "black-seal", kind: "duel", name: "Чёрная печать", place: "Зал без зрителей", description: "Предельные постоянные дуэли против бойцов королевского уровня.", minLevel: 20, requiredDuelWins: 55, requiredArena: 4, enemyLevelOffset: [3, 7], rewardGold: 820, rewardExperience: 680, accent: "#9c5044" },
];

const heroClasses = Object.keys(CLASS_DEFINITIONS) as HeroClass[];
const bossLootIds = (bossId: string): Record<HeroClass, string> => Object.fromEntries(
  heroClasses.map((classId) => [classId, `boss-${bossId}-${classId.toLowerCase()}-weapon`]),
) as Record<HeroClass, string>;

export const DUEL_BOSSES: BossDefinition[] = [
  { id: "iron-widow", kind: "boss", name: "Железная вдова", place: "Заброшенная часовня", description: "Рыцарь, который не снимает траурные латы. Побеждается один раз.", classId: "Knight", level: 9, requiredLevel: 7, requiredDuelWins: 10, requiredArena: 1, requiredDungeon: "catacombs", rewardGold: 900, rewardExperience: 720, lootTemplateIds: bossLootIds("iron-widow"), accent: "#58636b" },
  { id: "red-abbot", kind: "boss", name: "Красный настоятель", place: "Колокольня без языка", description: "Мастер рукопашного боя, открывающий поединок серией тяжёлых ударов.", classId: "Monk", level: 15, requiredLevel: 12, requiredDuelWins: 25, requiredArena: 2, requiredBoss: "iron-widow", rewardGold: 2100, rewardExperience: 1500, lootTemplateIds: bossLootIds("red-abbot"), accent: "#934c43" },
  { id: "clockmaker", kind: "boss", name: "Слепой часовщик", place: "Мастерская тринадцатого часа", description: "Оружейник, чьи выстрелы следуют друг за другом без видимой задержки.", classId: "Gunsmith", level: 22, requiredLevel: 18, requiredDuelWins: 45, requiredArena: 3, requiredDungeon: "archive", requiredBoss: "red-abbot", rewardGold: 4800, rewardExperience: 2800, lootTemplateIds: bossLootIds("clockmaker"), accent: "#846b3e" },
  { id: "nameless-duke", kind: "boss", name: "Безымянный герцог", place: "Чёрный балкон дворца", description: "Последний частный поединок мира. Его клинок не встречается ни в одном другом источнике.", classId: "Swordsman", level: 34, requiredLevel: 27, requiredDuelWins: 80, requiredArena: 5, requiredDungeon: "vault", requiredBoss: "clockmaker", rewardGold: 12000, rewardExperience: 6200, lootTemplateIds: bossLootIds("nameless-duke"), accent: "#4f485d" },
];

export const ENDGAME_ACTIVITIES: EndgameActivityDefinition[] = [
  {
    id: "crown-league", kind: "endgame", name: "Лига короны", place: "Зал семи знамён",
    description: "Рейтинговые поединки с сильнейшими живыми бойцами. Победы приносят очки лиги и постепенно укрепляют место в мировом топе.",
    rewardGold: 8200, rewardExperience: 4200, accent: "#8c6d2f",
  },
  {
    id: "legend-hunt", kind: "endgame", name: "Охота на легенд", place: "Дорога без гербов",
    description: "Редкий вызов одному из лучших бойцов мира. Каждая легенда засчитывается только один раз и оставляет высокоуровневую добычу.",
    rewardGold: 14000, rewardExperience: 6800, accent: "#713f4a",
  },
];

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
export const RARITY_LABELS: Record<Rarity, string> = { common: "Обычное", rare: "Редкое", epic: "Эпическое", legendary: "Легендарное", mythic: "Мифическое" };
export const SLOT_LABELS: Record<EquipmentSlot, string> = { weapon: "Оружие", offhand: "Вторая рука", head: "Голова", chest: "Корпус", hands: "Руки", feet: "Обувь" };

const additionalSetSpecs: Array<{
  id: string; name: string; description: string; purpose: string; classes: HeroClass[] | "all";
  pieceNames: Record<EquipmentSlot, string>; stats: [keyof Stats, keyof Stats, keyof Stats];
  bonuses?: EquipmentSetDefinition["bonuses"];
}> = [
  { id: "pilgrim", name: "Железный паломник", description: "Универсальный дорожный доспех.", purpose: "Ровно усиливает здоровье и защиту для прохождения длинных данжей.", classes: "all", stats: ["health", "defense", "attack"], pieceNames: { weapon: "Оружие паломника", offhand: "Дорожный оберег", head: "Шлем паломника", chest: "Железная кираса", hands: "Рукавицы пути", feet: "Сапоги пути" } },
  { id: "ash-hunter", name: "Охотник из пепла", description: "Лёгкий комплект выжившего.", purpose: "Скорость и критический шанс для любого героя, который предпочитает короткие бои.", classes: "all", stats: ["speed", "crit", "attack"], pieceNames: { weapon: "Пепельное оружие", offhand: "Сумка охотника", head: "Пепельная маска", chest: "Плащ выжившего", hands: "Серые перчатки", feet: "Мягкие сапоги" } },
  { id: "argent", name: "Серебряный орден", description: "Парадный комплект рыцарского ордена.", purpose: "Баланс защиты и атаки для регулярных турнирных сеток.", classes: ["Knight"], stats: ["defense", "attack", "health"], pieceNames: { weapon: "Серебряный меч", offhand: "Щит ордена", head: "Шлем с белым плюмажем", chest: "Кираса ордена", hands: "Серебряные латы", feet: "Поножи ордена" } },
  { id: "sun-guard", name: "Солнечная стража", description: "Легендарное облачение дворцовой стражи.", purpose: "Максимальная живучесть для поздних королевских турниров.", classes: ["Knight"], stats: ["health", "defense", "crit"], pieceNames: { weapon: "Клинок рассвета", offhand: "Солнечный щит", head: "Коронованный шлем", chest: "Золотая кираса", hands: "Ладони рассвета", feet: "Солнечные сабатоны" } },
  { id: "moth", name: "Крыло ночной моли", description: "Беззвучный комплект ночного стрелка.", purpose: "Критический шанс и скорость для частых точных выстрелов.", classes: ["Archer"], stats: ["crit", "speed", "attack"], pieceNames: { weapon: "Лук ночной моли", offhand: "Чёрный колчан", head: "Маска моли", chest: "Крылатый плащ", hands: "Перчатки тетивы", feet: "Бесшумные сапоги" } },
  { id: "thorn", name: "Терновая тропа", description: "Комплект лесного охотника.", purpose: "Сочетает атаку и выживаемость для длинных серий боёв.", classes: ["Archer"], stats: ["attack", "health", "speed"], pieceNames: { weapon: "Терновый лук", offhand: "Колчан из лозы", head: "Венок охотника", chest: "Кожаный камзол", hands: "Терновые наручи", feet: "Сапоги следопыта" } },
  { id: "comet", name: "Чёрная комета", description: "Одеяние разрушительной школы магии.", purpose: "Максимизирует урон и критические заклинания ценой защиты.", classes: ["Wizard"], stats: ["attack", "crit", "speed"], pieceNames: { weapon: "Посох кометы", offhand: "Чёрная звезда", head: "Венец кометы", chest: "Мантия пустоты", hands: "Перчатки затмения", feet: "Шаги пустоты" } },
  { id: "oracle", name: "Заводной оракул", description: "Реликвии школы времени.", purpose: "Скорость и здоровье для более частого применения навыков.", classes: ["Wizard"], stats: ["speed", "health", "attack"], pieceNames: { weapon: "Жезл часовой стрелки", offhand: "Малый хронометр", head: "Линзы оракула", chest: "Мантия механизма", hands: "Часовые перчатки", feet: "Сапоги секундной стрелки" } },
  { id: "stone-bell", name: "Каменный колокол", description: "Тяжёлые реликвии горного монастыря.", purpose: "Защита и здоровье для устойчивого рукопашного комбо.", classes: ["Monk"], stats: ["defense", "health", "attack"], pieceNames: { weapon: "Каменные бинты", offhand: "Малый колокол", head: "Обруч послушника", chest: "Тяжёлое одеяние", hands: "Каменные накладки", feet: "Горные сандалии" } },
  { id: "lotus", name: "Красный лотос", description: "Ритуальный комплект мастера ударов.", purpose: "Скорость и критические удары для быстрого набора комбо.", classes: ["Monk"], stats: ["speed", "crit", "attack"], pieceNames: { weapon: "Бинты красного лотоса", offhand: "Печать лотоса", head: "Красная повязка", chest: "Одеяние мастера", hands: "Ладони лотоса", feet: "Лёгкие сандалии" } },
  { id: "brass-storm", name: "Латунная буря", description: "Турнирное снаряжение оружейника.", purpose: "Чистая атака и критический шанс для серии двойных выстрелов.", classes: ["Gunsmith"], stats: ["attack", "crit", "speed"], pieceNames: { weapon: "Латунный гром", offhand: "Латунная молния", head: "Очки наводчика", chest: "Китель стрелка", hands: "Перчатки затвора", feet: "Сапоги дуэлянта" } },
  { id: "silent-machine", name: "Тихий механизм", description: "Экспериментальный комплект тайной мастерской.", purpose: "Скорость, защита и стабильность в длинных турнирных сетках.", classes: ["Gunsmith"], stats: ["speed", "defense", "health"], pieceNames: { weapon: "Тихий пистолет", offhand: "Глухой пистолет", head: "Маска механизма", chest: "Бронеплащ", hands: "Точные перчатки", feet: "Шаги механизма" } },
  { id: "moon-scar", name: "Лунный шрам", description: "Парные клинки и доспех ночного дуэлянта.", purpose: "Критический шанс и атака для рискованного боя на низком здоровье.", classes: ["Swordsman"], stats: ["crit", "attack", "speed"], pieceNames: { weapon: "Первый лунный клинок", offhand: "Второй лунный клинок", head: "Маска полумесяца", chest: "Куртка ночи", hands: "Лунные хваты", feet: "Сапоги ночи" } },
  { id: "ronin", name: "Клятва ронина", description: "Сдержанный комплект одинокого мастера.", purpose: "Выживаемость без отказа от силы парных атак.", classes: ["Swordsman"], stats: ["health", "attack", "defense"], pieceNames: { weapon: "Клинок первой клятвы", offhand: "Клинок второй клятвы", head: "Соломенная шляпа", chest: "Дорожное хаори", hands: "Обмотки ронина", feet: "Сандалии странника" } },
  {
    id: "verdigris", name: "Медная цитадель", description: "Морской латный доспех, покрытый благородной патиной.",
    purpose: "Даёт рыцарю запас здоровья и защиту, сохраняя силу ответного удара.", classes: ["Knight"], stats: ["defense", "health", "attack"],
    pieceNames: { weapon: "Клинок зелёной патины", offhand: "Башенный щит прилива", head: "Шлем медного дозора", chest: "Кираса морской цитадели", hands: "Рукавицы прибоя", feet: "Сабатоны якорной цепи" },
    bonuses: [
      { pieces: 2, description: "Стойкость патины: +5 к защите", stats: { defense: 5 } },
      { pieces: 4, description: "Сердце цитадели: +28 к здоровью", stats: { health: 28 } },
      { pieces: 6, description: "Медный таран: +8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "kingfisher", name: "Перья зимородка", description: "Яркое снаряжение речного стрелка, неуловимого у самой воды.",
    purpose: "Соединяет скорость, точность и силу выстрела для стремительных побед.", classes: ["Archer"], stats: ["speed", "crit", "attack"],
    pieceNames: { weapon: "Лук синего крыла", offhand: "Колчан кораллового пера", head: "Капюшон зимородка", chest: "Жилет речного стрелка", hands: "Наручи быстрого нырка", feet: "Сапоги над водой" },
    bonuses: [
      { pieces: 2, description: "Лёгкое перо: +5 к скорости", stats: { speed: 5 } },
      { pieces: 4, description: "Зоркий нырок: +7 п.п. к критическому шансу", stats: { crit: 7 } },
      { pieces: 6, description: "Речной удар: +8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "prism", name: "Призматический синод", description: "Одеяние школы, преломляющей в заклинаниях весь видимый спектр.",
    purpose: "Укрепляет мага, а затем усиливает точность и мощь боевых заклинаний.", classes: ["Wizard"], stats: ["defense", "crit", "attack"],
    pieceNames: { weapon: "Посох семи граней", offhand: "Призма тихого света", head: "Диадема спектра", chest: "Мантия преломления", hands: "Перчатки хроматурга", feet: "Сапоги световой дуги" },
    bonuses: [
      { pieces: 2, description: "Гранёная защита: +4 к защите", stats: { defense: 4 } },
      { pieces: 4, description: "Фокус спектра: +7 п.п. к критическому шансу", stats: { crit: 7 } },
      { pieces: 6, description: "Полный спектр: +8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "saffron", name: "Шафрановое безмолвие", description: "Церемониальное облачение пустынного монастыря.",
    purpose: "Поддерживает длинное комбо запасом здоровья, скоростью и выдержкой.", classes: ["Monk"], stats: ["health", "speed", "defense"],
    pieceNames: { weapon: "Шафрановые бинты", offhand: "Чётки безмолвия", head: "Повязка полуденного солнца", chest: "Касая тишины", hands: "Накладки тёплого песка", feet: "Сандалии тихого шага" },
    bonuses: [
      { pieces: 2, description: "Дыхание пустыни: +20 к здоровью", stats: { health: 20 } },
      { pieces: 4, description: "Тихий шаг: +6 к скорости", stats: { speed: 6 } },
      { pieces: 6, description: "Неподвижный полдень: +8 к защите", stats: { defense: 8 } },
    ],
  },
  {
    id: "cobalt", name: "Кобальтовая искра", description: "Экспериментальный комплект с яркими теплоотводами и холодными стволами.",
    purpose: "Усиливает оба выстрела и помогает оружейнику выдержать ответную атаку.", classes: ["Gunsmith"], stats: ["attack", "defense", "crit"],
    pieceNames: { weapon: "Кобальтовый гром", offhand: "Оранжевая вспышка", head: "Монокль холодной искры", chest: "Куртка синего мастера", hands: "Перчатки точного разряда", feet: "Сапоги изолятора" },
    bonuses: [
      { pieces: 2, description: "Холодный ствол: +5 к атаке", stats: { attack: 5 } },
      { pieces: 4, description: "Корпус изолятора: +6 к защите", stats: { defense: 6 } },
      { pieces: 6, description: "Синхронная искра: +8 п.п. к критическому шансу", stats: { crit: 8 } },
    ],
  },
  {
    id: "jade-viper", name: "Нефритовая гадюка", description: "Парные церемониальные клинки южной школы дуэлянтов.",
    purpose: "Разгоняет темп двух клинков и превращает серию в точный завершающий выпад.", classes: ["Swordsman"], stats: ["speed", "attack", "crit"],
    pieceNames: { weapon: "Правый клык гадюки", offhand: "Левый клык гадюки", head: "Маска нефритовой чешуи", chest: "Куртка орхидейного яда", hands: "Хваты змеиного кольца", feet: "Сапоги скользящего шага" },
    bonuses: [
      { pieces: 2, description: "Скользящий шаг: +5 к скорости", stats: { speed: 5 } },
      { pieces: 4, description: "Двойной укус: +7 к атаке", stats: { attack: 7 } },
      { pieces: 6, description: "Ядовитый ритм: +8 п.п. к критическому шансу", stats: { crit: 8 } },
    ],
  },
  {
    id: "blood-regent", name: "Багряный регент", description: "Тяжёлое бронепальто дворцового наместника.",
    purpose: "Усиливает защиту, атаку и запас здоровья для уверенного продвижения по турнирной сетке.", classes: ["Knight"], stats: ["defense", "attack", "health"],
    pieceNames: { weapon: "Клинок последнего указа", offhand: "Щит алой печати", head: "Шлем наместника", chest: "Бронепальто регента", hands: "Рукавицы красного караула", feet: "Сапоги тяжёлой процессии" },
    bonuses: [
      { pieces: 2, description: "+5 к защите", stats: { defense: 5 } },
      { pieces: 4, description: "+7 к атаке", stats: { attack: 7 } },
      { pieces: 6, description: "+38 к здоровью", stats: { health: 38 } },
    ],
  },
  {
    id: "north-ranger", name: "Северный егерь", description: "Дорожный комплект разведчика ледяных трактов.",
    purpose: "Сочетает быстрый шаг, выносливость и точность для долгой охоты вдали от лагеря.", classes: ["Archer"], stats: ["speed", "health", "crit"],
    pieceNames: { weapon: "Лук ледяного тиса", offhand: "Колчан северной просеки", head: "Капюшон егеря", chest: "Пальто ледяного тракта", hands: "Перчатки белой тетивы", feet: "Сапоги по насту" },
    bonuses: [
      { pieces: 2, description: "+5 к скорости", stats: { speed: 5 } },
      { pieces: 4, description: "+28 к здоровью", stats: { health: 28 } },
      { pieces: 6, description: "+8 п.п. к критическому шансу", stats: { crit: 8 } },
    ],
  },
  {
    id: "ink-marshal", name: "Чернильный маршал", description: "Длинный офицерский комплект штабного стрелка.",
    purpose: "Повышает мощь и точность двойного выстрела, добавляя защиту для ответного огня.", classes: ["Gunsmith"], stats: ["attack", "crit", "defense"],
    pieceNames: { weapon: "Пистолет первой команды", offhand: "Пистолет последнего слова", head: "Монокль штабного стрелка", chest: "Двубортный китель маршала", hands: "Перчатки порохового протокола", feet: "Сапоги строевого шага" },
    bonuses: [
      { pieces: 2, description: "+5 к атаке", stats: { attack: 5 } },
      { pieces: 4, description: "+7 п.п. к критическому шансу", stats: { crit: 7 } },
      { pieces: 6, description: "+8 к защите", stats: { defense: 8 } },
    ],
  },
  {
    id: "white-squall", name: "Белый шквал", description: "Асимметричный дорожный комплект прибрежного дуэлянта.",
    purpose: "Ускоряет парные клинки и укрепляет мечника перед завершающим встречным выпадом.", classes: ["Swordsman"], stats: ["speed", "defense", "attack"],
    pieceNames: { weapon: "Клинок встречной волны", offhand: "Клинок обратного течения", head: "Полумаска белого шквала", chest: "Пальто разбитого прибоя", hands: "Хваты солёной стали", feet: "Сапоги мокрого камня" },
    bonuses: [
      { pieces: 2, description: "+5 к скорости", stats: { speed: 5 } },
      { pieces: 4, description: "+6 к защите", stats: { defense: 6 } },
      { pieces: 6, description: "+8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "free-company", name: "Вольная рота", description: "Практичное снаряжение наёмников, открытое любому классу.",
    purpose: "Универсальный запас здоровья, защиты и скорости без привязки к одной школе боя.", classes: "all", stats: ["health", "defense", "speed"],
    pieceNames: { weapon: "Оружие вольной роты", offhand: "Знак свободного контракта", head: "Капюшон наёмника", chest: "Пальто вольной роты", hands: "Перчатки походного расчёта", feet: "Сапоги долгого марша" },
    bonuses: [
      { pieces: 2, description: "+22 к здоровью", stats: { health: 22 } },
      { pieces: 4, description: "+6 к защите", stats: { defense: 6 } },
      { pieces: 6, description: "+7 к скорости", stats: { speed: 7 } },
    ],
  },
  {
    id: "storm-courier", name: "Грозовой курьер", description: "Лёгкий комплект стрелков, доставляющих приказы сквозь линию боя.",
    purpose: "Для лучников и оружейников: скорость, точность и сила дальней атаки.", classes: ["Archer", "Gunsmith"], stats: ["speed", "crit", "attack"],
    pieceNames: { weapon: "Дальнобой курьера", offhand: "Запас грозового гонца", head: "Капюшон синего фронта", chest: "Накидка грозового курьера", hands: "Перчатки молниеносной перезарядки", feet: "Сапоги вестового" },
    bonuses: [
      { pieces: 2, description: "+5 к скорости", stats: { speed: 5 } },
      { pieces: 4, description: "+7 п.п. к критическому шансу", stats: { crit: 7 } },
      { pieces: 6, description: "+8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "duelist-oath", name: "Клятва дуэлянта", description: "Парадный набор мастеров клинка и турнирных рыцарей.",
    purpose: "Сочетает атаку с защитой для мечника или рыцаря.", classes: ["Knight", "Swordsman"], stats: ["attack", "defense", "crit"],
    pieceNames: { weapon: "Клинок открытого вызова", offhand: "Сталь второй клятвы", head: "Полумаска секунданта", chest: "Колет дуэльной палаты", hands: "Перчатки белой ленты", feet: "Сапоги первого шага" },
    bonuses: [
      { pieces: 2, description: "+6 к атаке", stats: { attack: 6 } },
      { pieces: 4, description: "+6 к защите", stats: { defense: 6 } },
      { pieces: 6, description: "+8 п.п. к критическому шансу", stats: { crit: 8 } },
    ],
  },
  {
    id: "quiet-scholar", name: "Тихий схоласт", description: "Старинное облачение учёных монастырской библиотеки.",
    purpose: "Для мага и монаха: здоровье, скорость и сила навыков.", classes: ["Wizard", "Monk"], stats: ["health", "speed", "attack"],
    pieceNames: { weapon: "Орудие полевого трактата", offhand: "Печать тихой главы", head: "Капюшон схоласта", chest: "Мантия закрытой библиотеки", hands: "Перчатки хранителя полей", feet: "Обувь бесшумного зала" },
    bonuses: [
      { pieces: 2, description: "+24 к здоровью", stats: { health: 24 } },
      { pieces: 4, description: "+6 к скорости", stats: { speed: 6 } },
      { pieces: 6, description: "+8 к атаке", stats: { attack: 8 } },
    ],
  },
  {
    id: "border-watch", name: "Пограничная стража", description: "Слоистая броня северных застав для стрелков и бойцов строя.",
    purpose: "Укрепляет выживаемость рыцаря, лучника или оружейника.", classes: ["Knight", "Archer", "Gunsmith"], stats: ["defense", "health", "crit"],
    pieceNames: { weapon: "Оружие дальней заставы", offhand: "Дозорный комплект", head: "Шлем пограничника", chest: "Бригантина северной стены", hands: "Рукавицы ночного караула", feet: "Сапоги дозорной тропы" },
    bonuses: [
      { pieces: 2, description: "+5 к защите", stats: { defense: 5 } },
      { pieces: 4, description: "+30 к здоровью", stats: { health: 30 } },
      { pieces: 6, description: "+7 п.п. к критическому шансу", stats: { crit: 7 } },
    ],
  },
  {
    id: "ashen-circuit", name: "Пепельный контур", description: "Тёмный ремесленный комплект экспериментаторов поздних арен.",
    purpose: "Атака, скорость и защита для мага, оружейника или мечника.", classes: ["Wizard", "Gunsmith", "Swordsman"], stats: ["attack", "speed", "defense"],
    pieceNames: { weapon: "Оружие замкнутого контура", offhand: "Второй узел цепи", head: "Маска пепельной схемы", chest: "Куртка угольного контура", hands: "Контактные перчатки", feet: "Сапоги заземления" },
    bonuses: [
      { pieces: 2, description: "+6 к атаке", stats: { attack: 6 } },
      { pieces: 4, description: "+6 к скорости", stats: { speed: 6 } },
      { pieces: 6, description: "+8 к защите", stats: { defense: 8 } },
    ],
  },
];

const additionalItemTemplates: ItemTemplate[] = additionalSetSpecs.flatMap((set) =>
  (Object.keys(set.pieceNames) as EquipmentSlot[]).map((slot, index) => ({
    id: `${set.id}-${slot}`, name: set.pieceNames[slot], slot, allowedClasses: set.classes,
    primaryStat: set.stats[index % set.stats.length], setId: set.id,
  })),
);

const classWeaponNames: Record<HeroClass, string> = {
  Knight: "клинок", Archer: "лук", Wizard: "посох", Monk: "боевые печати", Gunsmith: "пистолет", Swordsman: "парный клинок",
};
const bossClassLootTemplates: ItemTemplate[] = DUEL_BOSSES.flatMap((boss) => heroClasses.map((classId) => ({
  id: boss.lootTemplateIds[classId],
  name: `${classWeaponNames[classId]} · ${boss.name}`,
  slot: "weapon" as const,
  allowedClasses: [classId],
  primaryStat: "attack" as const,
  exclusiveToBoss: boss.id,
})));

export const ITEM_TEMPLATES: ItemTemplate[] = [
  ...bossClassLootTemplates,
  { id: "boss-widow-mantle", name: "Траурная бронемантия", slot: "chest", allowedClasses: "all", primaryStat: "health", exclusiveToBoss: "iron-widow" },
  { id: "boss-abbot-gauntlets", name: "Ладони немого колокола", slot: "hands", allowedClasses: "all", primaryStat: "attack", exclusiveToBoss: "red-abbot" },
  { id: "boss-clockmaker-eye", name: "Око тринадцатого часа", slot: "head", allowedClasses: "all", primaryStat: "crit", exclusiveToBoss: "clockmaker" },
  { id: "boss-duke-blade", name: "Клинок утраченного имени", slot: "weapon", allowedClasses: ["Knight", "Swordsman"], primaryStat: "attack", exclusiveToBoss: "nameless-duke" },
  { id: "wanderer-blade", name: "Клинок странника", slot: "weapon", allowedClasses: ["Knight", "Swordsman"], primaryStat: "attack", setId: "wanderer" },
  { id: "wanderer-guard", name: "Наруч странника", slot: "offhand", allowedClasses: ["Knight", "Swordsman"], primaryStat: "defense", setId: "wanderer" },
  { id: "wanderer-coat", name: "Куртка странника", slot: "chest", allowedClasses: "all", primaryStat: "health", setId: "wanderer" },
  { id: "wanderer-gloves", name: "Перчатки странника", slot: "hands", allowedClasses: "all", primaryStat: "attack", setId: "wanderer" },
  { id: "wanderer-boots", name: "Сапоги странника", slot: "feet", allowedClasses: "all", primaryStat: "speed", setId: "wanderer" },
  { id: "wanderer-hood", name: "Капюшон странника", slot: "head", allowedClasses: "all", primaryStat: "crit", setId: "wanderer" },

  { id: "bastion-sword", name: "Меч бастиона", slot: "weapon", allowedClasses: ["Knight"], primaryStat: "attack", setId: "bastion" },
  { id: "bastion-shield", name: "Щит бастиона", slot: "offhand", allowedClasses: ["Knight"], primaryStat: "defense", setId: "bastion" },
  { id: "bastion-helm", name: "Шлем бастиона", slot: "head", allowedClasses: ["Knight"], primaryStat: "defense", setId: "bastion" },
  { id: "bastion-plate", name: "Латы бастиона", slot: "chest", allowedClasses: ["Knight"], primaryStat: "health", setId: "bastion" },
  { id: "bastion-gauntlets", name: "Латные перчатки", slot: "hands", allowedClasses: ["Knight"], primaryStat: "defense", setId: "bastion" },
  { id: "bastion-greaves", name: "Поножи бастиона", slot: "feet", allowedClasses: ["Knight"], primaryStat: "health", setId: "bastion" },

  { id: "wind-bow", name: "Лук встречного ветра", slot: "weapon", allowedClasses: ["Archer"], primaryStat: "attack", setId: "wind" },
  { id: "wind-quiver", name: "Колчан встречного ветра", slot: "offhand", allowedClasses: ["Archer"], primaryStat: "crit", setId: "wind" },
  { id: "wind-mask", name: "Маска встречного ветра", slot: "head", allowedClasses: ["Archer"], primaryStat: "crit", setId: "wind" },
  { id: "wind-vest", name: "Жилет встречного ветра", slot: "chest", allowedClasses: ["Archer"], primaryStat: "speed", setId: "wind" },
  { id: "wind-bracers", name: "Наручи встречного ветра", slot: "hands", allowedClasses: ["Archer"], primaryStat: "attack", setId: "wind" },
  { id: "wind-boots", name: "Следопытские сапоги", slot: "feet", allowedClasses: ["Archer"], primaryStat: "speed", setId: "wind" },

  { id: "astral-staff", name: "Астральный посох", slot: "weapon", allowedClasses: ["Wizard"], primaryStat: "attack", setId: "astral" },
  { id: "astral-orb", name: "Астральная сфера", slot: "offhand", allowedClasses: ["Wizard"], primaryStat: "crit", setId: "astral" },
  { id: "astral-circlet", name: "Астральный венец", slot: "head", allowedClasses: ["Wizard"], primaryStat: "crit", setId: "astral" },
  { id: "astral-robe", name: "Астральная мантия", slot: "chest", allowedClasses: ["Wizard"], primaryStat: "health", setId: "astral" },
  { id: "astral-gloves", name: "Перчатки звездочёта", slot: "hands", allowedClasses: ["Wizard"], primaryStat: "attack", setId: "astral" },
  { id: "astral-shoes", name: "Туфли звездочёта", slot: "feet", allowedClasses: ["Wizard"], primaryStat: "speed", setId: "astral" },

  { id: "crane-wraps", name: "Бинты белого журавля", slot: "weapon", allowedClasses: ["Monk"], primaryStat: "attack", setId: "crane" },
  { id: "crane-beads", name: "Чётки белого журавля", slot: "offhand", allowedClasses: ["Monk"], primaryStat: "defense", setId: "crane" },
  { id: "crane-band", name: "Повязка белого журавля", slot: "head", allowedClasses: ["Monk"], primaryStat: "crit", setId: "crane" },
  { id: "crane-robe", name: "Одеяние белого журавля", slot: "chest", allowedClasses: ["Monk"], primaryStat: "health", setId: "crane" },
  { id: "crane-braces", name: "Накладки белого журавля", slot: "hands", allowedClasses: ["Monk"], primaryStat: "attack", setId: "crane" },
  { id: "crane-sandals", name: "Сандалии белого журавля", slot: "feet", allowedClasses: ["Monk"], primaryStat: "speed", setId: "crane" },

  { id: "powder-left", name: "Левый пистолет мастера", slot: "weapon", allowedClasses: ["Gunsmith"], primaryStat: "attack", setId: "powder" },
  { id: "powder-right", name: "Правый пистолет мастера", slot: "offhand", allowedClasses: ["Gunsmith"], primaryStat: "attack", setId: "powder" },
  { id: "powder-goggles", name: "Пороховые очки", slot: "head", allowedClasses: ["Gunsmith"], primaryStat: "crit", setId: "powder" },
  { id: "powder-coat", name: "Пороховой плащ", slot: "chest", allowedClasses: ["Gunsmith"], primaryStat: "defense", setId: "powder" },
  { id: "powder-gloves", name: "Перчатки механика", slot: "hands", allowedClasses: ["Gunsmith"], primaryStat: "attack", setId: "powder" },
  { id: "powder-boots", name: "Сапоги механика", slot: "feet", allowedClasses: ["Gunsmith"], primaryStat: "speed", setId: "powder" },

  { id: "dusk-main", name: "Клинок поздних сумерек", slot: "weapon", allowedClasses: ["Swordsman"], primaryStat: "attack", setId: "dusk" },
  { id: "dusk-second", name: "Клинок ранних сумерек", slot: "offhand", allowedClasses: ["Swordsman"], primaryStat: "attack", setId: "dusk" },
  { id: "dusk-mask", name: "Маска сумерек", slot: "head", allowedClasses: ["Swordsman"], primaryStat: "crit", setId: "dusk" },
  { id: "dusk-jacket", name: "Куртка сумерек", slot: "chest", allowedClasses: ["Swordsman"], primaryStat: "health", setId: "dusk" },
  { id: "dusk-grips", name: "Хваты сумерек", slot: "hands", allowedClasses: ["Swordsman"], primaryStat: "attack", setId: "dusk" },
  { id: "dusk-boots", name: "Сапоги сумерек", slot: "feet", allowedClasses: ["Swordsman"], primaryStat: "speed", setId: "dusk" },
  ...additionalItemTemplates,
];

export const EQUIPMENT_SETS: EquipmentSetDefinition[] = [
  { id: "wanderer", name: "Путь странника", description: "Универсальный комплект для первых арен.", purpose: "Закрывает слабые места любого класса и помогает понять, какие характеристики полезны герою.", classes: "all", pieces: ITEM_TEMPLATES.filter((item) => item.setId === "wanderer").map((item) => item.id), bonuses: [{ pieces: 2, description: "+8 к здоровью" }, { pieces: 4, description: "+3 к атаке и защите" }, { pieces: 6, description: "+5% к шансу критического удара" }] },
  { id: "bastion", name: "Последний бастион", description: "Тяжёлый рыцарский комплект.", purpose: "Для долгих боёв: здоровье, защита и усиление блока щитом.", classes: ["Knight"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "bastion").map((item) => item.id), bonuses: [{ pieces: 2, description: "+6 к защите" }, { pieces: 4, description: "Блок рыцаря усилен до 24%" }, { pieces: 6, description: "Первый смертельный удар оставляет 1 HP" }] },
  { id: "wind", name: "Встречный ветер", description: "Комплект быстрого лучника.", purpose: "Разгоняет скорость и критический шанс для частых усиленных выстрелов.", classes: ["Archer"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "wind").map((item) => item.id), bonuses: [{ pieces: 2, description: "+4 к скорости" }, { pieces: 4, description: "+8% к критическому шансу" }, { pieces: 6, description: "Усиленным становится каждый второй выстрел" }] },
  { id: "astral", name: "Астральный круг", description: "Комплект боевого мага.", purpose: "Повышает силу и частоту навыков, сохраняя магу здоровье.", classes: ["Wizard"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "astral").map((item) => item.id), bonuses: [{ pieces: 2, description: "+5 к атаке" }, { pieces: 4, description: "Лечение после навыка увеличено вдвое" }, { pieces: 6, description: "Перезарядка навыков сокращена на 1 ход" }] },
  { id: "crane", name: "Белый журавль", description: "Комплект мобильного монаха.", purpose: "Для уклонения, скорости и длинных серий рукопашных ударов.", classes: ["Monk"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "crane").map((item) => item.id), bonuses: [{ pieces: 2, description: "+5 к скорости" }, { pieces: 4, description: "+6% к уклонению" }, { pieces: 6, description: "Комбо не сбрасывается после промаха" }] },
  { id: "powder", name: "Пороховой расчёт", description: "Комплект оружейника.", purpose: "Усиливает обе пистоли и повышает эффективность критических выстрелов.", classes: ["Gunsmith"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "powder").map((item) => item.id), bonuses: [{ pieces: 2, description: "+5 к атаке" }, { pieces: 4, description: "Второй выстрел наносит 75% урона" }, { pieces: 6, description: "Критический первый выстрел делает второй критическим" }] },
  { id: "dusk", name: "Парные сумерки", description: "Комплект мечника с двумя клинками.", purpose: "Рискованный стиль через атаку и критический шанс при низком здоровье.", classes: ["Swordsman"], pieces: ITEM_TEMPLATES.filter((item) => item.setId === "dusk").map((item) => item.id), bonuses: [{ pieces: 2, description: "+6% к критическому шансу" }, { pieces: 4, description: "Второй удар активен при HP ниже 70%" }, { pieces: 6, description: "Критические удары восстанавливают 3% HP" }] },
  ...additionalSetSpecs.map((set) => ({
    id: set.id, name: set.name, description: set.description, purpose: set.purpose, classes: set.classes,
    pieces: ITEM_TEMPLATES.filter((item) => item.setId === set.id).map((item) => item.id),
    bonuses: set.bonuses ?? [
      { pieces: 2, description: `+${set.stats[0] === "health" ? 18 : 4} к ${set.stats[0]}`, stats: { [set.stats[0]]: set.stats[0] === "health" ? 18 : 4 } },
      { pieces: 4, description: `+${set.stats[1] === "health" ? 28 : 6} к ${set.stats[1]}`, stats: { [set.stats[1]]: set.stats[1] === "health" ? 28 : 6 } },
      { pieces: 6, description: `+${set.stats[2] === "health" ? 38 : 8} к ${set.stats[2]}`, stats: { [set.stats[2]]: set.stats[2] === "health" ? 38 : 8 } },
    ],
  })),
];

export function addStats(base: Stats, bonus: Partial<Stats>): Stats {
  return {
    health: base.health + (bonus.health ?? 0), attack: base.attack + (bonus.attack ?? 0),
    defense: base.defense + (bonus.defense ?? 0), speed: base.speed + (bonus.speed ?? 0),
    crit: base.crit + (bonus.crit ?? 0),
  };
}
