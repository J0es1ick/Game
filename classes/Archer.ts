import { Player } from "../abstract/Player";
import { IWeapon } from "../weapon/IWeapon";

export class Archer extends Player {
  public _className: string = "Archer";

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill({
      name: "Огненные стрелы",
      effect: () => {
        this.strength += 2;
      },
    });
    this.addSkill({
      name: "Ледяные стрелы",
      turns: 3,
      effect: () => {
        this.strength += 3;
      },
    });
  }
}
