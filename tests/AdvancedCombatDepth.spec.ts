import { SKILLS } from "../src/catalogs/WorldCatalog";
import { BattleSession } from "../src/gameplay/AdvancedBattle";
import { chooseTacticalSkill, TacticalFighterView } from "../src/gameplay/BattleTactics";
import { BattleEffectPipeline, createClassResource, EffectFighter } from "../src/gameplay/CombatEffects";
import {
  createEnemyStyleMemory,
  heroBattleSignature,
  readEnemyStyleMemory,
  recordEnemyStyleMemory,
  styleSimilarity,
} from "../src/gameplay/EnemyMemory";
import { SeededRandom } from "../src/gameplay/RandomSource";
import type { BattleTurn, CombatantSnapshot, HeroProfile, TacticalProfile } from "../src/gameplay/WorldTypes";

const tactics: TacticalProfile = {
  id: "deep-tactics",
  name: "Глубокая тактика",
  style: "defensive",
  healThreshold: 0.7,
  finisherThreshold: 0.4,
  preserveStrongSkills: true,
  prioritizeControl: false,
  breakGuardFirst: true,
  ultimateHealthThreshold: 0.45,
  preferredOpeningSkillId: "shield-bash",
};

function tacticalFighter(overrides: Partial<TacticalFighterView> = {}): TacticalFighterView {
  return {
    classId: "Knight",
    health: 100,
    maxHealth: 100,
    defense: 20,
    buff: 0,
    weakened: 0,
    statuses: [],
    resource: createClassResource("Knight"),
    tactics,
    actionsTaken: 0,
    ...overrides,
  };
}

function effectFighter(id: string, classId: EffectFighter["classId"]): EffectFighter {
  return { id, classId, health: 100, maxHealth: 100, statuses: [], resource: createClassResource(classId) };
}

function combatant(id: string, classId: CombatantSnapshot["classId"] = "Knight"): CombatantSnapshot {
  return {
    id,
    name: id,
    classId,
    level: 20,
    maxHealth: 720,
    health: 720,
    attack: 68,
    defense: 32,
    speed: id === "hero" ? 36 : 22,
    crit: 12,
    equipmentScore: 120,
    skills: classId === "Knight"
      ? ["shield-bash", "riposte", "second-wind", "battle-focus"]
      : ["ember", "frost-seal", "second-wind", "arcane-flow"],
    tacticalStyle: "balanced",
    setCounts: {},
  };
}

function memoryHero(): HeroProfile {
  return {
    id: "hero",
    name: "Тактик",
    classId: "Knight",
    level: 20,
    inventory: [],
    equipped: {},
    traitIds: [],
    scarIds: [],
    injuries: [],
    autoSelectSkills: false,
    selectedSkillIds: ["shield-bash", "riposte", "second-wind", "battle-focus"],
    tacticalProfiles: [tactics],
    activeTacticalProfileId: tactics.id,
  } as unknown as HeroProfile;
}

function turn(index: number, skillId: string, detail = ""): BattleTurn {
  const skill = SKILLS.find((candidate) => candidate.id === skillId);
  return {
    turn: index + 1,
    actorId: "hero",
    targetId: "enemy",
    actorName: "Тактик",
    targetName: "enemy",
    action: skill?.name ?? skillId,
    skillId,
    detail,
    damage: skill?.kind === "heal" || skill?.kind === "buff" ? 0 : 30,
    healing: skill?.kind === "heal" ? 25 : 0,
    actorHealth: skill?.kind === "heal" ? 70 : 60,
    targetHealth: 100 - index * 20,
    critical: index === 0,
  };
}

