import { Player } from "../abstract/Player";

export interface ISkill {
  name: string;
  damage?: number;
  turns?: number;
  effect: (opponent: Player) => void;
}
