import { Knight } from "../src/classes";
import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";

describe("Player progression tests", () => {
  const weaponFabric = new WeaponFabric();

  it("levels up after enough experience and keeps the new stats on reset", () => {
    const hero = new Knight(100, 20, "Hero", weaponFabric.createWeapon("sword", "Training Sword", 5), []);

    hero.takeDamage(35);
    expect(hero.health).toBe(65);

    const levels = hero.gainExperience(250);

    expect(levels).toBe(2);
    expect(hero.level).toBe(3);
    expect(hero.experience).toBe(15);
    expect(hero.initialHealth).toBe(120);
    expect(hero.initialStrength).toBe(24);
    expect(hero.health).toBe(120);
    expect(hero.strength).toBe(24);

    hero.takeDamage(20);
    hero.reset();

    expect(hero.health).toBe(120);
    expect(hero.strength).toBe(24);
    expect(hero.level).toBe(3);
    expect(hero.experience).toBe(15);
  });
});
