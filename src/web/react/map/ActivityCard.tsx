import type { ReactNode } from "react";
import type {
  ArenaDefinition,
  DungeonDefinition,
} from "../../../gameplay/WorldTypes";
import { useGame } from "../state/GameContext";
import { useBeginBattle } from "../state/useBeginBattle";
import { css } from "../components/common";

interface ActivityCardProps {
  activity: ArenaDefinition | DungeonDefinition;
  index: number;
}

function ActivitySurface({
  activity,
  index,
  children,
  locked,
  reason,
  action,
}: ActivityCardProps & {
  children: ReactNode;
  locked: boolean;
  reason: string;
  action: ReactNode;
}) {
  return (
    <article
      className={`activity-card ${activity.kind}${locked ? " locked" : ""}`}
      style={css({ "--activity-accent": activity.accent })}
      data-activity-id={activity.id}
    >
      <div className="activity-head">
        <span className="activity-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <small>{activity.place}</small>
      </div>
      <h3>{activity.name}</h3>
      <p>{activity.description}</p>
      {children}
      <div className="activity-state">{reason}</div>
      {action}
    </article>
  );
}

function TournamentCard({
  arena,
  index,
}: {
  arena: ArenaDefinition;
  index: number;
}) {
  const { game, act, notify } = useGame();
  const begin = useBeginBattle();
  const availability = game.availability(arena);
  const registeredDay = game.registeredTournamentDay(arena.id);
  const today = registeredDay === game.save.worldDay;
  const nextDay = registeredDay ?? game.nextTournamentDay(arena.id);
  const controller = game.factionController(arena.id);
  const rules = game.tournamentRules(arena.id, nextDay);
  const disabled =
    !availability.unlocked || (registeredDay !== undefined && !today);
  const label = !availability.unlocked
    ? "Закрыто"
    : today
      ? "Начать турнир"
      : registeredDay
        ? `Записан на день ${registeredDay}`
        : `Записаться на день ${nextDay}`;

  const start = () => {
    if (today) {
      begin((current) => current.beginTournament(arena.id));
      return;
    }
    const day = act((current) => current.registerTournament(arena.id));
    if (day !== undefined)
      notify({
        eyebrow: "КАЛЕНДАРЬ ТУРНИРОВ",
        title: `Запись на день ${day}`,
        description:
          "Место в сетке закреплено за героем. В день события появится напоминание.",
        symbol: "◇",
        sound: "choice",
      });
  };

  return (
    <ActivitySurface
      activity={arena}
      index={index}
      locked={!availability.unlocked}
      reason={availability.reason}
      action={
        <button
          type="button"
          className="button activity-button"
          disabled={disabled}
          onClick={start}
        >
          {label}
        </button>
      }
    >
      <div
        className="activity-controller"
        style={css({ "--faction-accent": controller.accent })}
      >
        <small>АРЕНОЙ УПРАВЛЯЕТ</small>
        <strong>{controller.name}</strong>
        <span>{controller.effect}</span>
      </div>
      {rules.length > 0 && (
        <div
          className="activity-rules"
          title={rules
            .map((rule) => `${rule.name}: ${rule.description}`)
            .join("\n")}
        >
          {rules.map((rule) => rule.name).join(" · ")}
        </div>
      )}
      <div className="activity-levels">
        Сетка: {arena.participants} · каждые {arena.tournamentInterval} дн. ·
        приз {arena.rewardGold} ¤
      </div>
    </ActivitySurface>
  );
}

function DungeonCard({
  dungeon,
  index,
}: {
  dungeon: DungeonDefinition;
  index: number;
}) {
  const { game, act, openDialog } = useGame();
  const availability = game.availability(dungeon);
  const active = game.save.activeExpedition?.dungeonId === dungeon.id;
  const busy = Boolean(game.save.activeExpedition) && !active;
  const disabled = (!availability.unlocked && !active) || busy;
  const label = active
    ? "Продолжить поход"
    : busy
      ? "Сначала завершите текущий поход"
      : availability.unlocked
        ? "Начать вылазку"
        : "Закрыто";

  const start = () => {
    if (active || act((current) => current.startExpedition(dungeon.id)))
      openDialog({ kind: "dungeon" });
  };

  return (
    <ActivitySurface
      activity={dungeon}
      index={index}
      locked={!availability.unlocked && !active}
      reason={availability.reason}
      action={
        <button
          type="button"
          className="button activity-button"
          disabled={disabled}
          onClick={start}
        >
          {label}
        </button>
      }
    >
      <div className="activity-levels">
        Уровни врагов: {dungeon.enemyLevel.join("–")}
      </div>
    </ActivitySurface>
  );
}

export function ActivityCard({ activity, index }: ActivityCardProps) {
  return activity.kind === "arena" ? (
    <TournamentCard arena={activity} index={index} />
  ) : (
    <DungeonCard dungeon={activity} index={index} />
  );
}
