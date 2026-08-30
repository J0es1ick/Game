import { WorldGame } from "../src/gameplay/core/WorldGame";
import {
  byLeaderboardPosition,
  calculateEnemyWorldRating,
  calculateHeroWorldRating,
  enemyLeaderboardEntry,
  heroLeaderboardEntry,
} from "../src/gameplay/world/WorldRanking";
import {
  normalizeWorldSave,
  PROGRESSION_CURVE_MIGRATION,
} from "../src/gameplay/save/WorldSaveMigration";
import { GameSave } from "../src/gameplay/core/WorldTypes";
import { createRandomId, shuffleArray } from "../src/utils/randomization/index";

describe("world architecture helpers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes an old save in place and remains idempotent", () => {
    const save = JSON.parse(JSON.stringify(WorldGame.create("Архивариус", "Knight", 1).save)) as GameSave;
    const old = save as unknown as Record<string, unknown>;
    const hero = save.hero as unknown as Record<string, unknown>;

    old.version = 2;
    old.legacy = undefined;
    old.defeatedLegacyCycles = undefined;
    old.contractOffers = undefined;
    hero.selectedSkillIds = ["shield-bash", "shield-bash", "missing-skill"];
    save.hero.inventory[0].name = `[3D-прототип] ${save.hero.inventory[0].name}`;
    save.hero.inventory[0].grantedSkillId = "stolen-second";

    expect(normalizeWorldSave(save)).toBe(save);
    expect(save.version).toBe(3);
    expect(save.legacy.discoveredSkillIds).toContain("stolen-second");
    expect(save.hero.selectedSkillIds).toEqual(["shield-bash"]);
    expect(save.hero.inventory[0].name).not.toContain("3D-прототип");
    expect(save.migrations).toContain(PROGRESSION_CURVE_MIGRATION);

    const once = JSON.stringify(save);
    normalizeWorldSave(save);
    expect(JSON.stringify(save)).toBe(once);
  });

  it("keeps world rating rules in pure, reusable functions", () => {
    const game = WorldGame.create("Рейтинговый", "Knight", 1);
    const hero = game.save.hero;
    hero.level = 20;
    hero.highestArena = 3;
    hero.arenaWins = [2, 1, 1, 0, 0, 0];
    hero.tournamentMatchWins = 12;
    hero.tournamentMatchLosses = 3;

    const unprovenRating = calculateHeroWorldRating(hero);
    hero.arenaWins[3] = 1;
    const provenRating = calculateHeroWorldRating(hero);
    expect(provenRating).toBeGreaterThan(unprovenRating);

    const enemy = game.save.enemies[0];
    expect(calculateEnemyWorldRating(enemy)).toBeGreaterThanOrEqual(1000);
    enemy.carriedFromCycle = 4;
    expect(enemyLeaderboardEntry(enemy).carriedFromCycle).toBe(4);
    expect(heroLeaderboardEntry(hero).carriedFromCycle).toBeUndefined();
    expect(heroLeaderboardEntry(hero, { crownLeagueWins: 2 }).tournamentWins)
      .toBe(hero.arenaWins.reduce((sum, wins) => sum + wins, 0) + 2);
    expect(enemyLeaderboardEntry(enemy, { crownLeagueWins: 3 }).tournamentWins)
      .toBe(enemy.tournamentWins + 3);
  });

  it("orders leaderboard ties by tournament wins and level", () => {
    const game = WorldGame.create("Судья", "Knight", 1);
    const [first, second] = game.save.enemies.slice(0, 2).map((enemy) => enemyLeaderboardEntry(enemy));
    first.rating = second.rating = 2000;
    first.tournamentWins = 5;
    second.tournamentWins = 8;
    expect([first, second].sort(byLeaderboardPosition)[0]).toBe(second);
  });

  it("keeps pupils and competitive mentors in the shared ranking with their school", () => {
    const game = WorldGame.create("Летописец", "Knight", 1717);
    const [mentor, pupil] = game.save.enemies.slice(0, 2);
    game.save.eliteLeagueMemberIds = [];
    mentor.alive = true;
    pupil.alive = true;
    mentor.rating = 99_999;
    pupil.rating = 99_998;
    pupil.mentorId = "mentor-visible";
    game.save.mentors = [{
      id: "mentor-visible",
      fighterId: mentor.id,
      name: mentor.name,
      classId: mentor.classId,
      factionId: mentor.factionId!,
      goal: "champion",
      level: mentor.level,
      rating: mentor.rating,
      retiredDay: game.save.worldDay,
      studentIds: [pupil.id],
      legacy: "Продолжает защищать имя школы.",
      schoolName: "Школа Северного клинка",
      competes: true,
    }];

    const ranking = game.leaderboard();
    expect(ranking.find((entry) => entry.id === mentor.id)).toMatchObject({
      schoolName: "Школа Северного клинка",
      mentorName: mentor.name,
      isMentor: true,
    });
    expect(ranking.find((entry) => entry.id === pupil.id)).toMatchObject({
      schoolName: "Школа Северного клинка",
      mentorName: mentor.name,
      isMentor: false,
    });
  });

  it("shares deterministic shuffle and id formats without mutating inputs", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(Date, "now").mockReturnValue(1234);
    const source = [1, 2, 3];
    expect(shuffleArray(source)).toEqual([2, 3, 1]);
    expect(source).toEqual([1, 2, 3]);
    expect(createRandomId("event")).toMatch(/^event-ya-/);
  });
});
