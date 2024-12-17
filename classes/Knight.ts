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
    playerWeapon: IWeapon
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon);
    this.addSkill(this.skillFabric.createSkillFromTemplate("Удар возмездия")!);
  }

  public takeDamage(
    damage: number,
    attacker: Player,
    skill: ISkill | undefined = undefined
  ): void {
    if (skill !== undefined && skill.name === "ледяные стрелы") {
      damage = attacker.initialStrength;
    }
    this.health -= damage;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
}
