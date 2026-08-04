import { Archer } from "../src/classes";
import { createRandomWeapon, createWeapon } from "../src/catalogs/WeaponCatalog";

describe("Player progression tests", () => {

  it("levels up after enough experience and keeps the new stats on reset", () => {
    const hero = new Archer(100, 20, "Hero", createWeapon("Training Sword", 5), []);

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
