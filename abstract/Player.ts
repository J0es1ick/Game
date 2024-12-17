import { ISkill } from "../skills/ISkill";
import { getRandomArrayElement } from "../utils/randomization";
import { IWeapon } from "../weapon/IWeapon";

export abstract class Player {
  protected _name: string;
  protected _className?: string;
  protected initialHealth: number;
  protected health: number;
  protected _initialStrength: number;
  protected _strength: number;
  protected skills: ISkill[] = [];
  protected _currentSkill?: ISkill;
  protected skillBuff: number = 0;
  protected isSkillUsed: boolean = false;
  protected isAlive: boolean = true;
  protected countOfSkipingTurns: number = 0;
  protected _weapon: IWeapon;

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    this.initialHealth = playerHealth;
    this.health = this.initialHealth;
    this._initialStrength = playerStrength;
    this._strength = this.initialStrength;
    this._name = playerName;
    this._weapon = playerWeapon;
  }

  public get className(): string | undefined {
    return this._className;
  }

  public get name(): string {
    return this._name;
  }

  public get strength(): number {
    return this._strength;
  }

  public get initialStrength(): number {
    return this._initialStrength;
  }

  public get weapon(): IWeapon | undefined {
    return this._weapon;
  }

  public get currentSkill(): ISkill | undefined {
    return this._currentSkill;
  }

  protected addSkill(skill: ISkill): void {
    this.skills.push(skill);
  }

  public useSkill(opponent: Player): void | null {
    if (this.skills.length === 0) {
      return null;
    }

    this._currentSkill = getRandomArrayElement(this.skills);
    if (this._currentSkill) {
      this._currentSkill.effect(this, opponent);
      this._currentSkill.usageCount--;
      this.isSkillUsed = true;
    }
  }

  public attack(opponent: Player): void {
    if (this.isSkillUsed === true && this.currentSkill!.turns! > 0) {
      this.skillBuff++;
    }

    if (this.skillBuff === this.currentSkill!.turns!) {
      this._strength = this.initialStrength;
    }

    if (this.countOfSkipingTurns > 0) {
      this.countOfSkipingTurns--;
      return;
    }

    if ((this.isSkillUsed = true)) {
      opponent.takeDamage(
        this.strength + this._weapon.damage,
        this,
        this.currentSkill
      );
    } else {
      opponent.takeDamage(this.strength + this._weapon.damage, this);
    }
  }

  public damageUp(buff: number) {
    this._strength += buff;
  }

  public takeDamage(
    damage: number,
    attacker: Player,
    skill: ISkill | undefined = undefined
  ): void {
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
