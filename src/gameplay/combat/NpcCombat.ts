import { BattleSession, combatantSnapshot } from "./AdvancedBattle";
import { eraLawModifiers } from "../progression/NewGamePlus";
import { SeededRandom, type RandomSource } from "../core/RandomSource";
import type {
  BattleAnalytics,
  BattleTurn,
  EnemyProfile,
  EraLawId,
} from "../core/WorldTypes";

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

export function importantNpcBattle(
  first: EnemyProfile,
  second: EnemyProfile,
  eliteIds: readonly string[],
): boolean {
  return (
    Math.max(
      first.relationships?.[second.id]?.intensity ?? 0,
      second.relationships?.[first.id]?.intensity ?? 0,
    ) >= 55 ||
    eliteIds.includes(first.id) ||
    eliteIds.includes(second.id) ||
    Boolean(first.carriedFromCycle || second.carriedFromCycle) ||
    [first, second].some((fighter) =>
      fighter.equipment.some(
        (item) =>
          item.worldRelicId &&
          Object.values(fighter.equipped).includes(item.id),
      ),
    )
  );
}

export function resolveNpcCombat(
  first: EnemyProfile,
  second: EnemyProfile,
  context: NpcCombatContext,
): NpcCombatResult {
  const fullCombat =
    Boolean(context.forceFull) ||
    importantNpcBattle(first, second, context.eliteIds);
  const defenseMultiplier =
    1 + eraLawModifiers(context.lawIds ?? []).allFighterDefenseFlat / 100;
  const firstSnapshot = combatantSnapshot(first);
  const secondSnapshot = combatantSnapshot(second);
  firstSnapshot.defense = Math.round(firstSnapshot.defense * defenseMultiplier);
  secondSnapshot.defense = Math.round(
    secondSnapshot.defense * defenseMultiplier,
  );
  if (fullCombat) {
    const session = new BattleSession(firstSnapshot, secondSnapshot, {
      randomSource: context.combatRandom,
      ruleIds: context.ruleIds,
    });
    const result = session.runAutomatic();
    const winner = result.winnerId === first.id ? first : second;
    return {
      winner,
      loser: winner.id === first.id ? second : first,
      fullCombat,
      turns: result.turns,
      analysis: result.analysis,
    };
  }
  // One world draw isolates the bout from both world scheduling and the
  // interactive combat stream. Strength, injuries, skills and rules are resolved
  // by exactly the same engine as the fights the player watches.
  const random = new SeededRandom(context.worldRandom.int(0, 0x7fffffff));
  const winnerId = new BattleSession(firstSnapshot, secondSnapshot, {
    randomSource: random,
    ruleIds: context.ruleIds,
    recordTurns: false,
  }).runToWinner();
  const winner = winnerId === first.id ? first : second;
  return {
    winner,
    loser: winner.id === first.id ? second : first,
    fullCombat,
    turns: [],
  };
}
