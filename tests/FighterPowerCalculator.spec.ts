import { FighterPowerCalculator } from "../src/gameplay/FighterPowerCalculator";
import type { EquipmentItem } from "../src/gameplay/WorldTypes";

function item(overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "item",
    templateId: "test",
    name: "Тестовый предмет",
    slot: "weapon",
    rarity: "common",
    level: 1,
    stats: { attack: 10 },
    allowedClasses: "all",
    price: 0,
    ...overrides,
  };
}

describe("FighterPowerCalculator", () => {
  test("не умножает уже масштабированные характеристики на редкость повторно", () => {
    expect(FighterPowerCalculator.item(item({ rarity: "mythic" })))
      .toBe(FighterPowerCalculator.item(item({ rarity: "common" })));
  });

  test("учитывает аффикс, навык предмета и активные пороги комплекта", () => {
    const plain = item();
    const enhanced = item({
      affix: { name: "Пробой", description: "Атака", stat: "attack", value: 5 },
      grantedSkillId: "relic-blood-pact",
    });
    expect(FighterPowerCalculator.item(enhanced)).toBeGreaterThan(FighterPowerCalculator.item(plain));

    const bastion = ["weapon", "offhand", "head", "chest"].map((slot, index) => item({
      id: `bastion-${index}`,
      slot: slot as EquipmentItem["slot"],
      stats: {},
      setId: "bastion",
    }));
    expect(FighterPowerCalculator.equipment(bastion)).toBeGreaterThan(0);
  });

  test("оценка экипировки следует тому же ограничению уровня, что и боевые характеристики", () => {
    const highLevel = item({ level: 20, stats: { attack: 100 } });
    expect(FighterPowerCalculator.equipment([highLevel], 5)).toBeLessThan(FighterPowerCalculator.equipment([highLevel]));
  });
});
