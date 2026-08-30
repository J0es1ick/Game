import {
  evaluateBestEquipment,
  reforgeCost,
  reforgeProperty,
  rollTargetedLoot,
} from "../src/gameplay/equipment/LootProgression";
import { RandomSource, SeededRandom } from "../src/gameplay/core/RandomSource";
import type { EquipmentItem, EquipmentSlot } from "../src/gameplay/core/WorldTypes";

function item(id: string, slot: EquipmentSlot, overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id,
    templateId: id,
    name: id,
    slot,
    rarity: "common",
    level: 10,
    stats: { attack: 10 },
    allowedClasses: "all",
    price: 0,
    ...overrides,
  };
}

function fixedRandom(value: number): RandomSource {
  return {
    next: () => value,
    int: (min, max) => Math.min(max, Math.max(min, Math.floor(min + value * (max - min + 1)))),
    chance: (probability) => value < probability,
    pick: <T>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(value * items.length))],
    shuffle: <T>(items: readonly T[]) => [...items],
  };
}

describe("LootProgression", () => {
  test("стоимость перековки растёт с редкостью, улучшением и числом попыток", () => {
    const common = item("common", "weapon");
    const mythic = item("mythic", "weapon", { rarity: "mythic", enhancement: 4 });
    expect(reforgeCost(mythic, 3).gold).toBeGreaterThan(reforgeCost(common, 0).gold);
    expect(reforgeCost(mythic, 3).temperingMarks).toBeGreaterThan(reforgeCost(common, 0).temperingMarks);
  });

  test("перековывает ровно выбранное базовое свойство и не меняет исходный предмет", () => {
    const source = item("blade", "weapon", { stats: { attack: 14, defense: 5 } });
    const before = JSON.stringify(source);
    const result = reforgeProperty(source, { sourceStat: "attack", targetStat: "speed", attempt: 2 }, new SeededRandom("reforge"));
    expect(JSON.stringify(source)).toBe(before);
    expect(result.item.stats.attack).toBeUndefined();
    expect(result.item.stats.speed).toBeGreaterThan(0);
    expect(result.item.stats.defense).toBe(5);
    expect(result.cost).toEqual(reforgeCost(source, 2));
  });

  test("целевая охота накапливает промахи и гарантирует цель на hard pity", () => {
    const target = item("bastion-chest", "chest", { setId: "bastion" });
    const miss = item("loose-sword", "weapon");
    const first = rollTargetedLoot([target, miss], { slot: "chest", setId: "bastion" }, undefined, fixedRandom(0.99), {
      baseChance: 0.1, chancePerMiss: 0.1, hardPity: 3,
    });
    expect(first.matchedTarget).toBe(false);
    expect(first.pity.misses).toBe(1);

    const second = rollTargetedLoot([target, miss], { slot: "chest", setId: "bastion" }, first.pity, fixedRandom(0.99), {
      baseChance: 0.1, chancePerMiss: 0.1, hardPity: 3,
    });
    const third = rollTargetedLoot([target, miss], { slot: "chest", setId: "bastion" }, second.pity, fixedRandom(0.99), {
      baseChance: 0.1, chancePerMiss: 0.1, hardPity: 3,
    });
    expect(third.forcedByPity).toBe(true);
    expect(third.item.id).toBe(target.id);
    expect(third.pity.misses).toBe(0);
  });

  test("естественная целевая находка сбрасывает pity даже без успешного броска шанса", () => {
    const onlyTarget = item("only-chest", "chest", { setId: "bastion" });
    const result = rollTargetedLoot([onlyTarget], { slot: "chest" }, { targetKey: "chest:any", misses: 2 }, fixedRandom(0.99));
    expect(result.matchedTarget).toBe(true);
    expect(result.pity.misses).toBe(0);
  });

  test("поиск лучшей сборки учитывает механические бонусы полного комплекта", () => {
    const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest"];
    const inventory = slots.flatMap((slot) => [
      item(`bastion-${slot}`, slot, { stats: { attack: 1 }, setId: "bastion", allowedClasses: ["Knight"] }),
      item(`loose-${slot}`, slot, { stats: { attack: 3 }, allowedClasses: ["Knight"] }),
    ]);
    const result = evaluateBestEquipment(inventory, { classId: "Knight" });
    expect(result.setCounts.bastion).toBe(4);
    expect(result.activeSetBonuses.length).toBeGreaterThanOrEqual(2);
    expect(result.completeSlots).toBe(4);
  });
});
