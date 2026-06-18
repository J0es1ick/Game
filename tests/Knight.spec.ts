import { Archer, Knight, Wizard } from "../src/classes";
import { SkillFabric } from "../src/fabrics/skillFabric/SkillFabric";
import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";

describe("Knight class methods tests", () => {
  it("Constructor test", () => {
    const weaponFabric = new WeaponFabric();
    const skillFabric = new SkillFabric();
    const newKnight = new Knight(
      75,
      25,
      "Ibragim",
      weaponFabric.createRandomWeapon("sword"),
      [
        skillFabric.createSkillFromTemplate("удар возмездия")!,
        skillFabric.createSkillFromTemplate("ледяные стрелы")!,
      ],
    );
    expect(newKnight).toBeInstanceOf(Knight);
    expect(newKnight.health).toBe(75);
    expect(newKnight.strength).toBe(25);
    expect(newKnight.name).toBe("Ibragim");
  });

  describe("Get methods tests", () => {
    const weaponFabric = new WeaponFabric();
    const skillFabric = new SkillFabric();
    const newKnight = new Knight(
      75,
      25,
      "Ibragim",
      weaponFabric.createRandomWeapon("sword"),
      [
        skillFabric.createSkillFromTemplate("удар возмездия")!,
        skillFabric.createSkillFromTemplate("ледяные стрелы")!,
      ],
    );

    it("Health get test", () => {
      expect(newKnight.health).toBe(75);
    });
    it("Strength get test", () => {
      expect(newKnight.strength).toBe(25);
    });
    it("Name get test", () => {
      expect(newKnight.name).toBe("Ibragim");
    });
    it("ClassName get test", () => {
      expect(newKnight.className).toBe("Knight");
    });
    it("IsAlive get test", () => {
      expect(newKnight.isAlive).toBe(true);
    });
    it("InitialHealth get test", () => {
      expect(newKnight.initialHealth).toBe(75);
    });
    it("InitialStrength get test", () => {
      expect(newKnight.initialStrength).toBe(25);
    });
    it("CountOfSkippingTurns get test", () => {
      expect(newKnight.countOfSkipingTurns).toBe(0);
    });
    it("CountOfSkippingTurns get test after using skipping spell", () => {
      const opponent = new Wizard(
        86,
        26,
        "Mustafa",
        weaponFabric.createRandomWeapon("stick"),
        [
          skillFabric.createSkillFromTemplate("заворожение")!,
          skillFabric.createSkillFromTemplate("ледяные стрелы")!,
        ],
      );
      opponent.useSkill(newKnight, "заворожение");
      expect(newKnight.countOfSkipingTurns).toBe(1);
    });
  });

  describe("Knight methods tests", () => {
    const weaponFabric = new WeaponFabric();
    const skillFabric = new SkillFabric();

    const knightWeapon = weaponFabric.createWeapon(
      "sword",
      "Training Sword",
      5,
    );
    const archerWeapon = weaponFabric.createWeapon("bow", "Training Bow", 4);

    const newKnight = new Knight(75, 25, "Ibragim", knightWeapon, [
      skillFabric.createSkillFromTemplate("удар возмездия")!,
      skillFabric.createSkillFromTemplate("ледяные стрелы")!,
    ]);
    const opponent = new Archer(86, 26, "Mustafa", archerWeapon, [
      skillFabric.createSkillFromTemplate("ледяные стрелы")!,
      skillFabric.createSkillFromTemplate("заворожение")!,
    ]);

    it("Should return health after an attack without using a skill", () => {
      newKnight.attack(opponent);
      expect(opponent.health).toBe(
        86 - (newKnight.strength + newKnight.weapon.damage),
      );
    });

    it("Health should decrease by the number of damage units", () => {
      newKnight.takeDamage(45);
      expect(newKnight.health).toBe(75 - 45);
    });

    it("Knight takes full damage including skill buff from ледяные стрелы", () => {
      newKnight.heal(100);
      opponent.useSkill(newKnight, "ледяные стрелы");
      opponent.attack(newKnight);
      expect(newKnight.health).toBe(
        75 - (opponent.strength + opponent.weapon.damage + 3),
      );
    });

    it('Should change the property "isUsed" when skill is activated', () => {
      newKnight.choseSkill();
      newKnight.useSkill(opponent);
      expect(newKnight.skills).toContain(newKnight.currentSkill);
    });

    it("Health should increase after heal", () => {
      newKnight.heal(1000);
      newKnight.takeDamage(30);
      newKnight.heal(10);
      expect(newKnight.health).toBe(75 - 30 + 10);
    });

    it("Health should be equal initialHealth after full heal", () => {
      newKnight.heal(1000);
      expect(newKnight.health).toBe(newKnight.initialHealth);
    });

    it("Ibragim should die.", () => {
      newKnight.takeDamage(newKnight.initialHealth);
      expect(newKnight.isAlive).toBe(false);
      expect(newKnight.health).toBe(0);
    });

    it("Ibragim health should be equal 0 when overkilled.", () => {
      newKnight.takeDamage(1000);
      expect(newKnight.health).toBe(0);
    });

    it("Ibragim should reset.", () => {
      newKnight.reset();
      expect(newKnight.health).toBe(newKnight.initialHealth);
      expect(newKnight.strength).toBe(newKnight.initialStrength);
      expect(newKnight.currentSkill).toBeUndefined();
      newKnight.skills!.forEach((skill) => {
        expect(skill.usageCount).toBe(skill.initialSkillUsage);
        expect(skill.isUsed).toBe(false);
        expect(skill.turns).toBe(skill.initialTurns);
      });
    });

    it("Ice arrows buff applies for 3 attacks then expires", () => {
      opponent.heal(1000);
      newKnight.useSkill(opponent, "ледяные стрелы");
      expect(newKnight.attack(opponent)).toBe(
        newKnight.strength + newKnight.weapon.damage + 3,
      );
      expect(newKnight.attack(opponent)).toBe(
        newKnight.strength + newKnight.weapon.damage + 3,
      );
      expect(newKnight.attack(opponent)).toBe(
        newKnight.strength + newKnight.weapon.damage + 3,
      );
      expect(newKnight.attack(opponent)).toBe(
        newKnight.strength + newKnight.weapon.damage,
      );
    });
  });
});
