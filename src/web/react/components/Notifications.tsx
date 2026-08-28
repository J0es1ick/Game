import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ARENAS } from "../../../catalogs/WorldCatalog";
import { gameAudio } from "../../GameAudio";
import { useAppState, useGame, useGameStore } from "../state/GameContext";
import { effectChannel, type EffectNotice } from "../state/NotificationState";
import { useBeginBattle } from "../state/useBeginBattle";

function EffectCard({ effect }: { effect: EffectNotice }) {
  const store = useGameStore();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(effect.duration ?? 4200);
  const onScreen = useRef(0);
  useEffect(() => {
    if (effect.sound) gameAudio.event(effect.sound);
  }, [effect.id]);
  useEffect(() => {
    if (paused) return;
    onScreen.current = performance.now();
    const timer = window.setTimeout(
      () => store.dismissEffect(effect.id),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (performance.now() - onScreen.current),
      );
    };
  }, [paused, effect.id, store]);
  return (
    <article
      className={`world-effect-card ${effect.tone ?? "neutral"} effect-${effect.variant ?? "standard"}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span className="world-effect-symbol" aria-hidden="true">
        {effect.symbol ?? "✦"}
      </span>
      <div>
        <small>{effect.eyebrow}</small>
        <h3>{effect.title}</h3>
        {effect.description && <p>{effect.description}</p>}
        {effect.stats?.length ? (
          <div className="world-effect-stats">
            {effect.stats.map((stat, index) => (
              <span key={index}>{stat}</span>
            ))}
          </div>
        ) : null}
        {effect.action && (
          <button
            className="world-effect-action"
            onClick={() => {
              effect.action!.run();
              store.dismissEffect(effect.id);
            }}
          >
            {effect.action.label}
          </button>
        )}
      </div>
      <button
        className="world-effect-close"
        aria-label="Закрыть уведомление"
        onClick={() => store.dismissEffect(effect.id)}
      >
        ×
      </button>
    </article>
  );
}

export function NotificationDeck() {
  const { effects, mode, dialogs } = useAppState();
  if (
    mode !== "world" ||
    dialogs.some((dialog) => dialog.kind === "new-chronicle")
  )
    return null;
  const banner = effects.find((entry) => effectChannel(entry) === "banner");
  const corner = effects.find((entry) => effectChannel(entry) === "corner");
  return createPortal(
    <>
      <div
        id="world-effect-stage"
        className="world-effect-stage"
        aria-live="polite"
        aria-atomic="true"
      >
        {corner && <EffectCard key={corner.id} effect={corner} />}
      </div>
      <div
        id="world-announcement-stage"
        className="world-effect-stage world-announcement-stage"
        aria-live="polite"
        aria-atomic="true"
      >
        {banner && <EffectCard key={banner.id} effect={banner} />}
      </div>
    </>,
    document.body,
  );
}

export function TournamentReminder() {
  const { game, navigate } = useGame();
  const { dialogs, loot } = useAppState();
  const begin = useBeginBattle();
  const [dismissed, setDismissed] = useState("");
  const day = game.save.worldDay;
  const arenas = ARENAS.filter(
    (arena) => game.registeredTournamentDay(arena.id) === day,
  );
  const crown = game.registeredCrownLeagueDay() === day;
  const key = `${day}:${arenas.map((arena) => arena.id).join(",")}:${crown}`;
  if (
    (!arenas.length && !crown) ||
    dismissed === key ||
    loot.length ||
    dialogs.length
  )
    return null;
  return createPortal(
    <aside
      id="tournament-reminder"
      className="tournament-reminder"
      aria-label="События сегодняшнего дня"
    >
      <button
        className="reminder-close"
        aria-label="Скрыть напоминание"
        onClick={() => setDismissed(key)}
      >
        ×
      </button>
      <p className="eyebrow">ДЕНЬ {day} · ВЫ ЗАПИСАНЫ</p>
      <h3>Пора на турнир</h3>
      <div className="tournament-reminder-list">
        {arenas.map((arena) => (
          <div key={arena.id}>
            <strong>{arena.name}</strong>
            <button
              className="button primary"
              onClick={() =>
                begin((current) => current.beginTournament(arena.id))
              }
            >
              Начать
            </button>
          </div>
        ))}
        {crown && (
          <div>
            <strong>Лига короны</strong>
            <button
              className="button primary"
              onClick={() => begin((current) => current.beginCrownLeague())}
            >
              Начать
            </button>
          </div>
        )}
      </div>
      <button
        className="plain-button"
        onClick={() => {
          setDismissed(key);
          navigate("map", crown ? "endgame-section" : "tournaments-section");
        }}
      >
        Открыть календарь
      </button>
    </aside>,
    document.body,
  );
}
