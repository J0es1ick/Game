import { RARITY_ORDER } from "../catalogs/WorldCatalog";
import { EquipmentItem, Rarity } from "./WorldTypes";

export type LegacySalvageStatus = "available" | "equipped" | "protected";

export interface LegacySalvageEntry {
  item: EquipmentItem;
  dust: number;
  status: LegacySalvageStatus;
}

const DUST_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 2,
  epic: 4,
  legendary: 8,
  mythic: 14,
};

const STATUS_ORDER: Readonly<Record<LegacySalvageStatus, number>> = {
  equipped: 0,
  available: 1,
  protected: 2,
};

export function relicDustYield(item: Pick<EquipmentItem, "rarity" | "enhancement">): number {
  return DUST_BY_RARITY[item.rarity] + (item.enhancement ?? 0);
}

export function sortLegacyPathCandidates<T extends Pick<EquipmentItem, "id">>(
  items: readonly T[],
  equippedIds: ReadonlySet<string>,
): T[] {
  return [...items].sort((first, second) => (
    Number(equippedIds.has(second.id)) - Number(equippedIds.has(first.id))
  ));
}

export function buildLegacySalvageEntries(
  items: readonly EquipmentItem[],
  equippedIds: ReadonlySet<string>,
  canSalvage: (itemId: string) => boolean,
): LegacySalvageEntry[] {
  return items.map((item): LegacySalvageEntry => ({
    item,
    dust: relicDustYield(item),
    status: equippedIds.has(item.id) ? "equipped" : canSalvage(item.id) ? "available" : "protected",
  })).sort((first, second) => (
    STATUS_ORDER[first.status] - STATUS_ORDER[second.status]
    || RARITY_ORDER.indexOf(second.item.rarity) - RARITY_ORDER.indexOf(first.item.rarity)
    || second.item.level - first.item.level
    || first.item.name.localeCompare(second.item.name, "ru")
    || first.item.id.localeCompare(second.item.id)
  ));
}
