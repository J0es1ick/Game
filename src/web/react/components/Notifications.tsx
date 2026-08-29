import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ARENAS } from "../../../catalogs/WorldCatalog";
import { gameAudio } from "../../GameAudio";
import { useAppState, useGame, useGameStore } from "../state/GameContext";
import { effectChannel, type EffectNotice } from "../state/NotificationState";
import { useBeginBattle } from "../state/useBeginBattle";
import { useNoticeLayout } from "./NotificationLayout";
import "./notifications-react.css";

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
      className={`react-notice react-event-notice ${effect.tone ?? "neutral"} effect-${effect.variant ?? "standard"}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span className="notice-symbol" aria-hidden="true">
        {effect.symbol ?? "✦"}
      </span>
      <div className="notice-copy">
        <small className="notice-eyebrow">{effect.eyebrow}</small>
        <h3 className="notice-title">{effect.title}</h3>
        {effect.description && <p>{effect.description}</p>}
        {effect.stats?.length ? (
          <div className="notice-stats">
            {effect.stats.map((stat, index) => (
              <span key={index}>{stat}</span>
            ))}
          </div>
        ) : null}
        {effect.action && (
          <button
            className="notice-button notice-action"
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
        className="notice-close"
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
  const visible =
    mode === "world" &&
    !dialogs.some((dialog) => dialog.kind === "new-chronicle");
  const banner = effects.find((entry) => effectChannel(entry) === "banner");
  const corner = effects.find((entry) => effectChannel(entry) === "corner");
  const bannerRef = useNoticeLayout<HTMLDivElement>(
    "banner",
    visible && Boolean(banner),
  );
  const cornerRef = useNoticeLayout<HTMLDivElement>(
    "corner",
    visible && Boolean(corner),
  );
  if (!visible) return null;
  return createPortal(
    <>
      <div
        id="world-effect-stage"
        ref={cornerRef}
        className="react-notice-stage"
        aria-live="polite"
        aria-atomic="true"
      >
        {corner && <EffectCard key={corner.id} effect={corner} />}
      </div>
      <div
        id="world-announcement-stage"
        ref={bannerRef}
        className="react-notice-stage react-announcement-stage"
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
  const visible =
    (arenas.length > 0 || crown) &&
    dismissed !== key &&
    !loot.length &&
    !dialogs.length;
  const panelRef = useNoticeLayout<HTMLElement>("panel", visible);
  if (!visible) return null;
  return createPortal(
    <aside
      id="tournament-reminder"
      ref={panelRef}
      className="react-notice react-notice-panel react-tournament-reminder"
      aria-label="События сегодняшнего дня"
    >
      <header className="notice-heading">
        <div>
          <p className="notice-eyebrow">ДЕНЬ {day} · ВЫ ЗАПИСАНЫ</p>
          <h3 className="notice-title">Пора на турнир</h3>
        </div>
        <button
          className="notice-close"
          aria-label="Скрыть напоминание"
          onClick={() => setDismissed(key)}
        >
          ×
        </button>
      </header>
      <div className="notice-tournament-list">
        {arenas.map((arena) => (
          <div className="notice-tournament-row" key={arena.id}>
            <strong>{arena.name}</strong>
            <button
              className="notice-button is-primary"
              onClick={() =>
                begin((current) => current.beginTournament(arena.id))
              }
            >
              Начать
            </button>
          </div>
        ))}
        {crown && (
          <div className="notice-tournament-row">
            <strong>Лига короны</strong>
            <button
              className="notice-button is-primary"
              onClick={() => begin((current) => current.beginCrownLeague())}
            >
              Начать
            </button>
          </div>
        )}
      </div>
      <button
        className="notice-button notice-calendar"
        onClick={() => {
          setDismissed(key);
          navigate("map", crown ? "endgame-section" : "tournaments-section");
        }}
      >
        <span>Открыть календарь</span>
        <span aria-hidden="true">↗</span>
      </button>
    </aside>,
    document.body,
  );
}
