import {
  BattleSession,
  combatantSnapshot,
} from "../src/gameplay/combat/AdvancedBattle";
import {
  CLASS_DEFINITIONS,
  DUNGEONS,
  ARENAS,
} from "../src/catalogs/WorldCatalog";
import { createStarterItems } from "../src/factories/ItemFactory";
import { DEFAULT_TACTICAL_PROFILES } from "../src/catalogs/WorldExpansionCatalog";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { SeededRandom } from "../src/gameplay/core/RandomSource";
import type {
  CombatantSnapshot,
  HeroClass,
  HeroProfile,
} from "../src/gameplay/core/WorldTypes";

function fighter(classId: HeroClass): CombatantSnapshot {
  const inventory = createStarterItems(classId, new SeededRandom("starter"));
  return combatantSnapshot({
    id: classId,
    name: classId,
    classId,
    level: 1,
    inventory,
    equipped: Object.fromEntries(inventory.map((item) => [item.slot, item.id])),
    traitIds: [],
    scarIds: [],
    injuries: [],
    autoSelectSkills: true,
    selectedSkillIds: [],
    tacticalProfiles: DEFAULT_TACTICAL_PROFILES,
    activeTacticalProfileId: DEFAULT_TACTICAL_PROFILES[0].id,
  } as unknown as HeroProfile);
}

