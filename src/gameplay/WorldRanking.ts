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
  const provenArena = Math.max(0, enemy.arenaIndex - (enemy.tournamentWins > 0 ? 0 : 1));
  return 1000 + provenArena * WORLD_RATING_ARENA_BAND
    + Math.min(300, enemy.tournamentWins * 7)
    + Math.min(160, enemy.wins * 2)
    + Math.min(100, enemy.level * 3)
    - Math.min(140, enemy.losses * 2);
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
  };
}

export function byLeaderboardPosition(first: LeaderboardEntry, second: LeaderboardEntry): number {
  return second.rating - first.rating
    || second.tournamentWins - first.tournamentWins
    || second.level - first.level;
}
