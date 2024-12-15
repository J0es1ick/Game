import { Player } from "../abstract/Player";

export interface ISkill {
  name: string;
  damage?: (caster: Player) => number | undefined;
  usageCount: number;
  turns?: number;
  effect: (caster: Player, opponent: Player) => void;
}
