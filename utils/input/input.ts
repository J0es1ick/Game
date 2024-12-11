import { Game } from "../../gameplay/Game";
import { readAnswer } from "../question/readAnswer";

export function input(): void {
  async function askForPlayers() {
    const inputNumber = await readAnswer(
      "Введите число игроков (должно делиться на 4): "
    );
    const number = parseInt(inputNumber);
    if (isNaN(number) || number < 1 || number % 4 !== 0) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForPlayers();
    } else {
      const game = new Game(number);
      await game.start();
    }
  }

  askForPlayers();
}
