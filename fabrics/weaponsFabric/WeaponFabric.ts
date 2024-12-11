import {
  getRandomArrayElement,
  getRandomNumber,
} from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";

export class WeaponFabric implements IWeapon {
  private names: object = {
    sword: ["Dragonsbane", "Stormbringer", "Aethelred"],
    stick: ["Oak Staff", "Elderwood Branch", "Shepherd's Crook"],
    bow: ["Hunter's Bow", "Longbow", "Shortbow"],
  };
  public name: string = "";
  private types: string[] = ["Огонь", "Яд", "Лёд"];
  public typeOfDamage: string = "";
  public damage: number = getRandomNumber(5, 10);

  public createWeapon(weaponType: string): IWeapon {
    let weapon: IWeapon;
    this.typeOfDamage = getRandomArrayElement(this.types)!;
    const namesArr: string[] =
      this.names[weaponType.toLowerCase() as keyof typeof this.names];
    this.name =
      this.names[weaponType.toLowerCase() as keyof typeof this.names][
        Math.floor(Math.random() * namesArr.length)
      ];

    switch (weaponType.toLowerCase()) {
      case "sword":
        weapon = {
          name: this.name,
          damage: this.damage,
          typeOfDamage: this.typeOfDamage,
        };
        break;
      case "stick":
        weapon = {
          name: this.name,
          damage: this.damage,
          typeOfDamage: this.typeOfDamage,
        };
        break;
      case "bow":
        weapon = {
          name: this.name,
          damage: this.damage,
          typeOfDamage: this.typeOfDamage,
        };
        break;
      default:
        weapon = {
          name: "fists",
          damage: 3,
          typeOfDamage: "-",
        };
    }

    return weapon;
  }
}
