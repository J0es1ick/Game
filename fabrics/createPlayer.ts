import { Player } from "../abstract/Player";
import { Knight, Archer, Vizard } from "../classes";
import { getRandomArrayElement } from "../utils/randomization";

export function createPlayer(
  name: string,
  health: number,
  strength: number
): Player {
  const types = [Knight, Archer, Vizard];
  const PlayerClass = getRandomArrayElement(types);
  return new PlayerClass!(health, strength, name);
}
