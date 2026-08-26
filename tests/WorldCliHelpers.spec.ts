import { WorldGame } from "../src/gameplay/WorldGame";
import {
  compatibleWithHero,
  equippedItemFor,
  itemLine,
  numberedChoice,
  numberedChoices,
  sortedInventory,
} from "../src/utils/input/worldCliHelpers";

describe("world CLI helpers", () => {
  it("parses only in-range one-based choices", () => {
    expect(numberedChoice(["a", "b"], " 2 ")).toBe("b");
    expect(numberedChoice(["a", "b"], "0")).toBeUndefined();
    expect(numberedChoice(["a", "b"], "3")).toBeUndefined();
    expect(numberedChoice(["a", "b"], "abc")).toBeUndefined();
  });

  it("parses a bounded set of distinct one-based choices", () => {
    expect(numberedChoices(["a", "b", "c", "d"], "3, 1; 3 9", 3)).toEqual(["c", "a"]);
    expect(numberedChoices(["a", "b"], "", 2)).toEqual([]);
    expect(numberedChoices(["a", "b", "c"], "1 2 3", 2)).toEqual(["a", "b"]);
  });

  it("lists equipped items first and formats readable Russian properties", () => {
    const game = WorldGame.create("Путник", "Knight", 40_000);
    const items = sortedInventory(game.save);
    const equippedIds = new Set(Object.values(game.save.hero.equipped));

    expect(equippedIds.has(items[0].id)).toBe(true);
    expect(itemLine(items[0], true)).toContain("[НАДЕТО]");
    expect(itemLine(items[0], true)).toContain("ур. 1");
    expect(compatibleWithHero(items[0], game.save.hero.classId)).toBe(true);
    expect(equippedItemFor(game.save, items[0].slot)?.id).toBe(game.save.hero.equipped[items[0].slot]);
  });
});
