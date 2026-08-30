import { useMemo } from "react";
import { CLASS_DEFINITIONS } from "../../../../../../catalogs/WorldCatalog";
import {
  countermeasureDefinition,
  memoryStageDefinition,
} from "../../../../../../gameplay/combat/EnemyMemory";
import { buildRivalScoutingReport } from "../../../../../../gameplay/combat/RivalrySystem";
import { skillById } from "../../../../../../gameplay/core/WorldGame";
import type {
  EnemyProfile,
  HeroClass,
  TacticalStyle,
  HeroBehaviorPattern,
} from "../../../../../../gameplay/core/WorldTypes";
import { LazyDetails } from "../../../../shared/ui/common";
import { useGame } from "../../../../app/state/GameContext";

const tacticNames: Record<TacticalStyle, string> = {
  balanced: "Ровный бой",
  aggressive: "Давление",
  defensive: "Выжидание",
  control: "Срыв темпа",
};
const behaviorNames: Record<HeroBehaviorPattern, string> = {
  pressure: "Ранний натиск",
  healing: "Восстановление",
  control: "Контроль",
  burst: "Критические выпады",
  finisher: "Добивание",
};

function strongest(
  knowledge: Record<string, number | undefined>,
  limit = 2,
): Array<[string, number]> {
  return Object.entries(knowledge)
    .map(([key, value]): [string, number] => [key, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function MemoryDetails({ enemy }: { enemy: EnemyProfile }) {
  const { game, revision } = useGame();
  const preview = useMemo(
    () => game.enemyMemoryPreview(enemy.id),
    [game, revision, enemy.id],
  );
  const memory = enemy.heroMemory;
  const stage = memoryStageDefinition(memory.stage);
  const familiarity = Math.round(memory.familiarity);
  const similarity = Math.round(
    (preview?.similarity ?? memory.currentSimilarity ?? 0) * 100,
  );
  const strength = Math.round((preview?.strength ?? 0) * 100);
  const notes = [
    ...strongest(memory.classKnowledge, 1).map(
      ([key, value]) =>
        `Класс: ${CLASS_DEFINITIONS[key as HeroClass]?.name ?? key} · ${Math.round(value)}%`,
    ),
    ...strongest(memory.tacticalKnowledge, 1).map(
      ([key, value]) =>
        `Тактика: ${tacticNames[key as TacticalStyle] ?? key} · ${Math.round(value)}%`,
    ),
    ...strongest(memory.skillKnowledge).map(
      ([key, value]) =>
        `Приём: ${skillById(key)?.name ?? key} · ${Math.round(value)}%`,
    ),
    ...strongest(memory.behaviorKnowledge).map(
      ([key, value]) =>
        `${behaviorNames[key as HeroBehaviorPattern] ?? key} · ${Math.round(value)}%`,
    ),
  ];
  return (
    <div className="rivalry-memory-body">
      <div className="rivalry-memory-progress">
        <span>Изученность вашего стиля</span>
        <output>{familiarity}%</output>
        <progress
          max={100}
          value={familiarity}
          aria-label={`Изученность стиля: ${familiarity} процентов`}
        />
      </div>
      <p className="rivalry-memory-note">{stage.description}</p>
      {familiarity > 0 && (
        <p
          className={`rivalry-memory-note${similarity < 35 ? " disrupted" : ""}`}
        >
          Сходство текущей сборки: {similarity}%. Сила подготовленных контрмер:{" "}
          {strength}%.
        </p>
      )}
      <section className="rivalry-memory-section">
        <strong>Что соперник запомнил</strong>
        <div className="rivalry-memory-tags">
          {notes.length ? (
            notes.map((note) => (
              <span key={note} className="rivalry-memory-tag">
                {note}
              </span>
            ))
          ) : (
            <span className="rivalry-memory-empty">
              Устойчивые привычки ещё не выявлены.
            </span>
          )}
        </div>
      </section>
      <section className="rivalry-memory-section">
        <strong>Подготовленные контрмеры</strong>
        <div className="rivalry-memory-counters">
          {memory.countermeasureIds.length ? (
            memory.countermeasureIds.map((id) => {
              const definition = countermeasureDefinition(id);
              return definition ? (
                <div key={id} className="rivalry-memory-counter">
                  <b>{definition.name}</b>
                  <span>
                    {definition.description} {definition.effect}
                  </span>
                </div>
              ) : null;
            })
          ) : (
            <span className="rivalry-memory-empty">
              Контрмеры появятся, если продолжать сражаться одинаково.
            </span>
          )}
        </div>
      </section>
      {preview && (
        <section className="rivalry-scouting-advice">
          <strong>Совет перед следующей встречей</strong>
          <p>{buildRivalScoutingReport(memory, preview).recommendation}</p>
        </section>
      )}
    </div>
  );
}

export function RivalryMemory({ enemy }: { enemy: EnemyProfile }) {
  const stage = memoryStageDefinition(enemy.heroMemory.stage);
  return (
    <LazyDetails
      className="rivalry-memory"
      summary={
        <>
          <span className="rivalry-memory-mark" aria-hidden="true">
            ◉
          </span>
          <span className="rivalry-memory-heading">
            <b>{stage.name}</b>
            <small>
              {enemy.heroMemory.familiarity > 0
                ? `Изученность ${Math.round(enemy.heroMemory.familiarity)}% · открыть досье`
                : "Наблюдений пока нет"}
            </small>
          </span>
        </>
      }
    >
      {() => <MemoryDetails enemy={enemy} />}
    </LazyDetails>
  );
}
