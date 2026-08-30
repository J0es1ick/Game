import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, type TurnReport } from "../../../../../../gameplay/core/Game";
import {
  PlayerFactory,
  type PlayerClass,
} from "../../../../../../factories/PlayerFactory";
import type { Player } from "../../../../../../abstract/Player";
import { gameAudio } from "../../../../app/audio/GameAudio";
import { BASIC_CLASS_LABELS } from "../../components/BasicPlayerForm/BasicPlayerForm";
import {
  BasicArenaBoard,
  type BasicMatchEntry,
} from "../../components/BasicArenaBoard/BasicArenaBoard";
import {
  BasicChronicle,
  BasicClassManual,
  BasicInspector,
  BasicRoster,
} from "../../components/BasicTournamentPanels/BasicTournamentPanels";
import {
  appendTournamentLog,
  ReactTournamentLogger,
  type BasicLogEntry,
} from "../../utils/BasicTournamentLog";
import "../../styles/components.css";

export function BasicTournament({ onExit }: { onExit: () => void }) {
  const [factory] = useState(() => new PlayerFactory());
  const [players, setPlayers] = useState<Player[]>([]);
  const [created, setCreated] = useState<Player[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [report, setReport] = useState<TurnReport | null>(null);
  const [logs, setLogs] = useState<BasicLogEntry[]>([]);
  const [matches, setMatches] = useState<BasicMatchEntry[]>([]);
  const [count, setCount] = useState(4);
  const [arena, setArena] = useState("Учебный двор");
  const [delay, setDelay] = useState(850);
  const [automatic, setAutomatic] = useState(false);
  const [muted, setMuted] = useState(gameAudio.isMuted);
  const sequence = useRef(0);
  const [tick, setTick] = useState(0);
  const running = game?.state === "battle";
  const finished = game?.state === "finished";
  const write = useCallback((message: string, result = false) => {
    const entry: BasicLogEntry = {
      id: ++sequence.current,
      time: new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      message,
      result,
    };
    setLogs((previous) => appendTournamentLog(previous, entry));
  }, []);
  const logger = useMemo(() => new ReactTournamentLogger(write), [write]);
  const samples = useMemo(
    () =>
      (Object.keys(BASIC_CLASS_LABELS) as PlayerClass[]).map((className) =>
        factory.create({
          className,
          name: className,
          health: 140,
          strength: 12,
        }),
      ),
    [factory],
  );

  const step = useCallback(() => {
    if (!game?.battleActive) {
      setAutomatic(false);
      return;
    }
    const round = game.round;
    const match = game.match;
    const fighters = [...game.battleFighters];
    const next = game.doStep();
    if (!next) return;
    gameAudio.basicTurn(next.damage, next.skipped, next.attacker.className);
    if (next.battleFinished && next.winner)
      setMatches((previous) => [
        ...previous,
        {
          round,
          match,
          first: fighters[0].name,
          second: fighters[1].name,
          winner: next.winner!.name,
        },
      ]);
    if (next.tournamentFinished) {
      setAutomatic(false);
      gameAudio.battleResult(true);
      write(`Турнир завершён. Чемпион — ${game.champion?.name}.`, true);
    }
    setReport(next);
    setTick((value) => value + 1);
  }, [game, write]);

  useEffect(() => {
    if (!automatic || !running) return;
    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [automatic, running, delay, step, tick]);

  const addPlayers = (newPlayers: Player[]) => {
    if (running) return;
    setPlayers((previous) => [...previous, ...newPlayers]);
    setCreated(newPlayers);
    write(
      `PlayerFactory.create() → добавлено участников: ${newPlayers.length}.`,
    );
  };
  const reset = () => {
    setAutomatic(false);
    game?.resetTournament();
    setGame(null);
    setReport(null);
    setMatches([]);
    write(
      "Game.resetTournament(): состояние турнира очищено, HP и эффекты участников восстановлены.",
    );
  };
  const start = () => {
    if (players.length < 2 || running) return;
    setAutomatic(false);
    const tournament = new Game(players, undefined, logger, {
      arenaName: arena,
    });
    tournament.startTournament();
    setGame(tournament);
    setReport(null);
    setMatches([]);
    gameAudio.battleStart(false);
  };

  return (
    <main className="basic-shell react-basic-shell" id="basic-shell">
      <header className="basic-header">
        <div>
          <p className="eyebrow">ПОШАГОВАЯ МОДЕЛЬ · TYPESCRIPT</p>
          <h1>Базовый турнир</h1>
          <p>
            Создавайте участников, разыгрывайте турнирную сетку и наблюдайте за
            вызовами методов во время каждого хода.
          </p>
        </div>
        <div className="basic-head-actions">
          <span id="basic-global-status">
            {finished
              ? `Победитель: ${game?.champion?.name}`
              : running
                ? `Раунд ${game!.round} · бой ${game!.match}`
                : `Участников: ${players.length}`}
          </span>
          <button
            className="plain-button sound-toggle"
            type="button"
            aria-pressed={muted}
            aria-label={muted ? "Включить звуки" : "Отключить звуки"}
            title={muted ? "Включить звуки" : "Отключить звуки"}
            onClick={() => setMuted(gameAudio.toggle())}
          >
            {muted ? "♩" : "♫"}
          </button>
          <button
            className="plain-button"
            onClick={() => {
              setAutomatic(false);
              onExit();
            }}
          >
            Сменить режим
          </button>
        </div>
      </header>
      <section
        className="basic-patterns paper-panel"
        aria-label="Последовательность механизмов"
      >
        {[
          ["Simple Factory", "PlayerFactory создаёт конкретный подкласс"],
          ["Template Method", "Player.attack() задаёт общий порядок хода"],
          ["Polymorphism", "Класс переопределяет часть поведения"],
          ["Strategy", "IArena изменяет итоговый урон"],
        ].map(([name, description], index) => (
          <article key={name}>
            <b>0{index + 1}</b>
            <strong>{name}</strong>
            <small>{description}</small>
          </article>
        ))}
      </section>
      <div className="basic-workbench">
        <BasicRoster
          players={players}
          game={game}
          factory={factory}
          count={count}
          onCountChange={setCount}
          onAdd={addPlayers}
          onReset={reset}
        />
        <BasicArenaBoard
          game={game}
          playerCount={players.length}
          arena={arena}
          delay={delay}
          automatic={automatic}
          matches={matches}
          onArenaChange={setArena}
          onDelayChange={setDelay}
          onStart={start}
          onStep={step}
          onToggleAutomatic={() => setAutomatic((value) => !value)}
        />
        <BasicInspector created={created} report={report} />
      </div>
      <BasicClassManual samples={samples} />
      <BasicChronicle logs={logs} onClear={() => setLogs([])} />
    </main>
  );
}
