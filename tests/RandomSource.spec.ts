import { FixedGameClock } from "../src/gameplay/GameClock";
import { PersistentSeededRandom, RandomSnapshot, SeededRandom } from "../src/gameplay/RandomSource";
import { createItem } from "../src/factories/ItemFactory";

describe("SeededRandom", () => {
  test("replays the same sequence from the same seed", () => {
    const first = new SeededRandom("world-42");
    const second = new SeededRandom("world-42");

    expect(Array.from({ length: 20 }, () => first.next()))
      .toEqual(Array.from({ length: 20 }, () => second.next()));
  });

  test("continues from a serializable snapshot", () => {
    const original = new SeededRandom(12345);
    Array.from({ length: 7 }, () => original.next());
    const restored = new SeededRandom(0, original.snapshot());

    expect(Array.from({ length: 10 }, () => restored.next()))
      .toEqual(Array.from({ length: 10 }, () => original.next()));
  });

  test("keeps integer rolls inside inclusive bounds", () => {
    const random = new SeededRandom("bounds");
    const values = Array.from({ length: 200 }, () => random.int(2, 5));

    expect(values.every((value) => value >= 2 && value <= 5)).toBe(true);
    expect(new Set(values)).toEqual(new Set([2, 3, 4, 5]));
  });

  test("creates stable independent streams", () => {
    const root = new SeededRandom("campaign");
    const combat = root.fork("combat");
    const loot = root.fork("loot");

    expect(combat.next()).toBe(new SeededRandom("campaign").fork("combat").next());
    expect(combat.next()).not.toBe(loot.next());
  });

  test("persists every consumed world roll", () => {
    let saved: RandomSnapshot | undefined;
    const first = new PersistentSeededRandom("world", undefined, (snapshot) => { saved = snapshot; });
    first.next();
    first.int(1, 10);
    const snapshotBefore = saved;
    const expected = first.next();
    const restored = new PersistentSeededRandom("ignored", snapshotBefore, () => undefined);
    // The saved snapshot was taken before expected consumed the following value.
    expect(restored.next()).toBe(expected);
  });
});

describe("FixedGameClock", () => {
  test("advances without depending on wall time", () => {
    const clock = new FixedGameClock(1_000);
    clock.advance(250);
    expect(clock.now()).toBe(1_250);
  });
});

describe("deterministic item creation", () => {
  test("restores item values and ids from the same RNG snapshot", () => {
    const source = new SeededRandom("loot-stream");
    source.next();
    const snapshot = source.snapshot();
    const first = createItem(18, { classId: "Knight", minimumRarity: "legendary", randomSource: new SeededRandom("ignored", snapshot) });
    const second = createItem(18, { classId: "Knight", minimumRarity: "legendary", randomSource: new SeededRandom("ignored", snapshot) });

    expect(first).toEqual(second);
    expect(first.id).toBe(second.id);
  });
});
