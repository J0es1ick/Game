import { Player } from "../../abstract/Player";
import { PlayerFabric } from "../../fabrics/playersFabrics/index";
import { WeaponFabric } from "../../fabrics/weaponsFabric/WeaponFabric";
import { Game } from "../../gameplay/Game";
import { IWeapon } from "../../weapon/IWeapon";
import { readAnswer } from "../question/readAnswer";

export async function createCharacter(numberOfPlayers: number): Promise<void> {
  const weaponFabric = new WeaponFabric();

  let playerType: string;
  let playerHealth: number = 0;
  let playerStrength: number = 0;
  let playerWeapon: IWeapon;

  const playerFabric = new PlayerFabric();
  const types: string[] = ["Knight", "Archer", "Wizard"];
  const weapons: string[] = ["bow", "sword", "stick"];

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
      await askForWeapon();
    }
  }

  async function askForWeapon(): Promise<void> {
    const playerClass: string = await readAnswer(
      "Выберите оружие своего героя: 1. меч, 2. лук, 3. посох: "
    );
    const number: number = parseInt(playerClass);
    if (isNaN(number) || number < 1 || number > 3) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForWeapon();
    } else {
      playerWeapon = weaponFabric.createWeapon(weapons[number - 1]);
    }
  }

  await askForClass();

  const game = new Game(
    numberOfPlayers - 1,
    playerFabric.createPlayer(
      playerType!,
      playerHealth,
      playerStrength,
      playerWeapon!
    )
  );
  await game.start();
}
