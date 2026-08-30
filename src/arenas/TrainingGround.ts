import type { Player } from "../abstract/Player";
import type { IArena } from "./IArena";

export class TrainingGround implements IArena {
  public name = "Учебный двор";
  public description =
    "Безопасная стратегия: каждый удар становится на 10% мягче.";
  public damageMultiplier = 0.9;
  public experienceBonus = 25;

  public modifyDamage(
    damage: number,
    attacker: Player,
    defender: Player,
  ): number {
    return Math.max(0, Math.round(damage * this.damageMultiplier));
  }
}
