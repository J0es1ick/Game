import { SkillFabric } from "../src/fabrics/skillFabric/SkillFabric";
import { Archer } from "../src/classes";
import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";

describe("SkillFabric tests", () => {
  const skillFabric = new SkillFabric();
  const weaponFabric = new WeaponFabric();

  it("Should create a skill from template", () => {
    const skill = skillFabric.createSkillFromTemplate("огненные стрелы");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("огненные стрелы");
    expect(skill?.usageCount).toBe(1);
    expect(skill?.initialSkillUsage).toBe(1);
    expect(skill?.effect).toBeDefined();
  });

  it("Should create a skill from template with turns", () => {
    const skill = skillFabric.createSkillFromTemplate("ледяные стрелы");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("ледяные стрелы");
    expect(skill?.turns).toBe(3);
    expect(skill?.initialTurns).toBe(3);
  });

  it("Should create a skill from template with damage calculation", () => {
    const skill = skillFabric.createSkillFromTemplate("удар возмездия");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("удар возмездия");
    expect(skill?.damage).toBeDefined();

    const player = new Archer(
      100,
      20,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );
    const opponent = new Archer(
      100,
      10,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );

    skill?.effect!(player, opponent);
    expect(opponent.health).toBe(100 - (20 * 1.3 + player.weapon.damage));
  });

  it("Should create a skill from template with skip turns effect", () => {
    const skill = skillFabric.createSkillFromTemplate("заворожение");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("заворожение");

    const player = new Archer(
      100,
      20,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );
    const opponent = new Archer(
      100,
      10,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );

    skill?.effect!(player, opponent);
    expect(opponent.countOfSkipingTurns).toBe(1);
  });

  it("Should return null for an invalid template name", () => {
    const skill = skillFabric.createSkillFromTemplate("invalidSkillName");
    expect(skill).toBeNull();
  });

  it("Should correctly apply skill effects", () => {
    const player = new Archer(
      100,
      20,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );
    const opponent = new Archer(
      100,
      10,
      "",
      weaponFabric.createRandomWeapon("bow"),
      []
    );

    const fireArrows = skillFabric.createSkillFromTemplate("огненные стрелы")!;
    fireArrows.effect!(player, opponent);
    expect(player.strength).toBe(22);

    const iceArrows = skillFabric.createSkillFromTemplate("ледяные стрелы")!;
    iceArrows.effect!(player, opponent);
    expect(player.strength).toBe(25);

    const vengeanceStrike =
      skillFabric.createSkillFromTemplate("удар возмездия")!;
    vengeanceStrike.effect!(player, opponent);
    expect(opponent.health).toBeLessThan(100);

    const enchantment = skillFabric.createSkillFromTemplate("заворожение")!;
    enchantment.effect!(player, opponent);
    expect(opponent.health).toBeLessThan(100);
  });
});
