import type { Player } from "../abstract/Player";

export interface IArena {
  id?: string;
  name: string;
  description: string;
  damageMultiplier: number;
  experienceBonus: number;
  modifyDamage(damage: number, attacker: Player, defender: Player): number;
}
