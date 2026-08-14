import { CombatContext, CombatModifier, Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Gunsmith extends Player {
  protected _className = "Gunsmith";
  public readonly mechanic = {
    title: "Парные пистолеты",
    method: "Gunsmith.modifyCombatAttack()",
    description: "После первого попадания оружейник стреляет из второй руки.",
  };

  constructor(health: number, strength: number, name: string, weapon: IWeapon, skills: ISkill[]) {
    super(health, strength, name, weapon, skills);
  }

  protected override modifyOutgoingDamage(damage: number): number {
    this.recordDispatch("Gunsmith.modifyOutgoingDamage()", "Вторая пистоль добавила ещё 55% урона.");
    return Math.round(damage * 1.55);
  }

  public override modifyCombatAttack(damage: number, context: CombatContext): CombatModifier {
    return {
      damage,
      secondaryDamageRatio: (context.setCounts.powder ?? 0) >= 4 ? 0.75 : 0.55,
      detail: "выстрел из левой руки",
    };
  }
}
