import { Player } from "../../abstract/Player";
import { Knight } from "../../classes";
import { getRandomArrayElement } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";
import { WeaponFabric } from "../weaponsFabric/WeaponFabric";

export class KnightFabric {
  private weaponFabric = new WeaponFabric();

  public createKnight(
    names: string[],
    playerHealth: number,
    playerStrength: number
  ): Player {
    const name: string = getRandomArrayElement(names)!;
    const health: number = playerHealth;
    const strength: number = playerStrength;
    const weapon: IWeapon = this.weaponFabric.createWeapon("Sword");

    return new Knight(health, strength, name, weapon);
  }
}
