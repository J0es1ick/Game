import { ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { relicDustYield } from "../src/gameplay/EquipmentLegacy";
import { createWorldRelicRecord } from "../src/gameplay/LivingWorld";
import { WorldGame } from "../src/gameplay/WorldGame";
import type { EquipmentItem } from "../src/gameplay/WorldTypes";

function extraItem(game: WorldGame, id: string, price = 100): EquipmentItem {
  return { ...game.save.hero.inventory[0], id, price, stats: { ...game.save.hero.inventory[0].stats } };
}

describe("equipment operations", () => {
  test("direct sale checks match ID checks for every template without changing items", () => {
    const game = WorldGame.create("Продавец", "Knight", 42_201);
    const base = game.save.hero.inventory[0];
    game.save.hero.inventory = ITEM_TEMPLATES.map((template, index) => ({
      ...base, id: `sale-policy-${index}`, templateId: template.id,
    }));
    const before = JSON.stringify(game.save.hero.inventory);

    game.save.hero.inventory.forEach((item, index) => {
      expect(game.canSellItem(Object.freeze({ templateId: item.templateId }))).toBe(!ITEM_TEMPLATES[index].exclusiveToElite);
      expect(game.canSell(item.id)).toBe(game.canSellItem(item));
    });

    expect(game.canSell("missing-item")).toBe(false);
    expect(game.canSellItem({ templateId: "missing-template" })).toBe(true);
    expect(game.sell("missing-item")).toBe(0);
    expect(JSON.stringify(game.save.hero.inventory)).toBe(before);
  });

  test("direct upgrade quotes preserve every enhancement cost and the forge boon", () => {
    const game = WorldGame.create("Кузнец", "Knight", 42_202);
    const item = game.save.hero.inventory[0];
    const quote = (enhancement: number | undefined, expected: number) => {
      item.enhancement = enhancement;
      const before = JSON.stringify(game.save);
      expect(game.upgradeCostFor(Object.freeze({ enhancement }))).toBe(expected);
      expect(game.upgradeCost(item.id)).toBe(expected);
      expect(JSON.stringify(game.save)).toBe(before);
    };

    quote(undefined, 1);
    [1, 2, 3, 5, 8, 0].forEach((expected, enhancement) => quote(enhancement, expected));
    game.save.legacy.activeBoonId = "forge-tradition";
    quote(undefined, 0);
    [0, 2, 3, 5, 8, 0].forEach((expected, enhancement) => quote(enhancement, expected));
    expect(() => game.upgradeCost("missing-item")).toThrow("Предмет не найден.");
    expect(() => game.upgradeItem("missing-item")).toThrow("Предмет не найден.");
  });

  test("bulk selling makes no repeated inventory searches and retains equipment and regalia", () => {
    const game = WorldGame.create("Торговец", "Knight", 42_203);
    const equippedBefore = { ...game.save.hero.equipped };
    const equippedIds = Object.values(equippedBefore);
    const extras = Array.from({ length: 400 }, (_, index) => extraItem(game, `bulk-${index}`, index));
    const crown = createItem(30, { classId: "Knight", templateId: "crown-sovereign-head", rarity: "mythic" });
    game.save.hero.inventory.push(...extras, crown);
    const expectedValue = extras.reduce((sum, item) => sum + Math.max(1, Math.round(item.price * 0.45)), 0);
    const goldBefore = game.save.hero.gold;
    const find = jest.spyOn(game.save.hero.inventory, "find");

    const result = game.sellUnequipped();

    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
    expect(result).toEqual({ count: extras.length, value: expectedValue });
    expect(game.save.hero.gold).toBe(goldBefore + expectedValue);
    expect(game.save.hero.equipped).toEqual(equippedBefore);
    expect(game.save.hero.inventory.map((item) => item.id)).toEqual([...equippedIds, crown.id]);
    expect(() => game.sell(crown.id)).toThrow("Регалии живой короны нельзя продать");
    expect(() => game.sell(equippedIds[0]!)).toThrow("Сначала снимите предмет.");
    expect(game.sellUnequipped()).toEqual({ count: 0, value: 0 });
  });

  test("selling world relics returns them to circulation with their history intact", () => {
    const game = WorldGame.create("Хранитель", "Knight", 42_204);
    const relic = createItem(20, { classId: "Knight", rarity: "legendary", templateId: "wanderer-blade" });
    relic.relicTier = 1;
    relic.relicPath = "might";
    const record = createWorldRelicRecord("sale-world-relic", relic, "hero", game.save.hero.name, game.save.worldDay);
    game.save.worldRelics = [record];
    game.save.hero.inventory.push(record.item);
    const previousHistory = [...record.history];

    expect(game.sellUnequipped().count).toBe(1);
    const released = game.save.worldRelics[0];
    expect(released.status).toBe("lost");
    expect(released.currentOwnerId).toBeUndefined();
    expect(released.history).toEqual(expect.arrayContaining(previousHistory));
    expect(released.history.some((line) => line.includes("покинула инвентарь"))).toBe(true);
    expect(game.save.hero.inventory.some((item) => item.worldRelicId === record.id)).toBe(false);
  });

  test("bulk salvage indexes the inventory once and counts duplicate choices once", () => {
    const game = WorldGame.create("Разборщик", "Knight", 42_205);
    game.save.hero.arenaWins[3] = 1;
    const extras = Array.from({ length: 400 }, (_, index) => ({
      ...extraItem(game, `salvage-${index}`), enhancement: index % 6,
    }));
    game.save.hero.inventory.push(...extras);
    const inventoryBefore = game.save.hero.inventory.slice(0, -extras.length);
    const expectedDust = extras.reduce((sum, item) => sum + relicDustYield(item), 0);
    const dustBefore = game.save.hero.relicDust;
    const find = jest.spyOn(game.save.hero.inventory, "find");

    expect(game.salvageItems([...extras.map((item) => item.id), extras[0].id])).toBe(expectedDust);

    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
    expect(game.save.hero.relicDust).toBe(dustBefore + expectedDust);
    expect(game.save.hero.inventory).toEqual(inventoryBefore);
  });

  test("bulk salvage remains atomic for every protected or missing selection", () => {
    const game = WorldGame.create("Смотритель", "Knight", 42_206);
    game.save.hero.arenaWins[3] = 1;
    const available = extraItem(game, "available");
    const crown = createItem(30, { classId: "Knight", templateId: "crown-sovereign-head", rarity: "mythic" });
    const relic = { ...extraItem(game, "relic"), worldRelicId: "registered-relic" };
    game.save.hero.inventory.push(available, crown, relic);
    game.consumeFeatureUnlocks();
    const before = structuredClone(game.save.hero);

    expect(() => game.salvageItems([])).toThrow("Не выбраны предметы для разбора.");
    expect(() => game.salvageItems(["missing-item"])).toThrow("Предмет не найден.");
    expect(() => game.salvageItems([available.id, "missing-item"])).toThrow("Один из выбранных предметов не найден.");
    expect(() => game.salvageItems([available.id, game.save.hero.equipped.weapon!])).toThrow("Надетый предмет нельзя разобрать.");
    expect(() => game.salvageItems([available.id, crown.id])).toThrow("Регалии короны нельзя разобрать.");
    expect(() => game.salvageItems([available.id, relic.id])).toThrow("Мировую реликвию нельзя уничтожить");
    expect(game.save.hero).toEqual(before);
  });

  test("single upgrades and sales reuse the item found during their ownership check", () => {
    const game = WorldGame.create("Мастер", "Knight", 42_207);
    const item = extraItem(game, "single-action");
    game.save.hero.inventory.push(item);
    game.save.hero.temperingMarks = 1;
    const find = jest.spyOn(game.save.hero.inventory, "find");
    expect(game.upgradeItem(item.id)).toBe(item);
    expect(find).toHaveBeenCalledTimes(1);
    expect(game.save.hero.temperingMarks).toBe(0);
    expect(item.enhancement).toBe(1);
    find.mockClear();

    expect(game.sell(item.id)).toBe(Math.max(1, Math.round(item.price * 0.45)));
    expect(find).toHaveBeenCalledTimes(1);
    find.mockRestore();
  });
});
