import { Archer, Knight, Wizard } from "../src/classes";
import { createSkill } from "../src/catalogs/SkillCatalog";
import { createWeapon } from "../src/catalogs/WeaponCatalog";

const weapon = createWeapon("Тестовое оружие", 5);

describe("Полиморфное поведение классов", () => {
  it("Knight.takeDamage поглощает 22% входящего урона", () => {
    const knight = new Knight(150, 12, "Бронник", weapon, []);

    const received = knight.takeDamage(100);

    expect(received).toBe(78);
    expect(knight.health).toBe(72);
    expect(knight.lastDispatch?.method).toBe("Knight.takeDamage()");
  });

  it("Archer.modifyOutgoingDamage усиливает каждый третий выстрел", () => {
    const archer = new Archer(150, 20, "Стрелок", weapon, []);
    const target = new Wizard(500, 10, "Мишень", weapon, []);

    expect(archer.attack(target)).toBe(25);
    expect(archer.attack(target)).toBe(25);
    expect(archer.attack(target)).toBe(38);
    expect(archer.lastDispatch?.message).toContain("критическим");
  });

  it("Wizard.useSkill восстанавливает здоровье после успешного навыка", () => {
    const charm = createSkill("заворожение")!;
    const wizard = new Wizard(120, 12, "Маг", weapon, [charm]);
    const target = new Archer(120, 12, "Цель", weapon, []);
    wizard.takeDamage(30);

    const used = wizard.useSkill(target, "заворожение");

    expect(used).toBe(true);
    expect(wizard.health).toBe(96);
    expect(wizard.lastDispatch?.method).toBe("Wizard.useSkill()");
  });

  it("одинаковое сообщение takeDamage динамически выбирает реализацию", () => {
    const heroes = [
      new Knight(150, 12, "Рыцарь", weapon, []),
      new Archer(150, 12, "Лучник", weapon, []),
    ];

    expect(heroes.map((hero) => hero.takeDamage(50))).toEqual([39, 50]);
  });
});
