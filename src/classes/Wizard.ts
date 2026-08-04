import { Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Wizard extends Player {
  protected _className: string = "Wizard";
  public readonly mechanic = {
    title: "Отголосок заклинания",
    method: "Wizard.useSkill()",
    description: "Успешный навык возвращает магу 6 единиц здоровья.",
  };

  constructor(
    playerHealth: number,
    playerStrength: number,
    playerName: string,
    playerWeapon: IWeapon,
    playerSkills: ISkill[],
  ) {
    super(playerHealth, playerStrength, playerName, playerWeapon, playerSkills);
  }

  public override useSkill(opponent: Player, skillName: string | null = null): boolean {
    const used = super.useSkill(opponent, skillName);
    if (used) {
      const healthBefore = this.health;
      this.heal(6);
      const restored = this.health - healthBefore;
      this.recordDispatch(
        "Wizard.useSkill()",
        `Заклинание вернуло магу ${restored} здоровья.`,
      );
    }
    return used;
  }
}
