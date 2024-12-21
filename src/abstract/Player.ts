import { ISkill } from "../skills/ISkill";
import { getRandomArrayElement } from "../utils/randomization";
import { IWeapon } from "../weapon/IWeapon";

export abstract class Player {
  protected _name: string;
  protected _className?: string;
  protected _initialHealth: number;
  protected _health: number;
  protected _initialStrength: number;
  protected _strength: number;
  protected skills: ISkill[] = [];
  protected _currentSkill?: ISkill;
  protected skillBuff: number = 0;
  protected _isSkillUsed: boolean = false;
  protected _isAlive: boolean = true;
  protected _countOfSkipingTurns: number = 0;
  protected _weapon: IWeapon;

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkill: ISkill | undefined = undefined
  ) {
    this._initialHealth = playerHealth;
    this._health = this.initialHealth;
    this._initialStrength = playerStrength;
    this._strength = this.initialStrength;
    this._name = playerName;
    this._weapon = playerWeapon;
    if (playerSkill !== undefined) {
      this.addSkill(playerSkill);
    }
  }

  public get className(): string | undefined {
    return this._className;
  }

  public get name(): string {
    return this._name;
  }

  public get isAlive(): boolean {
    return this._isAlive;
  }

  public get isSkillUsed(): boolean {
    return this._isSkillUsed;
  }

  public get health(): number {
    return this._health;
  }

  public get strength(): number {
    return this._strength;
  }

  public get initialHealth(): number {
    return this._initialHealth;
  }

  public get initialStrength(): number {
    return this._initialStrength;
  }

  public get countOfSkipingTurns(): number {
    return this._countOfSkipingTurns;
  }

  public get weapon(): IWeapon {
    return this._weapon;
  }

  public get currentSkill(): ISkill | undefined {
    return this._currentSkill;
  }

  protected addSkill(skill: ISkill): void {
    this.skills.push(skill);
  }

  public choseSkill(): void {
    this._currentSkill = getRandomArrayElement(this.skills);
  }

  public useSkill(opponent: Player): void {
    if (this.skills.length === 0) {
      return;
    }

    if (this._currentSkill) {
      this._currentSkill.effect!(this, opponent);
      this._currentSkill.usageCount--;
      this._isSkillUsed = true;
    }
  }

  public attack(opponent: Player): void {
    if (this.currentSkill !== undefined) {
      if (this._isSkillUsed && this.currentSkill.usageCount > 0) {
        this._isSkillUsed = false;
        const skillIndex = this.skills.findIndex(
          (skill) => skill.name === this.currentSkill!.name
        );
        if (skillIndex !== -1) {
          this.skills[skillIndex].isUsed = true;
        }
      }

      this.skills.forEach((skill) => {
        if (skill.isUsed && skill.turns! <= 0 && skill.buff) {
          this._strength -= skill.buff.strength || 0;
        }
      });
    }

    this.skills.forEach((skill: ISkill) => {
      if (skill.isUsed) {
        skill.turns!--;
      }
    });

    if (this.countOfSkipingTurns > 0) {
      this._countOfSkipingTurns--;
      return;
    }

    if ((this._isSkillUsed = true)) {
      opponent.takeDamage(
        this._strength + this._weapon.damage,
        this,
        this.currentSkill
      );
    } else {
      opponent.takeDamage(this._strength + this._weapon.damage, this);
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
    this._health -= damage;
    if (this._health <= 0) {
      this._isAlive = false;
    }
  }

  public heal(amount: number) {
    if (this._health + amount > this.initialHealth) {
      this._health = this.initialHealth;
    } else {
      this._health = this._health + amount;
    }
  }

  public reset(): void {
    this._health = this.initialHealth;
    this._strength = this.initialStrength;
    this._isSkillUsed = false;
    this.skills.forEach((skill) => {
      skill.usageCount = skill.initialSkillUsage;
      skill.isUsed = false;
      skill.turns = skill.initialTurns;
    });
  }

  public skipTurns(value: number): void {
    this._countOfSkipingTurns = value;
  }
}
