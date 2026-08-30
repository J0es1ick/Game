import { WorldGame } from "../src/gameplay/core/WorldGame";
import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { createEraChallengeProgress, eraChallengeFor } from "../src/gameplay/world/EraChallenges";
import type { DungeonRoute } from "../src/gameplay/dungeons/DungeonRoute";

function finishPending(game: WorldGame, firstHeroSkill?: string) {
  let chosen = false;
  while (game.currentPendingBattle() && !game.currentPendingBattle()!.session.winnerId) {
    const pending = game.currentPendingBattle()!;
    if (!chosen && pending.session.nextActorId === "hero" && firstHeroSkill) {
      const option = game.pendingBattleActions().find((candidate) => candidate.id === firstHeroSkill && candidate.available);
      if (option) {
        game.stepPendingBattle({ type: "skill", skillId: option.id });
        chosen = true;
        continue;
      }
    }
    game.stepPendingBattle({ type: "basic" });
  }
  return game.finalizePendingBattle();
}

describe("persisted battle transaction", () => {
  test("does not apply rewards or records before finalize", () => {
    const game = WorldGame.create("Transaction", "Knight", 10_001);
    const before = {
      day: game.save.worldDay,
      gold: game.save.hero.gold,
      experience: game.save.hero.experience,
      wins: game.save.hero.wins,
      losses: game.save.hero.losses,
      injuries: JSON.stringify(game.save.hero.injuries),
    };
    game.beginDuel();
    while (!game.currentPendingBattle()!.session.winnerId) game.stepPendingBattle({ type: "basic" });
    expect({
      day: game.save.worldDay,
      gold: game.save.hero.gold,
      experience: game.save.hero.experience,
      wins: game.save.hero.wins,
      losses: game.save.hero.losses,
      injuries: JSON.stringify(game.save.hero.injuries),
    }).toEqual(before);

    const result = game.finalizePendingBattle();
    expect(result.status).toBe("complete");
    expect(game.save.worldDay).toBe(before.day + 1);
    expect(game.currentPendingBattle()).toBeUndefined();
    expect(game.save.hero.experience).toBeGreaterThan(before.experience);
  });

  test("reload resumes the exact unfinished duel", () => {
    const game = WorldGame.create("Reload", "Wizard", 10_002);
    game.beginDuel();
    for (let index = 0; index < 3 && !game.currentPendingBattle()!.session.winnerId; index += 1) {
      game.stepPendingBattle({ type: "basic" });
    }
    const turnsBefore = game.currentPendingBattle()!.session.turns;
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(restored.currentPendingBattle()?.session.turns).toEqual(turnsBefore);
    const finalization = finishPending(restored, "ember");
    expect(finalization.battle.turns.slice(0, turnsBefore.length)).toEqual(turnsBefore);
    expect(restored.currentPendingBattle()).toBeUndefined();
  });

  test("the selected manual skill is the move committed to campaign history", () => {
    const source = WorldGame.create("Choice", "Knight", 10_003);
    const manual = WorldGame.restore(JSON.parse(JSON.stringify(source.save)));
    manual.beginDuel();
    const finalized = finishPending(manual, "shield-bash");
    const firstHeroTurn = finalized.battle.turns.find((turn) => turn.actorId === "hero");
    expect(firstHeroTurn?.skillId).toBe("shield-bash");
    const opponent = manual.save.enemies.find((enemy) => enemy.id === finalized.battle.enemyBefore.id);
    expect(opponent?.heroMemory?.skillKnowledge["shield-bash"]).toBeGreaterThan(0);
  });

  test("abort and an active expedition cannot leak activity rewards", () => {
    const game = WorldGame.create("Recovery", "Knight", 10_004);
    const before = JSON.stringify({ day: game.save.worldDay, gold: game.save.hero.gold, wins: game.save.hero.wins });
    game.beginDuel();
    game.abortPendingBattle();
    expect(JSON.stringify({ day: game.save.worldDay, gold: game.save.hero.gold, wins: game.save.hero.wins })).toBe(before);

    const lossesBefore = game.save.hero.losses;
    const dayBeforeForfeit = game.save.worldDay;
    game.beginDuel();
    game.stepPendingBattle({ type: "basic" });
    const forfeited = game.abortPendingBattle();
    expect(forfeited?.battle.heroWon).toBe(false);
    expect(game.save.hero.losses).toBe(lossesBefore + 1);
    expect(game.save.worldDay).toBe(dayBeforeForfeit + 1);
    expect(game.abortPendingBattle()).toBeUndefined();

    game.save.hero.level = 40;
    game.save.hero.highestArena = 5;
    game.save.worldDay = 100;
    const dungeon = game.activities.find((activity) => activity.kind === "dungeon" && game.availability(activity).unlocked);
    expect(dungeon).toBeDefined();
    game.startExpedition(dungeon!.id);
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(() => restored.train()).toThrow(/поход/i);
    expect(() => restored.duel()).toThrow(/поход/i);
    expect(restored.simulateElapsed(restored.save.lastSimulatedAt + 99_000_000)).toBe(0);
  });

  test("reload preserves the tournament bracket and resumes against the recorded opponent", () => {
    const game = WorldGame.create("Bracket", "Swordsman", 10_005);
    const arena = ARENAS[0];
    const day = game.registerTournament(arena.id);
    game.save.worldDay = day;
    const beforeDay = game.save.worldDay;
    const pending = game.beginTournament(arena.id);
    const opponentId = pending.enemyId;
    const bracketBefore = JSON.parse(JSON.stringify(pending.tournament));

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(restored.currentPendingBattle()?.enemyId).toBe(opponentId);
    expect(restored.currentPendingBattle()?.tournament).toEqual(bracketBefore);
    const report = restored.runPendingBattleAutomatically();

    expect(report && "matches" in report).toBe(true);
    expect(restored.save.worldDay).toBe(beforeDay + 1);
    expect(restored.currentPendingBattle()).toBeUndefined();
    expect(report && "matches" in report ? report.heroBattles[0].enemyBefore.id : undefined).toBe(opponentId);
  });

  test("reload preserves an expedition battle and commits route progress only on finalize", () => {
    const game = WorldGame.create("Delver", "Knight", 10_006);
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.worldDay = 100;
    game.startExpedition(DUNGEONS[0].id);
    const node = game.reachableExpeditionNodes().find((candidate) => candidate.kind === "battle");
    expect(node).toBeDefined();
    const visitedBefore = [...(game.save.activeExpedition?.visitedNodeIds ?? [])];
    game.beginExpeditionNode(node!.id);
    expect(game.save.activeExpedition?.visitedNodeIds).toEqual(visitedBefore);

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    const result = restored.runPendingBattleAutomatically();

    expect(restored.currentPendingBattle()).toBeUndefined();
    expect(result && "completed" in result).toBe(true);
    expect(result && "expedition" in result ? result.expedition?.path : []).toContain(`node:battle:${node!.id}`);
  });

  test("expedition stamina starts full, only falls across battles, survives reload and is restored by camp", () => {
    const game = WorldGame.create("Stamina", "Knight", 10_060);
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.worldDay = 100;
    game.save.hero.inventory.forEach((item) => {
      item.stats = { ...item.stats, health: 10_000, attack: 10_000, defense: 10_000, speed: 1_000 };
    });
    const dungeonId = DUNGEONS[0].id;
    const route: DungeonRoute = {
      dungeonId,
      entryNodeIds: ["battle-1"],
      bossNodeId: "boss",
      nodes: [
        { id: "battle-1", depth: 0, lane: 0, kind: "battle", title: "Первый бой", description: "", danger: 2, rewardMultiplier: 1, connections: ["battle-2"] },
        { id: "battle-2", depth: 1, lane: 0, kind: "battle", title: "Второй бой", description: "", danger: 2, rewardMultiplier: 1, connections: ["camp"] },
        { id: "camp", depth: 2, lane: 0, kind: "camp", title: "Лагерь", description: "", danger: 0, rewardMultiplier: 0, connections: ["battle-3"] },
        { id: "battle-3", depth: 3, lane: 0, kind: "battle", title: "Последний бой", description: "", danger: 2, rewardMultiplier: 1, connections: ["boss"] },
        { id: "boss", depth: 4, lane: 0, kind: "boss", title: "Хранитель", description: "", danger: 4, rewardMultiplier: 2.4, connections: [] },
      ],
    };
    const expedition = game.startExpedition(dungeonId);
    expedition.route = route;
    expedition.maxStages = 5;

    expect(expedition.health).toBe(100);
    const first = game.advanceExpeditionNode("battle-1");
    const afterFirst = first.expedition!.health;
    expect(afterFirst).toBeLessThan(100);

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    const second = restored.advanceExpeditionNode("battle-2");
    const afterSecond = second.expedition!.health;
    expect(afterSecond).toBeLessThan(afterFirst);

    restored.save.activeExpedition!.health = 40;
    const camp = restored.advanceExpeditionNode("camp");
    expect(camp.expedition!.health).toBeGreaterThan(40);

    restored.save.activeExpedition!.health = 1;
    const exhausted = restored.advanceExpeditionNode("battle-3");
    expect(exhausted.retreated).toBe(true);
    expect(exhausted.message).toMatch(/исчерпал запас сил/i);
    expect(restored.save.activeExpedition).toBeUndefined();
  });

  test("a finalized win against a mutated world enemy advances the era objective once", () => {
    const game = WorldGame.create("Mutation", "Knight", 10_007);
    game.save.legacy.cycle = 2;
    game.save.eraChallengeProgress = createEraChallengeProgress(2);
    game.save.hero.level = 40;
    game.save.enemies.forEach((enemy) => {
      enemy.level = 1;
      enemy.equipment = [];
      enemy.equipped = {};
      const mutation = eraChallengeFor(2).mutations[enemy.classId];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    });
    game.beginDuel();
    const mutationId = game.currentPendingBattle()?.session.enemyBefore.mutationId;
    expect(mutationId).toBeDefined();
    const before = game.save.eraChallengeProgress.metrics.mutationVictories ?? 0;
    while (!game.currentPendingBattle()!.session.winnerId) game.stepPendingBattle({ type: "basic" });
    expect(game.save.eraChallengeProgress.metrics.mutationVictories ?? 0).toBe(before);
    const finalized = game.finalizePendingBattle();
    expect(finalized.battle.heroWon).toBe(true);
    expect(game.save.eraChallengeProgress.metrics.mutationVictories).toBe(before + 1);
  });
});
