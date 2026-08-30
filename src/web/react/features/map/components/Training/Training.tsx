import { useGame } from "../../../../app/state/GameContext";

export function Training() {
  const { game, act, notify } = useGame();
  const cap = game.trainingLevelCap();
  const blocked = game.save.hero.level >= cap;

  const train = () => {
    const result = act((current) => current.train());
    if (!result) return;
    notify({
      eyebrow: "ТРЕНИРОВОЧНЫЙ ДЕНЬ",
      title: result.title,
      description: `Получено ${result.experience} опыта${result.levelsGained ? ` и ${result.levelsGained} ур.` : ""}.`,
      symbol: "⚔",
      tone: "positive",
      sound: "training",
      duration: 1700,
      aggregation: {
        key: "training",
        count: 1,
        totals: { experience: result.experience, levels: result.levelsGained },
        format: (count, totals) => ({
          eyebrow: "СЕРИЯ ТРЕНИРОВОК",
          title: `${count} тренировочных дней завершено`,
          description: `Всего получено ${totals.experience ?? 0} опыта${totals.levels ? ` и ${totals.levels} ур.` : ""}.`,
        }),
      },
    });
  };

  return (
    <div className="daily-actions" id="daily-actions-section">
      <article>
        <span>КАЖДЫЙ ДЕНЬ</span>
        <h2>Тренировочная площадка</h2>
        <p>
          {blocked
            ? `Предел тренировок для текущей арены достигнут: ${cap} уровень. Продвиньтесь в следующую турнирную лигу.`
            : `Безопасный опыт до ${cap} уровня. Дальше потребуется продвижение на арене.`}
        </p>
        <button
          type="button"
          className="button"
          id="training-btn"
          disabled={blocked}
          onClick={train}
        >
          {blocked ? "Достигнут предел" : "Тренироваться"}
        </button>
      </article>
    </div>
  );
}
