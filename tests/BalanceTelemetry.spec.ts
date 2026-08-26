import { balanceWarnings, combatBalanceMetrics, worldBalanceSnapshot } from "../src/gameplay/BalanceTelemetry";
import type { BattleReport, GameSave, LeaderboardEntry } from "../src/gameplay/WorldTypes";

function battle(turnCount: number, heroWon = true): BattleReport {
  const snapshot = { id: "hero", name: "Hero", classId: "Knight" as const, level: 10, maxHealth: 100, health: 100, attack: 10, defense: 10, speed: 10, crit: 5, equipmentScore: 10, skills: [] };
  return {
    activity: { id: "arena", kind: "arena", name: "A", place: "A", description: "A", minLevel: 1, enemyLevel: [1, 2], winsToAdvance: 1, rewardGold: 1, rewardExperience: 1, lethalChance: 0, tournamentInterval: 1, participants: 8, prestige: "local", accent: "#000" },
    heroBefore: snapshot,
    enemyBefore: { ...snapshot, id: "enemy", name: "Enemy" },
    winnerId: heroWon ? "hero" : "enemy", loserId: heroWon ? "enemy" : "hero", heroWon, enemyDied: false,
    turns: Array.from({ length: turnCount }, (_, index) => ({ turn: index + 1, actorId: "hero", targetId: "enemy", actorName: "Hero", targetName: "Enemy", action: "Hit", detail: "Hit", damage: 10, healing: 0, actorHealth: 100, targetHealth: 90, critical: false })),
    rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
  };
}

describe("balance telemetry", () => {
  test("detects one-shot-heavy combat samples", () => {
    const reports = [...Array.from({ length: 15 }, () => battle(2)), ...Array.from({ length: 5 }, () => battle(8, false))];
    const metrics = combatBalanceMetrics(reports);
    expect(metrics.oneShotRate).toBe(0.75);
    expect(balanceWarnings(metrics, { day: 1, heroLevel: 1, medianNpcLevel: 1, heroLevelDelta: 0, heroInventorySize: 1, largestNpcInventory: 1, averageNpcInventory: 1, topNewcomerShare: 0, currencies: { gold: 0, temperingMarks: 0, relicDust: 0 } })).toContain("Слишком много коротких боёв: 75%.");
  });

  test("reports world churn and inventory growth", () => {
    const save = {
      worldDay: 20,
      hero: { level: 8, inventory: [], gold: 10, temperingMarks: 0, relicDust: 0 },
      enemies: [
        { id: "a", alive: true, level: 25, equipment: Array.from({ length: 14 }, () => ({})) },
        { id: "b", alive: true, level: 23, equipment: [] },
      ],
    } as unknown as GameSave;
    const leaderboard = Array.from({ length: 10 }, (_, index) => ({ id: `new-${index}`, isHero: false } as LeaderboardEntry));
    const snapshot = worldBalanceSnapshot(save, leaderboard, ["old-a", "old-b"]);
    expect(snapshot.topNewcomerShare).toBe(1);
    expect(balanceWarnings(combatBalanceMetrics([]), snapshot)).toEqual(expect.arrayContaining([
      "За один срез обновилось 100% топа.",
      "Инвентарь NPC вырос до 14 предметов.",
    ]));
  });
});
