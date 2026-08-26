import { expectedDungeonDays, generateDungeonRoute, reachableDungeonNodes } from "../src/gameplay/DungeonRoute";
import { SeededRandom } from "../src/gameplay/RandomSource";

describe("dungeon route", () => {
  test("creates a deterministic branching route ending in one boss", () => {
    const first = generateDungeonRoute("archive", 5, new SeededRandom("archive:10"));
    const second = generateDungeonRoute("archive", 5, new SeededRandom("archive:10"));
    expect(first).toEqual(second);
    expect(first.entryNodeIds).toHaveLength(2);
    expect(first.nodes.filter((node) => node.kind === "boss")).toHaveLength(1);
    expect(first.nodes.filter((node) => node.depth === 3).every((node) => node.connections[0] === first.bossNodeId)).toBe(true);
    for (let depth = 0; depth < 4; depth += 1) {
      const choices = first.nodes.filter((node) => node.depth === depth);
      expect(new Set(choices.map((node) => node.kind)).size).toBe(2);
      expect(choices.some((node) => node.kind === "battle" || node.kind === "elite")).toBe(true);
      expect(choices.some((node) => ["cache", "camp", "shrine"].includes(node.kind))).toBe(true);
    }
  });

  test("only exposes nodes connected to the last choice", () => {
    const route = generateDungeonRoute("vault", 4, new SeededRandom(12));
    const entry = reachableDungeonNodes(route, [])[0];
    expect(reachableDungeonNodes(route, [entry.id]).map((node) => node.id)).toEqual(entry.connections);
  });

  test("estimates that expeditions occupy several world days", () => {
    const route = generateDungeonRoute("cellar", 5, new SeededRandom(99));
    expect(expectedDungeonDays(route).minimum).toBe(5);
    expect(expectedDungeonDays(route).maximum).toBeGreaterThanOrEqual(5);
  });
});
