import {
  equipmentIndex,
  filteredInventory,
  isProtected,
  pageSlice,
} from "../src/web/react/equipment/model";
import { WorldGame } from "../src/gameplay/WorldGame";
import type { EquipmentItem } from "../src/gameplay/WorldTypes";
import { ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";

describe("React equipment list selectors", () => {
  const game = WorldGame.create("Проверка", "Knight", 4241);
  const original = game.save.hero.inventory[0];
  const item = (
    id: string,
    overrides: Partial<EquipmentItem> = {},
  ): EquipmentItem => ({ ...original, id, ...overrides });

  it("preserves inventory order and does not mutate the source when sorting by newest", () => {
    const items = [item("old"), item("middle"), item("new")];
    expect(
      filteredInventory(items, {
        slot: "all",
        set: "all",
        rarity: "all",
        order: "newest",
      }).map((entry) => entry.id),
    ).toEqual(["new", "middle", "old"]);
    expect(items.map((entry) => entry.id)).toEqual(["old", "middle", "new"]);
  });

  it("combines slot, set and rarity filters", () => {
    const items = [
      item("wanted", { slot: "head", rarity: "epic", setId: "sample" }),
      item("other-slot", { slot: "chest", rarity: "epic", setId: "sample" }),
      item("other-rarity", { slot: "head", rarity: "rare", setId: "sample" }),
    ];
    expect(
      filteredInventory(items, {
        slot: "head",
        set: "sample",
        rarity: "epic",
        order: "oldest",
      }).map((entry) => entry.id),
    ).toEqual(["wanted"]);
    expect(
      filteredInventory([item("none", { setId: undefined }), ...items], {
        slot: "all",
        set: "none",
        rarity: "all",
        order: "oldest",
      }).map((entry) => entry.id),
    ).toEqual(["none"]);
  });

  it("keeps all entries reachable while bounding rendered rows", () => {
    const items = Array.from({ length: 143 }, (_, index) =>
      item(String(index)),
    );
    const pages = Array.from({ length: 6 }, (_, page) =>
      pageSlice(items, page, 24),
    );
    expect(pages.every((page) => page.items.length <= 24)).toBe(true);
    expect(
      new Set(pages.flatMap((page) => page.items.map((entry) => entry.id)))
        .size,
    ).toBe(143);
    expect(pageSlice(items.slice(0, 13), 5, 24).current).toBe(0);
    expect(pageSlice([], 3, 24)).toEqual({
      items: [],
      current: 0,
      pages: 1,
      total: 0,
    });
  });

  it("indexes equipped items and keeps crown regalia protected without scanning the inventory", () => {
    const index = equipmentIndex(game.save.hero);
    expect(
      index.equipped.every((entry) => index.equippedIds.has(entry.id)),
    ).toBe(true);
    expect(index.byId.size).toBe(game.save.hero.inventory.length);
    const regalia = ITEM_TEMPLATES.find(
      (template) => template.exclusiveToElite,
    )!;
    expect(isProtected({ templateId: regalia.id })).toBe(true);
    expect(isProtected({ templateId: original.templateId })).toBe(false);
  });
});
