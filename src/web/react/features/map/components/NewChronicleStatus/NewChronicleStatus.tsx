import { useGame } from "../../../../app/state/GameContext";
import { css } from "../../../../shared/ui/common";

export function NewChronicleStatus() {
  const { game, openDialog } = useGame();
  const status = game.newGamePlusStatus();
  const completed = status.requirements.filter(
    (requirement) => requirement.met,
  ).length;
  const progress = (completed / Math.max(1, status.requirements.length)) * 100;

  return (
    <section
      className={`new-chronicle-status paper-panel${status.unlocked ? " available" : ""}`}
      id="new-chronicle-status"
    >
      <div className="chronicle-action-copy">
        <span aria-hidden="true">{status.unlocked ? "✦" : "Ⅱ"}</span>
        <div>
          <p className="eyebrow">ЭПОХА {game.save.legacy.cycle}</p>
          <h3 data-term="newChronicle" tabIndex={0}>
            Завершение летописи
          </h3>
          <p>
            {status.unlocked
              ? `Все условия выполнены. Можно начать эпоху ${status.targetCycle}.`
              : status.reason}
          </p>
        </div>
      </div>
      <div className="new-chronicle-progress" aria-label="Прогресс эпохи">
        <strong>
          {completed} из {status.requirements.length} условий
        </strong>
        <div
          className="new-chronicle-progress-line"
          style={css({ "--chronicle-progress": `${progress}%` })}
        >
          <i />
        </div>
      </div>
      <div className="chronicle-status-actions">
        <button
          type="button"
          className={`button${status.unlocked ? " primary" : ""}`}
          onClick={() => openDialog({ kind: "new-chronicle" })}
        >
          {status.unlocked
            ? `Начать эпоху ${status.targetCycle}`
            : "Условия эпохи"}
        </button>
      </div>
    </section>
  );
}
