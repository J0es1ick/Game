import { Archer } from "../../classes";
import { getRandomArrayElement } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";
import { WeaponFabric } from "../weaponsFabric/WeaponFabric";

export class ArcherFabric {
  private weaponFabric = new WeaponFabric();

  public createArcher(
    names: string[],
    playerHealth: number,
    playerStrength: number,
    playerWeapon: IWeapon
  ) {
    const name: string = getRandomArrayElement(names)!;
    const health: number = playerHealth;
    const strength: number = playerStrength;
    const weapon: IWeapon = playerWeapon;

    return new Archer(health, strength, name, weapon);
  }
}
