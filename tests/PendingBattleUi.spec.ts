import type { BattleAction } from "../src/gameplay/AdvancedBattle";
import type { PendingBattle, PendingBattleFinalization } from "../src/gameplay/WorldTypes";
import {
  PendingBattleUiController,
  pendingBattleActivity,
  pendingBattleReport,
  type PendingBattleGamePort,
} from "../src/web/PendingBattleUi";

function pendingFixture(kind: PendingBattle["kind"] = "duel", activityId = "sparring"): PendingBattle {
  return {
    version: 1,
    id: "pending-test",
    kind,
    activityId,
    enemyId: "enemy-1",
    startedDay: 3,
    enemy: { id: "enemy-1", name: "Соперник" } as PendingBattle["enemy"],
    session: {
      version: 1,
      heroBefore: { id: "hero", name: "Герой", maxHealth: 100 } as PendingBattle["session"]["heroBefore"],
      enemyBefore: { id: "enemy-1", name: "Соперник", maxHealth: 90 } as PendingBattle["session"]["enemyBefore"],
      hero: { id: "hero", name: "Герой", maxHealth: 100, health: 100 } as PendingBattle["session"]["hero"],
      enemy: { id: "enemy-1", name: "Соперник", maxHealth: 90, health: 90 } as PendingBattle["session"]["enemy"],
      turns: [],
      nextActorId: "hero",
      random: { state: 1 } as PendingBattle["session"]["random"],
    },
  };
}

describe("pending battle UI adapter", () => {
  it("resolves catalog activities and projects a reward-free live report", () => {
    const pending = pendingFixture();
    const activity = pendingBattleActivity(pending);
    const report = pendingBattleReport(pending);

    expect(activity.id).toBe("sparring");
    expect(report.activity).toStrictEqual(activity);
    expect(report.turns).toEqual([]);
    expect(report.rewards).toEqual({ experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] });
  });

  it("delegates turns and finalization to the persisted game transaction", () => {
    const pending = pendingFixture();
    const actions: BattleAction[] = [];
    const finalization = { status: "complete", battle: pendingBattleReport(pending) } as PendingBattleFinalization;
    const port: PendingBattleGamePort = {
      currentPendingBattle: () => pending,
      pendingBattleActions: () => [],
      stepPendingBattle: (action) => {
        if (action) actions.push(action);
        return { turn: {} as never, finished: false, pendingBattle: pending };
      },
      finalizePendingBattle: () => finalization,
      runPendingBattleAutomatically: () => undefined,
    };
    const controller = new PendingBattleUiController(port);

    controller.step({ type: "skill", skillId: "riposte" });

    expect(actions).toEqual([{ type: "skill", skillId: "riposte" }]);
    expect(controller.finalize()).toBe(finalization);
    expect(controller.report().enemyBefore.name).toBe("Соперник");
  });
});
