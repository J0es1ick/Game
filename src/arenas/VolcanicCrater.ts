import type { Player } from "../abstract/Player";
import type { IArena } from "./IArena";

export class VolcanicCrater implements IArena {
  public name = "Volcanic Crater";
  public description = "An aggressive arena where every hit burns harder.";
  public damageMultiplier = 1.15;
  public experienceBonus = 40;

  public modifyDamage(damage: number, attacker: Player, defender: Player): number {
    return Math.max(0, Math.round(damage * this.damageMultiplier));
  }
}
