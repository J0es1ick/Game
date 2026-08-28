import { ITEM_TEMPLATES } from "../../../catalogs/WorldCatalog";
import type {
  EquipmentItem,
  EquipmentSlot,
  HeroClass,
  HeroProfile,
  Rarity,
  Stats,
} from "../../../gameplay/WorldTypes";

export const equipmentSlots: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];
export const statKeys = [
  "health",
  "attack",
  "defense",
  "speed",
  "crit",
] as const;
export const statLabels: Record<keyof Stats, string> = {
  health: "Здоровье",
  attack: "Атака",
  defense: "Защита",
  speed: "Скорость",
  crit: "Крит. шанс",
};
export const statShortLabels: Record<keyof Stats, string> = {
  health: "HP",
  attack: "ATK",
  defense: "DEF",
  speed: "SPD",
  crit: "CRIT",
};
export const rarityColors: Record<Rarity, string> = {
  common: "#898478",
  rare: "#477ca8",
  epic: "#76519d",
  legendary: "#c58b2d",
  mythic: "#a13c43",
};
export const itemTemplates = new Map(
  ITEM_TEMPLATES.map((template) => [template.id, template]),
);
export const number = new Intl.NumberFormat("ru-RU");

export function itemName(item: EquipmentItem): string {
  return item.relicName ?? item.name;
}

export function statsText(stats: Partial<Stats>): string {
  return statKeys
    .filter((key) => stats[key] !== undefined && stats[key] !== 0)
    .map(
      (key) =>
        `${Number(stats[key]) > 0 ? "+" : ""}${stats[key]} ${statShortLabels[key]}`,
    )
    .join(" · ");
}

export function isCompatible(
  item: Pick<EquipmentItem, "allowedClasses">,
  classId: HeroClass,
): boolean {
  return item.allowedClasses === "all" || item.allowedClasses.includes(classId);
}

export function visualClass(
  item: Pick<EquipmentItem, "allowedClasses">,
  classId: HeroClass,
): HeroClass {
  return isCompatible(item, classId)
    ? classId
    : (item.allowedClasses[0] as HeroClass);
}

export function isProtected(item: Pick<EquipmentItem, "templateId">): boolean {
  return Boolean(itemTemplates.get(item.templateId)?.exclusiveToElite);
}

export function equipmentIndex(hero: HeroProfile) {
  const byId = new Map(hero.inventory.map((item) => [item.id, item]));
  const equippedIds = new Set(Object.values(hero.equipped));
  const equipped = equipmentSlots.flatMap((slot) => {
    const id = hero.equipped[slot];
    const item = id ? byId.get(id) : undefined;
    return item ? [item] : [];
  });
  return { byId, equippedIds, equipped };
}

export interface InventoryFilters {
  slot: EquipmentSlot | "all";
  set: string;
  rarity: Rarity | "all";
  order: "newest" | "oldest";
}

export function filteredInventory(
  items: readonly EquipmentItem[],
  filters: InventoryFilters,
): EquipmentItem[] {
  const result = items.filter(
    (item) =>
      (filters.slot === "all" || item.slot === filters.slot) &&
      (filters.rarity === "all" || item.rarity === filters.rarity) &&
      (filters.set === "all" ||
        (filters.set === "none" ? !item.setId : item.setId === filters.set)),
  );
  return filters.order === "newest" ? result.reverse() : result;
}

export function pageSlice<T>(items: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(0, Math.min(page, pages - 1));
  return {
    items: items.slice(current * size, (current + 1) * size),
    current,
    pages,
    total: items.length,
  };
}
