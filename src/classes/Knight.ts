import { CombatContext, CombatModifier, Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Knight extends Player {
  protected _className: string = "Knight";
  public readonly mechanic = {
    title: "Тяжёлая броня",
    method: "Knight.takeDamage()",
    description: "Переопределённый метод поглощает 22% входящего урона.",
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

  public takeDamage(
    damage: number,
    skill: ISkill | undefined = undefined,
  ): number {
    const reducedDamage = Math.max(1, Math.round(damage * 0.78));
    this.recordDispatch(
      "Knight.takeDamage()",
      `Броня снизила урон с ${damage} до ${reducedDamage}.`,
    );
    return super.takeDamage(reducedDamage, skill);
  }

  public override modifyCombatDefense(
    damage: number,
    context: CombatContext,
  ): CombatModifier {
    if (context.healthRatio <= 0.25) return { damage };
    const reduction = (context.setCounts.bastion ?? 0) >= 4 ? 0.24 : 0.18;
    return {
      damage: Math.max(1, Math.round(damage * (1 - reduction))),
      detail: "щит снизил урон",
    };
  }
}
