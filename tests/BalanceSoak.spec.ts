import { ARENAS, CLASS_DEFINITIONS, DUEL_TIERS, ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { resolveCombat } from "../src/gameplay/combat/AdvancedBattle";
import { cumulativeHeroExperience } from "../src/gameplay/progression/ProgressionBalance";
import { SeededRandom } from "../src/gameplay/core/RandomSource";
import { calculateEnemyWorldRating, calculateHeroWorldRating } from "../src/gameplay/world/WorldRanking";
import type {
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  HeroClass,
  HeroProfile,
  Rarity,
  Stats,
} from "../src/gameplay/core/WorldTypes";

const classes = Object.keys(CLASS_DEFINITIONS) as HeroClass[];
const levels = [1, 10, 20, 30, 40] as const;
const rarities = ["common", "epic", "mythic"] as const;
const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
const rarityMultiplier: Record<Rarity, number> = {
  common: 1,
  rare: 1.35,
  epic: 1.8,
  legendary: 2.35,
  mythic: 3.1,
  relic: 3.75,
};

const tactics = {
  id: "balanced",
  name: "Ровный бой",
  style: "balanced" as const,
  healThreshold: 0.55,
  finisherThreshold: 0.42,
  preserveStrongSkills: false,
  prioritizeControl: false,
};

function median(values: number[]): number {
  const ordered = [...values].sort((first, second) => first - second);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function percentile(values: number[], share: number): number {
  const ordered = [...values].sort((first, second) => first - second);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * share) - 1))] ?? 0;
}

function syntheticEquipment(classId: HeroClass, level: number, rarity: Rarity, owner: string): EquipmentItem[] {
  const setIds: Record<HeroClass, string> = {
    Knight: "bastion",
    Archer: "wind",
    Wizard: "astral",
    Monk: "crane",
    Gunsmith: "powder",
    Swordsman: "dusk",
  };
  const compatible = ITEM_TEMPLATES.filter((item) => item.setId === setIds[classId]);
  const multiplier = rarityMultiplier[rarity];
  const secondaryStats: Array<keyof Stats> = ["health", "defense", "speed", "crit", "attack"];
  return slots.map((slot, index) => {
    const template = compatible.find((item) => item.slot === slot) ?? compatible[index % compatible.length];
    const primary = template.primaryStat;
    const base = primary === "health"
      ? 9 + level * 3
      : primary === "crit"
        ? 2 + Math.floor(level / 5)
        : 2 + Math.floor(level * 0.75);
    const stats: Partial<Stats> = { [primary]: Math.max(1, Math.round(base * multiplier)) };
    if (rarity !== "common") {
      const secondary = secondaryStats.find((stat) => stat !== primary && (index + secondaryStats.indexOf(stat)) % 2 === 0)
        ?? secondaryStats.find((stat) => stat !== primary)!;
      stats[secondary] = Math.max(1, Math.round((secondary === "health" ? level * 1.5 + 5 : level * 0.22 + 1) * multiplier));
    }
    return {
      id: `${owner}-${classId}-${level}-${rarity}-${slot}`,
      templateId: template.id,
      name: `${rarity} ${template.name}`,
      slot,
      rarity,
      level,
      stats,
      allowedClasses: template.allowedClasses,
      price: 0,
      setId: template.setId,
      affix: rarity === "mythic"
        ? { name: "Закалка", description: "Тестовый аффикс", stat: secondaryStats[index % secondaryStats.length], value: Math.round(7.2 + level * 0.4) }
        : undefined,
      grantedSkillId: rarity === "mythic" ? "relic-blood-pact" : undefined,
    };
  });
}

function heroProfile(classId: HeroClass, level: number, rarity: Rarity): HeroProfile {
  const inventory = syntheticEquipment(classId, level, rarity, "hero");
  return {
    id: "hero",
    name: "Испытатель",
    classId,
    level,
    inventory,
    equipped: Object.fromEntries(inventory.map((item) => [item.slot, item.id])),
    traitIds: [],
    scarIds: [],
    injuries: [],
    autoSelectSkills: true,
    selectedSkillIds: [],
    tacticalProfiles: [tactics],
    activeTacticalProfileId: tactics.id,
  } as unknown as HeroProfile;
}

function enemyProfile(classId: HeroClass, level: number, rarity: Rarity): EnemyProfile {
  const equipment = syntheticEquipment(classId, level, rarity, "enemy");
  return {
    id: "enemy",
    name: "Соперник",
    classId,
    level,
    equipment,
    equipped: Object.fromEntries(equipment.map((item) => [item.slot, item.id])),
    traitIds: [],
    scarIds: [],
    injuries: [],
    adaptationIds: [],
    tacticalStyle: "balanced",
  } as unknown as EnemyProfile;
}

