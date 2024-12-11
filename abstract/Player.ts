import { ISkill } from "../skills/ISkill";
import { getRandomArrayElement } from "../utils/randomization";
import { IWeapon } from "../weapon/IWeapon";

export abstract class Player {
  public name: string;
  public _className?: string;
  protected initialHealth: number;
  protected health: number;
  protected initialStrength: number;
  protected strength: number;
  protected skills: ISkill[] = [];
  protected currentSkill?: ISkill;
  protected skillBuff: number = 0;
  protected isSkillUsed: boolean = false;
  protected isAlive: boolean = true;
  protected countOfSkipingTurns: number = 0;
  protected weapon: IWeapon;

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    this.initialHealth = playerHealth;
    this.health = this.initialHealth;
    this.initialStrength = playerStrength;
    this.strength = this.initialStrength;
    this.name = playerName;
    this.weapon = playerWeapon;
  }

  public get className(): string | undefined {
    return this._className;
  }

  protected addSkill(skill: ISkill): void {
    this.skills.push(skill);
  }

  public useSkill(opponent: Player): void | null {
    if (this.skills.length === 0) {
      return null;
    }

    this.currentSkill = getRandomArrayElement(this.skills);
    this.currentSkill!.effect;
  }

  public attack(opponent: Player): void {
    if (this.isSkillUsed === true && this.currentSkill!.turns! > 0) {
      this.skillBuff++;
    }

    if (this.skillBuff === this.currentSkill!.turns!) {
      this.strength = this.initialStrength;
    }

    if (this.countOfSkipingTurns > 0) {
      this.countOfSkipingTurns--;
      return;
    }

    opponent.takeDamage(this.strength + this.weapon.damage);
  }

  public takeDamage(damage: number): void {
    this.health -= damage;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }

  public heal(amount: number) {
    if (this.health + amount > this.initialHealth) {
      this.health = this.initialHealth;
    } else {
      this.health = this.health + amount;
    }
  }

  public skipTurns(value: number): void {
    this.countOfSkipingTurns = value;
  }
}
