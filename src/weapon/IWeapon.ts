import { IEquipment } from "../equipment/IEquipment";

export interface IWeapon extends IEquipment {
  get name(): string;
  get damage(): number;
}
