import { Player } from "../abstract/Player";
import { IWeapon } from "../weapon/IWeapon";

export class Knight extends Player {
  public _className: string = "Knight";

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill({
      name: "Удар возмездия",
      effect: (opponent) => {
        const skillDamage = this.strength * 1.3;
        opponent.takeDamage(skillDamage + this.weapon.damage);
      },
    });
  }
}
