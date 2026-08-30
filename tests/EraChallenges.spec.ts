import {
  ENEMY_CLASS_MUTATIONS,
  ERA_OBJECTIVES,
  eraChallengeFor,
  evaluateEraObjective,
  initialEnemyMutationState,
  resolveEnemyMutation,
  SelectedEnemyMutation,
  createEraChallengeProgress,
} from "../src/gameplay/world/EraChallenges";
import { WorldGame } from "../src/gameplay/core/WorldGame";

function mutation(id: string): SelectedEnemyMutation {
  const definition = ENEMY_CLASS_MUTATIONS.find((candidate) => candidate.id === id)!;
  return { ...definition, potency: 1 };
}

describe("EraChallenges", () => {
  test("одна эпоха всегда получает одинаковые мутации и цели", () => {
    expect(eraChallengeFor(5)).toEqual(eraChallengeFor(5));
    const challenge = eraChallengeFor(5);
    expect(Object.keys(challenge.mutations)).toHaveLength(6);
    Object.entries(challenge.mutations).forEach(([classId, selected]) => expect(selected.classId).toBe(classId));
    expect(challenge.objectives).toHaveLength(3);
  });

  test("в пуле дополнительных целей нет очередного захвата короны", () => {
    expect(ERA_OBJECTIVES.some((objective) => /корон/i.test(`${objective.name} ${objective.description}`))).toBe(false);
    expect(ERA_OBJECTIVES.some((objective) => objective.requirements.some((requirement) => requirement.metric.includes("crown")))).toBe(false);
  });

  test("цель эпохи оценивает частичный и полный прогресс", () => {
    const objective = ERA_OBJECTIVES.find((candidate) => candidate.id === "book-of-rivals")!;
    expect(evaluateEraObjective(objective, { uniqueRivalsDefeated: 6 })).toMatchObject({ ratio: 0.5, completed: false });
    expect(evaluateEraObjective(objective, { uniqueRivalsDefeated: 12 })).toMatchObject({ ratio: 1, completed: true });
  });

  test("рыцарская мутация реально отражает каждый третий полученный удар", () => {
    let state = initialEnemyMutationState();
    let reflected = 0;
    for (let index = 0; index < 3; index += 1) {
      const result = resolveEnemyMutation(mutation("iron-reprisal"), state, { type: "received-hit", damage: 40 });
      state = result.state;
      reflected = result.effect.reflectedDamage;
    }
    expect(reflected).toBe(10);
  });

  test("маг получает эхо каждого третьего навыка, а монах отменяет лишь первый статус", () => {
    let wizard = initialEnemyMutationState();
    let echo = 0;
    for (let index = 0; index < 3; index += 1) {
      const result = resolveEnemyMutation(mutation("echoing-seal"), wizard, { type: "skill-used", damage: 60 });
      wizard = result.state;
      echo = result.effect.bonusDamageRatio;
    }
    expect(echo).toBe(0.45);

    const first = resolveEnemyMutation(mutation("empty-step"), initialEnemyMutationState(), { type: "incoming-status", statusId: "burning" });
    const second = resolveEnemyMutation(mutation("empty-step"), first.state, { type: "incoming-status", statusId: "bleeding" });
    expect(first.effect.cancelIncomingStatus).toBe(true);
    expect(second.effect.cancelIncomingStatus).toBe(false);
  });

  test("необязательная цель эпохи выдаёт награду ровно один раз", () => {
    const game = WorldGame.create("Летописец", "Knight", 81_001);
    game.save.legacy.cycle = 2;
    game.save.eraChallengeProgress = createEraChallengeProgress(2);
    const objective = game.currentEraChallenge()!.objectives[0];
    objective.requirements.forEach((requirement) => {
      game.save.eraChallengeProgress.metrics[requirement.metric] = requirement.target;
    });
    const sealsBefore = game.save.legacy.seals;
    const marksBefore = game.save.hero.temperingMarks;
    game.train();
    expect(game.save.eraChallengeProgress.rewardedObjectiveIds).toContain(objective.id);
    expect(game.save.legacy.seals).toBe(sealsBefore + 1);
    expect(game.save.hero.temperingMarks).toBe(marksBefore + 1);
    const goldAfterReward = game.save.hero.gold;
    game.train();
    expect(game.save.legacy.seals).toBe(sealsBefore + 1);
    expect(game.save.hero.temperingMarks).toBe(marksBefore + 1);
    expect(game.save.hero.gold).toBe(goldAfterReward);
    expect(objective.optional).toBe(true);
  });
});
