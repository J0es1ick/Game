import { Game } from "../../gameplay/Game";
import { readAnswer } from "../question/readAnswer";
import { createCharacter } from "./createCharacter";

export function createGame(): void {
  let number: number;
  async function askForPlayers() {
    const inputNumber: string = await readAnswer(
      "Введите число игроков (должно делиться на 4): "
    );
    number = parseInt(inputNumber);
    if (isNaN(number) || number < 1 || number % 4 !== 0) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForPlayers();
    } else {
      await askForCreating();
    }
  }

  async function askForCreating() {
    const inputString: string = await readAnswer(
      "Хотите ли вы создать своего персонажа? (да/нет) "
    );
    switch (inputString.toLowerCase()) {
      case "да":
        createCharacter();
        break;
      case "нет":
        const game = new Game(number);
        await game.start();
        break;
      default:
        console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
        await askForCreating();
        break;
    }
  }

  askForPlayers();
}
