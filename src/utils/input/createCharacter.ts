import { createSkill } from "../../catalogs/SkillCatalog";
import { createRandomWeapon } from "../../catalogs/WeaponCatalog";
import { PlayerClass, PlayerFactory } from "../../factories/PlayerFactory";
import { Game } from "../../gameplay/Game";
import { ISkill } from "../../skills/ISkill";
import { IWeapon } from "../../weapon/IWeapon";
import { Logger } from "../output/Logger";
import { readAnswer } from "../question/readAnswer";

export async function createCharacter(numberOfPlayers: number): Promise<void> {
  const logger = new Logger();

  let playerType: string;
  let playerHealth: number = 0;
  let playerStrength: number = 0;
  let playerWeapon: IWeapon;

  const playerSkills: ISkill[] = [];
  const playerFactory = new PlayerFactory();
  const types: string[] = ["Knight", "Archer", "Wizard", "Monk", "Gunsmith", "Swordsman"];
  const weapons: string[] = ["sword", "bow", "stick", "fists", "pistols", "dual-swords"];
  const skillNames: string[] = [
    "огненные стрелы",
    "ледяные стрелы",
    "удар возмездия",
    "заворожение",
  ];

  async function askForClass(): Promise<void> {
    const playerClass: string = await readAnswer(
      "Выберите класс: 1. Knight, 2. Archer, 3. Wizard, 4. Monk, 5. Gunsmith, 6. Swordsman: ",
    );
    const number: number = parseInt(playerClass);
    if (isNaN(number) || number < 1 || number > 6) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForClass();
    } else {
      playerType = types[number - 1];
      await askForHealth();
    }
  }

  async function askForHealth(): Promise<void> {
    const healthInput: string = await readAnswer(
      "Напишите количество здоровья для своего героя (от 125 до 150): ",
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
      "Напишите количество силы для своего героя (от 10 до 15): ",
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
      "Выберите оружие: 1. меч, 2. лук, 3. посох, 4. бинты, 5. две пистоли, 6. два меча: ",
    );
    const number: number = parseInt(playerClass);
    if (isNaN(number) || number < 1 || number > 6) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForWeapon();
    } else {
      playerWeapon = createRandomWeapon(weapons[number - 1]);
      await askForSkills();
    }
  }

  async function askForSkills(): Promise<void> {
    const playerClass: string = await readAnswer(
      "Выберите скиллы своего героя: 1. огненные стрелы, 2. ледяные стрелы, 3. удар возмездия, 4. заворожение. \nДля старта со стандартными навыками класса, напишите 5. Для выхода напишите 6 : ",
    );
    const number: number = parseInt(playerClass);
    if (isNaN(number) || number < 1 || number > 6) {
      console.log("Некорректный ввод. Пожалуйста, попробуйте снова.");
      await askForSkills();
    } else if (number < 5 && number > 0) {
      if (playerSkills.length >= 2) {
        console.log("У вас уже максимальное количество скиллов");
      } else {
        playerSkills.push(
          createSkill(skillNames[number - 1])!,
        );
      }
      await askForSkills();
    } else if (number === 6) {
      if (playerSkills.length > 0) {
        return;
      } else {
        console.log("Выберите хотя бы один скилл");
        await askForSkills();
      }
    } else {
      return;
    }
  }

  await askForClass();

  const hero = playerFactory.create({
    className: playerType! as PlayerClass,
    health: playerHealth,
    strength: playerStrength,
    weapon: playerWeapon!,
    skills: playerSkills.length > 0 ? playerSkills : undefined,
  });
  const game = new Game(numberOfPlayers - 1, hero, logger);
  await game.start();
}
