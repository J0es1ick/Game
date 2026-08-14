import { CombatContext, CombatModifier, Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";
import { IWeapon } from "../weapon/IWeapon";

export class Archer extends Player {
  protected _className: string = "Archer";
  private shotCounter = 0;
  public readonly mechanic = {
    title: "Прицельный залп",
    method: "Archer.modifyOutgoingDamage()",
    description: "Каждая третья атака наносит на 50% больше урона.",
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

  protected override modifyOutgoingDamage(damage: number): number {
    this.shotCounter += 1;
    const isCritical = this.shotCounter % 3 === 0;
    const result = isCritical ? Math.round(damage * 1.5) : damage;
    this.recordDispatch(
      "Archer.modifyOutgoingDamage()",
      isCritical
        ? `Третий выстрел стал критическим: ${damage} → ${result}.`
        : `Лучник пристреливается: заряд ${this.shotCounter % 3}/3.`,
    );
    return result;
  }

  public override modifyCombatAttack(damage: number, context: CombatContext): CombatModifier {
    const cadence = (context.setCounts.wind ?? 0) >= 6 ? 2 : 3;
    if (context.attackCounter % cadence !== 0) return { damage };
    return { damage: damage * 1.45, detail: "усиленный выстрел" };
  }

  public override reset(): void {
    super.reset();
    this.shotCounter = 0;
  }
}
