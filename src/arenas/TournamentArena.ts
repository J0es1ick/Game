import type { Player } from "../abstract/Player";
import type { ArenaDefinition } from "../gameplay/WorldTypes";
import type { IArena } from "./IArena";

/** Календарная арена расширенного режима, использующая тот же контракт, что и базовый Game. */
export class TournamentArena implements IArena, ArenaDefinition {
  public readonly kind = "arena" as const;
  public readonly damageMultiplier: number;
  public readonly experienceBonus: number;

  public constructor(definition: ArenaDefinition) {
    Object.assign(this, definition);
    this.damageMultiplier = definition.prestige === "royal" ? 1.12
      : definition.prestige === "grand" ? 1.06
        : definition.id === "yard" ? 0.9 : 1;
    this.experienceBonus = definition.rewardExperience;
  }

  public readonly id!: string;
  public readonly name!: string;
  public readonly place!: string;
  public readonly description!: string;
  public readonly minLevel!: number;
  public readonly enemyLevel!: [number, number];
  public readonly winsToAdvance!: number;
  public readonly rewardGold!: number;
  public readonly rewardExperience!: number;
  public readonly lethalChance!: number;
  public readonly tournamentInterval!: number;
  public readonly participants!: 8 | 16 | 32;
  public readonly prestige!: "local" | "regional" | "grand" | "royal";
  public readonly accent!: string;

  public modifyDamage(damage: number, _attacker: Player, _defender: Player): number {
    return Math.max(0, Math.round(damage * this.damageMultiplier));
  }
}
