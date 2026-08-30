import { recommendedSkills, selectActiveSkills } from "../src/gameplay/combat/SkillLoadout";
import type { HeroProfile, SkillDefinition, TacticalStyle } from "../src/gameplay/core/WorldTypes";

function skill(id: string, kind: SkillDefinition["kind"], priority = 10): SkillDefinition {
  return { id, name: id, description: id, kind, priority, power: kind === "heal" ? 100 : 2, cooldown: 3, classes: "all", unlockLevel: 1 };
}

const pool = [
  skill("attack-one", "attack"), skill("attack-two", "attack"), skill("attack-three", "attack"),
  skill("control", "control"), skill("buff", "buff"),
  skill("heal-one", "heal", 500), skill("heal-two", "heal", 400), skill("heal-three", "heal", 300),
];

function manual(ids: string[]): HeroProfile {
  return { selectedSkillIds: [...ids], autoSelectSkills: false } as HeroProfile;
}

describe("skill loadout selection", () => {
  test.each<TacticalStyle>(["balanced", "aggressive", "defensive", "control"])("keeps damage and at most one heal for %s", (style) => {
    const before = JSON.stringify(pool);
    const result = recommendedSkills(pool, { style });
    expect(result).toHaveLength(4);
    expect(result.filter((entry) => entry.kind === "heal").length).toBeLessThanOrEqual(1);
    expect(result.filter((entry) => entry.kind === "attack" || entry.kind === "control").length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(pool)).toBe(before);
  });

  test("does not rewrite manual IDs or expand a deliberately single-skill build", () => {
    const hero = manual(["attack-three"]);
    expect(selectActiveSkills(hero, pool).map((entry) => entry.id)).toEqual(["attack-three"]);
    expect(hero.selectedSkillIds).toEqual(["attack-three"]);
  });

  test("replaces temporarily unavailable level and equipment skills without changing saved preferences", () => {
    const hero = manual(["attack-three", "high-level", "equipment-skill", "control"]);
    const before = [...hero.selectedSkillIds];
    const reduced = selectActiveSkills(hero, pool);
    expect(reduced).toHaveLength(4);
    expect(new Set(reduced.map((entry) => entry.id)).size).toBe(4);
    expect(reduced.map((entry) => entry.id)).toEqual(expect.arrayContaining(["attack-three", "control"]));
    expect(hero.selectedSkillIds).toEqual(before);
    const restored = selectActiveSkills(hero, [...pool, skill("high-level", "attack"), skill("equipment-skill", "buff")]);
    expect(restored.map((entry) => entry.id)).toEqual(before);
  });

  test("falls back when every manual skill is unavailable and ignores stored IDs in auto mode", () => {
    const hero = manual(["missing"]);
    expect(selectActiveSkills(hero, pool)).toEqual(recommendedSkills(pool));
    hero.autoSelectSkills = true;
    hero.selectedSkillIds = ["heal-three"];
    expect(selectActiveSkills(hero, pool)).toEqual(recommendedSkills(pool));
    expect(hero.selectedSkillIds).toEqual(["heal-three"]);
  });

  test.each(["attack-three", "heal-three", "control", "missing"])("handles opening %s without duplicate IDs or oversized builds", (preferredOpeningSkillId) => {
    const result = recommendedSkills([...pool, pool[0]], { preferredOpeningSkillId });
    expect(result.length).toBeLessThanOrEqual(4);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(result.length);
    expect(result.filter((entry) => entry.kind === "heal").length).toBeLessThanOrEqual(1);
    if (preferredOpeningSkillId !== "missing") expect(result.map((entry) => entry.id)).toContain(preferredOpeningSkillId);
  });

  test.each([0, 1, 2, 3, 4, 8])("honors maximum %s including opening selection", (maxSkills) => {
    const result = recommendedSkills(pool, { maxSkills, preferredOpeningSkillId: "heal-three" });
    expect(result.length).toBeLessThanOrEqual(Math.min(4, maxSkills));
    expect(new Set(result.map((entry) => entry.id)).size).toBe(result.length);
  });
});