describe("long-horizon balance guardrails", () => {
  test("late-game mirror fights preserve defensive builds without one-shots or stalemates", () => {
    const groupMetrics: Array<{ level: number; classId: HeroClass; rarity: Rarity; median: number; p90: number; oneShotRate: number; winRate: number }> = [];
    levels.forEach((level) => classes.forEach((classId) => rarities.forEach((rarity, rarityIndex) => {
      const reports = Array.from({ length: 21 }, (_, sample) => resolveCombat(
        heroProfile(classId, level, rarity),
        enemyProfile(classId, level, rarity),
        { randomSource: new SeededRandom(`balance:${level}:${classId}:${rarity}:${rarityIndex}:${sample}`) },
      ));
      const turns = reports.map((report) => report.turns.length);
      groupMetrics.push({
        level,
        classId,
        rarity,
        median: median(turns),
        p90: percentile(turns, 0.9),
        oneShotRate: turns.filter((turnCount) => turnCount <= 2).length / turns.length,
        winRate: reports.filter((report) => report.winnerId === "hero").length / reports.length,
      });
    })));

    const late = groupMetrics.filter((metric) => metric.level >= 20);
    expect(Math.min(...late.map((metric) => metric.median))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...late.map((metric) => metric.p90))).toBeLessThanOrEqual(36);
    expect(Math.max(...late.map((metric) => metric.oneShotRate))).toBeLessThanOrEqual(0.1);
    const mirrorWinRate = late.reduce((sum, metric) => sum + metric.winRate, 0) / late.length;
    expect(mirrorWinRate).toBeGreaterThan(0.45);
    expect(mirrorWinRate).toBeLessThan(0.55);
  });

  test("one mythic signature item creates an advantage over a typical epic build", () => {
    const winRates = classes.map((classId) => {
      const results = Array.from({ length: 61 }, (_, sample) => {
        const hero = heroProfile(classId, 30, "epic");
        const mythicWeapon = syntheticEquipment(classId, 30, "mythic", "signature")
          .find((item) => item.slot === "weapon")!;
        hero.inventory = hero.inventory.filter((item) => item.slot !== "weapon").concat(mythicWeapon);
        hero.equipped.weapon = mythicWeapon.id;
        return resolveCombat(
          hero,
          enemyProfile(classId, 30, "epic"),
          { randomSource: new SeededRandom(`signature:${classId}:${sample}`) },
        );
      });
      expect(results.filter((report) => report.turns.length <= 2)).toHaveLength(0);
      return {
        classId,
        winRate: results.filter((report) => report.winnerId === "hero").length / results.length,
        median: median(results.map((report) => report.turns.length)),
      };
    });
    expect(winRates.reduce((sum, metric) => sum + metric.winRate, 0) / winRates.length).toBeGreaterThanOrEqual(0.6);
    expect(winRates.reduce((sum, metric) => sum + metric.winRate, 0) / winRates.length).toBeLessThanOrEqual(0.85);
  });

  test("level 30 has a finite mixed-activity progression budget", () => {
    const total = cumulativeHeroExperience(30);
    const championshipExperience = ARENAS.reduce(
      (sum, arena) => sum + arena.rewardExperience * arena.winsToAdvance,
      0,
    );
    const duelMilestones = [
      { count: 8, reward: DUEL_TIERS[0].rewardExperience },
      { count: 16, reward: DUEL_TIERS[1].rewardExperience },
      { count: 31, reward: DUEL_TIERS[2].rewardExperience },
    ];
    const duelExperience = duelMilestones.reduce((sum, milestone) => sum + milestone.count * milestone.reward, 0);
    const remainingExperience = Math.max(0, total - championshipExperience - duelExperience);
    const mixedRepeatableDays = Math.ceil(remainingExperience / 400);
    const projectedActiveDays = ARENAS.reduce((sum, arena) => sum + arena.winsToAdvance, 0)
      + duelMilestones.reduce((sum, milestone) => sum + milestone.count, 0)
      + mixedRepeatableDays;
    expect(total).toBeGreaterThanOrEqual(35_000);
    expect(total).toBeLessThanOrEqual(55_000);
    expect(projectedActiveDays).toBeLessThanOrEqual(150);
  });

  test("a hero without a final-arena championship cannot outrank a proven final champion", () => {
    const hero = {
      level: 40,
      highestArena: 5,
      arenaWins: [50, 50, 50, 50, 50, 0],
      tournamentMatchWins: 999,
      tournamentMatchLosses: 0,
    } as HeroProfile;
    const finalChampion = {
      level: 22,
      arenaIndex: 5,
      arenaTournamentWins: [0, 0, 0, 0, 0, 1],
      tournamentWins: 1,
      wins: 0,
      losses: 0,
    } as EnemyProfile;
    expect(calculateHeroWorldRating(hero)).toBeLessThan(calculateEnemyWorldRating(finalChampion));
  });
});
