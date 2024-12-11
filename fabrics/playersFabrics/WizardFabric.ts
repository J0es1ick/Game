import { Wizard } from "../../classes";
import { getRandomArrayElement } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";
import { WeaponFabric } from "../weaponsFabric/WeaponFabric";

export class WizardFabric {
  private weaponFabric = new WeaponFabric();

  createWizard(names: string[], playerHealth: number, playerStrength: number) {
    const name: string = getRandomArrayElement(names)!;
    const health: number = playerHealth;
    const strength: number = playerStrength;
    const weapon: IWeapon = this.weaponFabric.createWeapon("stick");

    return new Wizard(health, strength, name, weapon);
  }
}
