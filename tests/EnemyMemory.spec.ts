import { combatantSnapshot, resolveCombat } from "../src/gameplay/AdvancedBattle";
import {
  createEnemyStyleMemory,
  decayEnemyStyleMemory,
  heroLoadoutSignature,
  readEnemyStyleMemory,
  recordEnemyStyleMemory,
} from "../src/gameplay/EnemyMemory";
import { WorldGame } from "../src/gameplay/WorldGame";
import type {
  BattleTurn,
  EnemyProfile,
  HeroClass,
  HeroProfile,
  TacticalStyle,
} from "../src/gameplay/WorldTypes";

const tactics = (style: TacticalStyle) => ({
  id: style,
  name: style,
  style,
  healThreshold: 0.55,
  finisherThreshold: 0.42,
  preserveStrongSkills: false,
  prioritizeControl: style === "control",
});

function hero(classId: HeroClass = "Knight", style: TacticalStyle = "balanced"): HeroProfile {
  return {
    id: "hero",
    name: "Тактик",
    classId,
    level: 1,
    inventory: [],
    equipped: {},
    traitIds: [],
    scarIds: [],
    injuries: [],
    autoSelectSkills: true,
    selectedSkillIds: [],
    tacticalProfiles: [tactics(style)],
    activeTacticalProfileId: style,
  } as unknown as HeroProfile;
}

function enemy(memory = createEnemyStyleMemory()): EnemyProfile {
  return {
    id: "enemy-memory-test",
    name: "Наблюдатель",
    classId: "Knight",
    level: 1,
    equipment: [],
    equipped: {},
    traitIds: [],
    scarIds: [],
    injuries: [],
    adaptationIds: [],
    heroMemory: memory,
    tacticalStyle: "balanced",
  } as unknown as EnemyProfile;
}

function battleTurns(skillIds: string[]): BattleTurn[] {
  return skillIds.map((skillId, index) => ({
    turn: index + 1,
    actorId: "hero",
    targetId: "enemy-memory-test",
    actorName: "Тактик",
    targetName: "Наблюдатель",
    action: skillId,
    skillId,
    detail: "",
    damage: 20,
    healing: 0,
    actorHealth: 100,
    targetHealth: Math.max(0, 100 - (index + 1) * 20),
    critical: index <= 1,
  }));
}

