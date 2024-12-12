import { Player } from "../abstract/Player";
import { SkillFabric } from "../fabrics/skillFabric/skillFabric";
import { IWeapon } from "../weapon/IWeapon";

export class Archer extends Player {
  public _className: string = "Archer";

  private skillFabric = new SkillFabric();

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill(this.skillFabric.createSkillFromTemplate("Ледяные стрелы")!);
    this.addSkill(this.skillFabric.createSkillFromTemplate("Огненные стрелы")!);
  }
}
