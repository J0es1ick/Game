import { useMemo } from "react";
import {
  ARENAS,
  CLASS_DEFINITIONS,
} from "../../../../../../catalogs/WorldCatalog";
import {
  combatantSnapshot,
  nextSkills,
} from "../../../../../../gameplay/combat/AdvancedBattle";
import { useGame } from "../../../../app/state/GameContext";
import { StatRow, css } from "../../../../shared/ui/common";
import { classIcons } from "../../../../shared/utils/gameLabels";

export function HeroSummaryCard() {
  const { game, revision } = useGame();
  const hero = game.save.hero;
  const definition = CLASS_DEFINITIONS[hero.classId];
  const stats = useMemo(() => combatantSnapshot(hero), [game, revision]);
  const experience = Math.min(
    100,
    (hero.experience / Math.max(1, hero.experienceToNextLevel)) * 100,
  );

  return (
    <aside className="hero-card" id="hero-card" aria-label="Сводка героя">
      <div className="hero-card-top">
        <div
          className="large-portrait"
          style={css({ "--portrait-accent": definition.accent })}
        >
          {classIcons[hero.classId]}
        </div>
        <div>
          <small>УРОВЕНЬ {hero.level}</small>
          <h2>{hero.name}</h2>
          <p>{definition.name}</p>
        </div>
      </div>
      <div className="experience-line">
        <i style={{ width: `${experience}%` }} />
      </div>
      <small className="exp-label">
        {hero.experience} / {hero.experienceToNextLevel} опыта
      </small>
      <div className="compact-stats">
        <StatRow label="Здоровье" value={stats.maxHealth} term="health" />
        <StatRow label="Атака" value={stats.attack} term="attack" />
        <StatRow label="Защита" value={stats.defense} term="defense" />
        <StatRow label="Скорость" value={stats.speed} term="speed" />
        <StatRow label="Победы в дуэлях" value={hero.duelWins} />
        <StatRow label="Поражения в дуэлях" value={hero.duelLosses} />
      </div>
      <p className="passive">{definition.passive}</p>
    </aside>
  );
}

export function NextGoalCard() {
  const { game, navigate, openDialog } = useGame();
  const hero = game.save.hero;
  const next = nextSkills(hero.classId, hero.level)[0];
  const arena = ARENAS[hero.highestArena];
  const wins = hero.arenaWins[hero.highestArena] ?? 0;
  const epoch = game.newGamePlusStatus();
  const completed = epoch.requirements.filter((entry) => entry.met).length;
  const finalArenaWon = epoch.requirements.find(
    (entry) => entry.id === "final-arena",
  )?.met;
  const registeredDay = game.registeredTournamentDay(arena.id);
  const availability = game.availability(arena);
  const dueArena = ARENAS.find(
    (entry) => game.registeredTournamentDay(entry.id) === game.save.worldDay,
  );
  const crownDue = game.registeredCrownLeagueDay() === game.save.worldDay;
  let title = arena.name;
  let detail = availability.reason;
  let action = registeredDay ? "К записи на турнир" : "К турнирам";
  let onAction = () => navigate("map", "tournaments-section");
  let urgent = false;

  if (finalArenaWon) {
    title = epoch.unlocked
      ? "Эпоха готова к завершению"
      : "Путь к вершине элиты";
    detail = epoch.reason;
    action = epoch.unlocked ? "Завершение эпохи" : "К борьбе за Корону";
    onAction = epoch.unlocked
      ? () => openDialog({ kind: "new-chronicle" })
      : () => navigate("map", "endgame-section");
  }
  if (dueArena || crownDue || game.save.pendingEliteChallengeId) {
    title = game.save.pendingEliteChallengeId
      ? "Защита титула"
      : crownDue
        ? "Лига короны сегодня"
        : `${dueArena!.name} — сегодня`;
    detail =
      "Событие ждёт героя. Разберитесь с ним до следующего занятия, которое продвинет день.";
    action = "К событию";
    onAction = () =>
      navigate(
        "map",
        game.save.pendingEliteChallengeId || crownDue
          ? "endgame-section"
          : "tournaments-section",
      );
    urgent = true;
  }
  if (game.save.activeExpedition) {
    title = "Продолжить экспедицию";
    detail =
      "Поход ещё не завершён. Выберите следующий узел или вернитесь с собранной добычей.";
    action = "Вернуться в поход";
    onAction = () => openDialog({ kind: "dungeon" });
  }
  if (game.save.pendingBattle) {
    title = "Незавершённый бой";
    detail =
      "Соперник и все сделанные ходы сохранены. Можно продолжить с места остановки.";
    action = "Вернуться к бою";
    onAction = () => openDialog({ kind: "battle" });
  }
  const current = finalArenaWon
    ? completed
    : Math.min(wins, arena.winsToAdvance);
  const target = finalArenaWon
    ? epoch.requirements.length
    : arena.winsToAdvance;
  const progress = Math.min(100, (current / Math.max(1, target)) * 100);

  return (
    <section
      className={`next-goal map-priority${urgent ? " goal-urgent" : ""}`}
      id="next-goal"
      aria-label="Ближайшая цель"
    >
      <div className="next-goal-copy">
        <p className="eyebrow">
          {urgent
            ? "ТРЕБУЕТ ВНИМАНИЯ"
            : `БЛИЖАЙШАЯ ЦЕЛЬ · ЭПОХА ${game.save.legacy.cycle}`}
        </p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <div className="next-goal-progress">
        <div>
          <span>
            {finalArenaWon
              ? "Условия перехода эпохи"
              : "Чемпионства на этой арене"}
          </span>
          <strong>
            {current} из {target}
          </strong>
        </div>
        <div
          className="goal-progress-line"
          role="progressbar"
          aria-label={
            finalArenaWon
              ? "Условия перехода эпохи"
              : "Чемпионства на этой арене"
          }
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={current}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        {next && (
          <small>
            На {next.unlockLevel} уровне откроется «{next.name}»
          </small>
        )}
        {!urgent && registeredDay && registeredDay > game.save.worldDay && (
          <small>
            Запись: день {registeredDay} · осталось{" "}
            {registeredDay - game.save.worldDay} дн.
          </small>
        )}
      </div>
      <button
        className="button primary next-goal-action"
        type="button"
        onClick={onAction}
      >
        {action}
      </button>
    </section>
  );
}
