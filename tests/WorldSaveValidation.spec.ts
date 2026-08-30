import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { validateWorldSave } from "../src/gameplay/save/WorldSaveValidation";
import { GameSave } from "../src/gameplay/core/WorldTypes";

function copy(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

function duelSave(seed = 91_001): GameSave {
  const game = WorldGame.create("Validator", "Knight", seed);
  game.beginDuel();
  return copy(game.save);
}

function expectInvalidAt(save: GameSave, path: string): void {
  const result = validateWorldSave(save);
  expect(result.valid).toBe(false);
  expect(result.issues.map((issue) => issue.path)).toContain(path);
}

describe("deep world save validation", () => {
  test("reports repeated identifiers once in their original duplicate order", () => {
    const save = WorldGame.create("Duplicate validator", "Knight", 91_000).save;
    const [first, second] = save.hero.inventory;
    save.hero.inventory.push(structuredClone(first), structuredClone(second), structuredClone(first));
    save.enemies.push(structuredClone(save.enemies[0]), structuredClone(save.enemies[0]));
    const issues = validateWorldSave(save).issues;
    expect(issues.find((issue) => issue.path === "$.items")?.message)
      .toContain(`${first.id}, ${second.id}`);
    expect(issues.find((issue) => issue.path === "$.enemies")?.message)
      .toBe(`Идентификаторы бойцов должны быть уникальны: ${save.enemies[0].id}.`);
  });

  test("accepts genuine duel and tournament continuation snapshots", () => {
    const duel = duelSave();
    expect(validateWorldSave(duel)).toEqual({ valid: true, issues: [] });

    const tournament = WorldGame.create("Bracket validator", "Swordsman", 91_002);
    const arena = ARENAS[0];
    tournament.save.worldDay = tournament.registerTournament(arena.id);
    tournament.beginTournament(arena.id);
    expect(validateWorldSave(copy(tournament.save))).toEqual({ valid: true, issues: [] });
  });

  test.each([
    {
      name: "invalid equipment resonance",
      path: "$.pendingBattle.session.hero.equipmentResonance",
      corrupt: (save: GameSave) => {
        save.pendingBattle!.session.hero.equipmentResonance = {
          setId: "wanderer", setName: "Путь странника", path: "guard", stage: 1, pieces: 12, description: "Защита",
        };
      },
    },
    {
      name: "health beyond maximum",
      path: "$.pendingBattle.session.hero.health",
      corrupt: (save: GameSave) => { save.pendingBattle!.session.hero.health = save.pendingBattle!.session.hero.maxHealth + 1; },
    },
    {
      name: "resource beyond maximum",
      path: "$.pendingBattle.session.hero.resource.current",
      corrupt: (save: GameSave) => {
        save.pendingBattle!.session.hero.resource.current = save.pendingBattle!.session.hero.resource.maximum + 1;
      },
    },
    {
      name: "cooldown for an unknown skill",
      path: "$.pendingBattle.session.hero.cooldowns.missing-skill",
      corrupt: (save: GameSave) => { save.pendingBattle!.session.hero.cooldowns["missing-skill"] = 2; },
    },
    {
      name: "status sourced by an unknown fighter",
      path: "$.pendingBattle.session.hero.statuses[0].sourceId",
      corrupt: (save: GameSave) => {
        save.pendingBattle!.session.hero.statuses.push({
          id: "guarded", name: "Guarded", description: "Test", duration: 1, stacks: 1, sourceId: "ghost",
        });
      },
    },
    {
      name: "negative RNG state",
      path: "$.pendingBattle.session.random.state",
      corrupt: (save: GameSave) => { save.pendingBattle!.session.random.state = -1; },
    },
    {
      name: "enemy snapshot from another transaction",
      path: "$.pendingBattle.session.enemy.id",
      corrupt: (save: GameSave) => { save.pendingBattle!.session.enemy.id = "other-enemy"; },
    },
  ])("rejects $name", ({ path, corrupt }) => {
    const save = duelSave();
    corrupt(save);
    expectInvalidAt(save, path);
  });

  test("rejects turn references and discontinuous turn indices", () => {
    const game = WorldGame.create("Turn validator", "Wizard", 91_003);
    game.beginDuel();
    game.stepPendingBattle({ type: "basic" });
    const unknownActor = copy(game.save);
    unknownActor.pendingBattle!.session.turns[0].actorId = "ghost";
    expectInvalidAt(unknownActor, "$.pendingBattle.session.turns[0].actorId");

    const skippedNumber = copy(game.save);
    skippedNumber.pendingBattle!.session.turns[0].turn = 5;
    expectInvalidAt(skippedNumber, "$.pendingBattle.session.turns[0].turn");
  });

  test("rejects tournament seed, cursor and current-pair cross-reference corruption", () => {
    const game = WorldGame.create("Broken bracket", "Archer", 91_004);
    const arena = ARENAS[0];
    game.save.worldDay = game.registerTournament(arena.id);
    game.beginTournament(arena.id);
    const base = copy(game.save);

    const brokenSeeds = copy(base);
    brokenSeeds.pendingBattle!.tournament!.initialSeeds.pop();
    expectInvalidAt(brokenSeeds, "$.pendingBattle.tournament.initialSeeds");

    const brokenCursor = copy(base);
    brokenCursor.pendingBattle!.tournament!.pairIndex = brokenCursor.pendingBattle!.tournament!.pairs.length;
    expectInvalidAt(brokenCursor, "$.pendingBattle.tournament.pairIndex");

    const brokenPair = copy(base);
    const state = brokenPair.pendingBattle!.tournament!;
    state.pairs[state.pairIndex] = ["hero", "ghost"];
    expectInvalidAt(brokenPair, `$.pendingBattle.tournament.pairs[${state.pairIndex}]`);
  });

  test("requires item ids to be unique across inventory, shop and active expedition loot", () => {
    const shopDuplicate = copy(WorldGame.create("Shop ids", "Monk", 91_005).save);
    shopDuplicate.shopOffers[0].item.id = shopDuplicate.hero.inventory[0].id;
    expectInvalidAt(shopDuplicate, "$.items");

    const expedition = WorldGame.create("Expedition ids", "Knight", 91_006);
    expedition.save.hero.level = 40;
    expedition.save.hero.highestArena = ARENAS.length - 1;
    expedition.save.worldDay = 100;
    expedition.startExpedition(DUNGEONS[0].id);
    expedition.save.activeExpedition!.loot.push({ ...expedition.save.hero.inventory[0] });
    expectInvalidAt(copy(expedition.save), "$.items");
  });

  test("accepts routes with traps, merchants, persistent rivals and alternate bosses", () => {
    const game = WorldGame.create("Route validator", "Monk", 91_007);
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.worldDay = 100;
    game.startExpedition(DUNGEONS[0].id);
    const kinds = new Set(game.save.activeExpedition?.route?.nodes.map((node) => node.kind));

    expect(kinds.has("trap")).toBe(true);
    expect(kinds.has("merchant")).toBe(true);
    expect(kinds.has("rival")).toBe(true);
    expect(kinds.has("alternate-boss")).toBe(true);
    expect(validateWorldSave(copy(game.save))).toEqual({ valid: true, issues: [] });
  });

  test("rejects corruption in persistent world systems", () => {
    const base = copy(WorldGame.create("World validator", "Wizard", 91_008).save);

    const discovery = copy(base);
    discovery.dungeonDiscoveries = {
      cellar: {
        dungeonId: "other-dungeon",
        completedRuns: 1,
        discoveredNodeIds: [],
        discoveredClueIds: [],
        seenEncounterKinds: [],
      },
    };
    expectInvalidAt(discovery, "$.dungeonDiscoveries.cellar.dungeonId");

    const faction = copy(base);
    faction.factionControl!.shopControllerId = "unknown-faction";
    expectInvalidAt(faction, "$.factionControl.shopControllerId");

    const season = copy(base);
    (season.worldSeason as unknown as Record<string, unknown>).ruleId = "unknown-rule";
    expectInvalidAt(season, "$.worldSeason.ruleId");

    const npcLife = copy(base);
    const fighterId = npcLife.enemies[0].id;
    (npcLife.npcLife!.profiles[fighterId] as unknown as Record<string, unknown>).career = "unknown-career";
    expectInvalidAt(npcLife, `$.npcLife.profiles.${fighterId}`);

    const route = WorldGame.restore(copy(base));
    route.save.hero.level = 40;
    route.save.hero.highestArena = ARENAS.length - 1;
    route.save.worldDay = 100;
    route.startExpedition(DUNGEONS[0].id);
    (route.save.activeExpedition!.route!.nodes[0] as unknown as Record<string, unknown>).kind = "unknown-node";
    expectInvalidAt(copy(route.save), "$.activeExpedition.route.nodes[0].kind");
  });
});
