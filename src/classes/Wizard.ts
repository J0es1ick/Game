import { Player } from "../abstract/Player";
import { SkillFabric } from "../fabrics/skillFabric/SkillFabric";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Wizard extends Player {
  public _className: string = "Wizard";

  private skillFabric = new SkillFabric();

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkill: ISkill | undefined = undefined
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon, playerSkill);
    this.addSkill(this.skillFabric.createSkillFromTemplate("заворожение")!);
    this.addSkill(this.skillFabric.createSkillFromTemplate("ледяные стрелы")!);
  }
}
