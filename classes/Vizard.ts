import { Player } from "../abstract/Player";
import { createWeapon } from "../fabrics";
import { ISkills } from "../skills/ISkills";
import { IWeapon } from "../weapon";

export class Vizard extends Player {
  protected className: string = "Vizard";
  protected countOfSkills: number = 0;
  protected skill?: ISkills;
  protected weapon: IWeapon;

  public get countOfVizardSkills() {
    return this.countOfSkills;
  }

  public set countOfVizardSkills(value: number) {
    this.countOfSkills = value;
  }

  constructor(health: number, strength: number, name: string) {
    super(health, strength, name);
    this.addSkill({
      name: "Заворожение",
      isAvailable: true,
      effect: (opponent) => {
        opponent.gettingCharmed(true);
        return 0;
      },
    });
    this.weapon = createWeapon("stick");
  }

  public attack(opponent: Player): string | undefined {
    if (this.isAlivePlayer && this.isCharmed) {
      opponent.takeDamage(this.strength + this.weapon.damage);
      return `(${this.playerClassName}) ${this.playerName} наносит урон ${
        this.strength + this.weapon.damage
      } противнику (${opponent.playerClassName}) ${opponent.playerName}`;
    } else if (this.isAlivePlayer && this.isCharmed) {
      this.gettingCharmed(false);
      return opponent.takeDamage(this.strength);
    }
  }

  public takeDamage(damage: number): string | undefined {
    if (this.skillUsed) {
      this.skillUsed = false;
      this.countOfSkills += 1;
      return `Противник не может атаковать ${this.playerName} из-за (Заворожения)`;
    } else {
      return super.takeDamage(damage);
    }
  }
}
