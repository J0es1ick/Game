import type { Player } from "../abstract/Player";
import type { IArena } from "./IArena";

export class TrainingGround implements IArena {
  public name = "Training Ground";
  public description = "A safe arena where blows land a little softer.";
  public damageMultiplier = 0.9;
  public experienceBonus = 25;

  public modifyDamage(damage: number, attacker: Player, defender: Player): number {
    return Math.max(0, Math.round(damage * this.damageMultiplier));
  }
}
