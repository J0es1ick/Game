import { Game } from "../../gameplay/Game";
import { Logger } from "../output/Logger";
import { readAnswer } from "../question/readAnswer";

import { createCharacter } from "./createCharacter";
import { createWorldGame } from "./createWorldGame";

export async function createGame(): Promise<void> {
  const logger = new Logger();

  const mode = await readAnswer(
    "Выберите режим: 1. Базовый турнир, 2. Живой мир: ",
  );
  if (mode.trim() === "2") {
    await createWorldGame();
    return;
  }

  let number: number;
  async function askForPlayers() {
    const inputNumber: string = await readAnswer(
      "Введите число участников (8, 16 или 32): ",
    );
    number = parseInt(inputNumber);
    if (![8, 16, 32].includes(number)) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForPlayers();
    } else {
      await askForCreating();
    }
  }

  async function askForCreating() {
    const inputString: string = await readAnswer(
      "Хотите ли вы создать своего персонажа? (да/нет) ",
    );
    const game = new Game(number, undefined, logger);
    switch (inputString.toLowerCase()) {
      case "да":
        await createCharacter(number);
        break;
      case "нет":
        await game.start();
        break;
      default:
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
        await askForCreating();
        break;
    }
  }

  await askForPlayers();
}
