import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import { factionShopPrice } from "../world/FactionEconomy";
import type { GameSave } from "../core/WorldTypes";

export const TEMPERING_MARK_BASE_PRICE = 20_000;

export function temperingMarkPrice(save: GameSave): number {
  const faction =
    FACTIONS.find(
      (entry) => entry.id === save.factionControl?.shopControllerId,
    ) ?? FACTIONS[0];
  return factionShopPrice(
    TEMPERING_MARK_BASE_PRICE,
    faction.id,
    save.hero.factionReputation[faction.id] ?? 0,
  );
}

export function buyTemperingMarks(
  save: GameSave,
  quantity = 1,
): { quantity: number; cost: number } {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(
      "Количество печатей должно быть целым положительным числом.",
    );
  }
  const cost = temperingMarkPrice(save) * quantity;
  const nextMarks = save.hero.temperingMarks + quantity;
  if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(nextMarks)) {
    throw new Error("Слишком большое количество печатей.");
  }
  if (!Number.isFinite(save.hero.gold) || save.hero.gold < cost) {
    throw new Error("Недостаточно монет для покупки печатей.");
  }
  save.hero.gold -= cost;
  save.hero.temperingMarks = nextMarks;
  return { quantity, cost };
}
