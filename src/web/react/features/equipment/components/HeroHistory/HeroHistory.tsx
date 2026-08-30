import { useMemo, useState } from "react";
import {
  ARENAS,
  CLASS_DEFINITIONS,
} from "../../../../../../catalogs/WorldCatalog";
import { FACTIONS } from "../../../../../../catalogs/WorldExpansionCatalog";
import { rivalryStatus } from "../../../../../../gameplay/combat/RivalrySystem";
import { useGame } from "../../../../app/state/GameContext";
import { pageSlice } from "../../utils/model";
import { Pagination } from "../EquipmentShared/EquipmentShared";
import { RivalryMemory } from "../RivalryMemory/RivalryMemory";

const factions = new Map(FACTIONS.map((faction) => [faction.id, faction]));

export function HeroHistory() {
  const { game, revision } = useGame();
  const hero = game.save.hero;
  const [sort, setSort] = useState<"recent" | "wins" | "losses">("recent");
  const [page, setPage] = useState(0);
  const [deadPage, setDeadPage] = useState(0);
  const history = useMemo(() => {
    const enemies = new Map(
      game.save.enemies.map((enemy) => [enemy.id, enemy]),
    );
    const records = Object.values(hero.rivalries);
    const known = records
      .filter((record) => enemies.has(record.enemyId))
      .sort((first, second) =>
        sort === "wins"
          ? second.wins - first.wins || second.lastMetDay - first.lastMetDay
          : sort === "losses"
            ? second.losses - first.losses ||
              second.lastMetDay - first.lastMetDay
            : second.lastMetDay - first.lastMetDay ||
              second.wins + second.losses - (first.wins + first.losses),
      );
    const leaders = new Map(
      game
        .leaderboard()
        .map((entry, index) => [entry.id, { entry, rank: index + 1 }]),
    );
    const elite = new Map(
      game
        .eliteLeaderboard()
        .map((entry, index) => [entry.id, { entry, rank: index + 1 }]),
    );
    return {
      enemies,
      records: known,
      dead: records.filter((record) => record.killed),
      leaders,
      elite,
    };
  }, [game, revision, sort]);
  const shown = pageSlice(history.records, page, 20);
  const deadShown = pageSlice(history.dead, deadPage, 30);
  return (
    <section className="hero-history-grid">
      <article className="paper-panel" id="hero-career-stats">
        <p className="eyebrow">КАРЬЕРА</p>
        <h2>Статистика героя</h2>
        <div className="career-results">
          <div className="career-results-head">
            <span>Активность</span>
            <span>Победы</span>
            <span>Проигрыши</span>
          </div>
          {[
            ["Все бои", hero.wins, hero.losses],
            ["Турниры", hero.tournamentMatchWins, hero.tournamentMatchLosses],
            ["Дуэли", hero.duelWins, hero.duelLosses],
            ["Данжи", hero.dungeonWins, hero.dungeonLosses],
          ].map(([label, wins, losses]) => (
            <div className="career-results-row" key={label}>
              <span>{label}</span>
              <strong>{wins}</strong>
              <strong>{losses}</strong>
            </div>
          ))}
        </div>
        <div className="career-lethal-wins">
          <span>Смертельные победы</span>
          <strong>{hero.kills}</strong>
        </div>
      </article>
      <article className="paper-panel" id="hero-rivalries">
        <p className="eyebrow">ЛИЧНЫЕ ВСТРЕЧИ</p>
        <h2>Соперники</h2>
        <label className="rivalry-toolbar">
          <span>Сортировка</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(0);
            }}
          >
            <option value="recent">Сначала новые</option>
            <option value="wins">Больше побед</option>
            <option value="losses">Больше проигрышей</option>
          </select>
        </label>
        {history.records.length > 0 && (
          <div className="rivalry-list-head">
            <span>Соперник</span>
            <span>Победы</span>
            <span>Проигрыши</span>
          </div>
        )}
        <div className="history-list rivalry-history-list">
          {shown.items.map((record) => {
            const fighter = history.enemies.get(record.enemyId)!;
            const ranked = history.leaders.get(record.enemyId);
            const elite = history.elite.get(record.enemyId);
            const relationship = rivalryStatus(record);
            const faction = fighter.factionId
              ? factions.get(fighter.factionId)
              : undefined;
            const features = game
              .fighterFeatures(fighter)
              .slice(0, 2)
              .map((feature) => feature.name)
              .join(" · ");
            const position = elite
              ? `Элита №${elite.rank} · ${game.legendTitle(elite.rank) ?? "участник Лиги короны"} · рейтинг ${elite.entry.rating}`
              : ranked
                ? `№${ranked.rank} в мире · рейтинг ${ranked.entry.rating} · ${ARENAS[ranked.entry.arenaIndex]?.name ?? "Арена не указана"}`
                : fighter.alive
                  ? `Вне первой сотни · рейтинг ${fighter.rating} · ${ARENAS[fighter.arenaIndex]?.name ?? "Арена не указана"}`
                  : fighter.retiredDay
                    ? `Завершил карьеру в день ${fighter.retiredDay} · теперь наставник`
                    : "Погиб · исключён из мирового рейтинга";
            return (
              <article key={record.enemyId}>
                <div>
                  <strong>{record.name}</strong>
                  <small>
                    {CLASS_DEFINITIONS[record.classId].name} · последняя
                    встреча: день {record.lastMetDay}
                  </small>
                  <span className={`rivalry-disposition ${relationship.id}`}>
                    {relationship.name} · {relationship.description}
                  </span>
                  <span
                    className={`rivalry-world-rank${elite ? " elite" : ranked ? " ranked" : ""}`}
                  >
                    {position}
                  </span>
                  {fighter.carriedFromCycle && (
                    <span className="fighter-era-badge">
                      Из эпохи {fighter.carriedFromCycle}
                    </span>
                  )}
                  {features && (
                    <span className="rivalry-traits">Характер: {features}</span>
                  )}
                  <span className="rivalry-world-intent">
                    {faction?.name ?? "Независимый боец"} ·{" "}
                    {game.npcGoal(fighter.goal).name}
                  </span>
                  {fighter.lastActivity && (
                    <span className="rivalry-last-activity">
                      {fighter.lastActivity.description}
                    </span>
                  )}
                  <RivalryMemory enemy={fighter} />
                </div>
                <b
                  className="rivalry-score"
                  aria-label={`Победы: ${record.wins}`}
                >
                  {record.wins}
                </b>
                <b
                  className="rivalry-score"
                  aria-label={`Проигрыши: ${record.losses}`}
                >
                  {record.losses}
                </b>
              </article>
            );
          })}
          {!history.records.length && (
            <p className="empty-copy">
              Здесь появятся участники турниров, с которыми герой уже встречался
              на арене или в дуэли.
            </p>
          )}
        </div>
        <Pagination {...shown} onChange={setPage} />
      </article>
      <article className="paper-panel" id="hero-necrology">
        <p className="eyebrow">НЕКРОЛОГ</p>
        <h2>Погибшие противники</h2>
        <div className="history-list necrology-list">
          {deadShown.items.map((record) => (
            <article key={record.enemyId}>
              {record.name} · побеждён в день {record.lastMetDay}
            </article>
          ))}
          {!history.dead.length && (
            <p className="empty-copy">
              Герой пока не завершил ни одной чужой истории навсегда.
            </p>
          )}
        </div>
        <Pagination {...deadShown} onChange={setDeadPage} />
      </article>
    </section>
  );
}
