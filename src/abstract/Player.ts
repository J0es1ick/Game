import type { IArena } from "../arenas/IArena";
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
  protected _skills: ISkill[];
  protected _currentSkill?: ISkill;
  protected _isAlive: boolean = true;
  protected _countOfSkipingTurns: number = 0;
  protected _weapon: IWeapon;
  protected _level: number = 1;
  protected _experience: number = 0;
  protected _experienceToNextLevel: number = 100;

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkills: ISkill[],
  ) {
    this._initialHealth = playerHealth;
    this._health = this._initialHealth;
    this._initialStrength = playerStrength;
    this._strength = this._initialStrength;
    this._name = playerName;
    this._weapon = playerWeapon;
    this._skills = playerSkills;
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

  public get skills(): ISkill[] {
    return this._skills;
  }

  public get level(): number {
    return this._level;
  }

  public get experience(): number {
    return this._experience;
  }

  public get experienceToNextLevel(): number {
    return this._experienceToNextLevel;
  }

  public choseSkill(): void {
    this._currentSkill = getRandomArrayElement(this.skills);
  }

  public useSkill(opponent: Player, skillName: string | null = null): boolean {
    if (this.skills.length === 0) {
      return false;
    }

    if (skillName !== null) {
      this._currentSkill = this.skills.find(
        (skill) => skill.name === skillName.toLowerCase(),
      );
      if (this._currentSkill === undefined) {
        return false;
      }
    }

    if (this._currentSkill !== undefined && this._currentSkill.usageCount > 0) {
      if (this._currentSkill.effect) {
        this._currentSkill.effect(this, opponent);
      }

      if (this._currentSkill.buff) {
        this._currentSkill.isUsed = true;
        if (this._currentSkill.initialTurns !== undefined) {
          this._currentSkill.turns = this._currentSkill.initialTurns;
        }
      }

      this._currentSkill.usageCount--;
      return true;
    }

    return false;
  }

  public attack(opponent: Player, arena?: IArena): number {
    if (this.countOfSkipingTurns > 0) {
      this._countOfSkipingTurns--;
      return 0;
    }

    const skillsBuff: number = this.applyActiveSkillBuffs();
    const rawDamage = this._strength + this._weapon.damage + skillsBuff;
    const finalDamage = arena
      ? arena.modifyDamage(rawDamage, this, opponent)
      : rawDamage;

    return opponent.takeDamage(finalDamage);
  }

  private applyActiveSkillBuffs(): number {
    let skillsBuff = 0;

    this._skills.forEach((skill) => {
      if (!skill.isUsed || !skill.buff) {
        return;
      }

      if (skill.turns === undefined) {
        skillsBuff += skill.buff.strength;
        return;
      }

      if (skill.turns > 0) {
        skillsBuff += skill.buff.strength;
        skill.turns -= 1;
        if (skill.turns <= 0) {
          skill.isUsed = false;
        }
      }
    });

    return skillsBuff;
  }

  public takeDamage(
    damage: number,
    skill: ISkill | undefined = undefined,
  ): number {
    const currentDamage: number = damage;
    this._health -= currentDamage;
    if (this._health <= 0) {
      this._health = 0;
      this._isAlive = false;
    }
    return currentDamage;
  }

  public heal(amount: number) {
    if (this._health + amount > this.initialHealth) {
      this._health = this.initialHealth;
    } else {
      this._health = this._health + amount;
    }
  }

  public gainExperience(amount: number): number {
    if (amount <= 0) {
      return 0;
    }

    this._experience += amount;
    let levelsGained = 0;

    while (this._experience >= this._experienceToNextLevel) {
      this._experience -= this._experienceToNextLevel;
      this._level += 1;
      levelsGained += 1;
      this._experienceToNextLevel = Math.round(this._experienceToNextLevel * 1.35);
      this._initialHealth += 10;
      this._initialStrength += 2;
    }

    if (levelsGained > 0) {
      this._health = this._initialHealth;
      this._strength = this._initialStrength;
    }

    return levelsGained;
  }

  public reset(): void {
    this._health = this.initialHealth;
    this._strength = this.initialStrength;
    this._currentSkill = undefined;
    this._countOfSkipingTurns = 0;
    this._isAlive = true;
    this._skills.forEach((skill) => {
      skill.usageCount = skill.initialSkillUsage;
      skill.isUsed = false;
      skill.turns = skill.initialTurns;
    });
  }

  public skipTurns(value: number): void {
    this._countOfSkipingTurns = value;
  }
}
