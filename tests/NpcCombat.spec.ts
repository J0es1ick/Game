import { WorldGame } from "../src/gameplay/WorldGame";
import { importantNpcBattle, resolveNpcCombat, type NpcCombatContext } from "../src/gameplay/NpcCombat";
import { SeededRandom } from "../src/gameplay/RandomSource";
import type { EnemyProfile } from "../src/gameplay/WorldTypes";
import { BattleSession, combatantSnapshot } from "../src/gameplay/AdvancedBattle";
import { SKILLS } from "../src/catalogs/WorldCatalog";

let templates: EnemyProfile[];
beforeAll(() => {
  templates = WorldGame.create("Наблюдатель", "Knight", 18_200).save.enemies.slice(0, 2);
});

function fighters(): [EnemyProfile, EnemyProfile] {
  const pair = JSON.parse(JSON.stringify(templates)) as [EnemyProfile, EnemyProfile];
  pair.forEach((fighter) => {
    fighter.relationships = {};
    fighter.carriedFromCycle = undefined;
    fighter.equipment.forEach((item) => { item.worldRelicId = undefined; });
  });
  return pair;
}

function context() {
  return { worldRandom: new SeededRandom("npc-world"), combatRandom: new SeededRandom("npc-combat"), eliteIds: [] as string[] };
}

function probability(first: EnemyProfile, second: EnemyProfile, settings: Pick<NpcCombatContext, "ruleIds" | "lawIds"> = {}): number {
  const options = { ...context(), ...settings };
  const roll = jest.spyOn(options.worldRandom, "chance");
  const before = JSON.stringify([first, second]);
  const combatBefore = options.combatRandom.snapshot();
  const result = resolveNpcCombat(first, second, options);
  expect(result.fullCombat).toBe(false);
  expect(roll).toHaveBeenCalledTimes(1);
  expect(options.combatRandom.snapshot()).toEqual(combatBefore);
  expect(JSON.stringify([first, second])).toBe(before);
  return roll.mock.calls[0][0];
}

