import type { Player } from "../../../../../../abstract/Player";
import type { Game } from "../../../../../../gameplay/core/Game";
import type { PlayerClass } from "../../../../../../factories/PlayerFactory";
import { BASIC_CLASS_LABELS } from "../BasicPlayerForm/BasicPlayerForm";

export interface BasicMatchEntry {
  round: number;
  match: number;
  first: string;
  second: string;
  winner: string;
}

function Fighter({
  fighter,
  prefix,
}: {
  fighter?: Player;
  prefix: "first" | "second";
}) {
  return (
    <article>
      <small>БОЕЦ {prefix === "first" ? "I" : "II"}</small>
      <h3 id={`basic-${prefix}`}>{fighter?.name ?? "—"}</h3>
      <p>
        {fighter
          ? `${BASIC_CLASS_LABELS[fighter.className as PlayerClass]} · ${fighter.weapon.name} · ${fighter.mechanic.method}`
          : "Метод ещё не вызван"}
      </p>
      <div className="basic-health">
        <i
          style={{
            width: fighter
              ? `${Math.max(0, (fighter.health / fighter.initialHealth) * 100)}%`
              : "0%",
          }}
        />
      </div>
      <footer>
        {fighter
          ? `HP ${Math.ceil(fighter.health)} / ${fighter.initialHealth} · STR ${fighter.strength}`
          : "HP 0 · STR 0"}
      </footer>
    </article>
  );
}

export function BasicArenaBoard({
  game,
  playerCount,
  arena,
  delay,
  automatic,
  matches,
  onArenaChange,
  onDelayChange,
  onStart,
  onStep,
  onToggleAutomatic,
}: {
  game: Game | null;
  playerCount: number;
  arena: string;
  delay: number;
  automatic: boolean;
  matches: readonly BasicMatchEntry[];
  onArenaChange: (value: string) => void;
  onDelayChange: (value: number) => void;
  onStart: () => void;
  onStep: () => void;
  onToggleAutomatic: () => void;
}) {
  const running = game?.state === "battle";
  const finished = game?.state === "finished";
  return (
    <section className="paper-panel basic-arena-board">
      <header>
        <div>
          <p className="eyebrow">
            {finished
              ? "B · ТУРНИР ЗАВЕРШЁН"
              : running
                ? `B · РАУНД ${game!.round}`
                : "B · СОСТОЯНИЕ ТУРНИРА"}
          </p>
          <h2 id="basic-status">
            {finished
              ? `Чемпион: ${game?.champion?.name}`
              : running
                ? game?.currentArena?.name
                : "Турнир не запущен"}
          </h2>
          <small>
            {finished
              ? "Последний соперник побеждён."
              : (game?.currentArena?.description ??
                "Добавьте участников и запустите сетку.")}
          </small>
        </div>
        <span id="basic-match">
          ХОД {String(game?.turn ?? 0).padStart(3, "0")}
        </span>
      </header>
      <div className="basic-versus">
        <Fighter fighter={game?.battleFighters[0]} prefix="first" />
        <b>VS</b>
        <Fighter fighter={game?.battleFighters[1]} prefix="second" />
      </div>
      <div className="basic-control-deck">
        <label>
          Арена
          <select
            id="basic-arena"
            value={arena}
            disabled={running}
            onChange={(event) => onArenaChange(event.target.value)}
          >
            {["Учебный двор", "Вулканический кратер", "Древние руины"].map(
              (name) => (
                <option key={name}>{name}</option>
              ),
            )}
          </select>
        </label>
        <button
          className="button primary"
          id="basic-create"
          disabled={playerCount < 2 || running}
          onClick={onStart}
        >
          Начать турнир
        </button>
        <button
          className="button"
          id="basic-step"
          disabled={!running}
          onClick={onStep}
        >
          Выполнить ход
        </button>
        <button
          className="button"
          id="basic-auto"
          disabled={!running}
          onClick={onToggleAutomatic}
        >
          {automatic ? "Приостановить" : "Автовыполнение"}
        </button>
        <label className="basic-speed">
          Задержка между ходами
          <input
            type="range"
            id="basic-delay"
            min={150}
            max={2500}
            step={50}
            value={delay}
            onChange={(event) => onDelayChange(Number(event.target.value))}
          />
          <output>{(delay / 1000).toFixed(2)} с</output>
        </label>
      </div>
      {matches.length > 0 && (
        <details className="basic-bracket">
          <summary>Турнирная сетка · завершено {matches.length} боёв</summary>
          <div className="bracket-strip">
            {matches.map((match) => (
              <article key={`${match.round}-${match.match}`}>
                <small>
                  РАУНД {match.round} · БОЙ {match.match}
                </small>
                <span>
                  {match.first} × {match.second}
                </span>
                <strong>→ {match.winner}</strong>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
