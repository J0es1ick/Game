import {
  eraVeteranBadgeCopy,
  loadRankingSnapshot,
  saveRankingSnapshot,
} from "../src/web/react/features/rankings/utils/LeaderboardView";

describe("leaderboard presentation data", () => {
  let original: PropertyDescriptor | undefined;
  let values: Map<string, string>;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    values = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("describes a carried fighter with the source era number", () => {
    expect(eraVeteranBadgeCopy(3)).toEqual({
      text: "эп. 3",
      label: "Ветеран, перенесённый из эпохи 3",
    });
    expect(eraVeteranBadgeCopy(1, 7)).toEqual({
      text: "эп. 1",
      label: "Ветеран из эпохи 1 · эпох в строю: 7",
    });
    expect(eraVeteranBadgeCopy(undefined)).toBeUndefined();
    expect(eraVeteranBadgeCopy(0)).toBeUndefined();
    expect(eraVeteranBadgeCopy(1.5)).toBeUndefined();
  });

  test("keeps snapshots keyed by stable fighter identity", () => {
    saveRankingSnapshot("world", [{ id: "first" }, { id: "second" }]);
    expect(loadRankingSnapshot("world")).toEqual({ first: 1, second: 2 });
    saveRankingSnapshot("world", [{ id: "second" }, { id: "third" }]);
    expect(loadRankingSnapshot("world")).toEqual({ second: 1, third: 2 });
  });

  test("ignores invalid or inaccessible snapshot data", () => {
    values.set("world", '{"valid":3,"zero":0,"negative":-1,"text":"4"}');
    expect(loadRankingSnapshot("world")).toEqual({ valid: 3 });
    values.set("world", "not-json");
    expect(loadRankingSnapshot("world")).toEqual({});
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("Storage denied");
      },
    });
    expect(loadRankingSnapshot("world")).toEqual({});
  });
});
