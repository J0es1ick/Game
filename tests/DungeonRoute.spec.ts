import {
  completeDungeonExploration,
  createDungeonDiscoveryState,
  dungeonMerchantTerms,
  expectedDungeonDays,
  generateDungeonRoute,
  reachableDungeonNodes,
  recordDungeonNodeVisit,
  resolveDungeonTrap,
  selectPersistentDungeonRival,
  visibleDungeonNodes,
} from "../src/gameplay/DungeonRoute";
import { SeededRandom } from "../src/gameplay/RandomSource";

describe("dungeon route", () => {
  test("creates a deterministic route with persistent encounters and two endings", () => {
    const first = generateDungeonRoute("archive", 5, new SeededRandom("archive:10"));
    const second = generateDungeonRoute("archive", 5, new SeededRandom("archive:10"));
    expect(first).toEqual(second);
    expect(first.entryNodeIds).toHaveLength(2);
    expect(first.nodes.filter((node) => node.kind === "boss")).toHaveLength(1);
    expect(first.nodes.filter((node) => node.kind === "alternate-boss")).toHaveLength(1);
    expect(first.nodes.some((node) => node.kind === "merchant")).toBe(true);
    expect(first.nodes.some((node) => node.kind === "rival")).toBe(true);
    expect(first.nodes.some((node) => node.kind === "trap" && node.hidden)).toBe(true);
    const preBoss = first.nodes.filter((node) => node.depth === 3);
    expect(preBoss.every((node) => node.connections.includes(first.bossNodeId))).toBe(true);
    expect(preBoss.every((node) => node.connections.includes(first.alternateBossNodeId!))).toBe(true);
  });

  test("only exposes nodes connected to the last choice", () => {
    const route = generateDungeonRoute("vault", 4, new SeededRandom(12));
    const entry = reachableDungeonNodes(route, [])[0];
    expect(reachableDungeonNodes(route, [entry.id]).map((node) => node.id)).toEqual(entry.connections);
  });

  test("reveals secret paths over repeated runs and discovered clues", () => {
    const route = generateDungeonRoute("vault", 4, new SeededRandom(12));
    const initial = createDungeonDiscoveryState(route.dungeonId);
    const trap = route.nodes.find((node) => node.kind === "trap")!;
    const alternate = route.nodes.find((node) => node.kind === "alternate-boss")!;
    expect(visibleDungeonNodes(route, initial)).not.toContainEqual(trap);
    expect(visibleDungeonNodes(route, initial)).not.toContainEqual(alternate);
    const afterRun = completeDungeonExploration(route, initial, route.entryNodeIds.slice(0, 1));
    expect(visibleDungeonNodes(route, afterRun)).toContainEqual(trap);
    expect(visibleDungeonNodes(route, afterRun)).not.toContainEqual(alternate);
    const afterTrap = recordDungeonNodeVisit(route, afterRun, trap.id);
    expect(visibleDungeonNodes(route, afterTrap)).toContainEqual(alternate);
  });

  test("resolves trap and merchant terms from generated event data", () => {
    const route = generateDungeonRoute("cellar", 5, new SeededRandom(99));
    const trap = route.nodes.find((node) => node.kind === "trap")!;
    const merchant = route.nodes.find((node) => node.kind === "merchant")!;
    const result = resolveDungeonTrap(trap, 70, 1000);
    expect(result.staminaAfter).toBeLessThan(70);
    expect(result.goldAfter).toBeLessThan(1000);
    expect(result.clueId).toBe("cellar:seal");
    const terms = dungeonMerchantTerms(merchant, 20);
    expect(terms.healingPrice).toBeGreaterThan(0);
    expect(terms.staminaRestored).toBeGreaterThan(0);
  });

  test("selects the same active tournament rival for the same encounter", () => {
    const route = generateDungeonRoute("archive", 5, new SeededRandom(44));
    const rival = route.nodes.find((node) => node.kind === "rival")!;
    const candidates = [
      { id: "retired", retiredDay: 30, tournamentWins: 10 },
      { id: "rookie", tournamentWins: 0 },
      { id: "veteran-a", tournamentWins: 3 },
      { id: "veteran-b", tournamentWins: 8 },
    ];
    const first = selectPersistentDungeonRival(rival, candidates);
    const second = selectPersistentDungeonRival(rival, [...candidates].reverse());
    expect(first?.id).toBe(second?.id);
    expect(first?.id).toMatch(/^veteran-/);
  });

  test("keeps legacy routes reachable without discovery metadata", () => {
    const route = {
      dungeonId: "legacy",
      nodes: [
        { id: "entry", depth: 0, lane: 0, kind: "battle" as const, title: "Вход", description: "", danger: 1, rewardMultiplier: 1, connections: ["boss"] },
        { id: "boss", depth: 1, lane: 0, kind: "boss" as const, title: "Финал", description: "", danger: 4, rewardMultiplier: 2, connections: [] },
      ],
      entryNodeIds: ["entry"],
      bossNodeId: "boss",
    };
    expect(reachableDungeonNodes(route, []).map((node) => node.id)).toEqual(["entry"]);
    expect(reachableDungeonNodes(route, ["entry"]).map((node) => node.id)).toEqual(["boss"]);
  });

  test("estimates that expeditions occupy several world days", () => {
    const route = generateDungeonRoute("cellar", 5, new SeededRandom(99));
    expect(expectedDungeonDays(route).minimum).toBe(5);
    expect(expectedDungeonDays(route).maximum).toBeGreaterThanOrEqual(5);
  });
});
