import type { EquipmentItem, GameSave } from "./WorldTypes";
import { reconcileWorldRelicRegistry, type WorldRelicPlacement } from "./WorldRelics";

export function reconcileSavedWorldRelics(save: GameSave): void {
  const placements: WorldRelicPlacement[] = [];
  const add = (prefix: string, items: EquipmentItem[], status: WorldRelicPlacement["status"], ownerId?: string, ownerName?: string) => {
    items.forEach((item, index) => {
      if (item.worldRelicId) placements.push({ key: `${prefix}:${index}`, item, status, ownerId, ownerName });
    });
  };
  add("hero", save.hero.inventory, "wielded", "hero", save.hero.name);
  save.enemies.forEach((enemy) => add(`enemy:${enemy.id}`, enemy.equipment, "wielded", enemy.id, enemy.name));
  save.shopOffers.forEach((offer, index) => {
    if (!offer.sold) add(`shop:${index}`, [offer.item], "shop", undefined, "Лавка Ионы");
  });
  if (save.activeExpedition) add("expedition", save.activeExpedition.loot, "wielded", "hero", save.hero.name);
  const result = reconcileWorldRelicRegistry(save.worldRelics ?? [], placements, save.worldDay);
  const replacements = new Map(result.placements.map((placement) => [placement.key, placement.item]));
  const removed = new Set(result.removedPlacementKeys);
  const restore = (prefix: string, items: EquipmentItem[]) => items.flatMap((item, index) => {
    const key = `${prefix}:${index}`;
    return removed.has(key) ? [] : [replacements.get(key) ?? item];
  });
  save.hero.inventory = restore("hero", save.hero.inventory);
  Object.entries(save.hero.equipped).forEach(([slot, id]) => {
    if (!save.hero.inventory.some((item) => item.id === id)) delete save.hero.equipped[slot as keyof typeof save.hero.equipped];
  });
  save.enemies.forEach((enemy) => {
    enemy.equipment = restore(`enemy:${enemy.id}`, enemy.equipment);
    Object.entries(enemy.equipped).forEach(([slot, id]) => {
      if (!enemy.equipment.some((item) => item.id === id)) delete enemy.equipped[slot as keyof typeof enemy.equipped];
    });
  });
  save.shopOffers = save.shopOffers.filter((_, index) => !removed.has(`shop:${index}:0`));
  save.shopOffers.forEach((offer) => {
    const placement = result.placements.find((entry) => entry.status === "shop" && entry.item.id === offer.item.id);
    if (!offer.sold && placement) offer.item = placement.item;
  });
  if (save.activeExpedition) save.activeExpedition.loot = restore("expedition", save.activeExpedition.loot);
  save.worldRelics = result.records;
}
