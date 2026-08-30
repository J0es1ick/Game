import { createStarterItems } from "../../factories/ItemFactory";
import type { RandomSource } from "./RandomSource";
import type { EquipmentItem, HeroClass, HeroProfile } from "./WorldTypes";

export function starterEquipment(
  classId: HeroClass,
  random: RandomSource,
): { inventory: EquipmentItem[]; equipped: HeroProfile["equipped"] } {
  const inventory = createStarterItems(classId, random);
  const equipped: HeroProfile["equipped"] = {};
  inventory.forEach((item) => {
    equipped[item.slot] = item.id;
  });
  return { inventory, equipped };
}
