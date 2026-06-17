import { Knight, Wizard } from "../src/classes";
import { Game } from "../src/gameplay/Game";
import { Logger } from "../src/utils/output/Logger";
import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";
import { SkillFabric } from "../src/fabrics/skillFabric/SkillFabric";

class MockLogger extends Logger {
  public messages: string[] = [];
  public attackLogs: string[] = [];
  public skillLogs: string[] = [];
  public deathLogs: string[] = [];
  public skipTurnLogs: string[] = [];

  public override messageLog(message: string): void {
    this.messages.push(message);
  }

  public override attackLog(
    _attacker: any,
    _defender: any,
    _damage: number,
  ): void {
    this.attackLogs.push("attack");
  }

  public override skillLog(_attacker: any, _defender: any): void {
    this.skillLogs.push("skill");
  }

  public override deathLog(_warrior: any): void {
    this.deathLogs.push("death");
  }

  public override skipTurnLog(_attacker: any): void {
    this.skipTurnLogs.push("skip");
  }
}

describe("Game tests", () => {
  const weaponFabric = new WeaponFabric();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts a game and returns the last player when only one hero is present", async () => {
    const logger = new MockLogger();
    const hero = new Knight(100, 20, "Hero", weaponFabric.createWeapon("sword", "Training Sword", 5), []);
    const game = new Game(0, hero, logger);

    const winner = await game.start();

    expect(winner).toBe(hero);
    expect(logger.messages[0]).toBe("Игра началась!");
    expect(logger.messages[1]).toContain("Список участников");
    expect(logger.messages[2]).toContain("Победитель");
  });

  it("runs a battle inside the chosen arena and returns a winner", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);

    const logger = new MockLogger();
    const game = new Game(0, undefined, logger, { arenaName: "Training Ground" });
    const fighter1 = new Knight(80, 22, "Alpha", weaponFabric.createWeapon("sword", "Training Sword", 5), []);
    const fighter2 = new Wizard(50, 6, "Beta", weaponFabric.createWeapon("stick", "Training Staff", 4), []);

    const winner = await game.battle([fighter1, fighter2]);

    expect(winner).toBe(fighter1);
    expect(game.currentArena?.name).toBe("Training Ground");
    expect(logger.messages[0]).toContain("Арена: Training Ground");
    expect(logger.attackLogs.length).toBeGreaterThan(0);
  });

  it("awards experience after battle and can level up a player", () => {
    const hero = new Knight(100, 20, "Hero", weaponFabric.createWeapon("sword", "Training Sword", 5), []);

    const levels = hero.gainExperience(120);

    expect(levels).toBe(1);
    expect(hero.level).toBe(2);
    expect(hero.experience).toBe(20);
    expect(hero.initialHealth).toBe(110);
    expect(hero.initialStrength).toBe(22);
    expect(hero.health).toBe(110);
    expect(hero.strength).toBe(22);
  });

  it("does not keep charm as a permanent self-debuff after the skipped turn", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);

    const logger = new MockLogger();
    const game = new Game(0, undefined, logger, { arenaName: "Training Ground" });
    const skillFabric = new SkillFabric();
    const charm = skillFabric.createSkillFromTemplate("заворожение")!;
    const attacker = new Wizard(80, 12, "Mage", weaponFabric.createWeapon("stick", "Training Staff", 4), [charm]);
    const defender = new Knight(80, 12, "Target", weaponFabric.createWeapon("sword", "Training Sword", 5), []);

    attacker.useSkill(defender, "заворожение");
    expect(defender.countOfSkipingTurns).toBe(1);

    attacker.attack(defender, game.currentArena);
    expect(attacker.health).toBeLessThan(attacker.initialHealth);

    attacker.attack(defender, game.currentArena);
    expect(attacker.health).toBeLessThan(attacker.initialHealth);
  });
  it("keeps permanent fire arrows after ice arrows expires", () => {
    const skillFabric = new SkillFabric();
    const weaponFabric = new WeaponFabric();

    const attacker = new Wizard(
      100,
      20,
      "Caster",
      weaponFabric.createWeapon("stick", "Staff", 5),
      [
        skillFabric.createSkillFromTemplate("ледяные стрелы")!,
        skillFabric.createSkillFromTemplate("огненные стрелы")!,
      ],
    );
    const defender = new Wizard(
      100,
      10,
      "Target",
      weaponFabric.createWeapon("stick", "Stick", 1),
      [],
    );

    attacker.useSkill(defender, "огненные стрелы");
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 2,
    );

    attacker.useSkill(defender, "ледяные стрелы");
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 5,
    );
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 5,
    );
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 2,
    );
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 2,
    );
  });

});
