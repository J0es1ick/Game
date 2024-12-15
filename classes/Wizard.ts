import { Player } from "../abstract/Player";
import { SkillFabric } from "../fabrics/skillFabric/SkillFabric";
import { IWeapon } from "../weapon/IWeapon";

export class Wizard extends Player {
  public _className: string = "Wizard";

  private skillFabric = new SkillFabric();

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill(this.skillFabric.createSkillFromTemplate("Заворожение")!);
  }
}
