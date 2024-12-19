import { Archer } from "../src/classes";
import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";

describe("Archer class methods tests", () => {
  it("Constructor test", () => {
    const weaponFabric = new WeaponFabric();
    const newArcher = new Archer(
      75,
      25,
      "Ibragim",
      weaponFabric.createWeapon("bow")
    );
    expect(newArcher.health).toEqual(75);
    expect(newArcher.strength).toBe(25);
    expect(newArcher.name).toBe("Ibragim");
  });
  describe("Get methods tests", () => {
    const weaponFabric = new WeaponFabric();
    const newArcher = new Archer(
      75,
      25,
      "Ibragim",
      weaponFabric.createWeapon("bow")
    );
    it("Health get test", () => {
      expect(newArcher.health).toEqual(75);
    });
    it("Strength get test", () => {
      expect(newArcher.strength).toBe(25);
    });
    it("Name get test", () => {
      expect(newArcher.name).toBe("Ibragim");
    });
  });
  describe("Archer methods tests", () => {
    const weaponFabric = new WeaponFabric();
    const newArcher = new Archer(
      75,
      25,
      "Ibragim",
      weaponFabric.createWeapon("bow")
    );
    const opponent = new Archer(
      86,
      26,
      "Mustafa",
      weaponFabric.createWeapon("bow")
    );
    it('Should change the propertie "skillUsed" to true', () => {
      newArcher.useSkill(opponent);
      expect(newArcher.isSkillUsed).toEqual(true);
    });
  });
  describe("Archer methods tests", () => {
    const weaponFabric = new WeaponFabric();
    const newArcher = new Archer(
      75,
      25,
      "Ibragim",
      weaponFabric.createWeapon("bow")
    );
    const opponent = new Archer(
      86,
      26,
      "Mustafa",
      weaponFabric.createWeapon("bow")
    );
    it("Should return health after an attack whithout using a skill", () => {
      newArcher.attack(opponent);
      expect(opponent.health).toEqual(
        86 - newArcher.strength + newArcher.weapon.damage
      );
    });
    it("Health should decrease by the number of damage units", () => {
      newArcher.takeDamage(45, opponent, opponent.currentSkill);
      expect(newArcher.health).toEqual(75 - 45);
    });
    it("Ibragim should DIE.", () => {
      newArcher.takeDamage(45, opponent, opponent.currentSkill);
      expect(newArcher.isAlive).toEqual(false);
    });
  });
});
