import { legacyTitleForCycle } from "../../../../../../catalogs/NewGamePlusCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { useBeginBattle } from "../../../../app/state/useBeginBattle";
import { css } from "../../../../shared/ui/common";

function EraChallengePanel() {
  const { game } = useGame();
  const challenge = game.currentEraChallenge();
  const goal = game.epochFinalGoalProgress();
  if (!challenge) return null;

  return (
    <section className="era-challenge-panel">
      <header>
        <small>ИСПЫТАНИЕ ЭПОХИ {challenge.cycle}</small>
        <strong>{challenge.name}</strong>
      </header>
      <div className="era-objective-list">
        {game.eraObjectiveProgress().map((entry) => (
          <article
            key={entry.objective.id}
            className={entry.completed ? "complete" : ""}
          >
            <div>
              <b>{entry.objective.name}</b>
              <span>
                {entry.current}/{entry.target}
              </span>
            </div>
            <p>{entry.objective.description}</p>
            <div className="era-objective-meter">
              <i style={{ width: `${Math.round(entry.ratio * 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
      {goal && (
        <section className="epoch-final-goal">
          <p className="eyebrow">ОБЯЗАТЕЛЬНАЯ ЦЕЛЬ ЭПОХИ</p>
          <h3>{goal.name}</h3>
          <p>{goal.description}</p>
          {goal.requirements.map((requirement) => (
            <p
              key={requirement.label}
              className={requirement.met ? "goal-complete" : ""}
            >
              {requirement.met ? "✓" : "—"} {requirement.label}
            </p>
          ))}
          <strong>
            {goal.completed
              ? "Финальная цель выполнена"
              : "Выполните цель, чтобы завершить эпоху."}
          </strong>
        </section>
      )}
    </section>
  );
}

export function NewChronicleStatus() {
  const { game, openDialog, navigate } = useGame();
  const begin = useBeginBattle();
  const status = game.newGamePlusStatus();
  const completed = status.requirements.filter(
    (requirement) => requirement.met,
  ).length;
  const progress = (completed / Math.max(1, status.requirements.length)) * 100;
  const legacy = game.legacyChampionAvailability();
  const archiveCount = game.save.legacy.archives.length;

  return (
    <section
      className={`new-chronicle-status paper-panel${status.unlocked ? " available" : ""}`}
      id="new-chronicle-status"
    >
      <div>
        <p className="eyebrow">
          ЭПОХА {game.save.legacy.cycle} ·{" "}
          {legacyTitleForCycle(game.save.legacy.cycle + 1).toUpperCase()}
        </p>
        <h3 data-term="newChronicle" tabIndex={0}>
          Завершение летописи
        </h3>
        <p>
          {status.unlocked
            ? `Мир готов отпустить героя. За переход будет получено ${status.sealsAwarded} печатей летописи.`
            : "Новая эпоха — не удаление сохранения, а продолжение истории другим героем."}
        </p>
      </div>
      <div className="new-chronicle-progress">
        <strong>
          {completed} из {status.requirements.length} условий
        </strong>
        <div
          className="new-chronicle-progress-line"
          style={css({ "--chronicle-progress": `${progress}%` })}
        >
          <i />
        </div>
        <ul className="chronicle-requirements">
          {status.requirements.map((requirement) => (
            <li
              key={requirement.label}
              className={`chronicle-requirement ${requirement.met ? "complete" : "locked"}`}
            >
              {requirement.label}
            </li>
          ))}
        </ul>
        <EraChallengePanel />
      </div>
      <div className="chronicle-status-actions">
        <button
          type="button"
          className="button primary"
          disabled={!status.unlocked}
          onClick={() => openDialog({ kind: "new-chronicle" })}
        >
          {status.unlocked
            ? `Начать эпоху ${status.targetCycle}`
            : "Путь ещё не завершён"}
        </button>
        {archiveCount > 0 && (
          <>
            <button
              type="button"
              className="plain-button"
              onClick={() => navigate("history", "epoch-history-view")}
            >
              Архив эпох · {archiveCount}
            </button>
            <button
              type="button"
              className="plain-button"
              disabled={!legacy.unlocked}
              title={legacy.reason}
              onClick={() => begin((current) => current.beginLegacyChampion())}
            >
              {legacy.unlocked
                ? "Вызвать героя прошлого"
                : "Герой прошлого закрыт"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
