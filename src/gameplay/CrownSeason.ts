import type { RandomSource } from "./RandomSource";

export interface CrownSeasonState {
  number: number;
  startsDay: number;
  endsDay: number;
  ruleIds: string[];
  points: Record<string, number>;
  defenses: Record<string, number>;
}

export interface CrownSeasonResult {
  season: number;
  completedDay: number;
  championId?: string;
  championName?: string;
  heroRank?: number;
  heroPoints: number;
  rewardGold: number;
  rewardTemperingMarks: number;
}

export interface SeededOpeningRound {
  byes: string[];
  matches: Array<{ firstId: string; secondId: string }>;
}

export function createCrownSeason(
  day: number,
  number: number,
  ruleIds: readonly string[],
  random: RandomSource,
  duration = 42,
): CrownSeasonState {
  const selectedRules = random.shuffle(ruleIds).slice(0, Math.min(3, ruleIds.length));
  return {
    number,
    startsDay: day,
    endsDay: day + Math.max(20, duration) - 1,
    ruleIds: selectedRules,
    points: {},
    defenses: {},
  };
}

export function crownSeasonRemainingDays(state: CrownSeasonState, day: number): number {
  return Math.max(0, state.endsDay - day + 1);
}

export function awardCrownSeasonPoints(
  state: CrownSeasonState,
  fighterId: string,
  result: "win" | "loss" | "defense" | "champion",
): CrownSeasonState {
  const points = { ...state.points };
  const defenses = { ...state.defenses };
  const reward = { win: 3, loss: 1, defense: 5, champion: 18 }[result];
  points[fighterId] = (points[fighterId] ?? 0) + reward;
  if (result === "defense") defenses[fighterId] = (defenses[fighterId] ?? 0) + 1;
  return { ...state, points, defenses };
}

/** Standard fair 30-player single-elimination opening: seeds #1 and #2 receive the only byes. */
export function seedThirtyFighterOpeningRound(rankedIds: readonly string[]): SeededOpeningRound {
  if (rankedIds.length !== 30) throw new RangeError("Crown League requires exactly 30 ranked fighters.");
  const byes = rankedIds.slice(0, 2);
  const playing = rankedIds.slice(2);
  const matches: SeededOpeningRound["matches"] = [];
  for (let index = 0; index < playing.length / 2; index += 1) {
    matches.push({ firstId: playing[index], secondId: playing[playing.length - 1 - index] });
  }
  return { byes, matches };
}
