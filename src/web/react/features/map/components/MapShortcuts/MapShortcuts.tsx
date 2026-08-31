import type { Ref } from "react";
import {
  ARENAS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
} from "../../../../../../catalogs/WorldCatalog";
import type { WorldGame } from "../../../../../../gameplay/core/WorldGame";
import { useGame } from "../../../../app/state/GameContext";

export const MAP_SECTION_IDS = [
  "duels-section",
  "bosses-section",
  "tournaments-section",
  "dungeons-section",
  "endgame-section",
] as const;

export type MapSectionId = (typeof MAP_SECTION_IDS)[number];

interface MapShortcut {
  id: MapSectionId;
  name: string;
  status: string;
}

export function isMapSectionId(
  value: string | undefined,
): value is MapSectionId {
  return MAP_SECTION_IDS.includes(value as MapSectionId);
}

function endgameStatus(game: WorldGame): string {
  if (game.pendingLegendChallenge()) return "Защитите титул";
  if (game.newGamePlusStatus().unlocked)
    return `Эпоха ${game.save.legacy.cycle + 1} готова`;
  if (game.legendHuntAvailability().unlocked) return "Легенда найдена";
  if (game.crownLeagueAvailability().unlocked)
    return game.crownLeagueTier().name;
  const registeredDay = game.registeredCrownLeagueDay();
  return registeredDay ? `Лига: день ${registeredDay}` : "Закрыто";
}

export function mapShortcuts(game: WorldGame): MapShortcut[] {
  const today = game.save.worldDay;
  const tournamentsToday =
    ARENAS.filter((arena) => game.registeredTournamentDay(arena.id) === today)
      .length + Number(game.registeredCrownLeagueDay() === today);
  const bosses = DUEL_BOSSES.filter(
    (boss) =>
      !game.save.defeatedBosses.includes(boss.id) &&
      game.availability(boss).unlocked,
  ).length;

  return [
    {
      id: "duels-section",
      name: "Дуэли",
      status: `${DUEL_TIERS.filter((duel) => game.availability(duel).unlocked).length} доступно`,
    },
    {
      id: "bosses-section",
      name: "Боссы",
      status: bosses > 0 ? `${bosses} готовы к бою` : "Нет доступных",
    },
    {
      id: "tournaments-section",
      name: "Турниры",
      status:
        tournamentsToday > 0
          ? `${tournamentsToday} сегодня`
          : `${ARENAS.filter((arena) => game.availability(arena).unlocked).length} открыто`,
    },
    {
      id: "dungeons-section",
      name: "Данжи",
      status: game.save.activeExpedition
        ? "Поход продолжается"
        : `${DUNGEONS.filter((dungeon) => game.availability(dungeon).unlocked).length} доступно`,
    },
    { id: "endgame-section", name: "Корона", status: endgameStatus(game) },
  ];
}

export function MapShortcuts({
  navigationRef,
  activeId,
}: {
  navigationRef?: Ref<HTMLElement>;
  activeId?: MapSectionId;
}) {
  const { game, navigate } = useGame();

  return (
    <nav
      className="map-shortcuts"
      aria-label="Быстрый доступ к активностям"
      ref={navigationRef}
    >
      {mapShortcuts(game).map(({ id, name, status }) => (
        <button
          type="button"
          key={id}
          data-scroll-target={id}
          className={activeId === id ? "active" : ""}
          aria-pressed={activeId === id}
          aria-controls="map-activity-panel"
          onClick={() => navigate("map", id)}
        >
          <b>{name}</b>
          <small>{status}</small>
        </button>
      ))}
    </nav>
  );
}