describe("многослойная память соперников", () => {
  test("учится на фактически применённых навыках и постепенно открывает контрмеры", () => {
    const fighter = hero();
    let memory = createEnemyStyleMemory(1);

    for (let day = 1; day <= 4; day += 1) {
      memory = recordEnemyStyleMemory(memory, fighter, battleTurns(["shield-bash", "riposte", "riposte"]), day).memory;
    }

    expect(memory.stage).toBe("adapted");
    expect(memory.skillKnowledge.riposte).toBeGreaterThan(memory.skillKnowledge["shield-bash"]);
    expect(memory.recentSignatures[0].skillIds).toEqual(expect.arrayContaining(["shield-bash", "riposte"]));
    expect(memory.countermeasureIds).toEqual(expect.arrayContaining(["guarded-opening", "critical-guard", "signature-parry"]));
  });

  test("смена класса и тактики ослабляет контрмеры, но не стирает старые знания", () => {
    const knight = hero("Knight", "balanced");
    let memory = createEnemyStyleMemory(1);
    let firstGain = 0;
    for (let day = 1; day <= 4; day += 1) {
      const result = recordEnemyStyleMemory(memory, knight, battleTurns(["shield-bash", "riposte"]), day);
      memory = result.memory;
      if (day === 1) firstGain = result.update.familiarityGained;
    }
    const knightKnowledge = memory.classKnowledge.Knight;
    const familiarRead = readEnemyStyleMemory(memory, heroLoadoutSignature(knight, ["shield-bash", "riposte"]));

    const archer = hero("Archer", "aggressive");
    const changedRead = readEnemyStyleMemory(memory, heroLoadoutSignature(archer, ["quick-shot", "pinning-arrow"]));
    const changedTacticRead = readEnemyStyleMemory(memory, heroLoadoutSignature(hero("Knight", "control"), ["shield-bash", "riposte"]));
    const changed = recordEnemyStyleMemory(memory, archer, battleTurns(["quick-shot", "pinning-arrow"]), 5);
    const returned = recordEnemyStyleMemory(changed.memory, knight, battleTurns(["shield-bash", "riposte"]), 6);

    expect(changedRead.similarity).toBeLessThan(familiarRead.similarity);
    expect(changedRead.strength).toBeLessThan(familiarRead.strength);
    expect(changedTacticRead.similarity).toBeLessThan(familiarRead.similarity);
    expect(changed.memory.classKnowledge.Knight).toBe(knightKnowledge);
    expect(returned.update.familiarityGained).toBeGreaterThan(firstGain);
    expect(returned.memory.classKnowledge.Knight).toBeGreaterThan(knightKnowledge!);
  });

  test("WorldGame записывает именно фактические действия постоянного соперника", () => {
    const game = WorldGame.create("Очевидец", "Knight", 1_000);
    const report = game.duel();
    const battle = report.battle!;
    const rival = game.save.enemies.find((candidate) => candidate.id === battle.enemyBefore.id)!;
    const actualSkillIds = [...new Set(battle.turns.filter((turn) => turn.actorId === "hero").map((turn) => turn.skillId).filter(Boolean))];

    expect(game.save.hero.rivalries[rival.id]).toBeDefined();
    expect(rival.heroMemory.recentSignatures[0].skillIds).toEqual(expect.arrayContaining(actualSkillIds));
    expect(rival.heroMemory.recentSignatures[0].day).toBe(1);
  });

  test("тишина снижает стадию и точность, сохраняя слабый след старого класса", () => {
    const fighter = hero();
    let memory = createEnemyStyleMemory(1);
    for (let day = 1; day <= 5; day += 1) {
      memory = recordEnemyStyleMemory(memory, fighter, battleTurns(["shield-bash", "riposte"]), day).memory;
    }
    const before = { familiarity: memory.familiarity, knowledge: memory.classKnowledge.Knight! };
    const forgotten = decayEnemyStyleMemory(memory, 90);

    expect(forgotten.familiarity).toBeLessThan(before.familiarity);
    expect(forgotten.classKnowledge.Knight).toBeLessThan(before.knowledge);
    expect(forgotten.classKnowledge.Knight).toBeGreaterThan(0);
    expect(["unknown", "observing", "familiar"]).toContain(forgotten.stage);
  });

  test("подготовленная контрмера уменьшает реальный урон знакомого открытия", () => {
    const fighter = hero();
    const knownSignature = heroLoadoutSignature(fighter, ["shield-bash"]);
    const learnedMemory = {
      ...createEnemyStyleMemory(),
      familiarity: 100,
      stage: "mastered" as const,
      recentSignatures: [knownSignature],
      countermeasureIds: ["guarded-opening" as const],
    };
    const random = jest.spyOn(Math, "random").mockReturnValue(0.5);

    const baseline = resolveCombat(fighter, enemy());
    const learned = resolveCombat(fighter, enemy(learnedMemory));
    random.mockRestore();
    const baselineOpening = baseline.turns.find((turn) => turn.actorId === "hero")!;
    const learnedOpening = learned.turns.find((turn) => turn.actorId === "hero")!;

    expect(learnedOpening.damage).toBeLessThan(baselineOpening.damage);
    expect(learnedOpening.detail).toContain("ожидал ранний натиск");
  });

  test("мигрирует старые адаптации в память без двойного плоского бонуса", () => {
    const game = WorldGame.create("Старый герой", "Knight", 1_000);
    const oldEnemy = game.save.enemies[0];
    const baseDefense = combatantSnapshot({ ...oldEnemy, adaptationIds: [], heroMemory: createEnemyStyleMemory() }).defense;
    oldEnemy.adaptationIds = ["adapt-guard"];
    delete (oldEnemy as Partial<EnemyProfile>).heroMemory;

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    const migrated = restored.save.enemies.find((candidate) => candidate.id === oldEnemy.id)!;

    expect(migrated.heroMemory.familiarity).toBeGreaterThan(0);
    expect(migrated.heroMemory.countermeasureIds).toContain("guarded-opening");
    expect(combatantSnapshot(migrated).defense).toBe(baseDefense);
  });
});
