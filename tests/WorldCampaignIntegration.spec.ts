import { WorldGame } from "../src/gameplay/WorldGame";
import type { DungeonRoute } from "../src/gameplay/DungeonRoute";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function route(): DungeonRoute {
  return {
    dungeonId: "cellar",
    entryNodeIds: ["cache"],
    bossNodeId: "boss",
    nodes: [
      {
        id: "cache", depth: 0, lane: 0, kind: "cache", title: "Тайник", description: "Припасы.",
        danger: 0, rewardMultiplier: 1.2, connections: ["shrine"],
      },
      {
        id: "shrine", depth: 1, lane: 0, kind: "shrine", title: "Алтарь", description: "Клятва.",
        danger: 1, rewardMultiplier: 0, connections: ["boss"],
      },
      {
        id: "boss", depth: 2, lane: 0, kind: "boss", title: "Хранитель", description: "Финал.",
        danger: 4, rewardMultiplier: 2.4, connections: [],
      },
    ],
  };
}

describe("WorldGame campaign services", () => {
  test("migrates old saves into the campaign state without discarding progress", () => {
    const oldSave = clone(WorldGame.create("Архивист", "Archer", 77).save) as unknown as Record<string, unknown>;
    const day = oldSave.worldDay as number;
    delete oldSave.crownSeason;
    delete oldSave.seenNarrativeEventIds;
    delete oldSave.reforgeAttempts;
    delete oldSave.eraChallengeProgress;

    const restored = WorldGame.restore(oldSave);

    expect(restored.save.worldDay).toBe(day);
    expect(restored.save.crownSeason.number).toBe(1);
    expect(restored.save.seenNarrativeEventIds).toEqual([]);
    expect(restored.save.reforgeAttempts).toEqual({});
    expect(restored.save.eraChallengeProgress.cycle).toBe(restored.save.legacy.cycle);
  });

  test("resolves narrative choices atomically", () => {
    const game = WorldGame.create("Должник", "Monk", 91);
    game.save.pendingNarrativeEventId = "risky-forge";
    game.save.hero.gold = 100;
    const before = clone(game.save.randomSnapshots);

    expect(() => game.resolveNarrativeChoice("attempt")).toThrow(/недостаточно монет/i);
    expect(game.save.pendingNarrativeEventId).toBe("risky-forge");
    expect(game.save.seenNarrativeEventIds).not.toContain("risky-forge");
    expect(game.save.hero.gold).toBe(100);
    expect(game.save.randomSnapshots).toEqual(before);

    game.save.hero.gold = 1_000;
    game.resolveNarrativeChoice("attempt");
    expect(game.save.pendingNarrativeEventId).toBeUndefined();
    expect(game.save.seenNarrativeEventIds).toContain("risky-forge");
    expect(game.save.hero.gold).toBe(100);
    expect(game.save.hero.temperingMarks).toBeGreaterThan(0);
  });

  test("makes route caches non-combat rewards and shrine decisions explicit", () => {
    const game = WorldGame.create("Следопыт", "Knight", 123);
    game.save.activeExpedition = {
      dungeonId: "cellar", stage: 0, maxStages: 1, health: 70,
      accumulatedGold: 0, accumulatedExperience: 0, loot: [], path: [], route: route(), visitedNodeIds: [],
    };

    const cache = game.advanceExpeditionNode("cache");
    expect(cache.battle).toBeUndefined();
    expect(cache.completed).toBe(false);
    expect(cache.expedition?.accumulatedGold).toBeGreaterThan(0);
    expect(game.reachableExpeditionNodes().map((node) => node.id)).toEqual(["shrine"]);

    const shrine = game.advanceExpeditionNode("shrine");
    expect(shrine.requiresChoice).toBe(true);
    expect(game.reachableExpeditionNodes()).toEqual([]);
    const resolved = game.resolveExpeditionShrine("blood-oath");
    expect(resolved.expedition?.attackMultiplier).toBeGreaterThan(1);
    expect(resolved.expedition?.health).toBe(56);
    expect(game.reachableExpeditionNodes().map((node) => node.id)).toEqual(["boss"]);
  });

  test("does not consume the loot stream when an unaffordable reforge is rejected", () => {
    const game = WorldGame.create("Кузнец", "Swordsman", 181);
    const item = game.save.hero.inventory[0];
    const sourceStat = Object.keys(item.stats)[0] as keyof typeof item.stats;
    game.save.hero.gold = 0;
    game.save.hero.temperingMarks = 0;
    const before = clone(game.save.randomSnapshots.loot);

    expect(() => game.reforgeItem(item.id, { sourceStat })).toThrow(/нужно/i);
    expect(game.save.randomSnapshots.loot).toEqual(before);
    expect(game.save.hero.inventory[0]).toEqual(item);
  });
});
