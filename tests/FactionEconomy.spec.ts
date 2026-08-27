import { ARENAS, DUNGEONS, ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import {
  applyFactionReputationChange,
  changeFactionInfluence,
  createFactionRelations,
  factionArenaReward,
  factionDisposition,
  factionDungeonReward,
  factionHostility,
  factionRelation,
  factionShopPolicy,
  factionShopPrice,
  improveFactionMinimumRarity,
  isPublicShopTemplate,
  resolveFactionControlCycle,
} from "../src/gameplay/FactionEconomy";
import { createFactionControlState, normalizeFactionControlState } from "../src/gameplay/LivingWorld";

describe("faction economy", () => {
  it("preserves rare arena influence until its tournament window has completed", () => {
    const source = createFactionControlState(0);
    source.lastShiftDay = 0;
    source.arenaControllers.crown = "wardens";
    source.arenaControllers.glass = "wardens";
    source.arenaInfluence.crown = { wardens: 20, "free-company": 100, "red-ledger": 0 };
    source.arenaInfluence.glass = { wardens: 20, "free-company": 100, "red-ledger": 0 };
    const first = resolveFactionControlCycle(source, 7);
    expect(first.state.arenaInfluence.crown).toEqual(source.arenaInfluence.crown);
    expect(first.state.arenaInfluence.glass).toEqual(source.arenaInfluence.glass);
    expect(first.state.arenaControllers.crown).toBe("wardens");
    const second = resolveFactionControlCycle(first.state, 14);
    expect(second.state.arenaControllers.crown).toBe("free-company");
    expect(second.state.arenaControllers.glass).toBe("free-company");
    expect(second.state.arenaInfluence.crown["free-company"]).toBe(82);
    expect(second.state.arenaInfluence.glass["free-company"]).toBe(82);
    const third = resolveFactionControlCycle(second.state, 21);
    expect(third.state.arenaInfluence.crown).toEqual(second.state.arenaInfluence.crown);
    expect(third.state.arenaInfluence.glass["free-company"]).toBe(67);
    expect(source.arenaInfluence.crown["free-company"]).toBe(100);
  });

  it("accounts for skipped tournament windows without inventing influence or changing empty control", () => {
    const source = createFactionControlState(0);
    source.lastShiftDay = 0;
    ARENAS.forEach((arena) => {
      source.arenaControllers[arena.id] = "red-ledger";
      source.arenaInfluence[arena.id] = { wardens: 0, "free-company": 0, "red-ledger": 0 };
    });
    source.arenaInfluence.crown["red-ledger"] = 100;
    const result = resolveFactionControlCycle(source, 42);
    expect(result.state.arenaInfluence.crown["red-ledger"]).toBe(55);
    expect(result.arenaChanges).toHaveLength(0);
    expect(result.state.arenaInfluence.glass).toEqual(source.arenaInfluence.glass);
  });

  it("calculates stable prices for controller, reputation and world relic premium", () => {
    const regular = factionShopPrice(1_000, "wardens", 45, false);
    const relic = factionShopPrice(1_000, "wardens", 45, true);
    const hostile = factionShopPrice(1_000, "wardens", -40, false);

    expect(regular).toBe(845);
    expect(relic).toBe(1_225);
    expect(hostile).toBe(1_060);
  });

  it("keeps boss and crown equipment out of every public shop policy", () => {
    const boss = ITEM_TEMPLATES.find((template) => template.exclusiveToBoss)!;
    const crown = ITEM_TEMPLATES.find((template) => template.exclusiveToElite)!;
    const publicItem = ITEM_TEMPLATES.find((template) => !template.exclusiveToBoss && !template.exclusiveToElite)!;

    expect(isPublicShopTemplate(boss)).toBe(false);
    expect(isPublicShopTemplate(crown)).toBe(false);
    expect(isPublicShopTemplate(publicItem)).toBe(true);
    expect(factionShopPolicy("free-company").universalTemplateChance).toBeGreaterThan(factionShopPolicy("wardens").universalTemplateChance);
  });

  it("applies arena consequences identically for hero and simulated fighters", () => {
    expect(factionArenaReward("wardens", { experience: 100, gold: 100 })).toMatchObject({ experience: 110, gold: 100, raritySteps: 0 });
    expect(factionArenaReward("free-company", { experience: 100, gold: 100 })).toMatchObject({ experience: 100, gold: 112, raritySteps: 0 });
    expect(factionArenaReward("red-ledger", { experience: 100, gold: 100 })).toMatchObject({ experience: 100, gold: 100, raritySteps: 1 });
    expect(improveFactionMinimumRarity("legendary", "red-ledger")).toBe("mythic");
    expect(factionDungeonReward("wardens", { experience: 100, gold: 100 })).toMatchObject({ experience: 108, gold: 100, raritySteps: 0 });
    expect(factionDungeonReward("free-company", { experience: 100, gold: 100 })).toMatchObject({ experience: 100, gold: 115, raritySteps: 0 });
    expect(factionDungeonReward("red-ledger", { experience: 100, gold: 100 })).toMatchObject({ experience: 100, gold: 100, raritySteps: 1 });
  });

  it("turns faction choices into bounded rivalry consequences", () => {
    const result = applyFactionReputationChange({ wardens: 0, "free-company": 0, "red-ledger": 0 }, "wardens", 20);

    expect(result.reputation.wardens).toBe(20);
    expect(result.reputation["red-ledger"]).toBe(-6);
    expect(result.changes["red-ledger"]).toBe(-6);
    expect(factionHostility(result.reputation, "red-ledger")).toBeGreaterThan(6);
    expect(factionDisposition(-30)).toBe("hostile");

    const relations = createFactionRelations();
    relations["red-ledger"].wardens = -80;
    expect(factionHostility({ wardens: 50, "free-company": 0, "red-ledger": 0 }, "red-ledger", relations)).toBe(40);
    expect(factionRelation(relations, "red-ledger", "wardens")).toBe(-80);
  });

  it("changes arena and dungeon influence without mutating the supplied state", () => {
    const source = createFactionControlState(1);
    const dungeonId = DUNGEONS[0].id;
    const snapshot = JSON.parse(JSON.stringify(source));
    const withArenaInfluence = changeFactionInfluence(source, "arena", Object.keys(source.arenaControllers)[0], "free-company", 11);
    const withDungeonInfluence = changeFactionInfluence(withArenaInfluence, "dungeon", dungeonId, "red-ledger", 7);

    expect(source).toEqual(snapshot);
    expect(withDungeonInfluence.arenaInfluence[Object.keys(source.arenaControllers)[0]]["free-company"])
      .toBe(source.arenaInfluence[Object.keys(source.arenaControllers)[0]]["free-company"] + 11);
    expect(withDungeonInfluence.dungeonInfluence?.[dungeonId]["red-ledger"])
      .toBe(source.dungeonInfluence?.[dungeonId]["red-ledger"]! + 7);
  });

  it("resolves arena, dungeon, relation and shop control as a pure cycle", () => {
    const source = createFactionControlState(1);
    const arenaId = Object.keys(source.arenaControllers)[0];
    const dungeonId = DUNGEONS[0].id;
    const previousArena = source.arenaControllers[arenaId];
    const previousDungeon = source.dungeonControllers![dungeonId];
    source.arenaInfluence[arenaId] = { wardens: 10, "free-company": 90, "red-ledger": 8 };
    source.dungeonInfluence![dungeonId] = { wardens: 10, "free-company": 90, "red-ledger": 8 };
    source.relations = { wardens: { "red-ledger": -40 } };
    const snapshot = JSON.parse(JSON.stringify(source));

    const result = resolveFactionControlCycle(source, 8);

    expect(source).toEqual(snapshot);
    expect(result.state.arenaControllers[arenaId]).toBe("free-company");
    expect(result.arenaChanges).toContainEqual({ arenaId, previousFactionId: previousArena, nextFactionId: "free-company" });
    expect(result.dungeonChanges).toContainEqual({ dungeonId, previousFactionId: previousDungeon, nextFactionId: "free-company" });
    expect(result.state.arenaInfluence[arenaId]["free-company"]).toBe(41);
    expect(result.state.dungeonInfluence?.[dungeonId]["free-company"]).toBe(74);
    expect(result.state.relations?.wardens["free-company"]).toBe(-1);
    expect(result.state.relations?.["free-company"].wardens).toBe(-1);
    expect(result.shopChange).toEqual({ previousFactionId: "wardens", nextFactionId: "free-company" });
    expect(result.state.shopPriceRevision).toBe(1);
    expect(result.state.shopOwnerMentorId).toBeUndefined();
  });

  it("creates and repairs complete dungeon control and faction relations", () => {
    const created = createFactionControlState(4);
    expect(Object.keys(created.dungeonControllers ?? {})).toEqual(DUNGEONS.map((dungeon) => dungeon.id));
    expect(Object.keys(created.dungeonInfluence ?? {})).toEqual(DUNGEONS.map((dungeon) => dungeon.id));

    const normalized = normalizeFactionControlState({
      arenaControllers: {},
      arenaInfluence: {},
      shopControllerId: "unknown",
      lastShiftDay: 0,
      dungeonControllers: { [DUNGEONS[0].id]: "free-company", invalid: "red-ledger" },
      dungeonInfluence: { [DUNGEONS[0].id]: { wardens: 0, "free-company": 72 } },
      relations: { wardens: { "red-ledger": -42 } },
    }, 12);

    expect(Object.keys(normalized.dungeonControllers ?? {})).toEqual(DUNGEONS.map((dungeon) => dungeon.id));
    expect(normalized.dungeonControllers?.[DUNGEONS[0].id]).toBe("free-company");
    expect(normalized.dungeonInfluence?.[DUNGEONS[0].id].wardens).toBe(0);
    expect(normalized.dungeonInfluence?.[DUNGEONS[0].id]["free-company"]).toBe(72);
    expect(normalized.relations?.wardens["red-ledger"]).toBe(-42);
    expect(normalized.relations?.["free-company"].wardens).toBe(8);
  });
});
