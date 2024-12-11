import { Player } from "../abstract/Player";
import { IWeapon } from "../weapon/IWeapon";

export class Wizard extends Player {
  public _className: string = "Wizard";

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill({
      name: "Заворожение",
      effect: (opponent) => {
        opponent.skipTurns(1);
      },
    });
  }
}
