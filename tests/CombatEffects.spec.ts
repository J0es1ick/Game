import {
  BattleEffectPipeline,
  createClassResource,
  EffectFighter,
} from "../src/gameplay/combat/CombatEffects";
import type { HeroClass } from "../src/gameplay/core/WorldTypes";

function fighter(id: string, classId: HeroClass): EffectFighter {
  return { id, classId, health: 70, maxHealth: 100, statuses: [], resource: createClassResource(classId) };
}

describe("class resources and status pipeline", () => {
  test.each([
    ["Knight", "guarded", "target"],
    ["Archer", "marked", "target"],
    ["Wizard", "arcane-surge", "actor"],
    ["Gunsmith", "burning", "target"],
    ["Swordsman", "bleeding", "target"],
  ] as Array<[HeroClass, string, "actor" | "target"]>)(
    "%s converts a full resource into its class effect",
    (classId, statusId, owner) => {
      const pipeline = new BattleEffectPipeline();
      const actor = fighter("actor", classId === "Knight" ? "Archer" : classId);
      const target = fighter("target", classId === "Knight" ? "Knight" : "Archer");
      for (let index = 0; index < 3; index += 1) {
        pipeline.afterAction(actor, target, 10, classId === "Wizard");
      }
      expect((owner === "actor" ? actor : target).statuses.some((status) => status.id === statusId)).toBe(true);
      expect((classId === "Knight" ? target : actor).resource.current).toBe(0);
    },
  );

  test("Monk converts chi into healing", () => {
    const pipeline = new BattleEffectPipeline();
    const monk = fighter("monk", "Monk");
    const target = fighter("target", "Knight");
    let healing = 0;
    for (let index = 0; index < 3; index += 1) healing += pipeline.afterAction(monk, target, 10, false).healing;
    expect(healing).toBeGreaterThan(0);
    expect(monk.health).toBeGreaterThan(70);
  });

  test("damage-over-time statuses are resolved by the same turn-start pipeline", () => {
    const pipeline = new BattleEffectPipeline();
    const target = fighter("target", "Knight");
    pipeline.addStatus(target, "burning", 2, "source");
    pipeline.addStatus(target, "bleeding", 2, "source");
    const result = pipeline.beginTurn(target);
    expect(result.damage).toBeGreaterThan(0);
    expect(target.health).toBe(70 - result.damage);
    expect(result.detail).toEqual(expect.arrayContaining([expect.stringContaining("горение"), expect.stringContaining("кровотечение")]));
  });
});
