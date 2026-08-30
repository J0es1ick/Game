import type {
  EquipmentSetDefinition,
  EquipmentSlot,
  ItemTemplate,
  Stats,
} from "../gameplay/core/WorldTypes";

const slots: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];
const specs = [
  {
    factionId: "wardens",
    id: "faction-wardens",
    name: "Знамя внутреннего круга",
    stats: ["defense", "health", "attack"],
    names: [
      "Оружие внутреннего круга",
      "Печать распорядителя",
      "Шлем внутреннего круга",
      "Камзол хранителя арены",
      "Перчатки судьи",
      "Поножи первого ряда",
    ],
    bonuses: [
      { pieces: 2, description: "+10 к защите", stats: { defense: 10 } },
      { pieces: 4, description: "+70 к здоровью", stats: { health: 70 } },
      { pieces: 6, description: "+12 к атаке", stats: { attack: 12 } },
    ],
  },
  {
    factionId: "free-company",
    id: "faction-company",
    name: "Вольный горизонт",
    stats: ["speed", "health", "defense"],
    names: [
      "Оружие вольного горизонта",
      "Знак дальнего пути",
      "Капюшон первопроходца",
      "Пальто вольного горизонта",
      "Перчатки проводника",
      "Поножи непроторённой тропы",
    ],
    bonuses: [
      { pieces: 2, description: "+10 к скорости", stats: { speed: 10 } },
      { pieces: 4, description: "+65 к здоровью", stats: { health: 65 } },
      { pieces: 6, description: "+12 к защите", stats: { defense: 12 } },
    ],
  },
  {
    factionId: "red-ledger",
    id: "faction-ledger",
    name: "Последняя запись",
    stats: ["attack", "crit", "health"],
    names: [
      "Оружие последней записи",
      "Красная расписка",
      "Маска взыскателя",
      "Пальто последнего долга",
      "Перчатки красной книги",
      "Поножи молчаливого свидетеля",
    ],
    bonuses: [
      { pieces: 2, description: "+10 к атаке", stats: { attack: 10 } },
      {
        pieces: 4,
        description: "+8 п.п. критического шанса",
        stats: { crit: 8 },
      },
      { pieces: 6, description: "+70 к здоровью", stats: { health: 70 } },
    ],
  },
];

export const FACTION_ITEM_TEMPLATES: ItemTemplate[] = specs.flatMap((set) =>
  slots.map((slot, index) => ({
    id: `${set.id}-${slot}`,
    name: set.names[index],
    slot,
    allowedClasses: "all",
    setId: set.id,
    primaryStat: set.stats[index % set.stats.length] as keyof Stats,
    exclusiveToFaction: set.factionId,
  })),
);

export const FACTION_EQUIPMENT_SETS: EquipmentSetDefinition[] = specs.map(
  (set) => ({
    id: set.id,
    name: set.name,
    classes: "all",
    description: "Исключительная награда за цепочку фракционных поручений.",
    purpose:
      "Все шесть частей выдаются за три этапа службы. Не встречается в лавке и случайной добыче.",
    pieces: FACTION_ITEM_TEMPLATES.filter((item) => item.setId === set.id).map(
      (item) => item.id,
    ),
    bonuses: set.bonuses,
  }),
);
