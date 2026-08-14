import { CombatContext, CombatModifier, Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Swordsman extends Player {
  protected _className = "Swordsman";
  public readonly mechanic = {
    title: "Два клинка",
    method: "Swordsman.modifyCombatAttack()",
    description: "При тяжёлом ранении мечник ускоряет темп и проводит второй удар.",
  };

  constructor(health: number, strength: number, name: string, weapon: IWeapon, skills: ISkill[]) {
    super(health, strength, name, weapon, skills);
  }

  protected override modifyOutgoingDamage(damage: number): number {
    if (this.health / this.initialHealth >= 0.5) return damage;
    this.recordDispatch("Swordsman.modifyOutgoingDamage()", "Ранение открыло темп второго клинка.");
    return Math.round(damage * 1.55);
  }

  public override modifyCombatAttack(damage: number, context: CombatContext): CombatModifier {
    const threshold = (context.setCounts.dusk ?? 0) >= 4 ? 0.7 : 0.5;
    return context.healthRatio < threshold
      ? { damage, secondaryDamageRatio: 0.55, detail: "раненый темп двух клинков" }
      : { damage };
  }

  public override criticalChanceBonus(context: CombatContext): number {
    const threshold = (context.setCounts.dusk ?? 0) >= 4 ? 0.7 : 0.5;
    return context.healthRatio < threshold ? 12 : 0;
  }
}
