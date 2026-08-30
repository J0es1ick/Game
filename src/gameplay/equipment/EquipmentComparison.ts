import { combatantSnapshot } from "../combat/AdvancedBattle";
import type { EquipmentItem, HeroProfile, Stats } from "../core/WorldTypes";

export function effectiveEquipmentStats(
  hero: HeroProfile,
  replacement?: EquipmentItem,
  currentItem?: EquipmentItem,
): Stats {
  const equipped = { ...hero.equipped };
  const item = replacement ?? currentItem;
  let inventory = hero.inventory;
  if (item) {
    equipped[item.slot] = item.id;
    inventory = [...inventory.filter((entry) => entry.id !== item.id), item];
  }
  const snapshot = combatantSnapshot({ ...hero, inventory, equipped });
  return {
    health: snapshot.maxHealth,
    attack: snapshot.attack,
    defense: snapshot.defense,
    speed: snapshot.speed,
    crit: snapshot.crit,
  };
}

export function compareEquipment(
  hero: HeroProfile,
  candidate: EquipmentItem,
  previous?: EquipmentItem,
) {
  const baseline = { ...hero, equipped: { ...hero.equipped } };
  if (previous) baseline.equipped[candidate.slot] = previous.id;
  else delete baseline.equipped[candidate.slot];
  return {
    current: effectiveEquipmentStats(baseline, undefined, previous),
    candidate: effectiveEquipmentStats(baseline, candidate),
  };
}
