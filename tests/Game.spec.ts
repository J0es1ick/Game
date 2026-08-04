import { Knight, Wizard } from "../src/classes";
import { Game } from "../src/gameplay/Game";
import { Logger } from "../src/utils/output/Logger";
import { createRandomWeapon, createWeapon } from "../src/catalogs/WeaponCatalog";
import { createSkill } from "../src/catalogs/SkillCatalog";

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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts a game and returns the last player when only one hero is present", async () => {
    const logger = new MockLogger();
    const hero = new Knight(
      100,
      20,
      "Hero",
      createWeapon("Training Sword", 5),
      [],
    );
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
    const game = new Game(0, undefined, logger, {
      arenaName: "Учебный двор",
    });
    const fighter1 = new Knight(
      80,
      22,
      "Alpha",
      createWeapon("Training Sword", 5),
      [],
    );
    const fighter2 = new Wizard(
      50,
      6,
      "Beta",
      createWeapon("Training Staff", 4),
      [],
    );

    const winner = await game.battle([fighter1, fighter2]);

    expect(winner).toBe(fighter1);
    expect(game.currentArena?.name).toBe("Учебный двор");
    expect(logger.messages[0]).toContain("Арена: Учебный двор");
    expect(logger.attackLogs.length).toBeGreaterThan(0);
  });

  it("awards experience after battle and can level up a player", () => {
    const hero = new Knight(
      100,
      20,
      "Hero",
      createWeapon("Training Sword", 5),
      [],
    );

    const levels = hero.gainExperience(120);

    expect(levels).toBe(1);
    expect(hero.level).toBe(2);
    expect(hero.experience).toBe(20);
    expect(hero.initialHealth).toBe(110);
    expect(hero.initialStrength).toBe(22);
    expect(hero.health).toBe(110);
    expect(hero.strength).toBe(22);
  });

  it("charm stuns defender: defender takes damage and skip counter decrements", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);

    const logger = new MockLogger();
    const game = new Game(0, undefined, logger, {
      arenaName: "Учебный двор",
    });

    const charm = createSkill("заворожение")!;
    const attacker = new Wizard(
      80,
      12,
      "Mage",
      createWeapon("Training Staff", 4),
      [charm],
    );
    const defender = new Knight(
      80,
      12,
      "Target",
      createWeapon("Training Sword", 5),
      [],
    );

    attacker.useSkill(defender, "заворожение");
    expect(defender.countOfSkipingTurns).toBe(1);

    const damage = attacker.attack(defender, game.currentArena);
    expect(damage).toBeGreaterThan(0);
    expect(defender.health).toBeLessThan(defender.initialHealth);

    const skippedDamage = defender.attack(attacker, game.currentArena);
    expect(skippedDamage).toBe(0);
    expect(defender.countOfSkipingTurns).toBe(0);

    expect(attacker.health).toBe(attacker.initialHealth);
  });

  it("ice arrows last exactly 3 attacks; fire arrows persist without turns", () => {

    const attacker = new Wizard(
      100,
      20,
      "Caster",
      createWeapon("Staff", 5),
      [
        createSkill("огненные стрелы")!,
        createSkill("ледяные стрелы")!,
      ],
    );
    const defender = new Wizard(
      500,
      10,
      "Target",
      createWeapon("Stick", 1),
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
      attacker.strength + attacker.weapon.damage + 5,
    );
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 2,
    );
    expect(attacker.attack(defender)).toBe(
      attacker.strength + attacker.weapon.damage + 2,
    );
  });

  it("returns a live trace of template method, strategy and polymorphism", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);
    const logger = new MockLogger();
    const knight = new Knight(100, 12, "Shield", createWeapon("Sword", 5), []);
    const wizard = new Wizard(100, 12, "Caster", createWeapon("Staff", 5), []);
    const game = new Game([], undefined, logger, { arenaName: "Учебный двор" });
    game.startStepBattle([wizard, knight]);

    const report = game.doStep();

    expect(report?.insights.map((item) => item.principle)).toEqual([
      "Template Method",
      "Strategy",
      "Polymorphism",
    ]);
    expect(report?.insights[2].method).toBe("Knight.takeDamage()");
  });

  it("owns the whole tournament bracket in step mode", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);
    const heroes = ["A", "B", "C", "D"].map(
      (name) => new Knight(80, 14, name, createWeapon("Sword", 4), []),
    );
    const game = new Game(heroes, undefined, new MockLogger(), {
      arenaName: "Учебный двор",
    });
    game.startTournament();

    let guard = 0;
    while (game.state !== "finished" && guard < 200) {
      game.doStep();
      guard += 1;
    }

    expect(game.state).toBe("finished");
    expect(game.champion).toBeDefined();
    expect(game.eliminated).toHaveLength(3);
    expect(guard).toBeLessThan(200);
  });
});
