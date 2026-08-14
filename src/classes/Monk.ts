import { CombatContext, CombatModifier, Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Monk extends Player {
  protected _className = "Monk";
  private combo = 0;
  public readonly mechanic = {
    title: "Ритм открытой ладони",
    method: "Monk.modifyCombatAttack()",
    description: "Каждый последовательный удар наращивает комбо, а часть атак монаха невозможно поймать.",
  };

  constructor(health: number, strength: number, name: string, weapon: IWeapon, skills: ISkill[]) {
    super(health, strength, name, weapon, skills);
  }

  protected override modifyOutgoingDamage(damage: number): number {
    this.combo = Math.min(5, this.combo + 1);
    return Math.round(damage * (1 + this.combo * 0.05));
  }

  public override takeDamage(damage: number, skill?: ISkill): number {
    if (Math.random() < 0.14) {
      this.recordDispatch("Monk.takeDamage()", "Монах уклонился от удара.");
      return 0;
    }
    this.combo = 0;
    return super.takeDamage(damage, skill);
  }

  public override modifyCombatAttack(damage: number, context: CombatContext): CombatModifier {
    const combo = Math.min(5, context.combo + 1);
    return { damage: damage * (1 + combo * 0.05), detail: `комбо ×${combo}`, combo };
  }

  public override modifyCombatDefense(damage: number, context: CombatContext): CombatModifier {
    const dodge = 0.14 + ((context.setCounts.crane ?? 0) >= 4 ? 0.06 : 0);
    return Math.random() < dodge
      ? { damage: 0, detail: "монах уклонился", combo: (context.setCounts.crane ?? 0) >= 6 ? context.combo : 0 }
      : { damage, combo: 0 };
  }

  public override reset(): void {
    super.reset();
    this.combo = 0;
  }
}
