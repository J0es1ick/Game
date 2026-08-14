import { Player } from "../abstract/Player";
import { Archer, Gunsmith, Knight, Monk, Swordsman, Wizard } from "../classes";
import { createSkills } from "../catalogs/SkillCatalog";
import { createRandomWeapon, WeaponType } from "../catalogs/WeaponCatalog";
import { ISkill } from "../skills/ISkill";
import { getRandomArrayElement, getRandomNumber } from "../utils/randomization";
import { IWeapon } from "../weapon/IWeapon";

export type PlayerClass = "Knight" | "Archer" | "Wizard" | "Monk" | "Gunsmith" | "Swordsman";

export interface PlayerBlueprint {
  className: PlayerClass;
  health: number;
  strength: number;
  name?: string;
  weapon?: IWeapon;
  skills?: ISkill[];
}

const playerNames = [
  "Эльдар", "Артур", "Гэндальф", "Вильямс", "Агатон", "Аполлон", "Артемида",
  "Зевс", "Персей", "Феникс", "Элита", "Ирида", "Медея", "Орион", "Рафаэль",
  "Себастиан", "Эмиль", "Аврора", "Веста", "Лилия", "Мира",
];

const classDefaults: Record<PlayerClass, { weapon: WeaponType; skills: string[] }> = {
  Knight: { weapon: "sword", skills: ["удар возмездия", "ледяные стрелы"] },
  Archer: { weapon: "bow", skills: ["ледяные стрелы", "огненные стрелы"] },
  Wizard: { weapon: "stick", skills: ["заворожение", "ледяные стрелы"] },
  Monk: { weapon: "fists", skills: ["удар возмездия", "огненные стрелы"] },
  Gunsmith: { weapon: "pistols", skills: ["ледяные стрелы", "огненные стрелы"] },
  Swordsman: { weapon: "dual-swords", skills: ["удар возмездия", "заворожение"] },
};

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export class PlayerFactory {
  private names = shuffled(playerNames);
  private nameIndex = 0;

  public create(blueprint: PlayerBlueprint): Player {
    const defaults = classDefaults[blueprint.className];
    const name = blueprint.name?.trim() || this.nextName();
    const weapon = blueprint.weapon ?? createRandomWeapon(defaults.weapon);
    const skills = blueprint.skills ?? createSkills(defaults.skills);

    switch (blueprint.className) {
      case "Knight":
        return new Knight(blueprint.health, blueprint.strength, name, weapon, skills);
      case "Archer": {
        const iceArrows = skills.find((skill) => skill.name === "ледяные стрелы");
        if (iceArrows && blueprint.skills === undefined) {
          iceArrows.usageCount = 2;
          iceArrows.initialSkillUsage = 2;
        }
        return new Archer(blueprint.health, blueprint.strength, name, weapon, skills);
      }
      case "Wizard":
        return new Wizard(blueprint.health, blueprint.strength, name, weapon, skills);
      case "Monk":
        return new Monk(blueprint.health, blueprint.strength, name, weapon, skills);
      case "Gunsmith":
        return new Gunsmith(blueprint.health, blueprint.strength, name, weapon, skills);
      case "Swordsman":
        return new Swordsman(blueprint.health, blueprint.strength, name, weapon, skills);
    }
  }

  public createRandom(): Player {
    const className = getRandomArrayElement<PlayerClass>(["Knight", "Archer", "Wizard", "Monk", "Gunsmith", "Swordsman"])!;
    return this.create({
      className,
      health: getRandomNumber(125, 150),
      strength: getRandomNumber(10, 15),
    });
  }

  public createMany(amount: number): Player[] {
    return Array.from({ length: Math.max(0, amount) }, () => this.createRandom());
  }

  private nextName(): string {
    if (this.nameIndex >= this.names.length) {
      this.names = shuffled(playerNames);
      this.nameIndex = 0;
    }
    return this.names[this.nameIndex++];
  }
}
