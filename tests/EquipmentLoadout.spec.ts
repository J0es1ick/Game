import { WorldGame } from "../src/gameplay/core/WorldGame";
import { compareEquipment } from "../src/gameplay/equipment/EquipmentComparison";
import { evaluateEquipmentLoadout, findBestEquipmentLoadout } from "../src/gameplay/equipment/EquipmentLoadout";
import type { EquipmentItem } from "../src/gameplay/core/WorldTypes";

function item(id: string, slot: EquipmentItem["slot"], stats: EquipmentItem["stats"]): EquipmentItem {
  return { id, name: id, templateId: id, slot, stats, level: 40, rarity: "mythic", allowedClasses: "all", price: 1 };
}

describe("effective equipment loadouts", () => {
  test("prefers speed over redundant critical chance without changing the hero", () => {
    const hero = WorldGame.create("Тест", "Swordsman", 752).save.hero;
    hero.level = 40;
    hero.inventory = [item("crit", "head", { crit: 100 }), item("more", "hands", { crit: 80 }), item("tempo", "hands", { speed: 35 })];
    hero.equipped = { head: "crit", hands: "more" };
    const before = JSON.stringify(hero);
    const selected = findBestEquipmentLoadout(hero);
    expect(selected.hands).toBe("tempo");
    expect(JSON.stringify(hero)).toBe(before);
    expect(evaluateEquipmentLoadout(hero, selected)).toBeGreaterThan(evaluateEquipmentLoadout(hero, hero.equipped));
  });

  test("reports no effective gain beyond the critical cap and includes relic properties", () => {
    const hero = WorldGame.create("Тест", "Knight", 753).save.hero;
    const helmet = item("cap", "head", { crit: 100 });
    const old = item("old", "hands", { defense: 10 });
    const candidate = { ...item("new", "hands", { defense: 10, crit: 40 }), relicProperties: [{ name: "Память", description: "", stat: "attack" as const, value: 12 }] };
    hero.inventory = [helmet, old];
    hero.equipped = { head: helmet.id, hands: old.id };
    const before = JSON.stringify(hero);
    const comparison = compareEquipment(hero, candidate, old);
    expect(comparison.candidate.crit - comparison.current.crit).toBe(0);
    expect(comparison.candidate.attack - comparison.current.attack).toBe(12);
    expect(JSON.stringify(hero)).toBe(before);
  });

  test("retains equivalent equipment and ignores incompatible items", () => {
    const hero = WorldGame.create("Тест", "Knight", 754).save.hero;
    const old = item("old", "weapon", { attack: 20 });
    hero.inventory = [old, item("same", "weapon", { attack: 20 }), { ...item("wrong", "weapon", { attack: 999 }), allowedClasses: ["Wizard"] }];
    hero.equipped = { weapon: old.id };
    expect(findBestEquipmentLoadout(hero).weapon).toBe(old.id);
  });

  test("does not sacrifice a stronger world-relic loadout merely to maximize set piece count", () => {
    const hero = WorldGame.create("Тест", "Knight", 755).save.hero;
    const slots: EquipmentItem["slot"][] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
    const relics = slots.map((slot, index) => ({
      ...item(`relic-${slot}`, slot, { attack: 80 + index }),
      rarity: "relic" as const,
      worldRelicId: `world-relic-${slot}`,
    }));
    const set = slots.map((slot) => ({
      ...item(`set-${slot}`, slot, { attack: 1 }),
      setId: "crown-sovereign",
    }));
    hero.inventory = [...relics, ...set];
    hero.equipped = Object.fromEntries(relics.map((entry) => [entry.slot, entry.id]));

    const selected = findBestEquipmentLoadout(hero, "set");

    expect(selected).toEqual(hero.equipped);
    expect(evaluateEquipmentLoadout(hero, selected)).toBeGreaterThan(
      evaluateEquipmentLoadout(hero, Object.fromEntries(set.map((entry) => [entry.slot, entry.id]))),
    );
  });
});
