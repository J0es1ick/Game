import { ITEM_TEMPLATES, RARITY_ORDER } from "../../catalogs/WorldCatalog";
import { itemPower } from "../../factories/ItemFactory";
import {
  EnemyProfile,
  EquipmentItem,
  EquipmentSet,
  EquipmentSlot,
} from "../core/WorldTypes";
import { isWorldRelicEligible } from "./WorldRelics";

const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];
const ELITE_ITEM_PRIORITY = 1_000_000;

export type NpcLootRejection =
  | "incompatible"
  | "forbidden-relic"
  | "same-relic"
  | "relic-slot-occupied"
  | "elite-protected"
  | "not-an-upgrade";

export interface NpcLootDecision {
  equipped: boolean;
  displaced: EquipmentItem[];
  rejection?: NpcLootRejection;
}

function isCompatible(enemy: EnemyProfile, item: EquipmentItem): boolean {
  return (
    item.allowedClasses === "all" || item.allowedClasses.includes(enemy.classId)
  );
}

function isEliteEquipment(item: EquipmentItem): boolean {
  return Boolean(
    ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId)
      ?.exclusiveToElite,
  );
}

export function npcItemScore(item: EquipmentItem): number {
  const template = ITEM_TEMPLATES.find(
    (candidate) => candidate.id === item.templateId,
  );
  const elitePriority = template?.exclusiveToElite ? ELITE_ITEM_PRIORITY : 0;
  const rarityPriority = RARITY_ORDER.indexOf(item.rarity) * 0.01;
  const worldRelicPriority = item.worldRelicId ? 2_000_000 : 0;
  return elitePriority + worldRelicPriority + itemPower(item) + rarityPriority;
}

function preferredItem(
  current: EquipmentItem | undefined,
  candidate: EquipmentItem,
  equippedId?: string,
): EquipmentItem {
  if (!current) return candidate;
  if (isEliteEquipment(current) !== isEliteEquipment(candidate)) {
    return isEliteEquipment(candidate) ? candidate : current;
  }
  const difference = npcItemScore(candidate) - npcItemScore(current);
  if (difference > 0) return candidate;
  if (difference < 0) return current;
  return current.id === equippedId ? current : candidate;
}

export function compactNpcEquipment(enemy: EnemyProfile): EquipmentItem[] {
  const previous = [...enemy.equipment];
  const bestBySlot = new Map<EquipmentSlot, EquipmentItem>();
  enemy.equipment.forEach((item) => {
    if (!EQUIPMENT_SLOTS.includes(item.slot) || !isCompatible(enemy, item))
      return;
    const current = bestBySlot.get(item.slot);
    bestBySlot.set(
      item.slot,
      preferredItem(current, item, enemy.equipped[item.slot]),
    );
  });

  const equipment = EQUIPMENT_SLOTS.map((slot) => bestBySlot.get(slot)).filter(
    (item): item is EquipmentItem => Boolean(item),
  );
  const equipped: EquipmentSet = {};
  equipment.forEach((item) => {
    equipped[item.slot] = item.id;
  });
  enemy.equipment = equipment;
  enemy.equipped = equipped;
  const retained = new Set(equipment.map((item) => item.id));
  return previous.filter((item) => !retained.has(item.id));
}

export function considerNpcLootDetailed(
  enemy: EnemyProfile,
  item: EquipmentItem,
): NpcLootDecision {
  if (!isCompatible(enemy, item))
    return { equipped: false, displaced: [], rejection: "incompatible" };
  if (item.worldRelicId && !isWorldRelicEligible(item)) {
    return { equipped: false, displaced: [], rejection: "forbidden-relic" };
  }
  compactNpcEquipment(enemy);
  const current = enemy.equipment.find(
    (candidate) => candidate.id === enemy.equipped[item.slot],
  );
  if (
    item.worldRelicId &&
    enemy.equipment.some(
      (candidate) => candidate.worldRelicId === item.worldRelicId,
    )
  ) {
    return { equipped: false, displaced: [], rejection: "same-relic" };
  }
  if (
    current?.worldRelicId &&
    item.worldRelicId &&
    current.worldRelicId !== item.worldRelicId
  ) {
    return { equipped: false, displaced: [], rejection: "relic-slot-occupied" };
  }
  if (current && isEliteEquipment(current) && !isEliteEquipment(item)) {
    return { equipped: false, displaced: [], rejection: "elite-protected" };
  }
  if (current && npcItemScore(item) <= npcItemScore(current)) {
    return { equipped: false, displaced: [], rejection: "not-an-upgrade" };
  }

  const displaced = enemy.equipment.filter(
    (candidate) => candidate.slot === item.slot,
  );
  enemy.equipment = enemy.equipment.filter(
    (candidate) => candidate.slot !== item.slot,
  );
  enemy.equipment.push(item);
  enemy.equipped[item.slot] = item.id;
  return { equipped: true, displaced };
}

export function considerNpcLoot(
  enemy: EnemyProfile,
  item: EquipmentItem,
): boolean {
  return considerNpcLootDetailed(enemy, item).equipped;
}
