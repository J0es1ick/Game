import { Player } from "../abstract/Player";

export interface ISkills {
  name: string;
  damage?: number;
  turns?: number;
  isAvailable: boolean;
  isDeflectable?: string[];
  effect: (opponent: Player) => number;
}
