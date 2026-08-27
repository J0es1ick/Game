import { createItem } from "../src/factories/ItemFactory";
import {
  createFactionControlState,
  createWorldRelicRecord,
  normalizeFactionControlState,
  normalizeWorldRelics,
} from "../src/gameplay/LivingWorld";
import { SeededRandom } from "../src/gameplay/RandomSource";
import { WorldGame } from "../src/gameplay/WorldGame";
import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { FACTIONS } from "../src/catalogs/WorldExpansionCatalog";

describe("LivingWorld", () => {
  it("creates persistent faction control for every arena and dungeon", () => {
    const state = createFactionControlState(4);

    expect(Object.keys(state.arenaControllers)).toEqual(ARENAS.map((arena) => arena.id));
    ARENAS.forEach((arena) => {
      expect(FACTIONS.some((faction) => faction.id === state.arenaControllers[arena.id])).toBe(true);
      expect(Object.keys(state.arenaInfluence[arena.id])).toHaveLength(FACTIONS.length);
    });
    expect(Object.keys(state.dungeonControllers ?? {})).toEqual(DUNGEONS.map((dungeon) => dungeon.id));
    DUNGEONS.forEach((dungeon) => {
      expect(FACTIONS.some((faction) => faction.id === state.dungeonControllers?.[dungeon.id])).toBe(true);
      expect(Object.keys(state.dungeonInfluence?.[dungeon.id] ?? {})).toHaveLength(FACTIONS.length);
    });
    expect(state.relations?.wardens["red-ledger"]).toBeLessThan(0);
  });

  it("repairs incomplete faction state from an older save", () => {
    const state = normalizeFactionControlState({
      arenaControllers: { [ARENAS[0].id]: "unknown" },
      arenaInfluence: {},
      shopControllerId: "unknown",
      lastShiftDay: 0,
      dungeonControllers: { [DUNGEONS[0].id]: "free-company", invalid: "unknown" },
      relations: { wardens: { "red-ledger": -42 } },
      shopPriceRevision: 3,
    }, 12);

    expect(FACTIONS.some((faction) => faction.id === state.shopControllerId)).toBe(true);
    expect(FACTIONS.some((faction) => faction.id === state.arenaControllers[ARENAS[0].id])).toBe(true);
    expect(state.lastShiftDay).toBe(12);
    expect(Object.keys(state.dungeonControllers ?? {})).toEqual(DUNGEONS.map((dungeon) => dungeon.id));
    expect(state.dungeonControllers?.[DUNGEONS[0].id]).toBe("free-company");
    expect(state.relations?.wardens["red-ledger"]).toBe(-42);
    expect(state.shopPriceRevision).toBe(3);
  });

  it("preserves a named item as a transferable world relic", () => {
    const item = createItem(24, {
      classId: "Swordsman",
      slot: "weapon",
      rarity: "legendary",
      randomSource: new SeededRandom("world-relic"),
    });
    const record = createWorldRelicRecord("relic-test", item, "enemy-test", "Орса К.", 38);
    const restored = normalizeWorldRelics([JSON.parse(JSON.stringify(record))])[0];

    expect(item.worldRelicId).toBe("relic-test");
    expect(item.relicName).toContain("Орса");
    expect(restored.currentOwnerId).toBe("enemy-test");
    expect(restored.history[0]).toContain("День 38");
  });

  it("gives every simulated fighter a goal, faction, economy and daily choice", () => {
    const now = 1_800_000_000_000;
    const game = WorldGame.create("Путник", "Knight", now);
    game.setAutoResolveLegendChallenges(true);

    game.simulateElapsed(now + 600_000);

    const active = game.save.enemies.filter((enemy) => enemy.alive);
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((enemy) => Boolean(enemy.goal && enemy.factionId))).toBe(true);
    expect(active.every((enemy) => typeof enemy.gold === "number")).toBe(true);
    expect(active.some((enemy) => enemy.lastActivity?.day === 1)).toBe(true);
  });
});
