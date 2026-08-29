import { ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { createWorldRelicRecord } from "../src/gameplay/LivingWorld";
import { FighterPowerCalculator } from "../src/gameplay/FighterPowerCalculator";
import { considerNpcLoot, considerNpcLootDetailed } from "../src/gameplay/NpcEquipment";
import { SeededRandom } from "../src/gameplay/RandomSource";
import {
  auditWorldRelicRegistry,
  deduplicateWorldRelicRecords,
  deriveWorldRelicLegacy,
  isWorldRelicEligible,
  reconcileWorldRelicRegistry,
  releaseWorldRelic,
  stripWorldRelicIdentity,
  synchronizeWorldRelic,
  transferWorldRelic,
  worldRelicLegacyBonus,
} from "../src/gameplay/WorldRelics";
import { EnemyProfile, EquipmentItem } from "../src/gameplay/WorldTypes";

function item(id: string, slot: EquipmentItem["slot"] = "weapon"): EquipmentItem {
  const created = createItem(18, { classId: "Swordsman", slot, rarity: "legendary", randomSource: new SeededRandom(id) });
  created.id = id;
  return created;
}

describe("world relic invariants", () => {
  it("forbids crown and boss-exclusive equipment from becoming a world relic", () => {
    const crownTemplate = ITEM_TEMPLATES.find((template) => template.exclusiveToElite)!;
    const bossTemplate = ITEM_TEMPLATES.find((template) => template.exclusiveToBoss)!;
    const crown = createItem(30, { classId: "Knight", templateId: crownTemplate.id, rarity: "mythic", randomSource: new SeededRandom("crown") });
    const boss = createItem(30, { classId: "Knight", templateId: bossTemplate.id, rarity: "mythic", randomSource: new SeededRandom("boss") });

    expect(isWorldRelicEligible(crown)).toBe(false);
    expect(isWorldRelicEligible(boss)).toBe(false);
    expect(() => createWorldRelicRecord("forbidden-crown", crown, "hero", "Герой", 1)).toThrow(/не могут стать/);
    expect(() => createWorldRelicRecord("forbidden-boss", boss, "hero", "Герой", 1)).toThrow(/не могут стать/);
    crown.worldRelicId = "legacy-corrupt-crown";
    expect(deduplicateWorldRelicRecords([{
      id: "legacy-corrupt-crown",
      item: crown,
      createdDay: 1,
      status: "lost",
      formerOwners: [],
      history: [],
    }])).toEqual([]);

    const repaired = reconcileWorldRelicRegistry([], [{
      key: "hero:head",
      item: crown,
      status: "wielded",
      ownerId: "hero",
      ownerName: "Герой",
    }], 2);
    expect(repaired.records).toEqual([]);
    expect(repaired.removedPlacementKeys).toEqual([]);
    expect(repaired.sanitizedPlacementKeys).toEqual(["hero:head"]);
    expect(repaired.placements[0].item.worldRelicId).toBeUndefined();
  });

  it("keeps the canonical copy synchronized through transfer and release", () => {
    const source = item("sync-source");
    const initial = createWorldRelicRecord("relic-sync", source, "fighter-a", "Ада А.", 4);
    source.enhancement = 4;
    source.stats.attack = 999;
    const synchronized = synchronizeWorldRelic(initial, source, "День 8: реликвию перековали.");
    const transferred = transferWorldRelic(synchronized, source, "fighter-b", "Бран Б.", "День 9: реликвия сменила владельца.");
    const released = releaseWorldRelic(transferred.record, transferred.item, "День 12: реликвия вновь затерялась.");

    expect(synchronized.item.enhancement).toBe(4);
    expect(synchronized.item.stats.attack).toBe(999);
    expect(synchronized.lastSyncedDay).toBe(8);
    expect(synchronized.legacyProperty).toBeDefined();
    expect(transferred.record.currentOwnerId).toBe("fighter-b");
    expect(transferred.record.formerOwners).toEqual(["Ада А.", "Бран Б."]);
    expect(released.record.status).toBe("lost");
    expect(released.record.currentOwnerId).toBeUndefined();
    expect(released.item.relicHistory?.[(released.item.relicHistory?.length ?? 1) - 1]).toContain("затерялась");
  });

  it("turns a remembered item into the unique highest rarity and restores its origin when released from the registry", () => {
    const source = item("ascendant-source");
    const mythic = createItem(18, {
      classId: "Swordsman",
      templateId: source.templateId,
      rarity: "mythic",
      randomSource: new SeededRandom("ascendant-source"),
    });
    const record = createWorldRelicRecord("relic-ascendant", source, "fighter-a", "Ада А.", 4);

    expect(record.item.rarity).toBe("relic");
    expect(record.item.relicBaseRarity).toBe("legendary");
    expect(FighterPowerCalculator.item(record.item)).toBeGreaterThan(FighterPowerCalculator.item(mythic));
    expect(record.item.relicProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Воля мира", stat: "attack" }),
      expect.objectContaining({ name: "Память триумфа" }),
    ]));

    const stripped = stripWorldRelicIdentity(record.item);
    expect(stripped.rarity).toBe("legendary");
    expect(stripped.relicBaseRarity).toBeUndefined();
    expect(stripped.relicProperties?.some((property) => property.name === "Воля мира")).toBe(false);
  });

  it("deduplicates records and reports duplicate physical placements", () => {
    const source = item("duplicate-source");
    const first = createWorldRelicRecord("relic-duplicate", source, "fighter-a", "Ада А.", 2);
    const second = transferWorldRelic(first, source, "fighter-b", "Бран Б.", "День 5: новый владелец.").record;
    const records = deduplicateWorldRelicRecords([first, second]);
    const audit = auditWorldRelicRegistry(records, [
      { key: "fighter-a:weapon", item: { ...source }, status: "wielded", ownerId: "fighter-a", ownerName: "Ада А." },
      { key: "fighter-b:weapon", item: { ...source }, status: "wielded", ownerId: "fighter-b", ownerName: "Бран Б." },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].currentOwnerId).toBe("fighter-b");
    expect(audit.issues.some((issue) => issue.kind === "duplicate-placement")).toBe(true);
    expect(audit.canonicalPlacementKeys[records[0].id]).toBe("fighter-b:weapon");
  });

  it("reconciles duplicate owners into one canonical record and one physical item", () => {
    const source = item("reconcile-source");
    const record = createWorldRelicRecord("relic-reconcile", source, "fighter-b", "Бран Б.", 2);
    const result = reconcileWorldRelicRegistry([record, { ...record }], [
      { key: "fighter-a:weapon", item: { ...source }, status: "wielded", ownerId: "fighter-a", ownerName: "Ада А." },
      { key: "fighter-b:weapon", item: { ...source }, status: "wielded", ownerId: "fighter-b", ownerName: "Бран Б." },
    ], 8);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].currentOwnerId).toBe("fighter-b");
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].key).toBe("fighter-b:weapon");
    expect(result.removedPlacementKeys).toEqual(["fighter-a:weapon"]);
  });

  it("derives an evolving identity and property from the actual chronicle", () => {
    const source = item("history-source");
    const record = createWorldRelicRecord("relic-history", source, "fighter-a", "Ада А.", 1);
    record.history.push(
      "День 2: владелец победил чемпиона.",
      "День 3: победа в турнире.",
      "День 4: получен титул легенды.",
      "День 5: реликвию нашёл другой чемпион.",
      "День 6: ещё одна победа.",
    );
    record.formerOwners.push("Бран Б.", "Валлен В.");

    const legacy = deriveWorldRelicLegacy(record);
    const renamed = synchronizeWorldRelic(record, record.item);
    const renamedAgain = synchronizeWorldRelic(renamed, renamed.item);

    expect(legacy.stage).toBeGreaterThanOrEqual(2);
    expect(legacy.kind).toBe("conquest");
    expect(legacy.name).toContain("·");
    expect(legacy.property.stat).toBe("defense");
    expect(legacy.property.value).toBeGreaterThan(3);
    expect(worldRelicLegacyBonus(renamed)).toEqual({ defense: legacy.property.value });
    expect(renamedAgain.item.relicName).toBe(renamed.item.relicName);
  });

  it("does not let a second relic silently erase the relic already occupying an NPC slot", () => {
    const enemy = {
      id: "enemy-relic-keeper",
      name: "Наблюдатель",
      classId: "Swordsman",
      equipment: [],
      equipped: {},
    } as unknown as EnemyProfile;
    const first = item("first-relic");
    const second = item("second-relic");
    createWorldRelicRecord("relic-first", first, enemy.id, enemy.name, 1);
    createWorldRelicRecord("relic-second", second, "lost", "Неизвестный", 2);
    first.stats.attack = 20;
    second.stats.attack = 20_000;

    expect(considerNpcLoot(enemy, first)).toBe(true);
    const decision = considerNpcLootDetailed(enemy, second);

    expect(decision).toEqual({ equipped: false, displaced: [], rejection: "relic-slot-occupied" });
    expect(enemy.equipment.find((candidate) => candidate.slot === "weapon")?.worldRelicId).toBe("relic-first");
  });
});
