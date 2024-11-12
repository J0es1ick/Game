import * as readline from "readline";

import { Game } from "../../gameplay/Game";

export function input(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function askForPlayers() {
    const inputNumber = await question(
      "Введите число игроков (должно делиться на 4): "
    );
    const number = parseInt(inputNumber);
    if (isNaN(number) || number < 1 || number % 4 !== 0) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForPlayers();
    } else {
      rl.close();
      const game = new Game(number);
      await game.start();
    }
  }

  function question(query: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  }

  askForPlayers();
}
