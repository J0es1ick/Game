import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import {
  BattlePlayback,
  battleTurnDetail,
  battleTurnSummary,
} from "../src/web/react/battle/BattlePlayback";
import type { BattleTurn } from "../src/gameplay/WorldTypes";

function winCurrentRound(playback: BattlePlayback): void {
  playback.snapshot.enemy.health = 1;
  playback.snapshot.hero.health = playback.snapshot.hero.maxHealth;
  playback.snapshot.hero.attack = 10_000;
  playback.snapshot.nextActorId = "hero";
  playback.step({ type: "basic" });
  let limit = 0;
  while (!playback.finished && limit++ < 200) playback.step();
  expect(playback.finished).toBe(true);
}

describe("React battle playback transaction", () => {
  test("refuses to open a battle that does not exist", () => {
    const game = WorldGame.create("Без боя", "Knight", 93101);
    expect(() => new BattlePlayback(game)).toThrow(
      "Незавершённый бой не найден",
    );
  });

  test("rewards and finalization are committed exactly once", () => {
    const game = WorldGame.create("Один исход", "Knight", 93102);
    game.beginDuel();
    const playback = new BattlePlayback(game);
    const beforeGold = game.save.hero.gold;
    const finalize = jest.spyOn(game, "finalizePendingBattle");
    expect(() => playback.finalize()).toThrow("Сначала завершите");
    winCurrentRound(playback);
    expect(game.save.hero.gold).toBe(beforeGold);
    const first = playback.finalize();
    const goldAfter = game.save.hero.gold;
    expect(playback.finalize()).toBe(first);
    expect(playback.step({ type: "basic" })).toBeUndefined();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(game.save.hero.gold).toBe(goldAfter);
    expect(game.currentPendingBattle()).toBeUndefined();
  });

  test("resumes the saved health, action order and earlier turns", () => {
    const game = WorldGame.create("Продолжение", "Swordsman", 93103);
    game.beginDuel();
    game.stepPendingBattle({ type: "basic" });
    const saved = JSON.parse(JSON.stringify(game.save));
    const savedTurns = JSON.parse(
      JSON.stringify(saved.pendingBattle.session.turns),
    );
    const restored = WorldGame.restore(saved);
    const playback = new BattlePlayback(restored);
    expect(playback.snapshot).toEqual(saved.pendingBattle.session);
    expect(playback.report.turns).toEqual(saved.pendingBattle.session.turns);
    playback.step({ type: "basic" });
    expect(playback.report.turns).toHaveLength(savedTurns.length + 1);
    expect(playback.report.turns[0]).toEqual(savedTurns[0]);
  });

  test("commits the manually selected skill, not a separate simulated battle", () => {
    const game = WorldGame.create("Ручной приём", "Knight", 93104);
    game.beginDuel();
    const playback = new BattlePlayback(game);
    playback.snapshot.nextActorId = "hero";
    const skill = playback.session
      .availableActions()
      .find((option) => option.available && option.id !== "basic");
    expect(skill).toBeDefined();
    const turn = playback.step({ type: "skill", skillId: skill!.id });
    expect(turn?.skillId).toBe(skill?.id);
    expect(game.currentPendingBattle()!.session.turns[0].skillId).toBe(
      skill?.id,
    );
  });

  test("keeps the completed round visible until advancing the tournament", () => {
    const game = WorldGame.create("Следующий раунд", "Knight", 93105);
    game.save.worldDay = game.registerTournament(ARENAS[0].id);
    game.beginTournament(ARENAS[0].id);
    const playback = new BattlePlayback(game);
    const firstOpponent = playback.report.enemyBefore.id;
    const firstBattleId = playback.id;
    winCurrentRound(playback);
    const completed = playback.finalize();
    expect(completed.status).toBe("next-battle");
    expect(playback.report.enemyBefore.id).toBe(firstOpponent);
    expect(playback.id).toBe(firstBattleId);
    expect(playback.takeLoot()).toBeUndefined();
    playback.nextRound();
    expect(playback.id).not.toBe(firstBattleId);
    expect(playback.completion).toBeUndefined();
    expect(playback.snapshot.turns).toEqual([]);
    expect(playback.id).toBe(game.currentPendingBattle()?.id);
  });

  test("collects every newly awarded item and delivers the loot batch once", () => {
    const game = WorldGame.create("Шесть предметов", "Gunsmith", 93106);
    game.beginDuel();
    const originalEquipment = { ...game.save.hero.equipped };
    const playback = new BattlePlayback(game);
    winCurrentRound(playback);
    playback.finalize();
    const template = game.save.hero.inventory[0];
    const items = Array.from({ length: 6 }, (_, index) => ({
      ...template,
      id: `crown-loot-${index}`,
      name: `Регалия ${index}`,
    }));
    game.save.hero.inventory.push(...items);
    game.save.hero.equipped[template.slot] = items[0].id;
    const loot = playback.takeLoot();
    expect(loot?.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(items.map((item) => item.id)),
    );
    expect(loot?.equipmentBefore).toEqual(originalEquipment);
    expect(playback.takeLoot()).toBeUndefined();
  });

  test("keeps inventory baselines across all tournament rounds", () => {
    const game = WorldGame.create("Награды сетки", "Knight", 93107);
    game.save.worldDay = game.registerTournament(ARENAS[0].id);
    game.beginTournament(ARENAS[0].id);
    const playback = new BattlePlayback(game);
    const firstRoundItem = {
      ...game.save.hero.inventory[0],
      id: "first-round-remembered",
    };
    let rounds = 0;
    while (rounds++ < 8) {
      winCurrentRound(playback);
      const completion = playback.finalize();
      if (rounds === 1) game.save.hero.inventory.push(firstRoundItem);
      if (completion.status === "complete") break;
      playback.nextRound();
    }
    expect(playback.completion?.status).toBe("complete");
    expect(
      playback.takeLoot()?.items.some((item) => item.id === firstRoundItem.id),
    ).toBe(true);
  });

  test("turn descriptions include resources, status combinations and decisions", () => {
    const turn: BattleTurn = {
      turn: 1,
      actorId: "hero",
      actorName: "Герой",
      targetId: "opponent",
      targetName: "Соперник",
      actorHealth: 100,
      targetHealth: 20,
      damage: 12,
      healing: 4,
      critical: true,
      action: "Удар",
      detail: "Парирование",
      resourceChange: 2,
      resourceTriggered: "Напор",
      statusComboIds: ["Оглушение"],
      decisionReason: "Цель ослаблена",
    };
    const copy = battleTurnDetail(turn);
    expect(copy).toContain("12 урона");
    expect(copy).toContain("+4 HP");
    expect(copy).toContain("критический удар");
    expect(copy).toContain("ресурс +2");
    expect(copy).toContain("Напор");
    expect(copy).toContain("Оглушение");
    expect(copy).toContain("Цель ослаблена");
    expect(battleTurnSummary(turn)).toBe(
      "12 урона · +4 HP · критический удар · ресурс +2",
    );
    const repeatedReason = battleTurnDetail({
      ...turn,
      detail: "Парирование; Решение: Цель ослаблена",
    });
    expect(repeatedReason.match(/Цель ослаблена/g)).toHaveLength(1);
  });
});
