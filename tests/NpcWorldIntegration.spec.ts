import { ARENAS, ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import * as NpcCombat from "../src/gameplay/NpcCombat";
import * as NpcLifeSimulation from "../src/gameplay/NpcLifeSimulation";
import { WorldGame } from "../src/gameplay/WorldGame";
import { calculateEnemyWorldRating } from "../src/gameplay/WorldRanking";
import type { EnemyProfile, ExpeditionStepReport } from "../src/gameplay/WorldTypes";

interface WorldSimulation {
  simulateNpcAgencyDay(): void;
  resolvePlannedNpcFight(first: EnemyProfile, second: EnemyProfile, targeted: boolean): Pick<NpcCombat.NpcCombatResult, "winner" | "loser" | "fullCombat">;
  simulateBackgroundTournament(arenaIndex: number): void;
  simulateEliteDay(): void;
  awardCrownSeason(fighterId: string, result: "win" | "loss" | "defense" | "champion"): void;
  finishExpedition(retreated: boolean, message: string): ExpeditionStepReport;
  maybeAwakenWorldRelic(enemy: EnemyProfile, force: boolean): void;
  completeDay(): void;
}

function world() {
  const game = WorldGame.create("Наблюдатель", "Knight", 1_800_000_000_000);
  return { game, simulation: game as unknown as WorldSimulation };
}

afterEach(() => jest.restoreAllMocks());

describe("NPC world combat integration", () => {
  test("all daily NPC plans share one roster index", () => {
    const { game, simulation } = world();
    const expectedFighterIds = game.save.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id);
    const contextSpy = jest.spyOn(NpcLifeSimulation, "createNpcPlanningContext");
    const plansSpy = jest.spyOn(NpcLifeSimulation, "planNpcDay");
    simulation.simulateNpcAgencyDay();
    expect(contextSpy).toHaveBeenCalledTimes(1);
    expect(plansSpy.mock.calls.map(([fighter]) => fighter.id)).toEqual(expectedFighterIds);
    const context = contextSpy.mock.results[0].value;
    expect(context.index.activeById.size).toBe(expectedFighterIds.length);
    expect(plansSpy.mock.calls.every(([, , value]) => value === context)).toBe(true);
    game.save.worldDay += 1;
    simulation.simulateNpcAgencyDay();
    expect(contextSpy).toHaveBeenCalledTimes(2);
    expect(contextSpy.mock.results[1].value).not.toBe(context);
  });

  test("a personal revenge duel does not award arena progress or season points", () => {
    const { game, simulation } = world();
    const pair = game.save.enemies.slice(0, 2);
    pair.forEach((fighter) => { fighter.level = 20; fighter.experience = 0; });
    const arenaWins = new Map(pair.map((fighter) => [fighter.id, fighter.arenaWins]));
    const points = JSON.stringify(game.save.worldSeason!.arenaPoints);
    const influence = JSON.stringify(game.save.factionControl!.arenaInfluence);
    const ratings = new Map(pair.map((fighter) => [fighter.id, calculateEnemyWorldRating(fighter)]));

    const result = simulation.resolvePlannedNpcFight(pair[0], pair[1], true);

    expect(result.fullCombat).toBe(true);
    expect(result.winner.duelWins).toBe(1);
    expect(result.loser.duelLosses).toBe(1);
    pair.forEach((fighter) => {
      expect(fighter.arenaWins).toBe(arenaWins.get(fighter.id));
      expect(calculateEnemyWorldRating(fighter)).toBe(ratings.get(fighter.id));
    });
    expect(JSON.stringify(game.save.worldSeason!.arenaPoints)).toBe(points);
    expect(JSON.stringify(game.save.factionControl!.arenaInfluence)).toBe(influence);
  });

  test("background tournaments receive their calendar rules and shared era laws", () => {
    const { game, simulation } = world();
    game.save.legacy.activeLawIds = ["age-of-steel"];
    const spy = jest.spyOn(NpcCombat, "resolveNpcCombat");
    const ruleIds = game.tournamentRules(ARENAS[0].id, game.save.worldDay).map((rule) => rule.id);

    simulation.simulateBackgroundTournament(0);

    expect(spy).toHaveBeenCalled();
    spy.mock.calls.forEach(([, , context]) => {
      expect(context.ruleIds).toEqual(ruleIds);
      expect(context.lawIds).toEqual(["age-of-steel"]);
    });
    expect(spy.mock.calls.some(([, , context]) => context.forceFull)).toBe(true);
  });

  test("a duel with the hero updates NPC duel statistics without changing tournament rating", () => {
    const { game, simulation } = world();
    jest.spyOn(simulation, "completeDay").mockImplementation(() => undefined);
    const pending = game.beginDuel();
    const enemy = game.save.enemies.find((fighter) => fighter.id === pending.enemyId)!;
    const rating = calculateEnemyWorldRating(enemy);
    const arenaWins = enemy.arenaWins;

    game.runPendingBattleAutomatically();

    expect((enemy.duelWins ?? 0) + (enemy.duelLosses ?? 0)).toBe(1);
    expect(enemy.arenaWins).toBe(arenaWins);
    expect(calculateEnemyWorldRating(enemy)).toBe(rating);
  });

  test("NPC awakening skips protected crown equipment without interrupting the world day", () => {
    const { game, simulation } = world();
    const enemy = game.save.enemies[0];
    const template = ITEM_TEMPLATES.find((item) => item.exclusiveToElite
      && (item.allowedClasses === "all" || item.allowedClasses.includes(enemy.classId)))!;
    const item = createItem(30, { classId: enemy.classId, templateId: template.id, rarity: "mythic" });
    enemy.equipment = [item];
    enemy.equipped = { [item.slot]: item.id };

    expect(() => simulation.maybeAwakenWorldRelic(enemy, true)).not.toThrow();
    expect(item.worldRelicId).toBeUndefined();
    expect(game.save.worldRelics!.some((record) => record.currentOwnerId === enemy.id)).toBe(false);
  });

  test("every elite outcome updates both season ledgers exactly once", () => {
    const { game, simulation } = world();
    const points = JSON.stringify(game.save.worldSeason!.arenaPoints);

    simulation.awardCrownSeason("hero", "win");
    simulation.awardCrownSeason("hero", "loss");
    simulation.awardCrownSeason("hero", "defense");
    simulation.awardCrownSeason("hero", "champion");

    expect(game.save.worldSeason!.elitePoints.hero).toBe(27);
    expect(game.save.crownSeason.points.hero).toBe(27);
    expect(JSON.stringify(game.save.worldSeason!.arenaPoints)).toBe(points);
  });

  test("a background Crown League contributes its actual results to the world season", () => {
    const { game, simulation } = world();
    game.save.worldDay = game.crownLeagueInterval();
    const points = JSON.stringify(game.save.worldSeason!.arenaPoints);

    simulation.simulateEliteDay();

    expect(game.save.lastCrownLeagueDay).toBe(game.save.worldDay);
    const elitePoints = game.save.worldSeason!.elitePoints;
    expect(Object.keys(elitePoints).length).toBeGreaterThanOrEqual(30);
    expect(Object.values(elitePoints).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(134);
    expect(elitePoints).toEqual(game.save.crownSeason.points);
    expect(JSON.stringify(game.save.worldSeason!.arenaPoints)).toBe(points);
  });

  test("dungeon completion grants loot and experience but no arena season points", () => {
    const { game, simulation } = world();
    jest.spyOn(simulation, "completeDay").mockImplementation(() => undefined);
    game.save.hero.level = 2;
    game.save.worldDay = 2;
    const expedition = game.startExpedition("cellar");
    expedition.stage = expedition.maxStages;
    expedition.accumulatedExperience = 100;
    expedition.accumulatedGold = 80;
    const points = JSON.stringify(game.save.worldSeason!.arenaPoints);

    const result = simulation.finishExpedition(false, "Данж пройден.");

    expect(result.completed).toBe(true);
    expect(result.rewards!.experience).toBeGreaterThan(0);
    expect(game.save.hero.dungeonWins).toBe(1);
    expect(JSON.stringify(game.save.worldSeason!.arenaPoints)).toBe(points);
  });
});