describe("classic campaign balance regressions", () => {
  test("all six starting classes are competitive with their real starting equipment", () => {
    const classes = Object.keys(CLASS_DEFINITIONS) as HeroClass[];
    const snapshots = classes.map(fighter);
    const wins = Object.fromEntries(classes.map((c) => [c, 0]));
    for (let a = 0; a < classes.length; a++)
      for (let b = a + 1; b < classes.length; b++) {
        for (let seed = 0; seed < 200; seed++) {
          const pair =
            seed % 2
              ? [snapshots[b], snapshots[a]]
              : [snapshots[a], snapshots[b]];
          const winner = new BattleSession(pair[0], pair[1], {
            recordTurns: false,
            randomSource: new SeededRandom(`starter-guard:${a}:${b}:${seed}`),
          }).runToWinner();
          wins[winner]++;
        }
      }
    for (const count of Object.values(wins)) {
      const share = count / 1000;
      // A finite seed sample should detect class dominance, not fail on
      // sampling noise at the edge of the 40–60% target interval.
      const uncertainty = 1.96 * Math.sqrt((share * (1 - share)) / 1000);
      expect(share + uncertainty).toBeGreaterThanOrEqual(0.4);
      expect(share - uncertainty).toBeLessThanOrEqual(0.6);
    }
  });

  test("a special shot does not receive a second copy of its skill multiplier", () => {
    const gun = {
      ...fighter("Gunsmith"),
      speed: 100,
      crit: 0,
      health: 2000,
      maxHealth: 2000,
    };
    const enemy = {
      ...fighter("Archer"),
      speed: 1,
      health: 2000,
      maxHealth: 2000,
    };
    const basic = new BattleSession(gun, enemy, {
      randomSource: new SeededRandom(99),
    });
    const skill = new BattleSession(gun, enemy, {
      randomSource: new SeededRandom(99),
    });
    expect(basic.currentActorId).toBe(gun.id);
    expect(basic.step({ type: "basic" }).detail).toContain("второй удар");
    expect(
      skill.step({ type: "skill", skillId: "snap-shot" }).detail,
    ).not.toContain("второй удар");
  });

  test("unrecorded combat has the same action limit and RNG consumption as the full replay", () => {
    const first = {
      ...fighter("Knight"),
      health: 1_000_000,
      maxHealth: 1_000_000,
      defense: 1_000_000,
      attack: 1,
      skills: [],
      speed: 10,
      crit: 0,
    };
    const second = { ...first, id: "opponent" };
    const fullRandom = new SeededRandom("bounded");
    const compactRandom = new SeededRandom("bounded");
    const full = new BattleSession(first, second, {
      randomSource: fullRandom,
    }).runAutomatic();
    const compact = new BattleSession(first, second, {
      randomSource: compactRandom,
      recordTurns: false,
    });
    expect(compact.runToWinner()).toBe(full.winnerId);
    expect(full.turns).toHaveLength(120);
    expect(compact.turns).toEqual([]);
    expect(compactRandom.snapshot()).toEqual(fullRandom.snapshot());
    expect(() => compact.snapshot()).toThrow();
  });

  test.each(["Wizard", "Monk", "Swordsman"] as HeroClass[])(
    "dry ring also disables %s passive healing",
    (classId) => {
      const hero = {
        ...fighter(classId),
        level: 20,
        health: 300,
        maxHealth: 900,
        skills: ["measured-strike"],
        crit: 60,
        setCounts: { dusk: 6, astral: 6 },
      };
      const enemy = {
        ...fighter("Knight"),
        health: 9000,
        maxHealth: 9000,
        attack: 1,
        skills: [],
      };
      const result = new BattleSession(hero, enemy, {
        randomSource: new SeededRandom(100),
        ruleIds: ["dry-ring"],
      }).runAutomatic();
      expect(
        result.turns
          .filter((t) => t.actorId === classId)
          .every((t) => t.healing === 0),
      ).toBe(true);
    },
  );

  test("preparing a defensive skill protects the fighter and still makes a light attack", () => {
    const hero = { ...fighter("Knight"), speed: 100, skills: ["iron-stance"] };
    const enemy = { ...fighter("Archer"), speed: 1 };
    const session = new BattleSession(hero, enemy, {
      randomSource: new SeededRandom(77),
    });
    expect(
      session.step({ type: "skill", skillId: "iron-stance" }).damage,
    ).toBeGreaterThan(0);
    expect(
      session.fighterState(hero.id).statuses.some((s) => s.id === "guarded"),
    ).toBe(true);
  });

  test("automatic tactics use the wounded swordsman's stronger basic attack", () => {
    const hero = {
      ...fighter("Swordsman"),
      health: 60,
      maxHealth: 200,
      speed: 100,
      crit: 0,
    };
    const enemy = {
      ...fighter("Knight"),
      health: 9000,
      maxHealth: 9000,
      speed: 1,
      attack: 1,
    };
    const session = new BattleSession(hero, enemy, {
      randomSource: new SeededRandom(77),
    });
    expect(
      session.availableActions().find((a) => a.id === "basic")?.recommended,
    ).toBe(true);
    expect(session.step().skillId).toBeUndefined();
  });

  test("retreat during an expedition battle rejects without changing the save", () => {
    const game = WorldGame.create("Delver", "Knight", 10_006);
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.worldDay = 100;
    game.startExpedition(DUNGEONS[0].id);
    const node = game
      .reachableExpeditionNodes()
      .find((n) => n.kind === "battle")!;
    game.beginExpeditionNode(node.id);
    const before = JSON.stringify(game.save);
    expect(() => game.retreatExpedition()).toThrow();
    expect(JSON.stringify(game.save)).toBe(before);
    game.stepPendingBattle();
    game.abortPendingBattle();
    expect(game.save.pendingBattle).toBeUndefined();
  });

  test("cancelling the second tournament round forfeits the bracket exactly once", () => {
    const game = WorldGame.create("Bracket", "Knight", 10_005);
    const day = game.registerTournament(ARENAS[0].id);
    game.save.worldDay = day;
    const pending = game.beginTournament(ARENAS[0].id);
    pending.session.enemy.health = 0;
    pending.session.winnerId = "hero";
    expect(game.finalizePendingBattle().status).toBe("next-battle");
    expect(game.currentPendingBattle()!.session.turns).toHaveLength(0);
    expect(game.abortPendingBattle()?.status).toBe("complete");
    expect(game.save.worldDay).toBe(day + 1);
    const after = JSON.stringify(game.save);
    expect(game.abortPendingBattle()).toBeUndefined();
    expect(JSON.stringify(game.save)).toBe(after);
  });

  test.each(["suitable", "too-high-level", "overpowered-gear"])(
    "a dungeon rival respects the encounter budget: %s",
    (mode) => {
      const game = WorldGame.create("Delver", "Knight", 10_009);
      game.save.hero.level = 2;
      game.save.worldDay = 2;
      const rival = {
        ...game.save.enemies[0],
        id: "known-rival",
        name: "Знакомый дуэлянт",
        alive: true,
        retiredDay: undefined,
        arenaIndex: 0,
        level: mode === "too-high-level" ? 24 : 6,
        equipment: [],
        equipped: {},
        traitIds: [],
        scarIds: [],
        injuries:
          mode === "overpowered-gear"
            ? [
                {
                  id: "test-power",
                  name: "Сила",
                  description: "",
                  remainingDays: 1,
                  gainedDay: 1,
                  stats: { attack: 10000, health: 10000 },
                },
              ]
            : [],
      };
      game.save.enemies = [rival];
      const expedition = game.startExpedition(DUNGEONS[0].id);
      expedition.route = {
        dungeonId: DUNGEONS[0].id,
        entryNodeIds: ["rival"],
        bossNodeId: "boss",
        nodes: [
          {
            id: "rival",
            depth: 0,
            lane: 0,
            kind: "rival",
            title: "Соперник",
            description: "",
            danger: 3,
            rewardMultiplier: 1.65,
            connections: [],
            event: {
              type: "rival",
              encounterKey: "test",
              opponentId: rival.id,
            },
          },
        ],
      };
      const battle = game.beginExpeditionNode("rival");
      expect("session" in battle).toBe(true);
      if (!("session" in battle)) return;
      if (mode === "suitable") {
        expect(battle.enemyId).toBe(rival.id);
        expect(battle.enemy.name).toBe(rival.name);
        expect(battle.context?.persistentEnemyId).toBe(rival.id);
      } else {
        expect(battle.enemyId).not.toBe(rival.id);
        expect(battle.enemy.level).toBeLessThanOrEqual(7);
      }
    },
  );

  test("the original endgame requires first place as well as all the other obligations", () => {
    const game = WorldGame.create("Champion", "Knight", 10_010);
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.hero.arenaWins[ARENAS.length - 1] = 1;
    game.save.hero.crownLeagueWins = 1;
    game.save.hero.legendDefenses = 1;
    game.save.eliteLeagueMemberIds = [game.save.enemies[0].id, "hero"];
    expect(game.newGamePlusStatus().unlocked).toBe(false);
    game.save.eliteLeagueMemberIds.reverse();
    expect(game.newGamePlusStatus().unlocked).toBe(true);
    game.save.hero.legendDefenses = 0;
    expect(game.newGamePlusStatus().unlocked).toBe(false);
  });
});
