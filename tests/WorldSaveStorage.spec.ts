import { WorldGame } from "../src/gameplay/core/WorldGame";
import { normalizeWorldSave } from "../src/gameplay/save/WorldSaveMigration";
import {
  exportWorldSave,
  parseWorldSave,
  safeParseWorldSave,
  WorldSaveRepository,
} from "../src/gameplay/save/WorldSaveStorage";
import { GameSave } from "../src/gameplay/core/WorldTypes";
import { createItem } from "../src/factories/ItemFactory";
import { createWorldRelicRecord } from "../src/gameplay/world/LivingWorld";
import { SeededRandom } from "../src/gameplay/core/RandomSource";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

function copy(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

describe("world save safety", () => {
  it("repairs duplicate relic placements and preserves boss paths without awakening them", () => {
    const save = copy(WorldGame.create("Реставратор", "Knight", 122).save);
    const item = createItem(20, { templateId: "wanderer-blade", rarity: "legendary", randomSource: new SeededRandom(9) });
    const record = createWorldRelicRecord("relic-restored", item, "hero", save.hero.name, save.worldDay);
    item.worldRelicId = record.id;
    save.hero.inventory.push(item);
    save.worldRelics = [record];
    const duplicate = { ...item, id: "duplicate-relic-item", stats: { ...item.stats } };
    save.enemies[0].equipment.push(duplicate);
    save.enemies[0].equipped.weapon = duplicate.id;
    const boss = createItem(20, { templateId: "boss-widow-mantle", rarity: "mythic", randomSource: new SeededRandom(10) });
    boss.relicPath = "guard";
    save.hero.inventory.push(boss);
    const normalized = normalizeWorldSave(save);
    expect(normalized.hero.inventory.find((entry) => entry.id === boss.id)?.worldRelicId).toBeUndefined();
    expect(normalized.enemies[0].equipment.some((entry) => entry.id === duplicate.id)).toBe(false);
    expect(normalized.enemies[0].equipped.weapon).not.toBe(duplicate.id);
    if (normalized.enemies[0].equipped.weapon) {
      expect(normalized.enemies[0].equipment.some((entry) => entry.id === normalized.enemies[0].equipped.weapon)).toBe(true);
    }
    expect(normalized.worldRelics).toHaveLength(1);
    expect(normalized.worldRelics?.[0].currentOwnerId).toBe("hero");
  });
  it("preserves an unfinished tutorial and only completes it for version 2 migration", () => {
    const current = copy(WorldGame.create("Новичок", "Knight", 1).save);
    current.tutorialCompleted = false;
    expect(normalizeWorldSave(current).tutorialCompleted).toBe(false);

    const legacy = copy(WorldGame.create("Ветеран", "Archer", 1).save);
    legacy.version = 2;
    delete (legacy as unknown as Record<string, unknown>).tutorialCompleted;
    expect(normalizeWorldSave(legacy).tutorialCompleted).toBe(true);

    const incompleteCurrent = copy(WorldGame.create("Новый", "Monk", 1).save);
    delete (incompleteCurrent as unknown as Record<string, unknown>).tutorialCompleted;
    expect(normalizeWorldSave(incompleteCurrent).tutorialCompleted).toBe(false);
  });

  it("rejects malformed saves before migration can mutate them", () => {
    const malformed = JSON.stringify({ version: 3, hero: null, enemies: [], worldDay: "today" });
    const result = safeParseWorldSave(malformed);
    expect(result.save).toBeUndefined();
    expect(result.error?.message).toContain("$.hero");
  });

  it("exports a checksummed save and detects edited payloads", () => {
    const game = WorldGame.create("Летописец", "Wizard", 1);
    const exported = exportWorldSave(game.save, 42);
    expect(parseWorldSave(exported).hero.name).toBe("Летописец");

    const tampered = JSON.parse(exported) as { save: GameSave };
    tampered.save.hero.gold += 100_000;
    expect(() => parseWorldSave(JSON.stringify(tampered))).toThrow(/Контрольная сумма/);
  });

  it("falls back to the last known good backup when the primary is corrupted", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "game-save");
    const game = WorldGame.create("Хранитель", "Swordsman", 1);
    repository.save(game.save);
    const backedUpDay = game.save.worldDay;
    game.save.worldDay += 5;
    repository.save(game.save);
    storage.setItem(repository.primaryKey, "{broken");

    const loaded = repository.load();
    expect(loaded?.source).toBe("backup");
    expect(loaded?.save.worldDay).toBe(backedUpDay);
  });

  it("recovers the verified temporary copy when a save is interrupted before primary replacement", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "game-save");
    const game = WorldGame.create("Вернувшийся", "Knight", 10);
    repository.save(game.save);
    const oldDay = game.save.worldDay;
    game.save.worldDay += 7;
    storage.setItem(repository.temporaryKey, JSON.stringify(game.save));

    const loaded = repository.load();

    expect(loaded?.source).toBe("temporary");
    expect(loaded?.save.worldDay).toBe(oldDay + 7);
    expect(storage.getItem(repository.temporaryKey)).toBeNull();
    expect(safeParseWorldSave(storage.getItem(repository.primaryKey)!).save?.worldDay).toBe(oldDay + 7);
    expect(safeParseWorldSave(storage.getItem(repository.backupKey)!).save?.worldDay).toBe(oldDay);
  });

  it("repairs expedition stamina without discarding a resumable trip", () => {
    const game = WorldGame.create("Походник", "Knight", 404);
    game.save.hero.level = 40;
    game.save.hero.highestArena = 5;
    game.save.worldDay = 100;
    const expedition = game.startExpedition("cellar");
    expedition.accumulatedGold = 321;
    const dungeonId = expedition.dungeonId;

    delete (expedition as unknown as Record<string, unknown>).health;
    const missing = safeParseWorldSave(JSON.stringify(game.save)).save;
    expect(missing?.activeExpedition).toMatchObject({ dungeonId, accumulatedGold: 321, health: 100 });

    const valid = copy(missing!);
    valid.activeExpedition!.health = 37;
    expect(safeParseWorldSave(JSON.stringify(valid)).save?.activeExpedition?.health).toBe(37);

    const damaged = copy(missing!);
    (damaged.activeExpedition as unknown as Record<string, unknown>).health = "damaged";
    expect(safeParseWorldSave(JSON.stringify(damaged)).save?.activeExpedition).toMatchObject({
      dungeonId,
      accumulatedGold: 321,
      health: 100,
    });

    const outOfRange = copy(missing!);
    outOfRange.activeExpedition!.health = -15;
    expect(safeParseWorldSave(JSON.stringify(outOfRange)).save?.activeExpedition?.health).toBe(0);
  });

  it("preserves an exhausted expedition and restores its new route state", () => {
    const game = WorldGame.create("Истощённый", "Monk", 405);
    game.save.hero.level = 40;
    game.save.hero.highestArena = 5;
    game.save.worldDay = 100;
    const expedition = game.startExpedition("cellar");
    expedition.maxSupplies = 7;
    expedition.supplies = 0;
    const merchant = expedition.route?.nodes.find((node) => node.kind === "merchant");
    expedition.pendingMerchantNodeId = merchant?.id;
    expedition.discoveredNodeIds = expedition.route?.nodes.slice(0, 2).map((node) => node.id) ?? [];
    game.save.dungeonDiscoveries = {
      cellar: {
        dungeonId: "cellar",
        completedRuns: 2,
        discoveredNodeIds: ["node-a"],
        discoveredClueIds: ["clue-a"],
        seenEncounterKinds: ["merchant", "trap", "alternate-boss"],
        alternateBossDefeated: true,
      },
    };

    const restored = safeParseWorldSave(JSON.stringify(game.save)).save!;

    expect(restored.activeExpedition?.supplies).toBe(0);
    expect(restored.activeExpedition?.maxSupplies).toBe(7);
    expect(restored.activeExpedition?.pendingMerchantNodeId).toBe(merchant?.id);
    expect(restored.dungeonDiscoveries?.cellar).toEqual({
      dungeonId: "cellar",
      completedRuns: 2,
      discoveredNodeIds: ["node-a"],
      discoveredClueIds: ["clue-a"],
      seenEncounterKinds: ["merchant", "trap", "alternate-boss"],
      alternateBossDefeated: true,
    });
  });

  it("repairs a resumable battle snapshot created before combat metadata was added", () => {
    const game = WorldGame.create("Старый дуэлянт", "Knight", 406);
    game.beginDuel();
    const legacy = copy(game.save);
    [legacy.pendingBattle!.session.hero, legacy.pendingBattle!.session.enemy].forEach((fighter) => {
      delete (fighter as unknown as Record<string, unknown>).actionsTaken;
      delete (fighter as unknown as Record<string, unknown>).statuses;
      delete (fighter as unknown as Record<string, unknown>).resource;
      delete (fighter as unknown as Record<string, unknown>).usedMechanics;
      delete (fighter as unknown as Record<string, unknown>).mutationState;
    });

    const restored = safeParseWorldSave(JSON.stringify(legacy)).save!;

    expect(restored.pendingBattle?.session.hero).toMatchObject({
      actionsTaken: 0,
      statuses: [],
      usedMechanics: [],
      mutationState: { counter: 0, consumed: false, primed: false },
    });
    expect(restored.pendingBattle?.session.hero.resource.id).toBe("resolve");
  });

  it("discards an obsolete pending battle before validating its retired snapshot format", () => {
    const game = WorldGame.create("Вернувшийся боец", "Archer", 407);
    game.beginDuel();
    const legacy = copy(game.save);
    legacy.migrations = legacy.migrations?.filter((id) => id !== "pending-battle-state-v1");
    (legacy.pendingBattle as unknown as Record<string, unknown>).session = { obsolete: true };

    const restored = safeParseWorldSave(JSON.stringify(legacy)).save;

    expect(restored?.pendingBattle).toBeUndefined();
    expect(restored?.migrations).toContain("pending-battle-state-v1");
  });

  it("upgrades partial season and dungeon discovery records from intermediate saves", () => {
    const legacy = copy(WorldGame.create("Промежуточный", "Wizard", 408).save) as unknown as Record<string, unknown>;
    legacy.worldSeason = { number: 2 };
    legacy.worldSeasonHistory = [{}];
    legacy.dungeonDiscoveries = { cellar: { discoveredNodeIds: ["old-node"] } };

    const restored = safeParseWorldSave(JSON.stringify(legacy)).save!;

    expect(restored.worldSeason).toMatchObject({
      number: 2,
      startsDay: expect.any(Number),
      endsDay: expect.any(Number),
      arenaPoints: expect.any(Object),
      elitePoints: {},
    });
    expect(restored.worldSeasonHistory?.[0]).toMatchObject({
      number: 1,
      champions: [],
      promotedIds: [],
      demotedIds: [],
      retiredIds: [],
      mentorIds: [],
      newcomerIds: [],
    });
    expect(restored.dungeonDiscoveries?.cellar).toEqual({
      dungeonId: "cellar",
      completedRuns: 0,
      discoveredNodeIds: ["old-node"],
      discoveredClueIds: [],
      seenEncounterKinds: [],
      alternateBossDefeated: false,
    });
  });

  it("restores a second-era localStorage save that predates current campaign fields", () => {
    const source = WorldGame.create("Хранитель эпохи", "Knight", 81_002);
    source.save.legacy.cycle = 2;
    source.save.worldDay = 100;
    source.save.hero.level = 40;
    source.save.hero.highestArena = 5;
    const current = WorldGame.restore(copy(source.save));
    current.startExpedition("cellar");

    const expected = {
      heroId: current.save.hero.id,
      heroName: current.save.hero.name,
      classId: current.save.hero.classId,
      cycle: current.save.legacy.cycle,
      rating: current.save.hero.rating,
      inventory: current.save.hero.inventory.map((item) => ({ id: item.id, templateId: item.templateId })),
      expedition: {
        dungeonId: current.save.activeExpedition!.dungeonId,
        health: current.save.activeExpedition!.health,
      },
    };
    const legacy = copy(current.save) as unknown as Record<string, unknown>;
    [
      "migrations",
      "seenContextualTutorialIds",
      "unlockedFeatureIds",
      "pendingFeatureUnlocks",
      "pendingNarrativeEventId",
      "seenNarrativeEventIds",
      "crownSeason",
      "lastCrownSeasonResult",
      "lootTarget",
      "lootPity",
      "reforgeAttempts",
      "eraChallengeProgress",
      "pendingBattle",
      "randomSnapshots",
    ].forEach((field) => { delete legacy[field]; });
    ((legacy.enemies as Array<Record<string, unknown>>) ?? []).forEach((enemy) => {
      delete enemy.arenaTournamentWins;
      delete enemy.heroMemory;
      delete enemy.eraMutationId;
      delete enemy.eraMutationPotency;
    });
    const expedition = legacy.activeExpedition as Record<string, unknown>;
    [
      "route",
      "visitedNodeIds",
      "currentNodeId",
      "pendingShrineNodeId",
      "attackMultiplier",
      "defenseMultiplier",
      "lootChanceBonus",
      "daysSpent",
    ].forEach((field) => { delete expedition[field]; });

    const serialized = JSON.stringify(legacy);
    const parsed = parseWorldSave(serialized);
    const restored = WorldGame.restore(JSON.parse(serialized) as unknown);

    [parsed, restored.save].forEach((save) => {
      expect(save.hero).toMatchObject({
        id: expected.heroId,
        name: expected.heroName,
        classId: expected.classId,
        rating: expected.rating,
      });
      expect(save.hero.inventory.map((item) => ({ id: item.id, templateId: item.templateId })))
        .toEqual(expected.inventory);
      expect(save.legacy.cycle).toBe(expected.cycle);
      expect(save.activeExpedition).toMatchObject(expected.expedition);
      expect(save.activeExpedition).toMatchObject({
        visitedNodeIds: [],
        attackMultiplier: 1,
        defenseMultiplier: 1,
        lootChanceBonus: 0,
        daysSpent: 0,
      });
      expect(save.seenContextualTutorialIds).toEqual([]);
      expect(save.unlockedFeatureIds).toEqual(expect.any(Array));
      expect(save.pendingFeatureUnlocks).toEqual(expect.any(Array));
      expect(save.seenNarrativeEventIds).toEqual([]);
      expect(save.crownSeason).toMatchObject({ number: 1, points: {}, defenses: {} });
      expect(save.reforgeAttempts).toEqual({});
      expect(save.eraChallengeProgress.cycle).toBe(2);
      expect(save.pendingBattle).toBeUndefined();
      expect(save.randomSnapshots).toMatchObject({
        world: { seed: expect.any(Number), state: expect.any(Number), calls: expect.any(Number) },
        combat: { seed: expect.any(Number), state: expect.any(Number), calls: expect.any(Number) },
        loot: { seed: expect.any(Number), state: expect.any(Number), calls: expect.any(Number) },
      });
    });
  });
});
