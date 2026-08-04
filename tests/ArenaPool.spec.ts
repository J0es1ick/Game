import { ArenaPool } from "../src/arenas/ArenaPool";

describe("ArenaPool", () => {
  const pool = new ArenaPool();

  it("выбирает стратегию по имени", () => {
    expect(pool.pick("Учебный двор").damageMultiplier).toBe(0.9);
  });

  it("содержит три взаимозаменяемые стратегии", () => {
    const results = pool.all().map((arena) => arena.modifyDamage(100, {} as never, {} as never));

    expect(results).toEqual([90, 115, 100]);
  });
});
