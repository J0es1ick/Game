import { Wizard } from "../../classes";
import { getRandomArrayElement } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";
import { WeaponFabric } from "../weaponsFabric/WeaponFabric";

export class WizardFabric {
  private weaponFabric = new WeaponFabric();

  public createWizard(
    names: string[],
    playerHealth: number,
    playerStrength: number,
    playerWeapon: IWeapon
  ) {
    const name: string = getRandomArrayElement(names)!;
    const health: number = playerHealth;
    const strength: number = playerStrength;
    const weapon: IWeapon = playerWeapon;

    return new Wizard(health, strength, name, weapon);
  }
}
