import { Player } from "../abstract/Player";
import { createWeapon } from "../fabrics";
import { ISkills } from "../skills/ISkills";
import { IWeapon } from "../weapon";

export class Knight extends Player {
  protected className: string = "Knight";
  protected skill?: ISkills;
  protected weapon: IWeapon;

  constructor(health: number, strength: number, name: string) {
    super(health, strength, name);
    this.addSkill({
      name: "Удар возмездия",
      isAvailable: true,
      effect: (opponent) => {
        const skillDamage = this.strength * 1.3;
        opponent.takeDamage(skillDamage + this.weapon.damage);
        return skillDamage;
      },
    });
    this.weapon = createWeapon("sword");
  }

  public attack(opponent: Player): string | undefined {
    if (this.isAlivePlayer && !this.isCharmed) {
      opponent.takeDamage(this.strength + this.weapon.damage);
      return `(${this.playerClassName}) ${this.playerName} наносит урон ${
        this.strength + this.weapon.damage
      } противнику (${opponent.playerClassName}) ${opponent.playerName}`;
    } else if (this.isAlivePlayer && this.isCharmed) {
      this.gettingCharmed(false);
      return opponent.takeDamage(this.strength);
    }
  }
}
