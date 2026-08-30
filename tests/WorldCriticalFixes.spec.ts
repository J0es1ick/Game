import { ARENAS } from "../src/catalogs/WorldCatalog";
import { calculateEnemyWorldRating } from "../src/gameplay/world/WorldRanking";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { WorldEvent } from "../src/gameplay/core/WorldTypes";

describe("critical world invariants", () => {
  it("returns newly prepended events even when the journal is already capped", () => {
    const game = WorldGame.create("Свидетель", "Knight", 1);
    game.save.hero.level = 2;
    game.save.worldDay = 2;
    game.save.events = Array.from({ length: 500 }, (_, index): WorldEvent => ({
      id: `old-${index}`,
      day: 1,
      type: "system",
      message: `Старое событие ${index}`,
    }));

    const report = game.play("cellar");
    expect(report.worldEvents.length).toBeGreaterThan(0);
    expect(report.worldEvents.every((event) => !event.id.startsWith("old-"))).toBe(true);
    expect(report.worldEvents.some((event) => event.type === "dungeon")).toBe(true);
  });

  it("grants an arena rating band only after a championship on that arena", () => {
    const game = WorldGame.create("Судья", "Knight", 1);
    const enemy = game.save.enemies[0];
    enemy.arenaIndex = ARENAS.length - 1;
    enemy.level = 25;
    enemy.wins = 10;
    enemy.losses = 0;
    enemy.tournamentWins = 2;
    enemy.arenaTournamentWins = ARENAS.map((_, index) => index === 2 ? 2 : 0);
    const lowerArenaRating = calculateEnemyWorldRating(enemy);

    enemy.tournamentWins += 1;
    enemy.arenaTournamentWins[ARENAS.length - 1] = 1;
    expect(calculateEnemyWorldRating(enemy)).toBeGreaterThan(lowerArenaRating);
  });

  it("does not reinterpret a Crown League win as a normal arena championship on restore", () => {
    const game = WorldGame.create("Корона", "Swordsman", 1);
    const enemy = game.save.enemies[0];
    enemy.arenaIndex = ARENAS.length - 1;
    enemy.tournamentWins = 1;
    enemy.arenaTournamentWins = ARENAS.map(() => 0);

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(restored.save.enemies.find((candidate) => candidate.id === enemy.id)?.arenaTournamentWins)
      .toEqual(ARENAS.map(() => 0));
  });

  it("prepares full arena populations without creating fighters at tournament launch", () => {
    const game = WorldGame.create("Организатор", "Archer", 1);
    const elite = new Set(game.save.eliteLeagueMemberIds);
    ARENAS.forEach((arena, arenaIndex) => {
      const population = game.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !elite.has(enemy.id));
      expect(population.length).toBeGreaterThanOrEqual(arena.participants);
    });

    const arena = ARENAS[0];
    const local = game.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === 0 && !elite.has(enemy.id));
    local.slice(arena.participants - 2).forEach((enemy) => { enemy.alive = false; });
    game.save.tournamentRegistrations[arena.id] = game.save.worldDay;
    const enemyCount = game.save.enemies.length;
    expect(() => game.playTournament(arena.id)).toThrow(/недостаточно бойцов/);
    expect(game.save.enemies).toHaveLength(enemyCount);
  });

  it("replays the same combat after restoring identical RNG snapshots", () => {
    const source = WorldGame.create("Повтор", "Monk", 17).save;
    const first = WorldGame.restore(JSON.parse(JSON.stringify(source)));
    const second = WorldGame.restore(JSON.parse(JSON.stringify(source)));

    const firstReport = first.duel();
    const secondReport = second.duel();

    expect(firstReport.battle?.winnerId).toBe(secondReport.battle?.winnerId);
    expect(firstReport.battle?.turns).toEqual(secondReport.battle?.turns);
    expect(first.save.randomSnapshots.combat).toEqual(second.save.randomSnapshots.combat);
  });

  it("does not consume an expedition node before its pending battle starts", () => {
    let game: WorldGame | undefined;
    let nodeId: string | undefined;
    for (let seed = 1; seed <= 20 && !nodeId; seed += 1) {
      const candidate = WorldGame.create("Следопыт", "Knight", seed);
      candidate.save.worldDay = 2;
      candidate.save.hero.level = 40;
      candidate.save.hero.highestArena = ARENAS.length - 1;
      const expedition = candidate.startExpedition("cellar");
      const combatNode = candidate.reachableExpeditionNodes().find((node) =>
        ["battle", "elite", "rival", "boss", "alternate-boss"].includes(node.kind));
      if (combatNode) {
        game = candidate;
        nodeId = combatNode.id;
        expect(expedition.visitedNodeIds).not.toContain(nodeId);
      }
    }
    expect(game).toBeDefined();
    expect(nodeId).toBeDefined();
    const expedition = game!.save.activeExpedition!;
    const suppliesBefore = expedition.supplies;
    const discoveryBefore = [...game!.dungeonDiscovery("cellar").discoveredNodeIds];

    game!.beginExpeditionNode(nodeId!);

    expect(game!.save.pendingBattle).toBeDefined();
    expect(expedition.supplies).toBe(suppliesBefore);
    expect(expedition.visitedNodeIds).not.toContain(nodeId);
    expect(game!.dungeonDiscovery("cellar").discoveredNodeIds).toEqual(discoveryBefore);
    game!.abortPendingBattle();
    expect(game!.save.pendingBattle).toBeUndefined();
    expect(expedition.supplies).toBe(suppliesBefore);
    expect(game!.reachableExpeditionNodes().map((node) => node.id)).toContain(nodeId);
  });
});
