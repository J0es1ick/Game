import { EQUIPMENT_SETS } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { BattleSession, combatantSnapshot } from "../src/gameplay/combat/AdvancedBattle";
import {
  equipmentResonance,
  recordEquipmentDeed,
  resonanceCooldownCadence,
  resonanceDamageMultiplier,
  resonanceGuardMultiplier,
} from "../src/gameplay/equipment/EquipmentEvolution";
import { FighterPowerCalculator } from "../src/gameplay/combat/FighterPowerCalculator";
import { SeededRandom } from "../src/gameplay/core/RandomSource";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import type { CombatantSnapshot, EquipmentItem, EquipmentResonance } from "../src/gameplay/core/WorldTypes";

function relic(id: string): EquipmentItem {
  const item = createItem(20, { classId: "Knight", rarity: "legendary", randomSource: new SeededRandom(id) });
  return { ...item, id, relicTier: 2, relicPath: "guard" };
}

function resonance(path: EquipmentResonance["path"]): EquipmentResonance {
  return { setId: "bastion", setName: "Последний бастион", path, stage: 2, pieces: 6, description: "Испытание наследия" };
}

function fighter(id: string, extra: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    id, name: id, classId: "Knight", level: 20,
    health: 700, maxHealth: 700, attack: 70, defense: 30, speed: 20, crit: 10,
    equipmentScore: 150, skills: ["shield-bash", "riposte", "second-wind", "battle-focus"],
    ...extra,
  };
}

describe("equipment history and set resonance", () => {
  test("records real deeds once and applies bounded permanent properties", () => {
    const source = relic("deeds");
    const first = recordEquipmentDeed(source, "lethal", "Первый противник", 10);
    expect(source.relicProperties).toBeUndefined();
    expect(first.changed).toBe(true);
    expect(first.growth).toEqual({ attack: 2 });
    expect(first.item.relicHistory).toEqual(expect.arrayContaining([expect.stringContaining("первый противник")]));
    expect(FighterPowerCalculator.item(first.item)).toBeGreaterThan(FighterPowerCalculator.item(source));
    expect(recordEquipmentDeed(first.item, "lethal", "Первый противник", 11).changed).toBe(false);
    let evolved = first.item;
    for (let index = 0; index < 15; index += 1) {
      evolved = recordEquipmentDeed(evolved, "lethal", `Другой противник ${index}`, 12 + index).item;
    }
    expect(evolved.relicProperties?.find((property) => property.name === "Кровавая закалка")?.value).toBe(6);
    const restored = { ...evolved, relicFeats: [] };
    expect(recordEquipmentDeed(restored, "lethal", "Поздний противник", 80).item.relicProperties).toEqual(evolved.relicProperties);
  });

  test("does not awaken ordinary equipment from a single victory", () => {
    const source = { ...relic("common"), rarity: "common" as const };
    expect(recordEquipmentDeed(source, "championship", "Первый кубок", 12).item).toBe(source);
  });

  test("requires a real set and related awakened paths for combat resonance", () => {
    const set = EQUIPMENT_SETS.find((candidate) => candidate.id === "bastion")!;
    const items = set.pieces.map((templateId, index) => ({
      ...createItem(20, { classId: "Knight", templateId, rarity: "legendary", randomSource: new SeededRandom(templateId) }),
      relicPath: "guard" as const,
      relicTier: 2 as const,
    }));
    expect(equipmentResonance(items.slice(0, 3))).toBeUndefined();
    expect(equipmentResonance(items.slice(0, 4))).toMatchObject({ path: "guard", stage: 2, pieces: 4 });
    expect(equipmentResonance(items)).toMatchObject({ path: "guard", stage: 3, pieces: 6 });
    expect(resonanceGuardMultiplier(resonance("guard"))).toBeCloseTo(0.8);
    expect(resonanceDamageMultiplier(resonance("might"), true)).toBeCloseTo(1.08);
    expect(resonanceDamageMultiplier(resonance("might"), false)).toBe(1);
    expect(resonanceCooldownCadence(resonance("tempo"))).toBe(4);
  });

  test("resolves set protection in battle and preserves it across a reload", () => {
    const hero = fighter("hero", { health: 150, equipmentResonance: resonance("guard") });
    const enemy = fighter("enemy", { speed: 30 });
    const session = new BattleSession(hero, enemy, { randomSource: new SeededRandom("resonance-resume") });
    session.step();
    const serialized = JSON.parse(JSON.stringify(session.snapshot()));
    expect(serialized.hero.equipmentResonance).toEqual(resonance("guard"));
    const restored = new BattleSession(serialized);
    const originalResult = session.runAutomatic();
    const restoredResult = restored.runAutomatic();
    expect(restoredResult.turns).toEqual(originalResult.turns);
    expect(originalResult.turns.some((turn) => turn.detail.includes("наследие комплекта"))).toBe(true);
  });

  test("transfers the physical relic to a compatible NPC without duplicating it", () => {
    const game = WorldGame.create("Даритель", "Knight", 665_381);
    game.save.hero.highestArena = 4;
    game.save.hero.arenaWins[3] = 1;
    game.save.hero.level = 24;
    game.save.hero.relicDust = 8;
    const item = createItem(20, { classId: "Knight", templateId: "wanderer-coat", rarity: "legendary", randomSource: new SeededRandom("gift") });
    item.relicTier = 1;
    game.save.hero.inventory.push(item);
    const awakened = game.awakenRelic(item.id, "guard");
    const recipient = game.relicRecipients(item.id)[0];
    expect(recipient).toBeDefined();
    const record = game.giftRelic(item.id, recipient.id);
    expect(game.save.hero.inventory.some((candidate) => candidate.id === item.id)).toBe(false);
    expect(recipient.equipment.filter((candidate) => candidate.worldRelicId === awakened.worldRelicId)).toHaveLength(1);
    expect(record.currentOwnerId).toBe(recipient.id);
    expect(record.formerOwners).toEqual(expect.arrayContaining(["Даритель", recipient.name]));
    expect(recipient.relationships?.hero.kind).toBe("ally");
    expect(combatantSnapshot(recipient).maxHealth).toBeGreaterThan(0);
    expect(() => game.giftRelic(item.id, recipient.id)).toThrow();
  });
});