describe("NPC combat routing", () => {
  test("ordinary rolls account for injuries and earned traits", () => {
    const [first, second] = fighters();
    first.traitIds = [];
    first.injuries = [];
    const healthy = probability(first, second);
    first.injuries.push({ id: "sprain", name: "Травма", description: "Потеря темпа", remainingDays: 3,
      gainedDay: 1, stats: { speed: -4, attack: -8, health: -20 } });
    expect(probability(first, second)).toBeLessThan(healthy);
    first.injuries[0].remainingDays = 0;
    expect(probability(first, second)).toBe(healthy);
    first.traitIds.push("survivor");
    expect(probability(first, second)).toBeGreaterThan(healthy);
  });

  test("ordinary rolls apply symmetric rules, lower-level favor and defense laws", () => {
    const [first, second] = fighters();
    first.level = 1;
    second.level = 12;
    const normal = probability(first, second);
    expect(probability(first, second, { ruleIds: ["challenger-favor"] })).toBeGreaterThan(normal);
    expect(probability(first, second, { ruleIds: ["iron-oath"] })).not.toBe(normal);
    expect(probability(first, second, { lawIds: ["age-of-steel"] })).not.toBe(normal);
    const forward = probability(first, second, { ruleIds: ["heavy-sand", "iron-oath"] });
    const backward = probability(second, first, { ruleIds: ["heavy-sand", "iron-oath"] });
    expect(forward + backward).toBeCloseTo(1, 12);
  });

  test("dry ring removes healing skills from the cheap score", () => {
    const [first, second] = fighters();
    [first, second].forEach((fighter) => {
      fighter.classId = "Knight";
      fighter.equipment = [];
      fighter.equipped = {};
      fighter.traitIds = [];
      fighter.scarIds = [];
      fighter.injuries = [];
    });
    first.level = 3;
    second.level = 1;
    expect(combatantSnapshot(first).skills).toContain("second-wind");
    expect(probability(first, second, { ruleIds: ["dry-ring"] })).toBeLessThan(probability(first, second));
  });
  test("ordinary bouts consume only a world roll without mutating fighters", () => {
    const [first, second] = fighters();
    const before = JSON.stringify([first, second]);
    const options = context();
    const combatBefore = options.combatRandom.snapshot();
    const worldBefore = options.worldRandom.snapshot();
    const result = resolveNpcCombat(first, second, options);
    expect(result.fullCombat).toBe(false);
    expect(result.turns).toEqual([]);
    expect([first, second]).toContain(result.winner);
    expect(result.loser).not.toBe(result.winner);
    expect(options.combatRandom.snapshot()).toEqual(combatBefore);
    expect(options.worldRandom.snapshot()).not.toEqual(worldBefore);
    expect(JSON.stringify([first, second])).toBe(before);
  });

  test.each(["rival", "elite", "ancestor", "relic"] as const)("routes %s encounters through bounded shared combat", (reason) => {
    const [first, second] = fighters();
    const options = context();
    if (reason === "rival") first.relationships![second.id] = { fighterId: second.id, kind: "rival", intensity: 55, lastChangedDay: 1 };
    if (reason === "elite") options.eliteIds = [second.id];
    if (reason === "ancestor") first.carriedFromCycle = 1;
    if (reason === "relic") first.equipment.find((item) => first.equipped[item.slot] === item.id)!.worldRelicId = "relic-test";
    const before = JSON.stringify([first, second]);
    const worldBefore = options.worldRandom.snapshot();
    expect(importantNpcBattle(first, second, options.eliteIds)).toBe(true);
    const result = resolveNpcCombat(first, second, options);
    expect(result.fullCombat).toBe(true);
    expect(result.turns.length).toBeGreaterThan(0);
    expect(result.turns.length).toBeLessThanOrEqual(120);
    expect(result.analysis).toBeDefined();
    expect(options.worldRandom.snapshot()).toEqual(worldBefore);
    expect(JSON.stringify([first, second])).toBe(before);
    expect(result.turns.every((turn) => [first.id, second.id].includes(turn.actorId))).toBe(true);
  });

  test("a stored but unequipped relic does not force expensive simulation", () => {
    const [first, second] = fighters();
    first.equipment[0].worldRelicId = "relic-test";
    delete first.equipped[first.equipment[0].slot];
    expect(importantNpcBattle(first, second, [])).toBe(false);
  });

  test("forced finals replay deterministically without awarding progression twice", () => {
    const [first, second] = fighters();
    const firstResult = resolveNpcCombat(first, second, { ...context(), forceFull: true });
    const replay = resolveNpcCombat(first, second, { ...context(), forceFull: true });
    expect(replay.winner.id).toBe(firstResult.winner.id);
    expect(replay.turns).toEqual(firstResult.turns);
    expect(first.wins).toBe(templates[0].wins);
    expect(second.losses).toBe(templates[1].losses);
  });

  test("tournament rules affect full NPC combat instead of being ignored by snapshots", () => {
    const [first, second] = fighters();
    const ordinary = resolveNpcCombat(first, second, { ...context(), forceFull: true });
    const armored = resolveNpcCombat(first, second, { ...context(), forceFull: true, ruleIds: ["iron-oath"] });
    expect(armored.turns).not.toEqual(ordinary.turns);
  });

  test("combat snapshots retain mutations and equipment state", () => {
    const [first] = fighters();
    first.classId = "Knight";
    first.eraMutationId = "iron-reprisal";
    first.eraMutationPotency = 1.2;
    const snapshot = combatantSnapshot(first);
    expect(snapshot.mutationId).toBe("iron-reprisal");
    expect(snapshot.mutationPotency).toBe(1.2);
    expect(snapshot.setCounts).toBeDefined();
    const session = new BattleSession(snapshot, { ...snapshot, id: "other" }, { randomSource: new SeededRandom("mutation") });
    expect(session.snapshot().hero.mutationId).toBe("iron-reprisal");
  });

  test("the shared defense law affects both NPCs without mutating permanent equipment", () => {
    const [first, second] = fighters();
    first.equipment[0].stats.defense = 100;
    second.equipment[0].stats.defense = 100;
    const before = JSON.stringify([first, second]);
    const normal = resolveNpcCombat(first, second, { ...context(), forceFull: true });
    const steel = resolveNpcCombat(first, second, { ...context(), forceFull: true, lawIds: ["age-of-steel"] });
    expect(steel.turns).not.toEqual(normal.turns);
    expect(JSON.stringify([first, second])).toBe(before);
  });

  test("dry ring and challenger favor apply equally to both NPC snapshots", () => {
    const [first, second] = fighters();
    const a = combatantSnapshot(first);
    const b = combatantSnapshot(second);
    a.level = 1;
    b.level = 10;
    const healing = SKILLS.find((skill) => skill.kind === "heal")!.id;
    a.skills = [healing];
    b.skills = [healing];
    const session = new BattleSession(a, b, { randomSource: new SeededRandom("rules"), ruleIds: ["dry-ring", "challenger-favor"] });
    const snapshot = session.snapshot();
    expect(snapshot.hero.maxHealth).toBe(a.maxHealth + 14);
    expect(snapshot.enemy.maxHealth).toBe(b.maxHealth);
    expect(snapshot.hero.disableHealing).toBe(true);
    expect(snapshot.enemy.disableHealing).toBe(true);
    expect(snapshot.hero.skills).not.toContain(healing);
    expect(snapshot.enemy.skills).not.toContain(healing);
  });
});
