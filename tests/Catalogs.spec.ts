import { createSkill } from "../src/catalogs/SkillCatalog";
import { EQUIPMENT_SETS, ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createRandomWeapon, createWeapon } from "../src/catalogs/WeaponCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { EquipmentSlot, HeroClass, Stats } from "../src/gameplay/core/WorldTypes";

const NEW_CLASS_SETS: Record<string, HeroClass> = {
  verdigris: "Knight",
  kingfisher: "Archer",
  prism: "Wizard",
  saffron: "Monk",
  cobalt: "Gunsmith",
  "jade-viper": "Swordsman",
  "blood-regent": "Knight",
  "north-ranger": "Archer",
  "ink-marshal": "Gunsmith",
  "white-squall": "Swordsman",
};

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
const SHARED_SETS = [
  "free-company", "storm-courier", "duelist-oath", "quiet-scholar", "border-watch", "ashen-circuit",
  "marsh-lanterns", "ivory-choir", "coal-dragoons", "black-tide",
];

const NEW_LOOT_SETS: Record<string, HeroClass[] | "all"> = {
  "marsh-lanterns": "all",
  "ivory-choir": ["Wizard", "Monk"],
  "coal-dragoons": ["Knight", "Gunsmith", "Swordsman"],
  "black-tide": ["Archer", "Monk", "Swordsman"],
};

const AUDITED_COAT_SETS: Record<string, {
  name: string;
  pieceNames: string[];
  primaryStats: Array<keyof Stats>;
  bonuses: Array<{ pieces: number; stats: Partial<Stats> }>;
}> = {
  "blood-regent": {
    name: "Багряный регент",
    pieceNames: ["Клинок последнего указа", "Щит алой печати", "Шлем наместника", "Бронепальто регента", "Рукавицы красного караула", "Сапоги тяжёлой процессии"],
    primaryStats: ["defense", "attack", "health", "defense", "attack", "health"],
    bonuses: [{ pieces: 2, stats: { defense: 5 } }, { pieces: 4, stats: { attack: 7 } }, { pieces: 6, stats: { health: 38 } }],
  },
  "north-ranger": {
    name: "Северный егерь",
    pieceNames: ["Лук ледяного тиса", "Колчан северной просеки", "Капюшон егеря", "Пальто ледяного тракта", "Перчатки белой тетивы", "Сапоги по насту"],
    primaryStats: ["speed", "health", "crit", "speed", "health", "crit"],
    bonuses: [{ pieces: 2, stats: { speed: 5 } }, { pieces: 4, stats: { health: 28 } }, { pieces: 6, stats: { crit: 8 } }],
  },
  "ink-marshal": {
    name: "Чернильный маршал",
    pieceNames: ["Пистолет первой команды", "Пистолет последнего слова", "Монокль штабного стрелка", "Двубортный китель маршала", "Перчатки порохового протокола", "Сапоги строевого шага"],
    primaryStats: ["attack", "crit", "defense", "attack", "crit", "defense"],
    bonuses: [{ pieces: 2, stats: { attack: 5 } }, { pieces: 4, stats: { crit: 7 } }, { pieces: 6, stats: { defense: 8 } }],
  },
  "white-squall": {
    name: "Белый шквал",
    pieceNames: ["Клинок встречной волны", "Клинок обратного течения", "Полумаска белого шквала", "Пальто разбитого прибоя", "Хваты солёной стали", "Сапоги мокрого камня"],
    primaryStats: ["speed", "defense", "attack", "speed", "defense", "attack"],
    bonuses: [{ pieces: 2, stats: { speed: 5 } }, { pieces: 4, stats: { defense: 6 } }, { pieces: 6, stats: { attack: 8 } }],
  },
};

