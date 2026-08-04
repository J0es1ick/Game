import { Archer, Knight, Wizard } from "../src/classes";
import { PlayerFactory } from "../src/factories/PlayerFactory";

describe("PlayerFactory", () => {
  const factory = new PlayerFactory();

  it.each([
    ["Knight", Knight],
    ["Archer", Archer],
    ["Wizard", Wizard],
  ] as const)("создаёт конкретный подкласс %s", (className, Constructor) => {
    const hero = factory.create({ className, health: 140, strength: 12, name: className });

    expect(hero).toBeInstanceOf(Constructor);
    expect(hero.mechanic.method).toContain(className);
  });

  it("создаёт запрошенное количество случайных объектов", () => {
    expect(factory.createMany(4)).toHaveLength(4);
  });
});
