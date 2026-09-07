import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { ERA_LAWS, LEGACY_BOONS } from "../src/catalogs/NewGamePlusCatalog";

describe("world service determinism", () => {
  afterEach(() => jest.restoreAllMocks());

  test("preserves complete save and RNG checkpoints under the current combat rules", () => {
    const now = 1750000000000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    const game = WorldGame.create("Аудит", "Knight", now);
    const hash = () =>
      createHash("sha256").update(JSON.stringify(game.save)).digest("hex");
    expect(hash()).toBe(
      "698e333e86b0fb731e6f09f238cd1c3bfdf238ba8bf49074b09c1bc73e857d76",
    );
    game.save.hero.temperingMarks = 10;
    game.upgradeItem(game.save.hero.inventory[0].id);
    game.equipBest("set");
    game.setLootTarget({ slot: "weapon" });
    expect(hash()).toBe(
      "2ef499dfd0c14bbc6ea5880dedaf09dacb1667dcdbd45ada6e305eee0b32df62",
    );
    game.duel();
    expect(hash()).toBe(
      "8679bc4c857ef8628e6f4f05303216ec06cab74f054b082294a4b2c2685ca867",
    );
    game.save.hero.level = 8;
    game.save.hero.highestArena = 1;
    game.startExpedition(DUNGEONS[0].id);
    game.advanceExpeditionNode(game.reachableExpeditionNodes()[0].id);
    if (game.save.activeExpedition) game.retreatExpedition();
    expect(hash()).toBe(
      "51e55ab445aaf3a05636e8502543f8cc93ee19d2ee96df954e7fa4887f90a027",
    );
    game.save.lastSimulatedAt = now - 14 * 600000;
    game.simulateElapsed(now);
    expect(hash()).toBe(
      "2fa93daeae28e0ebe25d83b980b00481d1d5ee43118da30709669798c053979e",
    );
    game.save.worldDay = game.save.worldSeason!.endsDay;
    game.save.lastSimulatedAt = now - 600000;
    game.simulateElapsed(now);
    expect(hash()).toBe(
      "ab168fee5548445c32edd92c75bc9398e40dc137f0558b415416b650c5bd7627",
    );
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.hero.arenaWins[ARENAS.length - 1] = 1;
    game.save.hero.crownLeagueWins = 1;
    game.save.hero.legendDefenses = 1;
    game.save.eliteLeagueMemberIds = [
      "hero",
      ...game.save.eliteLeagueMemberIds.filter((id) => id !== "hero"),
    ].slice(0, 30);
    game.save.eliteRatings.hero = 4000;
    const status = game.newGamePlusStatus();
    const next = game.beginNewChronicle(
      {
        name: "Наследник",
        classId: "Knight",
        boonId: LEGACY_BOONS.find(
          (boon) => boon.sealCost <= status.availableSeals,
        )!.id,
        lawIds: ERA_LAWS.slice(0, status.lawLimit).map((law) => law.id),
        heirloomItemId: game.heirloomCandidates()[0]?.id,
      },
      now + 1,
    );
    expect(
      createHash("sha256").update(JSON.stringify(next.save)).digest("hex"),
    ).toBe("d8607e98db81235fd3ae983e5b605ca8ab4a80c8b62c173bbff7307fe818dfd7");
  });

  test.each([
    "equipment/HeroEquipmentService",
    "equipment/ShopService",
    "world/ContractService",
    "world/WorldPopulationService",
    "world/SeasonService",
    "progression/ChronicleTransition",
    "dungeons/ExpeditionService",
    "combat/BattleFinalizationService",
    "tournaments/TournamentService",
    "world/NpcSimulationService",
  ])("%s does not depend on the WorldGame facade", (module) => {
    const source = readFileSync(`src/gameplay/${module}.ts`, "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*\/WorldGame["']/);
    expect(source).not.toMatch(/(?:from\s*|import\s*\()["'][A-Za-z]:[/\\]/);
  });
});
