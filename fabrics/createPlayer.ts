import * as readline from "readline";
import { Player } from "../abstract/Player";
import { Knight, Archer, Vizard } from "../classes";
import { readQuestion } from "../utils/question/question";

export async function createPlayer(): Promise<Player | null> {
  let playerType: typeof Knight | typeof Archer | typeof Vizard;
  let playerName: string = "";
  let playerHealth: number = 0;
  let playerStrength: number = 0;

  const types = [Knight, Archer, Vizard];

  async function askForClass(): Promise<void> {
    while (true) {
      const playerClass = await readQuestion(
        "Выберите класс своего героя: 1. Knight, 2. Archer, 3. Wizard: "
      );
      const number = parseInt(playerClass);
      if (isNaN(number) || number < 1 || number > 3) {
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      } else {
        playerType = types[number - 1];
        break;
      }
    }
  }

  async function askForName(): Promise<void> {
    while (true) {
      playerName = await readQuestion("Напишите имя своего героя: ");
      if (playerName.trim() === "") {
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      } else {
        break;
      }
    }
  }

  async function askForHealth(): Promise<void> {
    while (true) {
      const healthInput = await readQuestion(
        "Напишите количество здоровья для своего героя (от 75 до 100): "
      );
      const number = parseInt(healthInput);
      if (isNaN(number) || number < 75 || number > 100) {
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      } else {
        playerHealth = number;
        break;
      }
    }
  }

  async function askForStrength(): Promise<void> {
    while (true) {
      const strengthInput = await readQuestion(
        "Напишите количество силы для своего героя (от 15 до 20): "
      );
      const number = parseInt(strengthInput);
      if (isNaN(number) || number < 15 || number > 20) {
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      } else {
        playerStrength = number;
        break;
      }
    }
  }

  await askForClass();
  await askForName();
  await askForHealth();
  await askForStrength();

  return new playerType!(playerHealth, playerStrength, playerName);
}
