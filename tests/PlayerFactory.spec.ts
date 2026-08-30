import { Archer, Gunsmith, Knight, Monk, Swordsman, Wizard } from "../src/classes/index";
import { PlayerFactory } from "../src/factories/PlayerFactory";

describe("PlayerFactory", () => {
  const factory = new PlayerFactory();

  it.each([
    ["Knight", Knight],
    ["Archer", Archer],
    ["Wizard", Wizard],
    ["Monk", Monk],
    ["Gunsmith", Gunsmith],
    ["Swordsman", Swordsman],
  ] as const)("создаёт конкретный подкласс %s", (className, Constructor) => {
    const hero = factory.create({ className, health: 140, strength: 12, name: className });

    expect(hero).toBeInstanceOf(Constructor);
    expect(hero.mechanic.method).toContain(className);
  });

  it("создаёт запрошенное количество случайных объектов", () => {
    expect(factory.createMany(4)).toHaveLength(4);
  });

  it("не расходует случайность при создании бойца с заданным именем", () => {
    const random = jest.spyOn(Math, "random");
    new PlayerFactory().create({
      className: "Knight", health: 140, strength: 12, name: "Заданное имя",
      weapon: { name: "Учебный меч", damage: 0 }, skills: [],
    });
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
