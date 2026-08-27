import { EQUIPMENT_SETS } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import {
  advanceNpcCareerSeason,
  chooseNpcArenaOpponent,
  cleanupNpcLifeReferences,
  createNpcLifeWorldState,
  isNpcDesiredLoot,
  normalizeNpcLifeWorldState,
  npcReferenceRetentionIds,
  planNpcDay,
  recordNpcPlanOutcome,
  recordNpcAlliance,
  recordNpcEncounter,
  evolveNpcRelationships,
  refreshFutureBossAvailability,
  refreshNpcIdentity,
} from "../src/gameplay/NpcLifeSimulation";
import { RandomSource, SeededRandom } from "../src/gameplay/RandomSource";
import { WorldGame } from "../src/gameplay/WorldGame";
import { combatantSnapshot } from "../src/gameplay/AdvancedBattle";
import { EnemyProfile, MentorRecord } from "../src/gameplay/WorldTypes";

const fixedRandom: RandomSource = {
  next: () => 0,
  int: (min) => min,
  chance: (probability) => probability > 0,
  pick: <T>(items: readonly T[]) => items[0],
  shuffle: <T>(items: readonly T[]) => [...items],
};

function fighters(count = 4): EnemyProfile[] {
  return WorldGame.create("Наблюдатель", "Knight", 1_800_000_000_000).save.enemies.slice(0, count);
}