describe("Каталоги конфигурации", () => {
  it("не показывает внутренние английские ключи в бонусах комплектов", () => {
    EQUIPMENT_SETS.flatMap((set) => set.bonuses).forEach((bonus) => {
      expect(bonus.description).not.toMatch(/\b(?:health|attack|defense|speed|crit)\b/i);
    });
  });

  it("хранит числовые бонусы базовых комплектов в каталоге", () => {
    const expected: Record<string, Array<{ pieces: number; stats?: Partial<Stats> }>> = {
      wanderer: [
        { pieces: 2, stats: { health: 8 } },
        { pieces: 4, stats: { attack: 3, defense: 3 } },
        { pieces: 6, stats: { crit: 5 } },
      ],
      bastion: [{ pieces: 2, stats: { defense: 6 } }],
      wind: [{ pieces: 2, stats: { speed: 4 } }, { pieces: 4, stats: { crit: 8 } }],
      astral: [{ pieces: 2, stats: { attack: 5 } }],
      crane: [{ pieces: 2, stats: { speed: 5 } }],
      powder: [{ pieces: 2, stats: { attack: 5 } }],
      dusk: [{ pieces: 2, stats: { crit: 6 } }],
    };

    Object.entries(expected).forEach(([setId, bonuses]) => {
      const actual = EQUIPMENT_SETS.find((set) => set.id === setId)!.bonuses
        .filter((bonus) => bonus.stats)
        .map(({ pieces, stats }) => ({ pieces, stats }));
      expect(actual).toEqual(bonuses);
    });
  });

  it("возвращает независимые экземпляры навыка", () => {
    const first = createSkill("ледяные стрелы")!;
    const second = createSkill("ледяные стрелы")!;
    first.usageCount = 0;

    expect(second.usageCount).toBe(1);
  });

  it("возвращает null для неизвестного навыка", () => {
    expect(createSkill("неизвестный навык")).toBeNull();
  });

  it("создаёт заданное оружие без отдельной фабрики", () => {
    expect(createWeapon("Макет меча", 7)).toEqual({ name: "Макет меча", damage: 7 });
  });

  it("использует кулаки для неизвестного типа оружия", () => {
    expect(createRandomWeapon("laser")).toEqual({ name: "Кулаки", damage: 3 });
  });

  it("добавляет по полному обычному комплекту для каждого класса", () => {
    Object.entries(NEW_CLASS_SETS).forEach(([setId, classId]) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId);
      const templates = ITEM_TEMPLATES.filter((item) => item.setId === setId);

      expect(set).toBeDefined();
      expect(set!.classes).toEqual([classId]);
      expect(set!.description.length).toBeGreaterThan(20);
      expect(set!.purpose.length).toBeGreaterThan(20);
      expect(set!.bonuses.map((bonus) => bonus.pieces)).toEqual([2, 4, 6]);
      expect(set!.bonuses.every((bonus) =>
        bonus.stats && Object.values(bonus.stats).some((value) => (value ?? 0) > 0),
      )).toBe(true);

      expect(templates).toHaveLength(EQUIPMENT_SLOTS.length);
      expect(templates.map((item) => item.slot).sort()).toEqual([...EQUIPMENT_SLOTS].sort());
      expect(new Set(templates.map((item) => item.name))).toHaveProperty("size", EQUIPMENT_SLOTS.length);
      expect(templates.every((item) => item.exclusiveToBoss === undefined)).toBe(true);
      expect(templates.every((item) => JSON.stringify(item.allowedClasses) === JSON.stringify([classId]))).toBe(true);
      expect([...set!.pieces].sort()).toEqual(templates.map((item) => item.id).sort());
    });
  });

  it("сохраняет утверждённые названия и баланс комплектов с длинными пальто", () => {
    Object.entries(AUDITED_COAT_SETS).forEach(([setId, expected]) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId)!;
      const templates = ITEM_TEMPLATES.filter((item) => item.setId === setId);

      expect(set.name).toBe(expected.name);
      expect(templates.map((item) => item.name)).toEqual(expected.pieceNames);
      expect(templates.map((item) => item.primaryStat)).toEqual(expected.primaryStats);
      expect(set.bonuses.map(({ pieces, stats }) => ({ pieces, stats }))).toEqual(expected.bonuses);
    });
  });

  it("добавляет полные комплекты для нескольких классов без боссовых ограничений", () => {
    SHARED_SETS.forEach((setId) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId)!;
      const templates = ITEM_TEMPLATES.filter((item) => item.setId === setId);
      expect(set).toBeDefined();
      expect(templates).toHaveLength(EQUIPMENT_SLOTS.length);
      expect(templates.map((item) => item.slot).sort()).toEqual([...EQUIPMENT_SLOTS].sort());
      expect(templates.every((item) => item.exclusiveToBoss === undefined)).toBe(true);
      expect(set.classes === "all" || set.classes.length > 1).toBe(true);
      expect(set.bonuses.every((bonus) => bonus.stats && Object.values(bonus.stats).some((value) => Number(value) > 0))).toBe(true);
    });
  });

  it("создаёт новые комплекты через общую фабрику добычи и лавки", () => {
    Object.entries(NEW_LOOT_SETS).forEach(([setId, expectedClasses]) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId)!;
      const templates = ITEM_TEMPLATES.filter((item) => item.setId === setId);
      expect(set.classes).toEqual(expectedClasses);
      expect(templates).toHaveLength(6);
      expect(templates.every((item) => !item.exclusiveToBoss && !item.exclusiveToElite)).toBe(true);

      const sampleClass: HeroClass = expectedClasses === "all" ? "Knight" : expectedClasses[0];
      templates.forEach((template) => {
        const item = createItem(12, { classId: sampleClass, templateId: template.id, rarity: "rare" });
        expect(item.templateId).toBe(template.id);
        expect(item.setId).toBe(setId);
        expect(item.slot).toBe(template.slot);
        expect(item.allowedClasses).toEqual(expectedClasses);
      });
    });
  });

  it("резервирует комплект живой короны только за первым местом элиты", () => {
    const set = EQUIPMENT_SETS.find((candidate) => candidate.id === "crown-sovereign")!;
    const templates = ITEM_TEMPLATES.filter((item) => item.setId === set.id);
    expect(set.classes).toBe("all");
    expect(templates).toHaveLength(6);
    expect(templates.every((item) => item.exclusiveToElite)).toBe(true);
    expect(set.bonuses[2].stats).toEqual({ speed: 12, crit: 12 });
  });
});
