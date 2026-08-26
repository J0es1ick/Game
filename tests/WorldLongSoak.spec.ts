import { worldBalanceSnapshot } from "../src/gameplay/BalanceTelemetry";
import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";

const DAY_MS = 600_000;

function simulateDays(game: WorldGame, days: number, now: number): void {
  let remaining = days;
  while (remaining > 0) {
    const batch = Math.min(14, remaining);
    game.save.lastSimulatedAt = now - batch * DAY_MS;
    expect(game.simulateElapsed(now)).toBe(batch);
    remaining -= batch;
  }
}

function expectFullArenaPopulations(game: WorldGame): void {
  const elite = new Set(game.save.eliteLeagueMemberIds);
  ARENAS.forEach((arena, arenaIndex) => {
    const alive = game.save.enemies.filter((enemy) =>
      enemy.alive && enemy.arenaIndex === arenaIndex && !elite.has(enemy.id));
    expect(alive.length).toBeGreaterThanOrEqual(arena.participants);
  });
}

describe("seeded 365-day world soak", () => {
  test("keeps identity, population, inventory, elite and economy invariants", () => {
    const now = 1_760_000_000_000;
    const game = WorldGame.create("Наблюдатель", "Knight", now);
    game.save.hero.autoResolveLegendChallenges = true;

    simulateDays(game, 351, now);
    const previousTop = game.leaderboard().map((entry) => entry.id);
    simulateDays(game, 14, now);

    const enemyIds = game.save.enemies.map((enemy) => enemy.id);
    expect(new Set(enemyIds).size).toBe(enemyIds.length);

    const itemIds = [
      ...game.save.hero.inventory.map((item) => item.id),
      ...game.save.enemies.flatMap((enemy) => enemy.equipment.map((item) => item.id)),
      ...game.save.shopOffers.map((offer) => offer.item.id),
    ];
    expect(new Set(itemIds).size).toBe(itemIds.length);

    expect(Math.max(...game.save.enemies.map((enemy) => enemy.equipment.length))).toBeLessThanOrEqual(6);
    expect(game.save.eliteLeagueMemberIds).toHaveLength(30);
    expect(new Set(game.save.eliteLeagueMemberIds).size).toBe(30);
    const livingIds = new Set(game.save.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id));
    game.save.eliteLeagueMemberIds.forEach((id) => expect(id === "hero" || livingIds.has(id)).toBe(true));

    const snapshot = worldBalanceSnapshot(game.save, game.leaderboard(), previousTop);
    expect(snapshot.day).toBe(366);
    expect(snapshot.topNewcomerShare).toBeLessThanOrEqual(0.35);
    expect(snapshot.largestNpcInventory).toBeLessThanOrEqual(6);
    expect(snapshot.averageNpcInventory).toBeLessThanOrEqual(6);
    expect(snapshot.currencies.gold).toBeGreaterThanOrEqual(0);
    expect(snapshot.currencies.gold).toBeLessThan(1_000_000_000);
    expect(game.save.events.length).toBeLessThanOrEqual(500);
    expectFullArenaPopulations(game);
  }, 30_000);

  test("preserves a complete tournament field on every arena after each daily tick", () => {
    const now = 1_760_000_000_000;
    const game = WorldGame.create("Хранитель сеток", "Gunsmith", now);
    game.save.hero.autoResolveLegendChallenges = true;

    for (let day = 0; day < 180; day += 1) {
      game.save.lastSimulatedAt = now - DAY_MS;
      expect(game.simulateElapsed(now)).toBe(1);
      expectFullArenaPopulations(game);
    }
  }, 30_000);

  test("restoring the same seeded day produces the same rankings and economy", () => {
    const now = 1_760_000_000_000;
    const source = WorldGame.create("Повтор мира", "Archer", now);
    simulateDays(source, 180, now);
    const first = WorldGame.restore(JSON.parse(JSON.stringify(source.save)));
    const second = WorldGame.restore(JSON.parse(JSON.stringify(source.save)));

    simulateDays(first, 14, now);
    simulateDays(second, 14, now);

    expect(first.leaderboard().map(({ id, rating }) => ({ id, rating })))
      .toEqual(second.leaderboard().map(({ id, rating }) => ({ id, rating })));
    expect(first.save.randomSnapshots).toEqual(second.save.randomSnapshots);
    expect(first.save.hero.gold).toBe(second.save.hero.gold);
  }, 30_000);
});