describe("углублённая тактика боя", () => {
  test("объясняет выбор лечения и учитывает назначенное открытие", () => {
    const heal = SKILLS.find((skill) => skill.id === "second-wind")!;
    const attack = SKILLS.find((skill) => skill.id === "measured-strike")!;
    const control = SKILLS.find((skill) => skill.id === "shield-bash")!;
    const lowHealth = chooseTacticalSkill([heal, attack], tacticalFighter({ health: 22, actionsTaken: 2 }), tacticalFighter());
    expect(lowHealth.skill?.id).toBe("second-wind");
    expect(lowHealth.reason).toContain("опасного уровня");

    const opening = chooseTacticalSkill([attack, control], tacticalFighter(), tacticalFighter());
    expect(opening.skill?.id).toBe("shield-bash");
    expect(opening.reason).toContain("назначен открытием");
  });

  test("связывает горение, кровотечение, метку и арканный прилив", () => {
    const pipeline = new BattleEffectPipeline();
    const wizard = effectFighter("wizard", "Wizard");
    const target = effectFighter("target", "Knight");
    pipeline.addStatus(target, "burning", 3, wizard.id);
    pipeline.addStatus(target, "bleeding", 3, wizard.id);
    const periodic = pipeline.beginTurn(target);
    expect(periodic.statusComboIds).toContain("smoldering-wound");
    expect(periodic.detail).toEqual(expect.arrayContaining([expect.stringContaining("тлеющая рана")]));

    pipeline.addStatus(wizard, "arcane-surge", 3, wizard.id);
    const ignition = pipeline.modifyDamage(wizard, target, 100, true);
    expect(ignition.statusComboIds).toContain("arcane-ignition");

    pipeline.addStatus(target, "marked", 3, wizard.id);
    const wound = pipeline.modifyDamage(wizard, target, 100, false);
    expect(wound.statusComboIds).toContain("exposed-wound");
    expect(wound.damage).toBeGreaterThan(100);
  });

  test("показывает рекомендацию до хода и причину после хода", () => {
    const session = new BattleSession(combatant("hero"), combatant("enemy"), { randomSource: new SeededRandom("decision") });
    const recommended = session.availableActions().find((action) => action.recommended);
    expect(recommended?.reason).toBeTruthy();
    const result = session.runAutomatic();
    const explainedTurns = result.turns.filter((entry) => entry.actorId !== entry.targetId);
    expect(explainedTurns.every((entry) => entry.decisionReason && entry.detail.includes("Решение:"))).toBe(true);
    expect(result.analysis.actionCount).toBe(explainedTurns.length);
    expect(result.analysis.fighters).toHaveLength(2);
    expect(result.analysis.highlights.length).toBeGreaterThan(0);
  });

  test("восстанавливает старый снимок без новых полей хода и счётчика действий", () => {
    const original = new BattleSession(combatant("hero"), combatant("enemy"), { randomSource: new SeededRandom("legacy-session") });
    original.step({ type: "basic" });
    const stored = JSON.parse(JSON.stringify(original.snapshot()));
    delete stored.hero.actionsTaken;
    delete stored.enemy.actionsTaken;
    stored.turns.forEach((entry: Record<string, unknown>) => {
      delete entry.decisionReason;
      delete entry.decisionScore;
      delete entry.statusComboIds;
      delete entry.resourceEvents;
    });
    const restored = new BattleSession(stored);
    expect(restored.runAutomatic().winnerId).toBeTruthy();
  });
});

describe("память конкретного рисунка боя", () => {
  test("запоминает открытие, защиту, лечение и повторяемые связки", () => {
    const hero = memoryHero();
    const turns = [
      turn(0, "shield-bash", "защитная стойка поглотила часть урона"),
      turn(1, "battle-focus"),
      turn(2, "second-wind"),
      turn(3, "shield-bash"),
      turn(4, "battle-focus"),
    ];
    const signature = heroBattleSignature(hero, turns, 1);
    expect(signature.fingerprint?.openingActionIds).toEqual(["shield-bash", "battle-focus", "second-wind", "shield-bash"]);
    expect(signature.fingerprint?.defensiveRatio).toBeGreaterThan(0);
    expect(signature.fingerprint?.healingRatio).toBeGreaterThan(0);
    expect(signature.fingerprint?.comboPatterns).toContain("shield-bash>battle-focus");

    const changedOpening = heroBattleSignature(hero, [turn(0, "second-wind"), turn(1, "battle-focus"), turn(2, "shield-bash")], 2);
    expect(styleSimilarity(signature, changedOpening)).toBeLessThan(styleSimilarity(signature, signature));
  });

  test("возвращает читаемые доказательства распознанного стиля", () => {
    const hero = memoryHero();
    const turns = [turn(0, "shield-bash"), turn(1, "battle-focus"), turn(2, "second-wind"), turn(3, "shield-bash")];
    let memory = createEnemyStyleMemory(1);
    for (let day = 1; day <= 5; day += 1) memory = recordEnemyStyleMemory(memory, hero, turns, day).memory;
    const read = readEnemyStyleMemory(memory, heroBattleSignature(hero, turns, 6));
    expect(read.recognizedOpening).toBe(true);
    expect(read.expectedHealing).toBe(true);
    expect(read.expectedDefense).toBe(true);
    expect(read.expectedCombo).toBeTruthy();
    expect(read.evidence).toEqual(expect.arrayContaining([
      "узнаны первые ходы",
      "запомнен момент лечения",
      "изучена защитная реакция",
    ]));
  });
});
