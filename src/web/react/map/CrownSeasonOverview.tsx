import { TOURNAMENT_RULES } from "../../../catalogs/WorldExpansionCatalog";
import { crownSeasonRemainingDays } from "../../../gameplay/CrownSeason";
import { useGame } from "../state/GameContext";
import { StatRow } from "../components/common";

export function CrownSeasonOverview() {
  const { game } = useGame();
  const season = game.currentCrownSeason();
  const standings = game.crownSeasonStandings();
  const index = standings.findIndex(
    (entry) => entry.fighterId === game.save.hero.id,
  );
  const standing = standings[index];

  return (
    <section className="crown-season-overview paper-panel">
      <div className="crown-season-copy">
        <p className="eyebrow">
          СЕЗОН {season.number} · ДО ДНЯ {season.endsDay}
        </p>
        <h3>Сезон Лиги короны</h3>
        <p>
          Чемпионство приносит 18 очков, защита титула — 5, победа — 3,
          поражение — 1. Сезонный зачёт не заменяет место в элите.
        </p>
      </div>
      <div className="crown-season-summary">
        <StatRow
          label="Осталось"
          value={`${crownSeasonRemainingDays(season, game.save.worldDay)} дн.`}
        />
        <StatRow label="Ваши очки" value={standing?.points ?? 0} />
        <StatRow
          label="Место сезона"
          value={index >= 0 ? `#${index + 1}` : "Без очков"}
        />
        <StatRow label="Защиты" value={standing?.defenses ?? 0} />
      </div>
      <div className="crown-season-rules">
        <strong>Правила текущего сезона</strong>
        {season.ruleIds.map((id) => {
          const rule = TOURNAMENT_RULES.find(
            (candidate) => candidate.id === id,
          );
          return (
            rule && (
              <article key={id}>
                <b>{rule.name}</b>
                <span>{rule.description}</span>
              </article>
            )
          );
        })}
      </div>
    </section>
  );
}
