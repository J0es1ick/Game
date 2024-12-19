import { Player } from "../abstract/Player";
import { SkillFabric } from "../fabrics/skillFabric/SkillFabric";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Knight extends Player {
  protected _className: string = "Knight";

  private skillFabric = new SkillFabric();

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkill: ISkill | undefined = undefined
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon, playerSkill);
    this.addSkill(this.skillFabric.createSkillFromTemplate("удар возмездия")!);
    this.addSkill(this.skillFabric.createSkillFromTemplate("ледяные стрелы")!);
  }

  public takeDamage(
    damage: number,
    attacker: Player,
    skill: ISkill | undefined = undefined
  ): void {
    if (skill !== undefined && skill.name === "ледяные стрелы") {
      damage = attacker.initialStrength;
    }
    this._health -= damage;
    if (this._health <= 0) {
      this._isAlive = false;
    }
  }
}
