import { Knight } from "../../classes";
import { ISkill } from "../../skills/ISkill";
import { getRandomArrayElement } from "../../utils/randomization";
import { IWeapon } from "../../weapon/IWeapon";

export class KnightFabric {
  public createKnight(
    names: string[],
    playerHealth: number,
    playerStrength: number,
    playerWeapon: IWeapon,
    playerSkill: ISkill | undefined = undefined
  ) {
    const name: string = getRandomArrayElement(names)!;
    const health: number = playerHealth;
    const strength: number = playerStrength;
    const weapon: IWeapon = playerWeapon;

    return new Knight(health, strength, name, weapon, playerSkill);
  }
}
