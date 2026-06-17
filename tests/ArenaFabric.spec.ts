import { ArenaFabric } from "../src/fabrics/arenasFabric/ArenaFabric";

describe("ArenaFabric tests", () => {
  it("creates a specific arena by name", () => {
    const fabric = new ArenaFabric();
    const arena = fabric.createArena("Training Ground");

    expect(arena.name).toBe("Training Ground");
    expect(arena.description).toContain("arena");
  });

  it("returns a valid random arena", () => {
    const fabric = new ArenaFabric();
    const arena = fabric.createArena();

    expect(["Training Ground", "Volcanic Crater", "Ancient Ruins"]).toContain(
      arena.name,
    );
  });

  it("lists all available arenas", () => {
    const fabric = new ArenaFabric();
    const arenas = fabric.listArenas();

    expect(arenas).toHaveLength(3);
    expect(new Set(arenas.map((arena) => arena.name)).size).toBe(3);
  });
});
