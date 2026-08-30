import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import type {
  ActivityAvailability,
  GameSave,
  MentorRecord,
  NpcGoal,
  WorldRelicRecord,
} from "../core/WorldTypes";
import type { NarrativeEventDefinition } from "./NarrativeEvents";
import { NARRATIVE_EVENTS } from "./NarrativeEvents";
import { factionShopPrice } from "./FactionEconomy";
import { factionCampaignViews, factionMentorAccess } from "./FactionCampaign";
import { FACTION_CONTROL_EFFECTS, NPC_GOALS } from "./LivingWorld";
import type { FutureBossRecord, NpcLifeProfile } from "./NpcLifeSimulation";
import type { WorldSeasonResult, WorldSeasonStanding } from "./WorldSeason";
import { worldSeasonRule, worldSeasonStandings } from "./WorldSeason";
import type { CrownSeasonResult, CrownSeasonState } from "./CrownSeason";

export function factionController(save: GameSave, arenaId: string) {
  const factionId =
    save.factionControl?.arenaControllers[arenaId] ?? FACTIONS[0].id;
  const faction =
    FACTIONS.find((candidate) => candidate.id === factionId) ?? FACTIONS[0];
  return {
    ...faction,
    effect: FACTION_CONTROL_EFFECTS[faction.id]?.arena ?? "",
  };
}

export function shopController(save: GameSave) {
  const factionId = save.factionControl?.shopControllerId ?? FACTIONS[0].id;
  const faction =
    FACTIONS.find((candidate) => candidate.id === factionId) ?? FACTIONS[0];
  return {
    ...faction,
    effect: FACTION_CONTROL_EFFECTS[faction.id]?.shop ?? "",
    priceModifier:
      factionShopPrice(
        1_000,
        faction.id,
        save.hero.factionReputation[faction.id] ?? 0,
      ) / 1_000,
  };
}

export function livingMentors(save: GameSave): MentorRecord[] {
  return [...(save.mentors ?? [])].sort(
    (first, second) =>
      second.rating - first.rating || second.retiredDay - first.retiredDay,
  );
}

export function worldRelicChronicle(save: GameSave): WorldRelicRecord[] {
  return [...(save.worldRelics ?? [])].sort(
    (first, second) => second.createdDay - first.createdDay,
  );
}

export function fighterSchool(save: GameSave, fighterId: string) {
  const mentors = save.mentors ?? [];
  const mentor =
    mentors.find((candidate) => candidate.fighterId === fighterId) ??
    mentors.find((candidate) => candidate.studentIds.includes(fighterId));
  if (!mentor) return undefined;
  const dynasty = save.npcLife?.dynasties.find(
    (candidate) => candidate.id === mentor.dynastyId,
  );
  return {
    name: mentor.schoolName ?? dynasty?.name ?? `Школа «${mentor.name}»`,
    mentorName: mentor.name,
    isMentor: mentor.fighterId === fighterId,
  };
}

export function currentWorldSeason(save: GameSave) {
  const season = save.worldSeason!;
  return {
    ...season,
    arenaPoints: Object.fromEntries(
      Object.entries(season.arenaPoints).map(([arenaId, points]) => [
        arenaId,
        { ...points },
      ]),
    ),
    elitePoints: { ...season.elitePoints },
    fighterNames: { ...season.fighterNames },
    rule: worldSeasonRule(season.ruleId),
    remainingDays: Math.max(0, season.endsDay - save.worldDay + 1),
  };
}

export function completedWorldSeasons(save: GameSave): WorldSeasonResult[] {
  return [...(save.worldSeasonHistory ?? [])].reverse().map((season) => ({
    ...season,
    champions: season.champions.map((standing) => ({ ...standing })),
    eliteChampion: season.eliteChampion
      ? { ...season.eliteChampion }
      : undefined,
    promotedIds: [...season.promotedIds],
    demotedIds: [...season.demotedIds],
    retiredIds: [...season.retiredIds],
    mentorIds: [...season.mentorIds],
    newcomerIds: [...season.newcomerIds],
  }));
}

