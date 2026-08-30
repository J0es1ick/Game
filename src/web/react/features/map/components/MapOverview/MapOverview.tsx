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
  const { game } = useGame();
  const hero = game.save.hero;
  const next = nextSkills(hero.classId, hero.level)[0];
  const arena = ARENAS[hero.highestArena];

  return (
    <aside className="next-goal" id="next-goal" aria-label="Ближайшие цели">
      <p className="eyebrow">БЛИЖАЙШИЕ ЦЕЛИ</p>
      <h2>{arena.name}</h2>
      <StatRow
        label="Победы"
        value={`${hero.arenaWins[hero.highestArena]}/${arena.winsToAdvance}`}
      />
      {next && (
        <div className="next-skill">
          <small>НАВЫК НА {next.unlockLevel} УРОВНЕ</small>
          <strong>{next.name}</strong>
          <p>{next.description}</p>
        </div>
      )}
      <div className="mini-events">
        <h3>Сейчас в мире</h3>
        {game.save.events.slice(0, 3).map((event) => (
          <p key={event.id}>
            День {event.day}. {event.message}
          </p>
        ))}
      </div>
    </aside>
  );
}
