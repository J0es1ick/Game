import { getRandomArrayElement } from "../utils/randomization/getRandomArrayElement";
import { getRandomNumber } from "../utils/randomization/getRandomNumber";
import { IWeapon } from "../weapon";

export function createWeapon(weaponType: string): IWeapon {
  let weapon: IWeapon;
  const names: object = {
    sword: ["Dragonsbane", "Stormbringer", "Aethelred"],
    stick: ["Oak Staff", "Elderwood Branch", "Shepherd's Crook"],
    bow: ["Hunter's Bow", "Longbow", "Shortbow"],
  };
  const types = ["Огонь", "Яд", "Лёд"];
  const randomType = getRandomArrayElement(types);
  const namesArr: string[] =
    names[weaponType.toLowerCase() as keyof typeof names];
  const randomName =
    names[weaponType.toLowerCase() as keyof typeof names][
      Math.floor(Math.random() * namesArr.length)
    ];
  const randomDamage = getRandomNumber(5, 10);

  switch (weaponType.toLowerCase()) {
    case "sword":
      weapon = {
        name: randomName,
        damage: randomDamage,
        typeOfDamage: randomType!,
      };
      break;
    case "stick":
      weapon = {
        name: randomName,
        damage: randomDamage,
        typeOfDamage: randomType!,
      };
      break;
    case "bow":
      weapon = {
        name: randomName,
        damage: randomDamage,
        typeOfDamage: randomType!,
      };
      break;
    default:
      throw new Error("Invalid weapon type");
  }

  return weapon;
}
