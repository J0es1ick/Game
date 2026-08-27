import { BattleSession } from "../src/gameplay/AdvancedBattle";
import { combatActionRate, combatArmorMultiplier, combatPressure, MAX_DIRECT_DAMAGE_SHARE, skillHealing } from "../src/gameplay/CombatBalance";
import { SeededRandom } from "../src/gameplay/RandomSource";
import { SKILLS } from "../src/catalogs/WorldCatalog";
import type { CombatantSnapshot } from "../src/gameplay/WorldTypes";

describe("Combat balance", () => {
  test("speed stays useful but has a bounded diminishing return", () => {
    const speeds = [0, 20, 60, 120, 300, 10000];
    const rates = speeds.map(combatActionRate);
    rates.forEach((rate, index) => {
      expect(rate).toBeGreaterThanOrEqual(24);
      expect(rate).toBeLessThan(72);
      if (index) expect(rate).toBeGreaterThan(rates[index - 1]);
    });
    expect(combatActionRate(40) - combatActionRate(20)).toBeGreaterThan(combatActionRate(240) - combatActionRate(220));
    expect(combatActionRate(160) / combatActionRate(20)).toBeLessThan(2);
    expect(combatActionRate(-5)).toBe(combatActionRate(0));
    expect(combatActionRate(NaN)).toBe(combatActionRate(0));
  });

  test("defense reduces damage instead of becoming irrelevant to a health-based floor", () => {
    expect(combatArmorMultiplier(0)).toBe(1);
    expect(combatArmorMultiplier(180)).toBeCloseTo(0.5);
    expect(combatArmorMultiplier(540)).toBeCloseTo(0.25);
    const pressure = combatPressure(20, 20).damageMultiplier;
    expect(100 * combatArmorMultiplier(540) * pressure).toBeLessThan(100 * combatArmorMultiplier(180) * pressure);
    expect(MAX_DIRECT_DAMAGE_SHARE).toBeLessThanOrEqual(0.4);
  });

  test("one fast fighter cannot advance fatigue before both fighters have acted", () => {
    expect(combatPressure(100, 0)).toEqual({ damageMultiplier: 1, healingMultiplier: 1 });
    expect(combatPressure(100, 4)).toEqual({ damageMultiplier: 1, healingMultiplier: 1 });
    expect(combatPressure(5, 100)).toEqual(combatPressure(100, 5));
    expect(combatPressure(5, 100).damageMultiplier).toBeCloseTo(1.3);
    expect(combatPressure(100, 100)).toEqual({ damageMultiplier: 4, healingMultiplier: 0.25 });
  });

  test("late healing remains useful and cannot exceed actual missing health", () => {
    const skill = SKILLS.find((entry) => entry.id === "survivor-instinct")!;
    const multiplier = combatPressure(100, 100).healingMultiplier;
    expect(skillHealing(skill, 40, 100, 2000, multiplier)).toBeGreaterThan(0);
    expect(skillHealing(skill, 40, 1999, 2000, multiplier)).toBe(1);
    expect(skillHealing(skill, 40, 2000, 2000, multiplier)).toBe(0);
  });

  test("a strong slow swordsman reliably defeats a weaker fast opponent", () => {
    const hero: CombatantSnapshot = {
      id: "hero", name: "Испытатель", classId: "Swordsman", level: 40,
      maxHealth: 2400, health: 2400, attack: 440, defense: 400, speed: 20, crit: 40,
      equipmentScore: 1000, skills: ["eight-cuts", "cross-cut", "survivor-instinct", "blade-catch"], tacticalStyle: "balanced",
    };
    const enemy: CombatantSnapshot = {
      ...hero, id: "npc", name: "Быстрый соперник", level: 30,
      maxHealth: 1200, health: 1200, attack: 240, defense: 200, speed: 160,
    };
    let wins = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const result = new BattleSession(hero, enemy, { randomSource: new SeededRandom(`synthetic${seed}`) }).runAutomatic();
      if (result.winnerId === "hero") wins += 1;
      expect(result.turns.length).toBeLessThan(120);
    }
    expect(wins).toBeGreaterThanOrEqual(80);
  });
});
