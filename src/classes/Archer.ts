import { Player } from "../abstract/Player";
import { SkillFabric } from "../fabrics/skillFabric/SkillFabric";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Archer extends Player {
  public _className: string = "Archer";

  private skillFabric = new SkillFabric();

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkill: ISkill | undefined = undefined
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon, playerSkill);
    const firstSkill =
      this.skillFabric.createSkillFromTemplate("ледяные стрелы")!;
    firstSkill.usageCount = 2;
    this.addSkill(firstSkill);
    this.addSkill(this.skillFabric.createSkillFromTemplate("огненные стрелы")!);
  }
}
