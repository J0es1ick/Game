import {
  EQUIPMENT_SETS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../catalogs/WorldCatalog";
import {
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  Stats,
} from "../../gameplay/core/WorldTypes";

const STAT_LABELS: Record<keyof Stats, string> = {
  health: "здоровье",
  attack: "атака",
  defense: "защита",
  speed: "скорость",
  crit: "крит. шанс",
};

export function numberedChoice<T>(
  items: readonly T[],
  answer: string,
): T | undefined {
  const index = Number.parseInt(answer.trim(), 10) - 1;
  return Number.isInteger(index) && index >= 0 && index < items.length
    ? items[index]
    : undefined;
}

export function numberedChoices<T>(
  items: readonly T[],
  answer: string,
  limit = items.length,
): T[] {
  const indexes = answer
    .split(/[\s,;]+/)
    .map((value) => Number.parseInt(value, 10) - 1)
    .filter(
      (index, position, values) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < items.length &&
        values.indexOf(index) === position,
    )
    .slice(0, Math.max(0, limit));
  return indexes.map((index) => items[index]);
}

export function itemStatsText(item: EquipmentItem): string {
  const stats = Object.entries(item.stats) as Array<[keyof Stats, number]>;
  const base = stats.map(
    ([stat, value]) => `${STAT_LABELS[stat]} ${value >= 0 ? "+" : ""}${value}`,
  );
  if (item.affix)
    base.push(
      `${item.affix.name}: ${STAT_LABELS[item.affix.stat]} +${item.affix.value}`,
    );
  return base.length > 0 ? base.join(" · ") : "без характеристик";
}

export function itemLine(item: EquipmentItem, equipped = false): string {
  const setName = item.setId
    ? (EQUIPMENT_SETS.find((set) => set.id === item.setId)?.name ?? item.setId)
    : undefined;
  const set = setName ? ` · комплект ${setName}` : "";
  const enhancement = item.enhancement ? ` · закалка +${item.enhancement}` : "";
  return `${equipped ? "[НАДЕТО]" : "[рюкзак]"} ${item.name} · ${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]} · ур. ${item.level}${enhancement}${set} · ${itemStatsText(item)}`;
}

export function sortedInventory(
  save: GameSave,
  slot?: EquipmentSlot,
): EquipmentItem[] {
  const equippedIds = new Set(Object.values(save.hero.equipped));
  return save.hero.inventory
    .filter((item) => !slot || item.slot === slot)
    .slice()
    .sort(
      (first, second) =>
        Number(equippedIds.has(second.id)) -
          Number(equippedIds.has(first.id)) ||
        second.level - first.level ||
        second.price - first.price ||
        first.name.localeCompare(second.name),
    );
}

export function compatibleWithHero(
  item: EquipmentItem,
  classId: GameSave["hero"]["classId"],
): boolean {
  return item.allowedClasses === "all" || item.allowedClasses.includes(classId);
}

export function equippedItemFor(
  save: GameSave,
  slot: EquipmentSlot,
): EquipmentItem | undefined {
  const id = save.hero.equipped[slot];
  return id ? save.hero.inventory.find((item) => item.id === id) : undefined;
}

export function saveSourceLabel(
  source: "primary" | "temporary" | "backup",
): string {
  if (source === "temporary") return "восстановлена незавершённая запись";
  if (source === "backup") return "восстановлена резервная копия";
  return "основное сохранение";
}
