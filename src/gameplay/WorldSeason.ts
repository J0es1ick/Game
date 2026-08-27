import { ARENAS } from "../catalogs/WorldCatalog";
import type { EnemyProfile, MentorRecord } from "./WorldTypes";
import type { RandomSource } from "./RandomSource";

export type WorldSeasonRuleId = "bloody-month" | "scarce-coin" | "deep-delves" | "faction-war" | "new-blood";

export interface WorldSeasonRule {
  id: WorldSeasonRuleId;
  name: string;
  description: string;
  lethalityMultiplier: number;
  goldMultiplier: number;
  dungeonRewardMultiplier: number;
  factionInfluenceMultiplier: number;
  npcExperienceMultiplier: number;
}

export interface WorldSeasonState {
  number: number;
  startsDay: number;
  endsDay: number;
  ruleId: WorldSeasonRuleId;
  arenaPoints: Record<string, Record<string, number>>;
  elitePoints: Record<string, number>;
}

export interface WorldSeasonStanding {
  fighterId: string;
  fighterName: string;
  arenaId: string;
  points: number;
  place: number;
}

export interface WorldSeasonResult {
  number: number;
  startsDay: number;
  endsDay: number;
  ruleId: WorldSeasonRuleId;
  champions: WorldSeasonStanding[];
  eliteChampion?: WorldSeasonStanding;
  promotedIds: string[];
  demotedIds: string[];
  retiredIds: string[];
  mentorIds: string[];
  newcomerIds: string[];
  summary: string;
}

export const WORLD_SEASON_RULES: readonly WorldSeasonRule[] = [
  {
    id: "bloody-month",
    name: "Кровавый месяц",
    description: "На аренах выше риск смертельного поражения. Победы сильнее влияют на контроль фракций.",
    lethalityMultiplier: 1.55,
    goldMultiplier: 1,
    dungeonRewardMultiplier: 1,
    factionInfluenceMultiplier: 1.1,
    npcExperienceMultiplier: 1,
  },
  {
    id: "scarce-coin",
    name: "Дефицит монеты",
    description: "Монетные выплаты снижены на 28%. Награды данжей получают дополнительный множитель ×1,15.",
    lethalityMultiplier: 0.9,
    goldMultiplier: 0.72,
    dungeonRewardMultiplier: 1.15,
    factionInfluenceMultiplier: 1,
    npcExperienceMultiplier: 1,
  },
  {
    id: "deep-delves",
    name: "Зов глубин",
    description: "Награды данжей выше на 40%. Противники получают на 5% больше опыта.",
    lethalityMultiplier: 1,
    goldMultiplier: 1,
    dungeonRewardMultiplier: 1.4,
    factionInfluenceMultiplier: 0.9,
    npcExperienceMultiplier: 1.05,
  },
  {
    id: "faction-war",
    name: "Война знамён",
    description: "Влияние побед на контроль фракций выше на 75%. Риск смертельных исходов на аренах также растёт.",
    lethalityMultiplier: 1.2,
    goldMultiplier: 1,
    dungeonRewardMultiplier: 1,
    factionInfluenceMultiplier: 1.75,
    npcExperienceMultiplier: 1,
  },
  {
    id: "new-blood",
    name: "Новое поколение",
    description: "Противники получают на 28% больше опыта. Монетные выплаты выше на 8%, риск гибели на аренах ниже.",
    lethalityMultiplier: 0.82,
    goldMultiplier: 1.08,
    dungeonRewardMultiplier: 1,
    factionInfluenceMultiplier: 1,
    npcExperienceMultiplier: 1.28,
  },
];

function safeRule(id: string | undefined): WorldSeasonRule {
  return WORLD_SEASON_RULES.find((rule) => rule.id === id) ?? WORLD_SEASON_RULES[0];
}

export function worldSeasonRule(id: string | undefined): WorldSeasonRule {
  return { ...safeRule(id) };
}

export function createWorldSeason(day: number, number: number, random: RandomSource): WorldSeasonState {
  const startsDay = Math.max(1, Math.floor(day));
  const duration = random.int(44, 56);
  const previousIndex = Math.max(0, number - 2) % WORLD_SEASON_RULES.length;
  const choices = WORLD_SEASON_RULES.filter((_, index) => index !== previousIndex);
  const rule = random.pick(choices);
  return {
    number: Math.max(1, Math.floor(number)),
    startsDay,
    endsDay: startsDay + duration - 1,
    ruleId: rule.id,
    arenaPoints: Object.fromEntries(ARENAS.map((arena) => [arena.id, {}])),
    elitePoints: {},
  };
}

export function normalizeWorldSeason(
  source: Partial<WorldSeasonState> | undefined,
  day: number,
  random: RandomSource,
): WorldSeasonState {
  if (!source) return createWorldSeason(day, 1, random);
  const startsDay = Math.max(1, Math.floor(Number(source.startsDay) || day));
  const number = Math.max(1, Math.floor(Number(source.number) || 1));
  const rule = safeRule(source.ruleId);
  return {
    number,
    startsDay,
    endsDay: Math.max(startsDay + 1, Math.floor(Number(source.endsDay) || startsDay + 49)),
    ruleId: rule.id,
    arenaPoints: Object.fromEntries(ARENAS.map((arena) => [arena.id, Object.fromEntries(
      Object.entries(source.arenaPoints?.[arena.id] ?? {})
        .filter(([, points]) => Number.isFinite(points))
        .map(([fighterId, points]) => [fighterId, Math.max(0, Math.floor(Number(points)))]),
    )])),
    elitePoints: Object.fromEntries(Object.entries(source.elitePoints ?? {})
      .filter(([, points]) => Number.isFinite(points))
      .map(([fighterId, points]) => [fighterId, Math.max(0, Math.floor(Number(points)))])),
  };
}

