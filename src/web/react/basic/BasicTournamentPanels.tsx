import type { Player } from "../../../abstract/Player";
import type { Game, TurnReport } from "../../../gameplay/Game";
import type {
  PlayerFactory,
  PlayerClass,
} from "../../../factories/PlayerFactory";
import { PagedList } from "../components/common";
import { BASIC_CLASS_LABELS, BasicPlayerForm } from "./BasicPlayerForm";
import {
  BASIC_TOURNAMENT_LOG_LIMIT,
  type BasicLogEntry,
} from "./BasicTournamentLog";

export function BasicRoster({
  players,
  game,
  factory,
  count,
  onCountChange,
  onAdd,
  onReset,
}: {
  players: readonly Player[];
  game: Game | null;
  factory: PlayerFactory;
  count: number;
  onCountChange: (value: number) => void;
  onAdd: (players: Player[]) => void;
  onReset: () => void;
}) {
  const running = game?.state === "battle";
  const eliminated = new Set(game?.eliminated ?? []);
  return (
    <aside className="paper-panel basic-roster">
      <header>
        <div>
          <p className="eyebrow">A · ВХОДНЫЕ ДАННЫЕ</p>
          <h2>Участники</h2>
        </div>
        <span>{String(players.length).padStart(2, "0")}</span>
      </header>
      <div className="basic-random-loader">
        <label>
          Случайные бойцы
          <select
            id="basic-player-count"
            value={count}
            disabled={running}
            onChange={(event) => onCountChange(Number(event.target.value))}
          >
            {[2, 4, 8, 16, 32].map((value) => (
              <option key={value} value={value}>
                {value} бойцов
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          id="basic-add-random"
          disabled={running}
          onClick={() => onAdd(factory.createMany(count))}
        >
          Добавить
        </button>
        <button
          className="button icon-button"
          id="basic-reset"
          title="Сбросить турнир"
          onClick={onReset}
        >
          ↺
        </button>
      </div>
      <div id="basic-roster">
        {players.length ? (
          players.map((fighter, index) => (
            <div
              key={index}
              className={`basic-roster-row${eliminated.has(fighter) ? " eliminated" : ""}${running && game?.battleFighters.includes(fighter) ? " active" : ""}`}
            >
              <strong>{fighter.name}</strong>
              <small>
                {BASIC_CLASS_LABELS[fighter.className as PlayerClass]} · ур.{" "}
                {fighter.level}
              </small>
              <code>{fighter.mechanic.method}</code>
            </div>
          ))
        ) : (
          <div className="basic-roster-row">
            Добавьте случайных бойцов или создайте участника вручную.
          </div>
        )}
      </div>
      <BasicPlayerForm
        factory={factory}
        disabled={Boolean(running)}
        onCreate={(fighter) => onAdd([fighter])}
      />
    </aside>
  );
}

export function BasicInspector({
  created,
  report,
}: {
  created: readonly Player[];
  report: TurnReport | null;
}) {
  return (
    <aside className="paper-panel basic-inspector">
      <header>
        <div>
          <p className="eyebrow">C · ЛОГИКА ХОДА</p>
          <h2>Выполненные методы</h2>
        </div>
      </header>
      <div className="basic-factory-trace">
        <small>РЕЗУЛЬТАТ PLAYERFACTORY.CREATE()</small>
        <strong>
          {created.length
            ? `PlayerFactory.create() × ${created.length}`
            : "Участники ещё не создавались"}
        </strong>
        <p>
          {created.length
            ? created
                .map(
                  (fighter) =>
                    `${fighter.name}: new ${fighter.constructor.name}()`,
                )
                .join(" · ")
            : "Здесь появятся фактически созданные подклассы Player."}
        </p>
      </div>
      <ol id="basic-trace">
        {report ? (
          report.insights.map((insight, index) => (
            <li
              key={index}
              className={insight.principle.toLowerCase().replace(" ", "-")}
            >
              <b>{insight.principle}</b>
              <code>{insight.method}</code>
              <span>{insight.description}</span>
            </li>
          ))
        ) : (
          <li>Начните турнир и выполните первый ход.</li>
        )}
      </ol>
      <div className="basic-trace-legend">
        <span>
          <i />
          Template Method
        </span>
        <span>
          <i className="green" />
          Polymorphism
        </span>
        <span>
          <i className="yellow" />
          Strategy
        </span>
      </div>
    </aside>
  );
}

export function BasicClassManual({ samples }: { samples: readonly Player[] }) {
  return (
    <section className="paper-panel basic-class-manual">
      <header>
        <p className="eyebrow">ПОЛИМОРФИЗМ PLAYER</p>
        <h2>Различия в поведении классов</h2>
      </header>
      <div id="basic-class-manual">
        {samples.map((sample) => (
          <article key={sample.className}>
            <small>{sample.className?.toUpperCase()}</small>
            <h3>{sample.mechanic.title}</h3>
            <code>{sample.mechanic.method}</code>
            <p>{sample.mechanic.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BasicChronicle({
  logs,
  onClear,
}: {
  logs: BasicLogEntry[];
  onClear: () => void;
}) {
  return (
    <section className="paper-panel basic-chronicle">
      <header>
        <div>
          <p className="eyebrow">D · ПОСЛЕДОВАТЕЛЬНОСТЬ ВЫЗОВОВ</p>
          <h2>Журнал турнира</h2>
        </div>
        <button className="plain-button" id="basic-clear-log" onClick={onClear}>
          Очистить журнал
        </button>
      </header>
      <p>
        Хранятся последние {BASIC_TOURNAMENT_LOG_LIMIT.toLocaleString("ru-RU")}{" "}
        записей, новые сверху. Более ранние события удаляются автоматически.
      </p>
      <PagedList
        items={logs}
        className="basic-log"
        pageSize={100}
        getKey={(entry) => String(entry.id)}
        render={(entry) => (
          <p className={entry.result ? "result" : ""}>
            <time>{entry.time}</time>
            <span>{entry.message}</span>
          </p>
        )}
        empty="Добавляйте участников вручную или случайным набором."
      />
    </section>
  );
}
