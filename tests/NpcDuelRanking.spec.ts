import { WorldGame } from "../src/gameplay/core/WorldGame";
import { calculateEnemyWorldRating } from "../src/gameplay/world/WorldRanking";
import { createNpcLifeWorldState, recordNpcEncounter } from "../src/gameplay/world/NpcLifeSimulation";
import { normalizeWorldSave } from "../src/gameplay/save/WorldSaveMigration";
import { validateWorldSave } from "../src/gameplay/save/WorldSaveValidation";
import { parseWorldSave } from "../src/gameplay/save/WorldSaveStorage";

describe("NPC duel statistics and arena rating", () => {
  test("a personal duel changes neither fighter's arena rating", () => {
    const game = WorldGame.create("Наблюдатель", "Knight", 910);
    const [winner, loser] = game.save.enemies;
    winner.wins = 12;
    loser.losses = 9;
    const before = [calculateEnemyWorldRating(winner), calculateEnemyWorldRating(loser)];
    winner.wins += 1;
    loser.losses += 1;
    recordNpcEncounter(createNpcLifeWorldState(1), winner, loser, { kind: "duel", day: 2, lethal: false });
    expect(winner.duelWins).toBe(1);
    expect(loser.duelLosses).toBe(1);
    expect([calculateEnemyWorldRating(winner), calculateEnemyWorldRating(loser)]).toEqual(before);
    winner.wins += 1;
    loser.losses += 1;
    recordNpcEncounter(createNpcLifeWorldState(1), winner, loser, { kind: "tournament", day: 3, lethal: false });
    expect(calculateEnemyWorldRating(winner)).toBe(before[0] + 2);
    expect(calculateEnemyWorldRating(loser)).toBe(before[1] - 2);
  });

  test("restores missing duel counters as zero and clamps malformed counters", () => {
    const game = WorldGame.create("Старая запись", "Knight", 911);
    const save = game.save;
    save.enemies.forEach((enemy) => { delete enemy.duelWins; delete enemy.duelLosses; });
    const restored = parseWorldSave(JSON.stringify(save));
    expect(restored.enemies.every((enemy) => enemy.duelWins === 0 && enemy.duelLosses === 0)).toBe(true);
    restored.enemies[0].wins = 5;
    restored.enemies[0].losses = 3;
    restored.enemies[0].duelWins = 999;
    restored.enemies[0].duelLosses = -8;
    expect(validateWorldSave(restored).valid).toBe(false);
    const normalized = normalizeWorldSave(restored);
    expect(normalized.enemies[0].duelWins).toBe(5);
    expect(normalized.enemies[0].duelLosses).toBe(0);
    expect(validateWorldSave(normalized)).toEqual({ valid: true, issues: [] });
  });
});
