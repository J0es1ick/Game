import { Player } from "../abstract/Player";
import { Knight, Archer, Vizard } from "../classes";
import { getRandomArrayElement, getRandomNumber } from "../utils/randomization";

export function createPlayers(names: string[]): Player {
  const types = [Knight, Archer, Vizard];
  const name = getRandomArrayElement(names);
  const health = getRandomNumber(75, 100);
  const strength = getRandomNumber(15, 20);
  const PlayerClass = getRandomArrayElement(types); //через switch case сделать
  return new PlayerClass!(health, strength, name!);
}