describe("NpcLifeSimulation", () => {
  function novice(): EnemyProfile {
    return { ...fighters(1)[0], traitIds: [], history: [], wins: 0, losses: 0, tournamentWins: 0, duelWins: 0, duelLosses: 0, joinedDay: 1 };
  }

  test("career traits require actual achievements, never merely elapsed days", () => {
    const fighter = novice();
    const state = createNpcLifeWorldState(1);
    refreshNpcIdentity(state, fighter, 10000);
    expect(fighter.traitIds).toEqual([]);
    fighter.tournamentWins = 3;
    fighter.duelWins = 5;
    fighter.duelLosses = 7;
    fighter.wins = 11;
    fighter.losses = 11;
    refreshNpcIdentity(state, fighter, 10000);
    expect(fighter.traitIds).toEqual([]);
    fighter.tournamentWins = 4;
    refreshNpcIdentity(state, fighter, 10);
    expect(fighter.traitIds).toEqual(["arena-born"]);
    fighter.duelWins = 6;
    refreshNpcIdentity(state, fighter, 10);
    expect(fighter.traitIds).toEqual(["arena-born", "duelist-eye"]);
    fighter.wins = 12;
    fighter.losses = 12;
    refreshNpcIdentity(state, fighter, 60);
    expect(fighter.traitIds).toHaveLength(2);
    refreshNpcIdentity(state, fighter, 61);
    expect(fighter.traitIds).toEqual(["arena-born", "duelist-eye", "survivor"]);
  });

  test("old guard needs a long fought career and traits remain capped and idempotent", () => {
    const fighter = novice();
    fighter.wins = 60;
    const state = createNpcLifeWorldState(1);
    refreshNpcIdentity(state, fighter, 120);
    expect(fighter.traitIds).toEqual([]);
    refreshNpcIdentity(state, fighter, 121);
    expect(fighter.traitIds).toEqual(["old-guard"]);
    fighter.tournamentWins = 10;
    fighter.duelWins = 20;
    fighter.losses = 20;
    refreshNpcIdentity(state, fighter, 122);
    expect(fighter.traitIds).toEqual(["old-guard", "arena-born", "duelist-eye"]);
    const history = [...fighter.history];
    refreshNpcIdentity(state, fighter, 123);
    expect(fighter.history).toEqual(history);
    expect(new Set(fighter.traitIds).size).toBe(3);
  });

  test("earned traits preserve initial traits and change actual combat stats", () => {
    const fighter = novice();
    fighter.traitIds = ["light-step", "iron-lungs"];
    fighter.tournamentWins = 4;
    const before = combatantSnapshot(fighter);
    refreshNpcIdentity(createNpcLifeWorldState(1), fighter, 5);
    const after = combatantSnapshot(fighter);
    expect(fighter.traitIds).toEqual(["light-step", "iron-lungs", "arena-born"]);
    expect(after.attack).toBeGreaterThan(before.attack);
    expect(after.defense).toBeGreaterThan(before.defense);
    expect(after.crit).toBeGreaterThan(before.crit);
    expect(fighter.history).toHaveLength(1);
  });

  test("plans revenge against a concrete living rival", () => {
    const [fighter, rival, fallback] = fighters(3);
    fighter.goal = "vengeance";
    fighter.relationships = {
      [rival.id]: { fighterId: rival.id, kind: "rival", intensity: 68, lastChangedDay: 11 },
    };
    const state = createNpcLifeWorldState(1);

    const plan = planNpcDay(fighter, state, { day: 12, fighters: [fighter, rival, fallback], random: fixedRandom });

    expect(plan.activity).toBe("arena");
    expect(plan.targetFighterId).toBe(rival.id);
    expect(plan.reason).toContain(rival.name);
    expect(state.profiles[fighter.id].revengeTargetId).toBe(rival.id);
    expect(chooseNpcArenaOpponent(plan, fighter, [fallback, rival])).toBe(rival);
  });

  test("plans collection of a concrete missing set piece", () => {
    const [fighter] = fighters(1);
    fighter.goal = "relic";
    fighter.gold = 0;
    const set = EQUIPMENT_SETS.find((candidate) => candidate.classes === "all" || candidate.classes.includes(fighter.classId))!;
    const ownedTemplate = set.pieces[0];
    const item = createItem(fighter.level, { classId: fighter.classId, templateId: ownedTemplate, rarity: "rare", randomSource: new SeededRandom("set-plan") });
    fighter.equipment = [item];
    fighter.equipped = { [item.slot]: item.id };
    const state = createNpcLifeWorldState(1);

    const plan = planNpcDay(fighter, state, { day: 4, fighters: [fighter], random: fixedRandom });

    expect(plan.focus).toBe("set-collection");
    expect(plan.activity).toBe("dungeon");
    expect(plan.targetSetId).toBe(set.id);
    expect(plan.targetTemplateId).toBe(set.pieces[1]);
    expect(plan.targetSlot).toBeDefined();
    expect(isNpcDesiredLoot(plan, fighter, set.pieces[1], plan.targetSlot!)).toBe(true);
  });

  test("chooses an aspirational class set even before the first piece drops", () => {
    const [fighter] = fighters(1);
    fighter.goal = "relic";
    fighter.level = 12;
    fighter.equipment = [];
    fighter.equipped = {};

    const plan = planNpcDay(fighter, createNpcLifeWorldState(1), { day: 7, fighters: [fighter], random: fixedRandom });

    expect(plan.focus).toBe("set-collection");
    expect(plan.targetSetId).toBeDefined();
    expect(plan.targetTemplateId).toBeDefined();
  });

  test("prioritizes recovery when a fighter is injured", () => {
    const [fighter, rival] = fighters(2);
    fighter.goal = "vengeance";
    fighter.relationships = {
      [rival.id]: { fighterId: rival.id, kind: "rival", intensity: 40, lastChangedDay: 3 },
    };
    fighter.injuries = [{ id: "wound", name: "Рана", description: "Требует отдыха", remainingDays: 5, stats: { health: -5 }, gainedDay: 2 }];

    const plan = planNpcDay(fighter, createNpcLifeWorldState(1), { day: 4, fighters: [fighter, rival], random: fixedRandom });

    expect(plan.activity).toBe("rest");
  });

  test("turns repeated encounters into bounded rivalry and a revenge target", () => {
    const [winner, loser, ally] = fighters(3);
    const state = createNpcLifeWorldState(1);
    for (let index = 0; index < 5; index += 1) {
      recordNpcEncounter(state, winner, loser, { day: index + 1, kind: "arena" });
    }
    recordNpcAlliance(state, winner, ally, 6, 20);

    expect(loser.relationships?.[winner.id]).toMatchObject({ kind: "rival", intensity: 35 });
    expect(loser.goal).toBe("vengeance");
    expect(state.profiles[loser.id].revengeTargetId).toBe(winner.id);
    expect(winner.relationships?.[ally.id]).toMatchObject({ kind: "ally", intensity: 20 });
  });

  test("uses allies as companions and resolves a completed revenge plan", () => {
    const [fighter, ally, rival] = fighters(3);
    fighter.goal = "wealth";
    fighter.gold = 0;
    fighter.equipment = [];
    fighter.equipped = { weapon: "planned", offhand: "planned", head: "planned", chest: "planned", hands: "planned", feet: "planned" };
    const state = createNpcLifeWorldState(1);
    recordNpcAlliance(state, fighter, ally, 3, 40);
    const expedition = planNpcDay(fighter, state, { day: 4, fighters: [fighter, ally, rival], random: fixedRandom });
    expect(expedition.activity).toBe("dungeon");
    expect(expedition.companionFighterId).toBe(ally.id);

    fighter.goal = "vengeance";
    fighter.relationships![rival.id] = { fighterId: rival.id, kind: "rival", intensity: 52, lastChangedDay: 4 };
    state.profiles[fighter.id].revengeTargetId = rival.id;
    const revenge = planNpcDay(fighter, state, { day: 5, fighters: [fighter, ally, rival], random: fixedRandom });
    recordNpcPlanOutcome(state, fighter, revenge, { day: 5, success: true });

    expect(state.profiles[fighter.id].revengeTargetId).toBeUndefined();
    expect(fighter.goal).toBe("champion");
    expect(fighter.relationships![rival.id].intensity).toBe(34);
  });

  test("caps relationship memory instead of growing without bound", () => {
    const roster = fighters(40);
    const owner = roster[0];
    const state = createNpcLifeWorldState(1);
    roster.slice(1).forEach((opponent, index) => {
      recordNpcEncounter(state, owner, opponent, { day: index + 1, kind: "duel" });
    });

    expect(Object.keys(owner.relationships ?? {})).toHaveLength(24);
  });

  test("cleans stale rivals, students, mentor links and profiles", () => {
    const [first, second] = fighters(2);
    first.relationships = {
      ghost: { fighterId: "ghost", kind: "rival", intensity: 80, lastChangedDay: 1 },
      [second.id]: { fighterId: second.id, kind: "ally", intensity: 20, lastChangedDay: 2 },
    };
    first.mentorId = "missing-mentor";
    const mentors: MentorRecord[] = [{
      id: "mentor", fighterId: "retired", name: "Наставник", classId: first.classId,
      factionId: first.factionId!, goal: "champion", level: 20, rating: 2000,
      retiredDay: 50, studentIds: [second.id, "ghost"], legacy: "Школа",
    }];
    const state = createNpcLifeWorldState(1);
    state.profiles[first.id] = { fighterId: first.id, career: "active", revengeTargetId: "ghost", seasonsActive: 1 };
    state.profiles.ghost = { fighterId: "ghost", career: "active", seasonsActive: 1 };

    const result = cleanupNpcLifeReferences([first, second], mentors, state);

    expect(first.relationships).toEqual({ [second.id]: expect.objectContaining({ kind: "ally" }) });
    expect(first.mentorId).toBeUndefined();
    expect(mentors[0].studentIds).toEqual([second.id]);
    expect(state.profiles[first.id].revengeTargetId).toBeUndefined();
    expect(state.profiles.ghost).toBeUndefined();
    expect(result).toMatchObject({ removedRelationships: 1, removedStudents: 1, removedMentorLinks: 1, removedProfiles: 1 });
  });

  test("decays old ties, keeps dynasty bonds and removes absent rivals", () => {
    const [first, ally] = fighters(2);
    first.relationships = {
      [ally.id]: { fighterId: ally.id, kind: "ally", intensity: 20, lastChangedDay: 1 },
      ghost: { fighterId: "ghost", kind: "rival", intensity: 60, lastChangedDay: 1 },
    };
    const state = createNpcLifeWorldState(1);
    state.profiles[first.id] = { fighterId: first.id, career: "active", dynastyId: "house", seasonsActive: 1 };
    state.profiles[ally.id] = { fighterId: ally.id, career: "active", dynastyId: "house", seasonsActive: 1 };

    expect(evolveNpcRelationships([first, ally], state, 57)).toBe(1);
    expect(first.relationships?.ghost).toBeUndefined();
    expect(first.relationships?.[ally.id].intensity).toBe(22);
  });

  test("returns retention ids for meaningful long-lived connections", () => {
    const [fighter, student, rival] = fighters(3);
    fighter.relationships = {
      [rival.id]: { fighterId: rival.id, kind: "rival", intensity: 75, lastChangedDay: 10 },
    };
    const mentor: MentorRecord = {
      id: "mentor", fighterId: "retired", name: "Учитель", classId: fighter.classId,
      factionId: fighter.factionId!, goal: "champion", level: 30, rating: 3000,
      retiredDay: 80, studentIds: [student.id], legacy: "Школа",
    };
    const state = createNpcLifeWorldState(1);
    state.profiles[fighter.id] = { fighterId: fighter.id, career: "active", revengeTargetId: rival.id, seasonsActive: 0 };

    const retained = npcReferenceRetentionIds([fighter, student, rival], [mentor], state);

    expect(retained).toEqual(expect.objectContaining(new Set([student.id, rival.id])));
  });

  test("moves legends and veterans through seasonal careers and founds a dynasty", () => {
    const roster = fighters(6);
    const legend = roster[0];
    const veteran = roster[1];
    roster.slice(2).forEach((fighter, index) => {
      fighter.level = 4 + index;
      fighter.tournamentWins = 0;
    });
    veteran.level = 24;
    veteran.tournamentWins = 7;
    veteran.losses = veteran.wins + 3;
    veteran.joinedDay = 1;
    const state = createNpcLifeWorldState(1);
    const mentors: MentorRecord[] = [];

    const result = advanceNpcCareerSeason(roster, mentors, state, {
      day: 120,
      eliteIds: [legend.id],
      seasonLength: 28,
      maxRetirements: 1,
      random: fixedRandom,
    });

    expect(state.profiles[legend.id].career).toBe("legend");
    expect(legend.legendSinceDay).toBe(120);
    expect(veteran.alive).toBe(false);
    expect(veteran.retiredDay).toBe(120);
    expect(mentors).toHaveLength(1);
    expect(result.mentorsCreated).toHaveLength(1);
    expect(result.dynastiesCreated).toHaveLength(1);
    expect(result.dynastiesCreated[0].memberIds).toContain(veteran.id);
    expect(result.transitions.map((transition) => transition.kind)).toEqual(expect.arrayContaining(["became-legend", "became-mentor"]));
  });

  test("awards an earned nickname and preserves a nemesis as a future boss", () => {
    const [fighter, rival] = fighters(2);
    fighter.kills = 12;
    fighter.relationships = {
      [rival.id]: { fighterId: rival.id, kind: "rival", intensity: 82, lastChangedDay: 50 },
    };
    fighter.joinedDay = 50;
    const state = createNpcLifeWorldState(1);

    expect(refreshNpcIdentity(state, fighter, 60)).toBe("Несущий пепел");
    const result = advanceNpcCareerSeason([fighter, rival], [], state, {
      day: 60,
      eliteIds: [],
      seasonLength: 28,
      random: fixedRandom,
    });

    expect(result.futureBossesCreated).toHaveLength(1);
    expect(result.futureBossesCreated[0]).toMatchObject({ fighterId: fighter.id, archetype: "nemesis", status: "dormant" });
    expect(state.profiles[fighter.id].career).toBe("future-boss");
    expect(npcReferenceRetentionIds([fighter, rival], [], state)).toContain(fighter.id);
    expect(refreshFutureBossAvailability(state, 73)).toHaveLength(0);
    expect(refreshFutureBossAvailability(state, 74)).toHaveLength(1);
    expect(state.futureBosses[0].status).toBe("available");
  });

  test("normalizes persisted life state against the current roster", () => {
    const [fighter] = fighters(1);
    const state = normalizeNpcLifeWorldState({
      season: -4,
      seasonStartedDay: "bad",
      profiles: { [fighter.id]: { fighterId: fighter.id, career: "legend", seasonsActive: 3 } },
      dynasties: [{ id: "dynasty", founderId: fighter.id, founderName: fighter.name, factionId: fighter.factionId, foundedDay: 2, memberIds: [fighter.id, fighter.id], prestige: 4 }],
      futureBosses: [],
    }, [fighter], 8);

    expect(state.season).toBe(1);
    expect(state.seasonStartedDay).toBe(8);
    expect(state.profiles[fighter.id]).toMatchObject({ career: "legend", seasonsActive: 3 });
    expect(state.dynasties[0].memberIds).toEqual([fighter.id]);
  });
});