export function awardWorldSeasonPoints(
  season: WorldSeasonState,
  arenaId: string,
  fighterId: string,
  kind: "win" | "loss" | "champion",
): number {
  const points = kind === "champion" ? 18 : kind === "win" ? 3 : 1;
  season.arenaPoints[arenaId] ??= {};
  season.arenaPoints[arenaId][fighterId] = (season.arenaPoints[arenaId][fighterId] ?? 0) + points;
  return points;
}

export function awardWorldEliteSeasonPoints(
  season: WorldSeasonState,
  fighterId: string,
  result: "win" | "loss" | "defense" | "champion",
): number {
  const points = { win: 3, loss: 1, defense: 5, champion: 18 }[result];
  season.elitePoints[fighterId] = (season.elitePoints[fighterId] ?? 0) + points;
  return points;
}

export function worldEliteSeasonStandings(
  season: WorldSeasonState,
  fighters: readonly EnemyProfile[],
  heroName: string,
): WorldSeasonStanding[] {
  const names = new Map(fighters.map((fighter) => [fighter.id, fighter.name]));
  names.set("hero", heroName);
  return Object.entries(season.elitePoints)
    .filter(([fighterId, points]) => names.has(fighterId) && points > 0)
    .map(([fighterId, points]) => ({ fighterId, fighterName: names.get(fighterId)!, arenaId: "elite", points, place: 0 }))
    .sort((first, second) => second.points - first.points || first.fighterName.localeCompare(second.fighterName, "ru") || first.fighterId.localeCompare(second.fighterId))
    .map((standing, index) => ({ ...standing, place: index + 1 }));
}

export function worldSeasonStandings(
  season: WorldSeasonState,
  fighters: readonly EnemyProfile[],
  heroName: string,
): WorldSeasonStanding[] {
  const names = new Map(fighters.map((fighter) => [fighter.id, fighter.name]));
  names.set("hero", heroName);
  return ARENAS.flatMap((arena) => Object.entries(season.arenaPoints[arena.id] ?? {})
    .map(([fighterId, points]) => ({ fighterId, fighterName: names.get(fighterId) ?? fighterId, arenaId: arena.id, points, place: 0 }))
    .sort((first, second) => second.points - first.points || first.fighterName.localeCompare(second.fighterName, "ru"))
    .map((standing, index) => ({ ...standing, place: index + 1 })));
}

export function closeWorldSeason(
  season: WorldSeasonState,
  fighters: readonly EnemyProfile[],
  mentors: readonly MentorRecord[],
  heroName: string,
  newcomerIds: readonly string[],
): WorldSeasonResult {
  const standings = worldSeasonStandings(season, fighters, heroName);
  const fightersById = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const champions = ARENAS.map((arena) => standings.find((standing) => standing.arenaId === arena.id)).filter((entry): entry is WorldSeasonStanding => Boolean(entry));
  const localStandings = (arenaIndex: number) => standings.filter((standing) => {
    const fighter = fightersById.get(standing.fighterId);
    return standing.arenaId === ARENAS[arenaIndex].id && fighter?.alive && fighter.arenaIndex === arenaIndex;
  });
  const promotedIds = ARENAS.slice(0, -1).flatMap((_, arenaIndex) => localStandings(arenaIndex)
    .slice(0, 3)
    .filter((standing) => fightersById.get(standing.fighterId)!.level >= ARENAS[arenaIndex + 1].minLevel)
    .map((standing) => standing.fighterId));
  const promoted = new Set(promotedIds);
  const demotedIds = ARENAS.slice(1).flatMap((_, index) => localStandings(index + 1)
    .slice(-2)
    .filter((standing) => !promoted.has(standing.fighterId))
    .map((standing) => standing.fighterId));
  const retiredIds = fighters.filter((fighter) => fighter.retiredDay && fighter.retiredDay >= season.startsDay && fighter.retiredDay <= season.endsDay).map((fighter) => fighter.id);
  const mentorIds = mentors.filter((mentor) => mentor.retiredDay >= season.startsDay && mentor.retiredDay <= season.endsDay).map((mentor) => mentor.id);
  return {
    number: season.number,
    startsDay: season.startsDay,
    endsDay: season.endsDay,
    ruleId: season.ruleId,
    champions,
    eliteChampion: worldEliteSeasonStandings(season, fighters, heroName)[0],
    promotedIds: [...new Set(promotedIds)],
    demotedIds: [...new Set(demotedIds)],
    retiredIds,
    mentorIds,
    newcomerIds: [...new Set(newcomerIds)],
    summary: `Сезон ${season.number} завершён: чемпионов арен — ${champions.length}, повышений — ${new Set(promotedIds).size}, новых бойцов — ${new Set(newcomerIds).size}.`,
  };
}
