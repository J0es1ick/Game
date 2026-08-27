import { WORLD_RATING_ARENA_BAND } from "./ProgressionBalance";
import { EnemyProfile, HeroProfile, LeaderboardEntry } from "./WorldTypes";

export interface LeaderboardEntryOptions {
  rating?: number;
  crownLeagueWins?: number;
}

export function heroTournamentWins(hero: HeroProfile): number {
  return hero.arenaWins.reduce((sum, wins) => sum + wins, 0);
}

export function calculateHeroWorldRating(hero: HeroProfile): number {
  const championships = hero.arenaWins.reduce((sum, count, index) => sum + count * (30 + index * 16), 0);
  const hasProvedCurrentArena = (hero.arenaWins[hero.highestArena] ?? 0) > 0;
  const provenArena = Math.max(0, hero.highestArena - (hasProvedCurrentArena ? 0 : 1));
  return 1000 + provenArena * WORLD_RATING_ARENA_BAND
    + Math.min(260, hero.tournamentMatchWins * 6)
    + Math.min(200, championships)
    + Math.min(100, hero.level * 3)
    - Math.min(260, hero.tournamentMatchLosses * 8);
}

export function calculateEnemyWorldRating(enemy: EnemyProfile): number {
  const arenaTournamentWins = enemy.arenaTournamentWins ?? [];
  const highestProvenArena = arenaTournamentWins.reduce(
    (highest, wins, index) => wins > 0 ? Math.max(highest, index) : highest,
    -1,
  );
  const provenArena = highestProvenArena >= 0
    ? highestProvenArena
    : Math.max(0, enemy.arenaIndex - 1);
  const championships = arenaTournamentWins.reduce(
    (sum, count, index) => sum + count * (7 + index * 3),
    0,
  );
  const recordedChampionships = arenaTournamentWins.reduce((sum, count) => sum + count, 0);
  const otherTournamentWins = Math.max(0, enemy.tournamentWins - recordedChampionships);
  return 1000 + provenArena * WORLD_RATING_ARENA_BAND
    + Math.min(300, championships)
    + Math.min(80, otherTournamentWins * 5)
    + Math.min(160, Math.max(0, enemy.wins - (enemy.duelWins ?? 0)) * 2)
    + Math.min(100, enemy.level * 3)
    - Math.min(140, Math.max(0, enemy.losses - (enemy.duelLosses ?? 0)) * 2);
}

export function heroLeaderboardEntry(
  hero: HeroProfile,
  options: LeaderboardEntryOptions = {},
): LeaderboardEntry {
  return {
    id: hero.id,
    name: hero.name,
    classId: hero.classId,
    level: hero.level,
    arenaIndex: hero.highestArena,
    rating: options.rating ?? hero.rating,
    tournamentWins: heroTournamentWins(hero) + (options.crownLeagueWins ?? 0),
    wins: hero.wins,
    losses: hero.losses,
    kills: hero.kills,
    isHero: true,
  };
}

export function enemyLeaderboardEntry(
  enemy: EnemyProfile,
  options: LeaderboardEntryOptions = {},
): LeaderboardEntry {
  return {
    id: enemy.id,
    name: enemy.name,
    classId: enemy.classId,
    level: enemy.level,
    arenaIndex: enemy.arenaIndex,
    rating: options.rating ?? enemy.rating,
    tournamentWins: enemy.tournamentWins + (options.crownLeagueWins ?? 0),
    wins: enemy.wins,
    losses: enemy.losses,
    kills: enemy.kills,
    isHero: false,
    carriedFromCycle: enemy.carriedFromCycle,
  };
}

export function byLeaderboardPosition(first: LeaderboardEntry, second: LeaderboardEntry): number {
  return second.rating - first.rating
    || second.tournamentWins - first.tournamentWins
    || second.level - first.level;
}
