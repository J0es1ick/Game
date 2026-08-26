import { createItem } from "../src/factories/ItemFactory";
import {
  buildLegacySalvageEntries,
  relicDustYield,
  sortLegacyPathCandidates,
} from "../src/gameplay/EquipmentLegacy";
import { WorldGame } from "../src/gameplay/WorldGame";
import { EquipmentItem, Rarity } from "../src/gameplay/WorldTypes";

function equipment(id: string, rarity: Rarity, level: number, enhancement = 0): EquipmentItem {
  return {
    ...createItem(level, { classId: "Knight", rarity }),
    id,
    name: id,
    rarity,
    level,
    enhancement,
  };
}

describe("equipment legacy salvage", () => {
  test.each([
    ["common", 1],
    ["rare", 2],
    ["epic", 4],
    ["legendary", 8],
    ["mythic", 14],
  ] as Array<[Rarity, number]>)("calculates %s relic dust yield", (rarity, expected) => {
    expect(relicDustYield({ rarity })).toBe(expected);
    expect(relicDustYield({ rarity, enhancement: 3 })).toBe(expected + 3);
  });

  test("includes every item with status groups and deterministic value ordering", () => {
    const items = [
      equipment("available-rare", "rare", 50),
      equipment("protected-common", "common", 30),
      equipment("equipped-common", "common", 2),
      equipment("available-legendary-low", "legendary", 4),
      equipment("protected-mythic", "mythic", 1),
      equipment("equipped-mythic", "mythic", 5),
      equipment("available-legendary-high", "legendary", 10),
    ];
    const protectedIds = new Set(["protected-common", "protected-mythic"]);
    const originalOrder = items.map((item) => item.id);

    const entries = buildLegacySalvageEntries(
      items,
      new Set(["equipped-common", "equipped-mythic"]),
      (itemId) => !protectedIds.has(itemId),
    );

    expect(entries).toHaveLength(items.length);
    expect(items.map((item) => item.id)).toEqual(originalOrder);
    expect(entries.map((entry) => entry.item.id)).toEqual([
      "equipped-mythic",
      "equipped-common",
      "available-legendary-high",
      "available-legendary-low",
      "available-rare",
      "protected-mythic",
      "protected-common",
    ]);
    expect(Object.fromEntries(entries.map((entry) => [entry.item.id, entry.status]))).toEqual({
      "equipped-mythic": "equipped",
      "equipped-common": "equipped",
      "available-legendary-high": "available",
      "available-legendary-low": "available",
      "available-rare": "available",
      "protected-mythic": "protected",
      "protected-common": "protected",
    });
    expect(entries.find((entry) => entry.item.id === "available-legendary-high")?.dust).toBe(8);
  });

  test("places equipped relic path candidates first without mutating inventory order", () => {
    const items = [
      equipment("stored-first", "legendary", 12),
      equipment("equipped-first", "mythic", 11),
      equipment("stored-second", "legendary", 10),
      equipment("equipped-second", "legendary", 9),
    ];

    const sorted = sortLegacyPathCandidates(items, new Set(["equipped-first", "equipped-second"]));

    expect(sorted.map((item) => item.id)).toEqual([
      "equipped-first",
      "equipped-second",
      "stored-first",
      "stored-second",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "stored-first",
      "equipped-first",
      "stored-second",
      "equipped-second",
    ]);
  });

  test("WorldGame rejects equipped and protected items and awards the shared dust yield", () => {
    const game = WorldGame.create("Разборщик", "Knight", 92_001);
    game.save.hero.arenaWins[3] = 1;
    const equippedId = game.save.hero.equipped.weapon!;
    const protectedItem = createItem(30, {
      classId: "Knight",
      templateId: "crown-sovereign-head",
      rarity: "mythic",
    });
    const availableItem = equipment("available-epic", "epic", 12, 3);
    game.save.hero.inventory.push(protectedItem, availableItem);

    expect(() => game.salvageItem(equippedId)).toThrow("Надетый предмет нельзя разобрать.");
    expect(() => game.salvageItem(protectedItem.id)).toThrow("Регалии короны нельзя разобрать.");

    const dustBefore = game.save.hero.relicDust;
    expect(game.salvageItem(availableItem.id)).toBe(relicDustYield(availableItem));
    expect(game.save.hero.relicDust).toBe(dustBefore + relicDustYield(availableItem));
    expect(game.save.hero.inventory.some((item) => item.id === availableItem.id)).toBe(false);
  });

  test("salvages several selected items as one operation without counting duplicate ids", () => {
    const game = WorldGame.create("Сборщик", "Knight", 92_002);
    game.save.hero.arenaWins[3] = 1;
    const first = equipment("batch-rare", "rare", 8, 1);
    const second = equipment("batch-epic", "epic", 10, 2);
    game.save.hero.inventory.push(first, second);

    const dustBefore = game.save.hero.relicDust;
    const expectedDust = relicDustYield(first) + relicDustYield(second);

    expect(game.salvageItems([first.id, second.id, first.id])).toBe(expectedDust);
    expect(game.save.hero.relicDust).toBe(dustBefore + expectedDust);
    expect(game.save.hero.inventory.some((item) => item.id === first.id || item.id === second.id)).toBe(false);
  });

  test("does not salvage anything when one selected item is missing or protected", () => {
    const game = WorldGame.create("Проверяющий", "Knight", 92_003);
    game.save.hero.arenaWins[3] = 1;
    const first = equipment("atomic-first", "rare", 8);
    const second = equipment("atomic-second", "epic", 10);
    const protectedItem = createItem(30, {
      classId: "Knight",
      templateId: "crown-sovereign-head",
      rarity: "mythic",
    });
    game.save.hero.inventory.push(first, second, protectedItem);
    const dustBefore = game.save.hero.relicDust;
    const equippedId = game.save.hero.equipped.weapon!;

    expect(() => game.salvageItems([first.id, "missing-item", second.id])).toThrow("Один из выбранных предметов не найден.");
    expect(() => game.salvageItems([first.id, equippedId, second.id])).toThrow("Надетый предмет нельзя разобрать.");
    expect(() => game.salvageItems([first.id, protectedItem.id, second.id])).toThrow("Регалии короны нельзя разобрать.");
    expect(game.save.hero.relicDust).toBe(dustBefore);
    expect(game.save.hero.inventory).toEqual(expect.arrayContaining([first, second, protectedItem]));
  });
});
