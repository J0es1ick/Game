import { Player } from "../../abstract/Player";
import { PlayerFabric } from "../../fabrics/playersFabrics/PlayerFabric";
import { getRandomArrayElement } from "./getRandomArrayElement";
import { getRandomNumber } from "./getRandomNumber";

export function createRandomPlayer(): Player {
  const playerFabric = new PlayerFabric();
  const classes = ["Knight", "Archer", "Wizard"];
  const playerClass: string = getRandomArrayElement(classes)!;
  const health = getRandomNumber(75, 100);
  const strength = getRandomNumber(15, 20);
  return playerFabric.createPlayer(playerClass, health, strength)!;
}
