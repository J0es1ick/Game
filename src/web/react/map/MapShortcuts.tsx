import type { Ref } from "react";
import {
  ARENAS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
} from "../../../catalogs/WorldCatalog";
import type { WorldGame } from "../../../gameplay/WorldGame";
import { useGame } from "../state/GameContext";

interface MapShortcut {
  id: string;
  name: string;
  status: string;
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
      id: "daily-actions-section",
      name: "Тренировка",
      status:
        game.save.hero.level >= game.trainingLevelCap()
          ? "Достигнут предел"
          : "Безопасный опыт",
    },
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
    { id: "endgame-section", name: "Эндгейм", status: endgameStatus(game) },
  ];
}

export function MapShortcuts({
  navigationRef,
}: {
  navigationRef?: Ref<HTMLElement>;
}) {
  const { game, navigate } = useGame();

  return (
    <nav
      className="map-shortcuts"
      aria-label="Быстрый доступ к активностям"
      ref={navigationRef}
    >
      <span>Быстрый переход</span>
      {mapShortcuts(game).map(({ id, name, status }) => (
        <button
          type="button"
          key={id}
          data-scroll-target={id}
          onClick={() => navigate("map", id)}
        >
          <b>{name}</b>
          <small>{status}</small>
        </button>
      ))}
    </nav>
  );
}
