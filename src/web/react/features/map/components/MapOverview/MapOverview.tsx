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
  const { game, navigate } = useGame();
  const hero = game.save.hero;
  const next = nextSkills(hero.classId, hero.level)[0];
  const arena = ARENAS[hero.highestArena];
  const wins = hero.arenaWins[hero.highestArena] ?? 0;
  const progress = Math.min(
    100,
    (wins / Math.max(1, arena.winsToAdvance)) * 100,
  );
  const registeredDay = game.registeredTournamentDay(arena.id);
  const availability = game.availability(arena);
  const tournamentAction =
    registeredDay === game.save.worldDay
      ? "Начать турнир"
      : registeredDay
        ? `Турнир в день ${registeredDay}`
        : availability.unlocked
          ? "Записаться на турнир"
          : "Открыть турниры";

  return (
    <section
      className="next-goal map-priority"
      id="next-goal"
      aria-label="Ближайшая цель"
    >
      <div className="next-goal-copy">
        <p className="eyebrow">БЛИЖАЙШАЯ ЦЕЛЬ</p>
        <h2>{arena.name}</h2>
        <p>{availability.reason}</p>
      </div>
      <div className="next-goal-progress">
        <div>
          <span>Победы для продвижения</span>
          <strong>
            {wins} из {arena.winsToAdvance}
          </strong>
        </div>
        <div className="goal-progress-line" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        {next && (
          <small>
            На {next.unlockLevel} уровне откроется «{next.name}»
          </small>
        )}
      </div>
      <button
        className="button primary next-goal-action"
        type="button"
        onClick={() => navigate("map", "tournaments-section")}
      >
        {tournamentAction}
      </button>
    </section>
  );
}
