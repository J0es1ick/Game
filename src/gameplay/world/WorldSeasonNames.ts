import type { GameSave } from "../core/WorldTypes";
import {
  knownSeasonFighterName,
  rememberWorldSeasonFighters,
  UNKNOWN_SEASON_FIGHTER_NAME,
} from "./WorldSeason";

export function restoreWorldSeasonNames(save: GameSave): void {
  const names = new Map<string, string>();
  const remember = (id: unknown, value: unknown): void => {
    if (typeof id !== "string" || !id) return;
    const name = knownSeasonFighterName(id, value);
    if (name) names.set(id, name);
  };
  const seasons = save.worldSeasonHistory ?? [];
  seasons.forEach((season) => {
    season.champions.forEach((champion) =>
      remember(champion.fighterId, champion.fighterName),
    );
    remember(
      season.eliteChampion?.fighterId,
      season.eliteChampion?.fighterName,
    );
  });
  Object.entries(save.worldSeason?.fighterNames ?? {}).forEach(([id, name]) =>
    remember(id, name),
  );
  remember(
    save.lastCrownSeasonResult?.championId,
    save.lastCrownSeasonResult?.championName,
  );
  (save.worldRelics ?? []).forEach((relic) =>
    remember(relic.currentOwnerId, relic.currentOwnerName),
  );
  if (Array.isArray(save.npcLife?.dynasties)) {
    save.npcLife.dynasties.forEach((dynasty) =>
      remember(dynasty.founderId, dynasty.founderName),
    );
  }
  if (Array.isArray(save.npcLife?.futureBosses)) {
    save.npcLife.futureBosses.forEach((boss) =>
      remember(boss.fighterId, boss.name),
    );
  }
  (save.mentors ?? []).forEach((mentor) =>
    remember(mentor.fighterId, mentor.name),
  );
  Object.values(save.hero.rivalries ?? {}).forEach((rival) =>
    remember(rival.enemyId, rival.name),
  );
  [...save.events].reverse().forEach((event) => {
    const payload = event.payload;
    if (!payload) return;
    switch (payload.kind) {
      case "battle":
        remember(payload.actorId, payload.actorName);
        remember(payload.targetId, payload.targetName);
        break;
      case "tournament":
        remember(payload.championId, payload.championName);
        break;
      case "death":
        remember(payload.fighterId, payload.fighterName);
        remember(payload.killerId, payload.killerName);
        break;
      case "dungeon":
      case "promotion":
      case "loot":
      case "narrative":
        remember(payload.fighterId, payload.fighterName);
        break;
    }
  });
  remember(save.pendingBattle?.enemy.id, save.pendingBattle?.enemy.name);
  save.enemies.forEach((fighter) => remember(fighter.id, fighter.name));
  remember("hero", save.hero.name);
  if (save.worldSeason) {
    rememberWorldSeasonFighters(
      save.worldSeason,
      [...names].map(([id, name]) => ({ id, name })),
    );
  }
  seasons.forEach((season) => {
    [
      ...season.champions,
      ...(season.eliteChampion ? [season.eliteChampion] : []),
    ].forEach((champion) => {
      champion.fighterName =
        knownSeasonFighterName(champion.fighterId, champion.fighterName) ??
        names.get(champion.fighterId) ??
        UNKNOWN_SEASON_FIGHTER_NAME;
    });
  });
}
