import { getRandomNumber } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";

type WeaponType = "sword" | "stick" | "bow";

export class WeaponFabric {
  private names: Record<WeaponType, string[]> = {
    sword: ["Dragonsbane", "Stormbringer", "Aethelred"],
    stick: ["Oak Staff", "Elderwood Branch", "Shepherd's Crook"],
    bow: ["Hunter's Bow", "Longbow", "Shortbow"],
  };

  public createWeapon(
    weaponType: string,
    weaponName: string,
    weaponDamage: number,
  ): IWeapon {
    return {
      name: weaponName,
      damage: weaponDamage,
    };
  }

  public createRandomWeapon(weaponType: string): IWeapon {
    const key = weaponType.toLowerCase() as WeaponType;
    const namesArr = this.names[key];

    if (!namesArr) {
      return this.createWeapon("fists", "fists", 3);
    }

    const name = namesArr[Math.floor(Math.random() * namesArr.length)];
    const damage = getRandomNumber(2, 5);
    return this.createWeapon(weaponType, name, damage);
  }
}
