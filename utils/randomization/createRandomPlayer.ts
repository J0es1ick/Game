import { Player } from "../../abstract/Player";
import { PlayerFabric } from "../../fabrics/playersFabrics/index";
import { getRandomArrayElement } from "./getRandomArrayElement";
import { getRandomNumber } from "./getRandomNumber";

export function createRandomPlayer(): Player {
  const playerFabric = new PlayerFabric();
  const classes: string[] = ["Knight", "Archer", "Wizard"];
  const playerClass: string = getRandomArrayElement(classes)!;
  const health: number = getRandomNumber(125, 150);
  const strength: number = getRandomNumber(10, 15);
  return playerFabric.createPlayer(playerClass, health, strength)!;
}
