import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import { validateWorldSave } from "../src/gameplay/WorldSaveValidation";
import { GameSave } from "../src/gameplay/WorldTypes";

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
});
