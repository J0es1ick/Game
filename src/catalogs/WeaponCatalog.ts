import { getRandomNumber } from "../utils/randomization";
import { IWeapon } from "../weapon/IWeapon";

export type WeaponType = "sword" | "stick" | "bow";

const weaponNames: Record<WeaponType, string[]> = {
  sword: ["Драконобой", "Буревестник", "Этельред"],
  stick: ["Дубовый посох", "Ветвь бузины", "Посох пастыря"],
  bow: ["Охотничий лук", "Длинный лук", "Короткий лук"],
};

export function createWeapon(name: string, damage: number): IWeapon {
  return { name, damage };
}

export function createRandomWeapon(type: string): IWeapon {
  const key = type.toLowerCase() as WeaponType;
  const names = weaponNames[key];
  if (!names) return createWeapon("Кулаки", 3);
  const name = names[Math.floor(Math.random() * names.length)];
  return createWeapon(name, getRandomNumber(2, 5));
}
