import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import { restoreWorldSeasonNames } from "../src/gameplay/WorldSeasonNames";
import { closeWorldSeason, UNKNOWN_SEASON_FIGHTER_NAME, worldSeasonStandings } from "../src/gameplay/WorldSeason";
import { parseWorldSave } from "../src/gameplay/WorldSaveStorage";
import { validateWorldSave } from "../src/gameplay/WorldSaveValidation";
import type { GameSave } from "../src/gameplay/WorldTypes";

let original: GameSave;
beforeAll(() => { original = WorldGame.create("Хронист", "Knight", 16_420).save; });
function saveCopy(): GameSave { return JSON.parse(JSON.stringify(original)) as GameSave; }

describe("Season participant name recovery", () => {
  test("recovers names from mentors, rivalries, events and past seasons without changing results", () => {
    const save = saveCopy();
    const season = save.worldSeason!;
    const ids = ["enemy-mentor", "enemy-rival", "enemy-history", "enemy-actor", "enemy-target", "enemy-unknown"];
    season.arenaPoints[ARENAS[0].id] = Object.fromEntries(ids.map((id, index) => [id, 43 + index]));
    save.mentors = [{
      id: "mentor-record", fighterId: ids[0], name: "Отис Д.", classId: "Knight", factionId: "wardens",
      goal: "champion", level: 30, rating: 2000, retiredDay: 1, studentIds: [], legacy: "Наставник",
    }];
    save.hero.rivalries[ids[1]] = {
      enemyId: ids[1], name: "Флинт В.", classId: "Knight", wins: 2, losses: 1, killed: true, lastMetDay: 1,
    };
    const result = closeWorldSeason(season, save.enemies, [], save.hero.name, []);
    result.champions = [
      { fighterId: ids[2], fighterName: "Хельга Е.", arenaId: ARENAS[0].id, points: 55, place: 1 },
      { fighterId: ids[0], fighterName: ids[0], arenaId: ARENAS[1].id, points: 65, place: 1 },
      { fighterId: ids[5], fighterName: ids[5], arenaId: ARENAS[2].id, points: 75, place: 1 },
    ];
    result.eliteChampion = { fighterId: ids[0], fighterName: ids[0], arenaId: "elite", points: 80, place: 1 };
    save.worldSeasonHistory = [result];
    save.events = [{
      id: "battle-record", day: 1, type: "battle", message: "Встреча бойцов",
      payload: { kind: "battle", actorId: ids[3], actorName: "Стерн С.", targetId: ids[4], targetName: "Мара Г.", outcome: "won" },
    }];
    const points = JSON.stringify(season.arenaPoints);
    restoreWorldSeasonNames(save);
    expect(season.fighterNames).toEqual({
      [ids[0]]: "Отис Д.", [ids[1]]: "Флинт В.", [ids[2]]: "Хельга Е.", [ids[3]]: "Стерн С.", [ids[4]]: "Мара Г.",
    });
    expect(JSON.stringify(season.arenaPoints)).toBe(points);
    expect(result.champions.map((champion) => champion.fighterName)).toEqual(["Хельга Е.", "Отис Д.", UNKNOWN_SEASON_FIGHTER_NAME]);
    expect(result.eliteChampion.fighterName).toBe("Отис Д.");
    expect(result.champions.map((champion) => champion.points)).toEqual([55, 65, 75]);
    worldSeasonStandings(season, save.enemies, save.hero.name).forEach((entry) => {
      expect(ids).not.toContain(entry.fighterName);
    });
    const firstRecovery = JSON.stringify(save);
    restoreWorldSeasonNames(save);
    expect(JSON.stringify(save)).toBe(firstRecovery);
  });

  test("loads older saves without the name registry and repairs an archived champion", () => {
    const save = saveCopy();
    const id = "enemy-archived-winner";
    delete (save.worldSeason as Partial<NonNullable<GameSave["worldSeason"]>>).fighterNames;
    save.worldSeason!.arenaPoints[ARENAS[0].id][id] = 55;
    const result = closeWorldSeason(save.worldSeason!, save.enemies, [], save.hero.name, []);
    result.champions[0].fighterName = id;
    save.worldSeasonHistory = [result];
    save.events.push({
      id: "tournament-record", day: 1, type: "tournament", message: "Чемпион определён",
      payload: { kind: "tournament", championId: id, championName: "Хельга Е.", tournamentId: ARENAS[0].id, tournamentName: ARENAS[0].name, participants: 8 },
    });
    const restored = parseWorldSave(JSON.stringify(save));
    expect(restored.worldSeason!.fighterNames[id]).toBe("Хельга Е.");
    expect(restored.worldSeason!.arenaPoints).toEqual(save.worldSeason!.arenaPoints);
    expect(restored.worldSeasonHistory![0].champions[0].fighterName).toBe("Хельга Е.");
    expect(restored.hero.level).toBe(save.hero.level);
    expect(restored.hero.gold).toBe(save.hero.gold);
    expect(validateWorldSave(restored)).toEqual({ valid: true, issues: [] });
  });

  test("preserves the name when population cleanup actually removes an NPC", () => {
    const save = saveCopy();
    const fallen = Array.from({ length: 270 }, (_, index) => ({
      ...save.enemies[0], id: `enemy-fallen-${index}`, name: `Участник ${index}`, alive: false,
      relationships: {}, equipment: [], equipped: {}, history: [],
    }));
    save.enemies.push(...fallen);
    save.worldSeason!.arenaPoints[ARENAS[0].id][fallen[0].id] = 99;
    const game = WorldGame.restore(save);
    expect(game.save.enemies.some((fighter) => fighter.id === fallen[0].id)).toBe(false);
    expect(game.worldSeasonLeaderboard(ARENAS[0].id)[0]).toMatchObject({
      fighterId: fallen[0].id, fighterName: fallen[0].name, points: 99,
    });
    const reloaded = WorldGame.restore(parseWorldSave(JSON.stringify(game.save)));
    expect(reloaded.worldSeasonLeaderboard(ARENAS[0].id)[0].fighterName).toBe(fallen[0].name);
    const view = reloaded.currentWorldSeason();
    view.fighterNames[fallen[0].id] = "Другое имя";
    expect(reloaded.save.worldSeason!.fighterNames[fallen[0].id]).toBe(fallen[0].name);
  });

  test.each([null, [], 42, { "enemy-invalid": 17 }, { "enemy-invalid": "" }])("validates optional name metadata: %p", (fighterNames) => {
    const save = saveCopy();
    (save.worldSeason as unknown as Record<string, unknown>).fighterNames = fighterNames;
    const result = validateWorldSave(save);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path.startsWith("$.worldSeason.fighterNames"))).toBe(true);
  });
});
