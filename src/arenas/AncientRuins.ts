import type { Player } from "../abstract/Player";
import type { IArena } from "./IArena";

export class AncientRuins implements IArena {
  public name = "Ancient Ruins";
  public description = "Balanced arena with a rewarding flow of battle.";
  public damageMultiplier = 1;
  public experienceBonus = 55;

  public modifyDamage(damage: number, attacker: Player, defender: Player): number {
    const base = Math.max(0, damage);
    return base;
  }
}
