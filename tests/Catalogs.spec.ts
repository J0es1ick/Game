import { createSkill } from "../src/catalogs/SkillCatalog";
import { createRandomWeapon, createWeapon } from "../src/catalogs/WeaponCatalog";

describe("Каталоги конфигурации", () => {
  it("возвращает независимые экземпляры навыка", () => {
    const first = createSkill("ледяные стрелы")!;
    const second = createSkill("ледяные стрелы")!;
    first.usageCount = 0;

    expect(second.usageCount).toBe(1);
  });

  it("возвращает null для неизвестного навыка", () => {
    expect(createSkill("неизвестный навык")).toBeNull();
  });

  it("создаёт заданное оружие без отдельной фабрики", () => {
    expect(createWeapon("Макет меча", 7)).toEqual({ name: "Макет меча", damage: 7 });
  });

  it("использует кулаки для неизвестного типа оружия", () => {
    expect(createRandomWeapon("laser")).toEqual({ name: "Кулаки", damage: 3 });
  });
});
