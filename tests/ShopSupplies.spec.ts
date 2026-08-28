import { createItem } from "../src/factories/ItemFactory";
import { reforgeCost } from "../src/gameplay/LootProgression";
import { SeededRandom } from "../src/gameplay/RandomSource";
import {
  TEMPERING_MARK_BASE_PRICE,
  buyTemperingMarks,
  temperingMarkPrice,
} from "../src/gameplay/ShopSupplies";
import { WorldGame } from "../src/gameplay/WorldGame";
import { exportWorldSave, parseWorldSave } from "../src/gameplay/WorldSaveStorage";
import type { GameSave, Stats } from "../src/gameplay/WorldTypes";

const NOW = 1_760_000_000_000;
let initialSave: GameSave;

function copy(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

function shopSave(factionId = "wardens", reputation = 0): GameSave {
  const save = copy(initialSave);
  save.factionControl!.shopControllerId = factionId;
  save.hero.factionReputation = { wardens: 0, "free-company": 0, "red-ledger": 0, [factionId]: reputation };
  save.hero.gold = 1_000_000;
  save.hero.temperingMarks = 3;
  save.legacy.seals = 7;
  return save;
}

beforeAll(() => {
  initialSave = WorldGame.create("Покупатель", "Knight", NOW).save;
});

describe("цены печатей закалки", () => {
  test("сохраняет базовую цену 20 000 монет", () => {
    expect(TEMPERING_MARK_BASE_PRICE).toBe(20_000);
  });

  test.each([
    ["wardens", -100, 21_200],
    ["wardens", 0, 19_600],
    ["wardens", 45, 16_900],
    ["wardens", 60, 16_000],
    ["wardens", 100, 16_000],
    ["free-company", -100, 21_600],
    ["free-company", 0, 20_000],
    ["free-company", 45, 17_300],
    ["free-company", 100, 16_400],
    ["red-ledger", -100, 23_600],
    ["red-ledger", 0, 22_000],
    ["red-ledger", 45, 19_300],
    ["red-ledger", 100, 18_400],
  ])("учитывает фракцию %s и репутацию %s: %s монет", (factionId, reputation, price) => {
    const save = shopSave(factionId as string, reputation as number);
    const before = copy(save);

    expect(temperingMarkPrice(save)).toBe(price);
    expect(save).toEqual(before);
  });

  test("не накладывает скидку кузницы поверх цены текущей фракции", () => {
    const save = shopSave("wardens", 0);
    save.hero.factionReputation["free-company"] = 100;

    expect(temperingMarkPrice(save)).toBe(19_600);
  });

  test("для неизвестного владельца использует Смотрителей и их репутацию", () => {
    const save = shopSave("unknown-faction", -100);
    save.hero.factionReputation.wardens = 60;
    const before = copy(save);

    expect(temperingMarkPrice(save)).toBe(16_000);
    expect(save).toEqual(before);
  });

  test("без данных владельца использует Смотрителей", () => {
    const save = shopSave("wardens", 45);
    delete save.factionControl;

    expect(temperingMarkPrice(save)).toBe(16_900);
  });

  test("пересчитывает цену после изменения владельца или репутации", () => {
    const save = shopSave();
    expect(temperingMarkPrice(save)).toBe(19_600);

    save.factionControl!.shopControllerId = "red-ledger";
    expect(temperingMarkPrice(save)).toBe(22_000);

    save.hero.factionReputation["red-ledger"] = 60;
    expect(temperingMarkPrice(save)).toBe(18_400);
  });
});

describe("покупка печатей закалки", () => {
  test("по умолчанию покупает одну печать", () => {
    const save = shopSave();
    const before = copy(save);

    expect(buyTemperingMarks(save)).toEqual({ quantity: 1, cost: 19_600 });
    before.hero.gold -= 19_600;
    before.hero.temperingMarks += 1;
    expect(save).toEqual(before);
  });

  test.each([1, 5, 7, 1_000])("покупает %s печатей за точную сумму без побочных эффектов", (quantity) => {
    const save = shopSave("free-company", 0);
    const cost = 20_000 * quantity;
    save.hero.gold = cost;
    const expected = copy(save);
    expected.hero.gold = 0;
    expected.hero.temperingMarks += quantity;

    expect(buyTemperingMarks(save, quantity)).toEqual({ quantity, cost });
    expect(save).toEqual(expected);
  });

  test("пять печатей стоят ровно как пять отдельных покупок", () => {
    const bulk = shopSave("red-ledger", 17);
    const singles = copy(bulk);
    const total = buyTemperingMarks(bulk, 5);
    let singleCost = 0;

    for (let index = 0; index < 5; index += 1) {
      singleCost += buyTemperingMarks(singles).cost;
    }

    expect(total.cost).toBe(singleCost);
    expect(bulk).toEqual(singles);
  });

  test.each([1, 5])("при нехватке одной монеты на %s печатей не меняет сохранение", (quantity) => {
    const save = shopSave();
    save.hero.gold = temperingMarkPrice(save) * quantity - 1;
    const before = copy(save);

    expect(() => buyTemperingMarks(save, quantity)).toThrow();
    expect(save).toEqual(before);
  });

  test.each([
    0, -1, -5, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1, "5", null, true,
  ])("отклоняет невалидное количество %s до любых изменений", (quantity) => {
    const save = shopSave();
    const before = copy(save);

    expect(() => buyTemperingMarks(save, quantity as number)).toThrow();
    expect(save).toEqual(before);
  });

  test("отклоняет переполнение общей стоимости до списания денег", () => {
    const save = shopSave();
    save.hero.gold = Number.MAX_SAFE_INTEGER;
    const quantity = Math.floor(Number.MAX_SAFE_INTEGER / temperingMarkPrice(save)) + 1;
    const before = copy(save);
    expect(Number.isSafeInteger(quantity)).toBe(true);

    expect(() => buyTemperingMarks(save, quantity)).toThrow();
    expect(save).toEqual(before);
  });

  test("разрешает большую покупку, пока количество и стоимость безопасны", () => {
    const save = shopSave();
    const quantity = Math.floor(Number.MAX_SAFE_INTEGER / temperingMarkPrice(save));
    const cost = quantity * temperingMarkPrice(save);
    save.hero.gold = cost;
    const expected = copy(save);
    expected.hero.gold = 0;
    expected.hero.temperingMarks += quantity;

    expect(buyTemperingMarks(save, quantity)).toEqual({ quantity, cost });
    expect(save).toEqual(expected);
  });

  test("отклоняет переполнение итогового запаса печатей без списания денег", () => {
    const save = shopSave();
    save.hero.temperingMarks = Number.MAX_SAFE_INTEGER;
    const before = copy(save);

    expect(() => buyTemperingMarks(save)).toThrow();
    expect(save).toEqual(before);
  });
});

describe("печати магазина в игровом мире", () => {
  test("позволяет многократно покупать в один день даже при распроданном снаряжении", () => {
    const game = WorldGame.restore(shopSave());
    game.save.shopOffers.forEach((offer) => { offer.sold = true; });
    const expected = copy(game.save);
    const unitPrice = game.temperingMarkPrice();

    for (let index = 0; index < 10; index += 1) {
      expect(game.buyTemperingMarks(5)).toEqual({ quantity: 5, cost: unitPrice * 5 });
    }

    expected.hero.gold -= unitPrice * 50;
    expected.hero.temperingMarks += 50;
    expect(game.save).toEqual(expected);
  });

  test("сохраняет купленные печати после экспорта и повторной загрузки", () => {
    const game = WorldGame.restore(shopSave("free-company", 0));
    const purchase = game.buyTemperingMarks(5);
    const gold = game.save.hero.gold;
    const marks = game.save.hero.temperingMarks;
    const legacySeals = game.save.legacy.seals;
    const restored = WorldGame.restore(parseWorldSave(exportWorldSave(game.save, NOW)));

    expect(purchase).toEqual({ quantity: 5, cost: 100_000 });
    expect(restored.save.hero.gold).toBe(gold);
    expect(restored.save.hero.temperingMarks).toBe(marks);
    expect(restored.save.legacy.seals).toBe(legacySeals);
    expect(restored.save.hero.inventory).toEqual(game.save.hero.inventory);
    expect(restored.save.worldDay).toBe(game.save.worldDay);

    const restoredAgain = WorldGame.restore(parseWorldSave(exportWorldSave(restored.save, NOW)));
    expect(restoredAgain.save.hero.gold).toBe(gold);
    expect(restoredAgain.save.hero.temperingMarks).toBe(marks);
    expect(restoredAgain.save.legacy.seals).toBe(legacySeals);
  });

  test("сразу использует купленную печать для закалки предмета", () => {
    const game = WorldGame.restore(shopSave());
    const item = game.save.hero.inventory[0];
    const level = item.level;
    const day = game.save.worldDay;
    const legacySeals = game.save.legacy.seals;
    game.save.hero.temperingMarks = 0;
    game.save.hero.gold = game.temperingMarkPrice();

    expect(game.buyTemperingMarks()).toEqual({ quantity: 1, cost: 19_600 });
    const upgraded = game.upgradeItem(item.id);

    expect(upgraded.enhancement).toBe(1);
    expect(upgraded.level).toBe(level + 1);
    expect(game.save.hero.temperingMarks).toBe(0);
    expect(game.save.hero.gold).toBe(0);
    expect(game.save.legacy.seals).toBe(legacySeals);
    expect(game.save.worldDay).toBe(day);
  });

  test("сразу использует купленную печать для перековки", () => {
    const game = WorldGame.restore(shopSave());
    const item = createItem(15, { classId: "Knight", rarity: "rare", randomSource: new SeededRandom("shop-reforge") });
    game.save.hero.inventory.push(item);
    const cost = reforgeCost(item);
    const sourceStat = Object.keys(item.stats)[0] as keyof Stats;
    const legacySeals = game.save.legacy.seals;
    game.save.hero.temperingMarks = 0;
    game.save.hero.gold = game.temperingMarkPrice() + cost.gold;

    game.buyTemperingMarks();
    const result = game.reforgeItem(item.id, { sourceStat });

    expect(result.cost).toEqual(cost);
    expect(game.save.hero.temperingMarks).toBe(0);
    expect(game.save.hero.gold).toBe(0);
    expect(game.save.legacy.seals).toBe(legacySeals);
    expect(game.save.reforgeAttempts[item.id]).toBe(1);
  });
});
