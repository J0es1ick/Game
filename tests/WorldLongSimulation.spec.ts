import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { auditWorldRelicRegistry, WorldRelicPlacement } from "../src/gameplay/equipment/WorldRelics";
import { parseWorldSave } from "../src/gameplay/save/WorldSaveStorage";
import { validateWorldSave } from "../src/gameplay/save/WorldSaveValidation";
import { EquipmentItem, GameSave } from "../src/gameplay/core/WorldTypes";

function copy(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

function advanceOneDay(game: WorldGame): void {
  game.save.hero.autoResolveLegendChallenges = true;
  const nextTimestamp = game.save.lastSimulatedAt + 600_001;
  expect(game.simulateElapsed(nextTimestamp)).toBe(1);
}

function expectFiniteNumbers(value: unknown, path = "$", visited = new Set<object>()): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectFiniteNumbers(entry, `${path}[${index}]`, visited));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    try {
      expectFiniteNumbers(entry, `${path}.${key}`, visited);
    } catch (error) {
      throw new Error(`${path}.${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function worldRelicPlacements(save: GameSave): WorldRelicPlacement[] {
  const placements: WorldRelicPlacement[] = [];
  const add = (
    keyPrefix: string,
    items: readonly EquipmentItem[],
    status: WorldRelicPlacement["status"],
    ownerId?: string,
    ownerName?: string,
  ) => {
    items.filter((item) => item.worldRelicId).forEach((item) => placements.push({
      key: `${keyPrefix}:${item.id}`,
      item,
      status,
      ownerId,
      ownerName,
    }));
  };
  add("hero", save.hero.inventory, "wielded", "hero", save.hero.name);
  save.enemies.forEach((enemy) => add(`enemy:${enemy.id}`, enemy.equipment, "wielded", enemy.id, enemy.name));
  add("shop", save.shopOffers.filter((offer) => !offer.sold).map((offer) => offer.item), "shop", undefined, "Лавка Ионы");
  if (save.activeExpedition) add("expedition", save.activeExpedition.loot, "wielded", "hero", save.hero.name);
  return placements;
}

function expectReferencesIntact(save: GameSave): void {
  const enemyIds = new Set(save.enemies.map((enemy) => enemy.id));
  const mentorFighterIds = new Set((save.mentors ?? []).map((mentor) => mentor.fighterId));
  const knownFighterIds = new Set(["hero", ...enemyIds, ...mentorFighterIds]);
  save.enemies.forEach((enemy) => {
    const itemById = new Map(enemy.equipment.map((item) => [item.id, item]));
    Object.entries(enemy.equipped).forEach(([slot, itemId]) => {
      expect(itemById.get(itemId!)?.slot).toBe(slot);
    });
    Object.values(enemy.relationships ?? {}).forEach((relationship) => {
      expect(knownFighterIds.has(relationship.fighterId)).toBe(true);
    });
    if (enemy.mentorId) expect((save.mentors ?? []).some((mentor) => mentor.id === enemy.mentorId)).toBe(true);
  });
  (save.mentors ?? []).forEach((mentor) => {
    expect(enemyIds.has(mentor.fighterId)).toBe(true);
    mentor.studentIds.forEach((studentId) => expect(enemyIds.has(studentId)).toBe(true));
  });
  Object.entries(save.npcLife?.profiles ?? {}).forEach(([fighterId, profile]) => {
    expect(profile.fighterId).toBe(fighterId);
    expect(knownFighterIds.has(fighterId)).toBe(true);
  });
  (save.npcLife?.dynasties ?? []).forEach((dynasty) => {
    expect(knownFighterIds.has(dynasty.founderId)).toBe(true);
    dynasty.memberIds.forEach((fighterId) => expect(knownFighterIds.has(fighterId)).toBe(true));
  });
  (save.npcLife?.futureBosses ?? []).forEach((boss) => expect(knownFighterIds.has(boss.fighterId)).toBe(true));
  save.eliteLeagueMemberIds.filter((id) => id !== "hero").forEach((id) => expect(enemyIds.has(id)).toBe(true));
  if (save.pendingFactionHunterId) expect(enemyIds.has(save.pendingFactionHunterId)).toBe(true);
}

describe("long living-world simulation", () => {
  test("keeps the world coherent for 224 autonomous days", () => {
    const game = WorldGame.create("Долгий наблюдатель", "Knight", 770_224);
    const initialIds = new Set(game.save.enemies.map((enemy) => enemy.id));
    const initialLevels = new Map(game.save.enemies.map((enemy) => [enemy.id, enemy.level]));
    const initialArenaControllers = { ...game.save.factionControl?.arenaControllers };
    const initialDungeonControllers = { ...game.save.factionControl?.dungeonControllers };
    const minimumPopulation = ARENAS.map(() => Number.POSITIVE_INFINITY);

    for (let day = 0; day < 224; day += 1) {
      advanceOneDay(game);
      const eliteIds = new Set(game.save.eliteLeagueMemberIds);
      ARENAS.forEach((arena, arenaIndex) => {
        const population = game.save.enemies.filter((enemy) => enemy.alive
          && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id)).length;
        minimumPopulation[arenaIndex] = Math.min(minimumPopulation[arenaIndex], population);
        expect(population).toBeGreaterThanOrEqual(arena.participants);
      });
      expectFiniteNumbers(game.save);
    }

    const activeFighters = game.save.enemies.filter((enemy) => enemy.alive);
    const newcomers = game.save.enemies.filter((enemy) => !initialIds.has(enemy.id));
    const dead = game.save.enemies.filter((enemy) => !enemy.alive);
    const grown = game.save.enemies.filter((enemy) => {
      const initialLevel = initialLevels.get(enemy.id);
      return initialLevel !== undefined && enemy.level > initialLevel;
    });
    const controllerChanged = Object.entries(game.save.factionControl?.arenaControllers ?? {})
      .some(([arenaId, factionId]) => initialArenaControllers[arenaId] !== factionId)
      || Object.entries(game.save.factionControl?.dungeonControllers ?? {})
        .some(([dungeonId, factionId]) => initialDungeonControllers[dungeonId] !== factionId);

    expect(activeFighters.length).toBeGreaterThanOrEqual(ARENAS.reduce((sum, arena) => sum + arena.participants, 0));
    expect(newcomers.length).toBeGreaterThan(0);
    expect(dead.length).toBeGreaterThan(0);
    expect(grown.length).toBeGreaterThan(0);
    expect(game.save.worldSeasonHistory?.length).toBeGreaterThanOrEqual(4);
    expect(game.save.mentors?.length).toBeGreaterThan(0);
    expect(game.save.npcLife?.dynasties.length).toBeGreaterThan(0);
    expect(controllerChanged).toBe(true);
    expect(minimumPopulation.every((population, index) => population >= ARENAS[index].participants)).toBe(true);
    expectReferencesIntact(game.save);
    expect(validateWorldSave(game.save)).toEqual({ valid: true, issues: [] });

    const relicAudit = auditWorldRelicRegistry(game.save.worldRelics ?? [], worldRelicPlacements(game.save));
    expect(relicAudit.issues).toEqual([]);
  }, 240_000);

  test("continues an old-format save after a long first epoch", () => {
    const original = WorldGame.create("Хранитель старой записи", "Archer", 770_180);
    for (let day = 0; day < 168; day += 1) advanceOneDay(original);
    const legacy = copy(original.save) as unknown as Record<string, unknown>;
    ["factionControl", "npcLife", "worldSeason", "worldSeasonHistory", "dungeonDiscoveries", "pendingFactionHunterId"]
      .forEach((field) => { delete legacy[field]; });
    const clearRelicIdentity = (item: Record<string, unknown>) => {
      delete item.worldRelicId;
      delete item.relicFeats;
      delete item.relicProperties;
      delete item.appearanceVariant;
    };
    ((legacy.hero as Record<string, unknown>).inventory as Array<Record<string, unknown>>).forEach(clearRelicIdentity);
    (legacy.enemies as Array<Record<string, unknown>>).forEach((enemy) => {
      delete enemy.factionLoyalty;
      delete enemy.factionHostility;
      (enemy.equipment as Array<Record<string, unknown>>).forEach(clearRelicIdentity);
    });
    delete legacy.worldRelics;

    const migrated = parseWorldSave(JSON.stringify(legacy));
    const restored = WorldGame.restore(migrated);
    for (let day = 0; day < 42; day += 1) advanceOneDay(restored);

    expect(restored.save.worldDay).toBe(original.save.worldDay + 42);
    expect(restored.save.factionControl).toBeDefined();
    expect(restored.save.npcLife).toBeDefined();
    expect(restored.save.worldSeason).toBeDefined();
    expectReferencesIntact(restored.save);
    expectFiniteNumbers(restored.save);
    expect(validateWorldSave(restored.save)).toEqual({ valid: true, issues: [] });
  }, 240_000);
});
