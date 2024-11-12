import { Player } from "../abstract/Player";
import { createWeapon } from "../fabrics";
import { ISkills } from "../skills/ISkills";
import { getRandomArrayElement } from "../utils/randomization/getRandomArrayElement";
import { IWeapon } from "../weapon";

export class Archer extends Player {
  protected className: string = "Archer";
  protected skill?: ISkills;
  protected skillBuff: number = 0;
  protected weapon: IWeapon;

  constructor(health: number, strength: number, name: string) {
    super(health, strength, name);
    this.addSkill({
      name: "Огненные стрелы",
      damage: 2,
      isAvailable: true,
      isDeflectable: ["Knight"],
      effect: (opponent) => {
        this.strength += 2;
        return 0;
      },
    });
    this.addSkill({
      name: "Ледяные стрелы",
      damage: 3,
      turns: 3,
      isAvailable: true,
      effect: () => {
        this.strength += 3;
        return 0;
      },
    });
    this.weapon = createWeapon("bow");
  }

  public useSkill(opponent: Player): string | null {
    if (this.skills.length === 0) {
      return null;
    }

    const availableSkills = this.skills.filter((skill) => skill.isAvailable);
    if (availableSkills.length === 0) {
      return null;
    }

    this.skill = getRandomArrayElement(availableSkills);
    this.skillUsed = true;
    const damageDealt = this.skill!.effect(opponent);
    if (this.skill?.isDeflectable?.indexOf(opponent.playerClassName) !== -1) {
      this.strength -= this.skill!.damage!;
    }
    let message = `(${this.playerClassName}) ${this.playerName} использует (${
      this.skill!.name
    }) на (${opponent.playerClassName}) ${opponent.playerName}`;
    if (damageDealt > 0) {
      message += ` и наносит урон ${damageDealt + this.weapon.damage}`;
    }
    return message;
  }

  // передавать в класс, получаемый урон созданный объект, копирующий параметры скилла и уже его обрабатывать

  public attack(opponent: Player): string | undefined {
    if (this.isAlivePlayer && !this.isCharmed) {
      if (this.skillUsed === true) {
        this.skillBuff += 1;
      }
      if (this.skillBuff === this.skill?.turns) {
        this.strength -= this.skill.damage!;
      }
      opponent.takeDamage(this.strength + this.weapon.damage);
      return `(${this.playerClassName}) ${this.playerName} наносит урон ${
        this.strength + this.weapon.damage
      } противнику (${opponent.playerClassName}) ${opponent.playerName}`;
    } else if (this.isAlivePlayer && this.isCharmed) {
      this.gettingCharmed(false);
      return opponent.takeDamage(this.strength + this.weapon.damage);
    }
  }
}