export function worldSeasonLeaderboard(
  save: GameSave,
  arenaId?: string,
): WorldSeasonStanding[] {
  const standings = worldSeasonStandings(
    save.worldSeason!,
    save.enemies,
    save.hero.name,
  );
  return arenaId
    ? standings.filter((standing) => standing.arenaId === arenaId)
    : standings;
}

export function npcLifeProfile(
  save: GameSave,
  fighterId: string,
): NpcLifeProfile | undefined {
  const profile = save.npcLife?.profiles[fighterId];
  return profile ? { ...profile } : undefined;
}

export function npcDynasties(save: GameSave) {
  return [...(save.npcLife?.dynasties ?? [])]
    .sort((first, second) => second.prestige - first.prestige)
    .map((dynasty) => ({ ...dynasty, memberIds: [...dynasty.memberIds] }));
}

export function factionCampaigns(save: GameSave) {
  return factionCampaignViews(
    save.factionCampaigns ?? {},
    save.hero.factionReputation,
  );
}

export function factionMentors(save: GameSave) {
  return factionMentorAccess(
    save.factionCampaigns ?? {},
    save.hero.factionReputation,
  ).map((access) => ({
    ...access,
    name:
      save.mentors?.find((mentor) => mentor.factionId === access.factionId)
        ?.name ??
      `Школа: ${FACTIONS.find((faction) => faction.id === access.factionId)?.name ?? access.factionId}`,
  }));
}

export function availableFutureBosses(save: GameSave): FutureBossRecord[] {
  return (save.npcLife?.futureBosses ?? [])
    .filter((boss) => boss.status === "available")
    .map((boss) => ({ ...boss }));
}

export function futureBossAvailability(
  save: GameSave,
  bossId: string,
): ActivityAvailability {
  const boss = save.npcLife?.futureBosses.find(
    (candidate) => candidate.id === bossId,
  );
  if (!boss)
    return {
      unlocked: false,
      reason: "Эта история ещё не породила особого противника.",
    };
  if (boss.status === "defeated")
    return {
      unlocked: false,
      reason: "Этот противник уже побеждён и остался в летописи.",
    };
  if (boss.status === "dormant")
    return {
      unlocked: false,
      reason: `След противника проявится не раньше дня ${boss.earliestAppearanceDay}.`,
    };
  return {
    unlocked: true,
    reason: `${boss.reason} Ожидаемая сила: уровень ${boss.powerLevel}.`,
  };
}

export function npcGoal(goal: NpcGoal | undefined) {
  return NPC_GOALS[goal ?? "champion"];
}

export function pendingNarrativeEvent(
  save: GameSave,
): NarrativeEventDefinition | undefined {
  return NARRATIVE_EVENTS.find(
    (event) => event.id === save.pendingNarrativeEventId,
  );
}

export function currentCrownSeason(save: GameSave): CrownSeasonState {
  return {
    ...save.crownSeason,
    ruleIds: [...save.crownSeason.ruleIds],
    points: { ...save.crownSeason.points },
    defenses: { ...save.crownSeason.defenses },
  };
}

export function lastCompletedCrownSeason(
  save: GameSave,
): CrownSeasonResult | undefined {
  return save.lastCrownSeasonResult
    ? { ...save.lastCrownSeasonResult }
    : undefined;
}

export function crownSeasonStandings(save: GameSave) {
  return Object.entries(save.crownSeason.points)
    .map(([fighterId, points]) => ({
      fighterId,
      name:
        fighterId === save.hero.id
          ? save.hero.name
          : (save.enemies.find((enemy) => enemy.id === fighterId)?.name ??
            fighterId),
      points,
      defenses: save.crownSeason.defenses[fighterId] ?? 0,
    }))
    .sort(
      (first, second) =>
        second.points - first.points ||
        second.defenses - first.defenses ||
        first.name.localeCompare(second.name),
    );
}
