import type { Player } from "../../../../../abstract/Player";
import { Logger } from "../../../../../utils/output/Logger";

export const BASIC_TOURNAMENT_LOG_LIMIT = 3000;

export interface BasicLogEntry {
  id: number;
  time: string;
  message: string;
  result: boolean;
}

export function appendTournamentLog(
  previous: readonly BasicLogEntry[],
  entry: BasicLogEntry,
): BasicLogEntry[] {
  return [entry, ...previous.slice(0, BASIC_TOURNAMENT_LOG_LIMIT - 1)];
}

export class ReactTournamentLogger extends Logger {
  public constructor(
    private readonly write: (message: string, result?: boolean) => void,
  ) {
    super();
  }
  public override messageLog(message: string): void {
    this.write(message);
  }
  public override attackLog(
    attacker: Player,
    defender: Player,
    damage: number,
  ): void {
    this.write(`${attacker.name}.attack(${defender.name}) → ${damage} урона.`);
  }
  public override skillLog(attacker: Player, defender: Player): void {
    this.write(
      `${attacker.name}.useSkill(«${attacker.currentSkill?.name}», ${defender.name}).`,
    );
  }
  public override deathLog(warrior: Player): void {
    this.write(
      `${warrior.name}.isAlive → false. Участник исключён из сетки.`,
      true,
    );
  }
  public override skipTurnLog(attacker: Player): void {
    this.write(`${attacker.name}.attack() пропущен из-за эффекта контроля.`);
  }
}
