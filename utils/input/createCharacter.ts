import { Player } from "../../abstract/Player";
import { PlayerFabric } from "../../fabrics/playersFabrics/index";
import { readAnswer } from "../question/readAnswer";

export async function createCharacter(): Promise<Player | undefined> {
  let playerType: string;
  let playerName: string = "";
  let playerHealth: number = 0;
  let playerStrength: number = 0;

  const playerFabric = new PlayerFabric();
  const types: string[] = ["Knight", "Archer", "Wizard"];

  async function askForClass(): Promise<void> {
    const playerClass: string = await readAnswer(
      "Выберите класс своего героя: 1. Knight, 2. Archer, 3. Wizard: "
    );
    const number: number = parseInt(playerClass);
    if (isNaN(number) || number < 1 || number > 3) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForClass();
    } else {
      playerType = types[number - 1];
      await askForName();
    }
  }

  async function askForName(): Promise<void> {
    playerName = await readAnswer("Напишите имя своего героя: ");
    if (playerName.trim() === "") {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForName();
    } else {
      await askForHealth();
    }
  }

  async function askForHealth(): Promise<void> {
    const healthInput: string = await readAnswer(
      "Напишите количество здоровья для своего героя (от 125 до 150): "
    );
    const number: number = parseInt(healthInput);
    if (isNaN(number) || number < 125 || number > 150) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForHealth();
    } else {
      playerHealth = number;
      await askForStrength();
    }
  }

  async function askForStrength(): Promise<void> {
    const strengthInput: string = await readAnswer(
      "Напишите количество силы для своего героя (от 10 до 15): "
    );
    const number: number = parseInt(strengthInput);
    if (isNaN(number) || number < 10 || number > 15) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForStrength();
    } else {
      playerStrength = number;
    }
  }

  await askForClass();

  return playerFabric.createPlayer(playerType!, playerHealth, playerStrength);
}
