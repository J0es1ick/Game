import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import { awardWorldEliteSeasonPoints, closeWorldSeason, createWorldSeason, normalizeWorldSeason, worldEliteSeasonStandings } from "../src/gameplay/WorldSeason";
import { SeededRandom } from "../src/gameplay/RandomSource";
import type { EnemyProfile } from "../src/gameplay/WorldTypes";

let source: EnemyProfile;
beforeAll(() => { source = WorldGame.create("Хронист", "Knight", 15_300).save.enemies[0]; });
function fighter(id: string, arenaIndex: number, level = 30): EnemyProfile {
  return { ...source, id, name: id, arenaIndex, level, alive: true };
}
function season() { return createWorldSeason(1, 1, new SeededRandom("season")); }

describe("World season results", () => {
  test("elite victories, defeats, defenses and championships accumulate distinct points", () => {
    const state = season();
    expect(awardWorldEliteSeasonPoints(state, "hero", "win")).toBe(3);
    expect(awardWorldEliteSeasonPoints(state, "hero", "loss")).toBe(1);
    expect(awardWorldEliteSeasonPoints(state, "hero", "defense")).toBe(5);
    expect(awardWorldEliteSeasonPoints(state, "hero", "champion")).toBe(18);
    expect(state.elitePoints.hero).toBe(27);
    expect(Object.values(state.arenaPoints).every((points) => Object.keys(points).length === 0)).toBe(true);
    const restored = normalizeWorldSeason(JSON.parse(JSON.stringify(state)), 12, new SeededRandom("restore"));
    expect(restored.elitePoints.hero).toBe(27);
  });

  test("closing records the elite champion alongside ordinary arena champions", () => {
    const state = season();
    const rival = fighter("rival", 5);
    state.arenaPoints[ARENAS[0].id].hero = 20;
    state.elitePoints = { hero: 27, rival: 20, missing: 999 };
    const result = closeWorldSeason(state, [rival], [], "Хронист", []);
    expect(result.champions[0].fighterId).toBe("hero");
    expect(result.eliteChampion).toMatchObject({ fighterId: "hero", fighterName: "Хронист", points: 27, place: 1, arenaId: "elite" });
    expect(worldEliteSeasonStandings(state, [rival], "Хронист")).toHaveLength(2);
    expect(closeWorldSeason(season(), [rival], [], "Хронист", []).eliteChampion).toBeUndefined();
  });

  test("historical points cannot promote or demote departed and dead fighters", () => {
    const state = season();
    const moved = fighter("moved", 3);
    const dead = { ...fighter("dead", 0), alive: false };
    const local = fighter("local", 0);
    const localLoser = fighter("loser", 1, 1);
    state.arenaPoints[ARENAS[0].id] = { moved: 100, dead: 90, local: 50 };
    state.arenaPoints[ARENAS[1].id] = { moved: 1, dead: 2, loser: 3 };
    const result = closeWorldSeason(state, [moved, dead, local, localLoser], [], "Герой", []);
    expect(result.promotedIds).toEqual(["local"]);
    expect(result.demotedIds).toEqual(["loser"]);
    expect(result.champions[0].fighterId).toBe("moved");
  });

  test("promotion requires the next arena minimum level and cannot also demote the same fighter", () => {
    const state = season();
    const threshold = ARENAS[2].minLevel;
    const novice = fighter("novice", 1, threshold - 1);
    const ready = fighter("ready", 1, threshold);
    state.arenaPoints[ARENAS[1].id] = { novice: 50, ready: 40 };
    const result = closeWorldSeason(state, [novice, ready], [], "Герой", []);
    expect(result.promotedIds).toEqual(["ready"]);
    expect(result.demotedIds).not.toContain("ready");
    expect(result.promotedIds).not.toContain("novice");
  });
});
