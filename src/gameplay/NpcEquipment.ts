import { ITEM_TEMPLATES, RARITY_ORDER } from "../catalogs/WorldCatalog";
import { itemPower } from "../factories/ItemFactory";
import { EnemyProfile, EquipmentItem, EquipmentSet, EquipmentSlot } from "./WorldTypes";

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
const ELITE_ITEM_PRIORITY = 1_000_000;

function isCompatible(enemy: EnemyProfile, item: EquipmentItem): boolean {
  return item.allowedClasses === "all" || item.allowedClasses.includes(enemy.classId);
}

function isEliteEquipment(item: EquipmentItem): boolean {
  return Boolean(ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId)?.exclusiveToElite);
}

/**
 * A stable NPC-facing score. Elite exclusivity is compared as a separate tier
 * by the selection functions before this numeric score is considered.
 */
export function npcItemScore(item: EquipmentItem): number {
  const template = ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId);
  const elitePriority = template?.exclusiveToElite ? ELITE_ITEM_PRIORITY : 0;
  const rarityPriority = RARITY_ORDER.indexOf(item.rarity) * 0.01;
  return elitePriority + itemPower(item) + rarityPriority;
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

/**
 * Keeps at most one useful item per slot and rebuilds dangling equipped links.
 * This also repairs inventories from older saves that accumulated every drop.
 */
export function compactNpcEquipment(enemy: EnemyProfile): void {
  const bestBySlot = new Map<EquipmentSlot, EquipmentItem>();
  enemy.equipment.forEach((item) => {
    if (!EQUIPMENT_SLOTS.includes(item.slot) || !isCompatible(enemy, item)) return;
    const current = bestBySlot.get(item.slot);
    bestBySlot.set(item.slot, preferredItem(current, item, enemy.equipped[item.slot]));
  });

  const equipment = EQUIPMENT_SLOTS
    .map((slot) => bestBySlot.get(slot))
    .filter((item): item is EquipmentItem => Boolean(item));
  const equipped: EquipmentSet = {};
  equipment.forEach((item) => { equipped[item.slot] = item.id; });
  enemy.equipment = equipment;
  enemy.equipped = equipped;
}

/**
 * Evaluates a drop before storing it. A rejected item is discarded, while an
 * upgrade atomically replaces the previous item in that slot.
 */
export function considerNpcLoot(enemy: EnemyProfile, item: EquipmentItem): boolean {
  if (!isCompatible(enemy, item)) return false;
  compactNpcEquipment(enemy);
  const current = enemy.equipment.find((candidate) => candidate.id === enemy.equipped[item.slot]);
  if (current && isEliteEquipment(current) && !isEliteEquipment(item)) return false;
  if (current && npcItemScore(item) <= npcItemScore(current)) return false;

  enemy.equipment = enemy.equipment.filter((candidate) => candidate.slot !== item.slot);
  enemy.equipment.push(item);
  enemy.equipped[item.slot] = item.id;
  return true;
}
