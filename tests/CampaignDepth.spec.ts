import { createEnemyStyleMemory, readEnemyStyleMemory } from "../src/gameplay/combat/EnemyMemory";
import { awardCrownSeasonPoints, createCrownSeason, seedThirtyFighterOpeningRound } from "../src/gameplay/world/CrownSeason";
import { availableNarrativeEvents } from "../src/gameplay/world/NarrativeEvents";
import { SeededRandom } from "../src/gameplay/core/RandomSource";
import { buildRivalScoutingReport, rivalryStatus } from "../src/gameplay/combat/RivalrySystem";
import { applyFactionAllegiance, unlockedFactionPerks } from "../src/gameplay/world/FactionSystem";

describe("campaign depth systems", () => {
  test("seeds a fair 30 fighter opening without random byes", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `fighter-${index + 1}`);
    const round = seedThirtyFighterOpeningRound(ids);
    expect(round.byes).toEqual(["fighter-1", "fighter-2"]);
    expect(round.matches).toHaveLength(14);
    expect(new Set([...round.byes, ...round.matches.flatMap((match) => [match.firstId, match.secondId])]).size).toBe(30);
  });

  test("tracks crown season points and deterministic rules", () => {
    const season = createCrownSeason(100, 2, ["a", "b", "c", "d"], new SeededRandom("season"));
    const updated = awardCrownSeasonPoints(awardCrownSeasonPoints(season, "hero", "win"), "hero", "defense");
    expect(updated.points.hero).toBe(8);
    expect(updated.defenses.hero).toBe(1);
    expect(updated.ruleIds).toHaveLength(3);
  });

  test("unlocks meaningful faction services and introduces allegiance cost", () => {
    expect(unlockedFactionPerks("free-company", 22).map((perk) => perk.name)).toEqual(["Проверенные тропы", "Страховка проводника"]);
    expect(applyFactionAllegiance({ wardens: 10, "free-company": 10, "red-ledger": 10 }, "wardens", 6))
      .toEqual({ wardens: 16, "free-company": 9, "red-ledger": 9 });
  });

  test("turns repeated meetings into a nemesis status", () => {
    expect(rivalryStatus({ enemyId: "e", name: "E", classId: "Knight", wins: 4, losses: 3, killed: false, lastMetDay: 20, meetings: 7 }).id)
      .toBe("nemesis");
  });

  test("explains remembered tactics before combat", () => {
    const memory = createEnemyStyleMemory();
    memory.familiarity = 65;
    memory.stage = "adapted";
    memory.classKnowledge.Knight = 50;
    memory.tacticalKnowledge.aggressive = 44;
    memory.skillKnowledge.execution = 40;
    memory.countermeasureIds = ["signature-parry"];
    const read = readEnemyStyleMemory(memory, { day: 4, classId: "Knight", tacticalStyle: "aggressive", skillIds: ["execution"], dominantSkillId: "execution", behavior: {} });
    const report = buildRivalScoutingReport(memory, read);
    expect(report.observations.join(" ")).toContain("Knight");
    expect(report.countermeasures[0]).toContain("Парирование");
  });

  test("offers narrative choices only when their conditions are met", () => {
    const events = availableNarrativeEvents({ day: 35, heroLevel: 20, classId: "Monk", gold: 1000, highestArena: 3, injuries: 1, rivalries: 2 }, []);
    expect(events.map((event) => event.id)).toEqual(expect.arrayContaining(["rival-mercy", "risky-forge", "field-healer", "faction-demand"]));
    expect(events.map((event) => event.id)).not.toContain("powder-shortage");
    expect(events).toHaveLength(10);
  });

  test("keeps late and class-specific stories out of the early campaign", () => {
    const novice = availableNarrativeEvents({ day: 10, heroLevel: 2, classId: "Knight", gold: 180, highestArena: 0, injuries: 0, rivalries: 0 }, []);
    expect(novice.map((event) => event.id)).toEqual(["street-apprentice"]);

    const marksman = availableNarrativeEvents({ day: 28, heroLevel: 12, classId: "Gunsmith", gold: 1200, highestArena: 2, injuries: 0, rivalries: 0 }, []);
    expect(marksman.map((event) => event.id)).toContain("powder-shortage");
    expect(marksman.map((event) => event.id)).not.toContain("silent-chapel");
  });
});
