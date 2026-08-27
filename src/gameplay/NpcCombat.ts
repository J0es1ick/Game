import { BattleSession, combatantSnapshot } from "./AdvancedBattle";
import { SKILLS } from "../catalogs/WorldCatalog";
import { TOURNAMENT_RULES } from "../catalogs/WorldExpansionCatalog";
import { FighterPowerCalculator } from "./FighterPowerCalculator";
import { eraLawModifiers } from "./NewGamePlus";
import type { RandomSource } from "./RandomSource";
import type { BattleAnalytics, BattleTurn, CombatantSnapshot, EnemyProfile, EraLawId } from "./WorldTypes";

export interface NpcCombatContext {
  worldRandom: RandomSource;
  combatRandom: RandomSource;
  eliteIds: readonly string[];
  forceFull?: boolean;
  ruleIds?: string[];
  lawIds?: readonly EraLawId[];
}

export interface NpcCombatResult {
  winner: EnemyProfile;
  loser: EnemyProfile;
  fullCombat: boolean;
  turns: BattleTurn[];
  analysis?: BattleAnalytics;
}

export function importantNpcBattle(first: EnemyProfile, second: EnemyProfile, eliteIds: readonly string[]): boolean {
  return Math.max(first.relationships?.[second.id]?.intensity ?? 0, second.relationships?.[first.id]?.intensity ?? 0) >= 55
    || eliteIds.includes(first.id) || eliteIds.includes(second.id)
    || Boolean(first.carriedFromCycle || second.carriedFromCycle)
    || [first, second].some((fighter) => fighter.equipment.some((item) => item.worldRelicId && Object.values(fighter.equipped).includes(item.id)));
}

export function resolveNpcCombat(first: EnemyProfile, second: EnemyProfile, context: NpcCombatContext): NpcCombatResult {
  const fullCombat = Boolean(context.forceFull) || importantNpcBattle(first, second, context.eliteIds);
  const defenseMultiplier = 1 + eraLawModifiers(context.lawIds ?? []).allFighterDefenseFlat / 100;
  const firstSnapshot = combatantSnapshot(first);
  const secondSnapshot = combatantSnapshot(second);
  firstSnapshot.defense = Math.round(firstSnapshot.defense * defenseMultiplier);
  secondSnapshot.defense = Math.round(secondSnapshot.defense * defenseMultiplier);
  if (fullCombat) {
    const session = new BattleSession(firstSnapshot, secondSnapshot, {
      randomSource: context.combatRandom,
      ruleIds: context.ruleIds,
    });
    const result = session.runAutomatic();
    const winner = result.winnerId === first.id ? first : second;
    return { winner, loser: winner.id === first.id ? second : first, fullCombat, turns: result.turns, analysis: result.analysis };
  }
  const rules = TOURNAMENT_RULES.filter((rule) => context.ruleIds?.includes(rule.id));
  const disableHealing = rules.some((rule) => rule.disableHealing);
  const power = (fighter: CombatantSnapshot, opponent: CombatantSnapshot, side: "hero" | "enemy"): number => {
    rules.forEach((rule) => {
      const bonus = side === "hero" ? rule.heroStats : rule.enemyStats;
      fighter.maxHealth = Math.max(1, fighter.maxHealth + (bonus?.health ?? 0)
        + (fighter.level < opponent.level ? rule.lowerLevelHealthBonus ?? 0 : 0));
      fighter.attack = Math.max(1, fighter.attack + (bonus?.attack ?? 0));
      fighter.defense = Math.max(0, fighter.defense + (bonus?.defense ?? 0));
      fighter.speed = Math.max(1, fighter.speed + (bonus?.speed ?? 0));
      fighter.crit = Math.max(0, Math.min(60, fighter.crit + (bonus?.crit ?? 0)));
    });
    const statsPower = FighterPowerCalculator.stats({
      health: fighter.maxHealth, attack: fighter.attack, defense: fighter.defense, speed: fighter.speed, crit: fighter.crit,
    });
    const skillsPower = SKILLS.filter((skill) => fighter.skills.includes(skill.id) && (!disableHealing || skill.kind !== "heal"))
      .reduce((sum, skill) => sum + (3 + Math.max(0, skill.power) * 2 + Math.max(0, skill.priority) * 0.08)
        / Math.max(1, skill.cooldown), 0);
    return Math.max(1, statsPower + Math.min(statsPower * 0.15, skillsPower));
  };
  const firstPower = power(firstSnapshot, secondSnapshot, "hero");
  const secondPower = power(secondSnapshot, firstSnapshot, "enemy");
  const winner = context.worldRandom.chance(firstPower / (firstPower + secondPower)) ? first : second;
  return { winner, loser: winner.id === first.id ? second : first, fullCombat, turns: [] };
}
