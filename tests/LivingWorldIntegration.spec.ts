import { ARENAS, DUNGEONS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { placeWorldRelicInShop } from "../src/gameplay/equipment/WorldRelics";
import type { BattleReport } from "../src/gameplay/core/WorldTypes";

function world(): WorldGame {
  return WorldGame.create("Испытатель", "Knight", 1_800_000_000_000);
}

function strengthenHero(game: WorldGame): void {
  const item = game.save.hero.inventory.find((candidate) => candidate.id === game.save.hero.equipped.weapon)!;
  item.stats = { health: 1_000_000, attack: 100_000, defense: 100_000, speed: 1_000, crit: 60 };
}

describe("Living world integration", () => {
  test("daily simulation closes a season, updates careers and creates the next generation", () => {
    const game = world();
    const previousIds = new Set(game.save.enemies.map((enemy) => enemy.id));
    const season = game.save.worldSeason!;
    game.save.worldDay = 28;
    season.endsDay = game.save.worldDay;
    season.ruleId = "new-blood";
    game.train();
    const result = game.completedWorldSeasons()[0];
    expect(game.currentWorldSeason().number).toBe(season.number + 1);
    expect(result.newcomerIds).toHaveLength(ARENAS.length * 2);
    expect(result.newcomerIds.every((id) => !previousIds.has(id) && game.save.enemies.some((enemy) => enemy.id === id))).toBe(true);
    expect(game.save.npcLife!.season).toBe(2);
    expect(Object.values(game.save.npcLife!.profiles).some((profile) => profile.career === "legend")).toBe(true);
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(restored.completedWorldSeasons()[0].newcomerIds).toEqual(result.newcomerIds);
    expect(restored.currentWorldSeason().number).toBe(season.number + 1);
  });

  test("faction pressure changes arena, dungeon and shop controllers through a world day", () => {
    const game = world();
    game.save.worldDay = 7;
    const control = game.save.factionControl!;
    control.lastShiftDay = 0;
    ARENAS.forEach((arena) => {
      control.arenaControllers[arena.id] = "wardens";
      control.arenaInfluence[arena.id] = { wardens: 1, "free-company": 10_000, "red-ledger": 1 };
    });
    DUNGEONS.forEach((dungeon) => { control.dungeonInfluence![dungeon.id] = { wardens: 1, "free-company": 10_000, "red-ledger": 1 }; });
    game.train();
    ARENAS.forEach((arena) => {
      const expected = arena.tournamentInterval <= 7 ? "free-company" : "wardens";
      expect(game.factionController(arena.id).id).toBe(expected);
    });
    expect(DUNGEONS.every((dungeon) => game.save.factionControl!.dungeonControllers![dungeon.id] === "free-company")).toBe(true);
    expect(game.shopController().id).toBe("free-company");
    expect(game.save.factionControl!.shopPriceRevision).toBeGreaterThan(0);
    expect(game.save.events.some((event) => event.message.includes("контроль над ареной"))).toBe(true);
    game.save.worldDay = 14;
    ARENAS.forEach((arena) => {
      game.save.factionControl!.arenaInfluence[arena.id] = { wardens: 1, "free-company": 10_000, "red-ledger": 1 };
    });
    game.train();
    ARENAS.forEach((arena) => {
      expect(game.factionController(arena.id).id).toBe("free-company");
    });
    expect(game.save.factionControl!.lastShiftDay).toBe(14);
  });

  test("a future boss awakens, survives saving and grants a single mythic reward when defeated", () => {
    const game = world();
    strengthenHero(game);
    const source = game.save.enemies[0];
    game.save.npcLife!.futureBosses.push({
      id: "future-test", fighterId: source.id, name: source.name, classId: source.classId,
      archetype: "nemesis", reason: "Помнит старое поражение", createdDay: 1,
      earliestAppearanceDay: 2, powerLevel: 5, status: "dormant",
    });
    game.train();
    expect(game.availableFutureBosses().map((boss) => boss.id)).toContain("future-test");
    game.beginFutureBossFight("future-test");
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(restored.currentPendingBattle()?.kind).toBe("world-encounter");
    const result = restored.runPendingBattleAutomatically() as BattleReport;
    expect(result.heroWon).toBe(true);
    expect(result.rewards.item?.rarity).toBe("mythic");
    expect(result.rewards.temperingMarks).toBe(2);
    expect(restored.save.npcLife!.futureBosses.find((boss) => boss.id === "future-test")?.status).toBe("defeated");
    expect(restored.save.hero.bossWins).toBe(1);
    expect(() => restored.beginFutureBossFight("future-test")).toThrow("уже побеждён");
  });

  test("a faction hunter resolves as a duel without adding arena victories", () => {
    const game = world();
    strengthenHero(game);
    const hunter = game.save.enemies[0];
    hunter.factionId = "red-ledger";
    game.save.pendingFactionHunterId = hunter.id;
    game.save.hero.factionReputation["red-ledger"] = -50;
    const arenaWins = [...game.save.hero.arenaWins];
    const matchWins = game.save.hero.tournamentMatchWins;
    game.beginFactionHunterFight();
    const result = game.runPendingBattleAutomatically() as BattleReport;
    expect(result.heroWon).toBe(true);
    expect(game.save.pendingFactionHunterId).toBeUndefined();
    expect(game.save.hero.duelWins).toBe(1);
    expect(game.save.hero.tournamentMatchWins).toBe(matchWins);
    expect(game.save.hero.arenaWins).toEqual(arenaWins);
    expect(game.save.hero.factionReputation["red-ledger"]).toBeGreaterThan(-50);
    expect(result.rewards.temperingMarks).toBe(1);
  });

  test("an awakened relic keeps upgrades and ownership history through sale, repurchase and restore", () => {
    const game = world();
    game.save.hero.highestArena = 4;
    game.save.hero.arenaWins[3] = 1;
    game.save.hero.level = 25;
    game.save.hero.relicDust = 8;
    const source = game.save.hero.inventory[0];
    source.rarity = "legendary";
    source.relicTier = 1;
    const relic = game.awakenRelic(source.id, "might");
    game.save.hero.temperingMarks = 10;
    game.upgradeItem(relic.id);
    const stats = { ...relic.stats };
    game.unequip(relic.slot);
    game.sell(relic.id);
    const record = game.worldRelicChronicle().find((candidate) => candidate.id === relic.worldRelicId)!;
    expect(record.status).toBe("lost");
    expect(record.currentOwnerId).toBeUndefined();
    expect(game.save.hero.inventory.some((item) => item.worldRelicId === record.id)).toBe(false);
    const offer = placeWorldRelicInShop(record, "Лавка Ионы", "День 2: реликвию нашли торговцы.");
    game.save.worldRelics![game.save.worldRelics!.findIndex((candidate) => candidate.id === record.id)] = offer.record;
    game.save.shopOffers = [{ item: offer.item, sold: false }];
    game.save.hero.gold = offer.item.price;
    game.buy(0);
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    const restoredRecord = restored.worldRelicChronicle().find((candidate) => candidate.id === record.id)!;
    expect(restoredRecord.status).toBe("wielded");
    expect(restoredRecord.currentOwnerId).toBe("hero");
    expect(restoredRecord.item.stats).toEqual(stats);
    expect(restoredRecord.history.some((entry) => entry.includes("продал реликвию"))).toBe(true);
    expect(restoredRecord.history.some((entry) => entry.includes("приобрёл"))).toBe(true);
    expect(restored.save.hero.inventory.filter((item) => item.worldRelicId === record.id)).toHaveLength(1);
    expect(restored.save.enemies.flatMap((enemy) => enemy.equipment).filter((item) => item.worldRelicId === record.id)).toHaveLength(0);
  });
});
