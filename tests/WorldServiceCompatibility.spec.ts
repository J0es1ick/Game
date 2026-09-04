import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { ERA_LAWS, LEGACY_BOONS } from "../src/catalogs/NewGamePlusCatalog";

describe("world service extraction", () => {
  afterEach(() => jest.restoreAllMocks());

  test("preserves complete saves and RNG states from the pre-extraction implementation", () => {
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
      "5ca76184717f912abfdc5055e77be24caa632fdf49ad04ac083e7873b12e533b",
    );
    game.save.hero.level = 8;
    game.save.hero.highestArena = 1;
    game.startExpedition(DUNGEONS[0].id);
    game.advanceExpeditionNode(game.reachableExpeditionNodes()[0].id);
    if (game.save.activeExpedition) game.retreatExpedition();
    expect(hash()).toBe(
      "e545992af0cd4eb2f1b61c278c8ece117ad91ef531d9ca331c9868fb5a815afd",
    );
    game.save.lastSimulatedAt = now - 14 * 600000;
    game.simulateElapsed(now);
    expect(hash()).toBe(
      "e04180d193ddbdb7186748d709e7452b98fdae3975e9951018cec40b2ad0b652",
    );
    game.save.worldDay = game.save.worldSeason!.endsDay;
    game.save.lastSimulatedAt = now - 600000;
    game.simulateElapsed(now);
    expect(hash()).toBe(
      "b400bc70e7617164aef6fddee316155dae68a79216dd7a5da334eabd31ccaf5e",
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
    ).toBe("d3c83c3f7947ad5bd224f88f0b7eaa478e49748154eb874058d5dc27bae8918d");
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
