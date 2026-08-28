import { useMemo } from "react";
import { CLASS_DEFINITIONS } from "../../../catalogs/WorldCatalog";
import { ERA_LAWS, LEGACY_BOONS } from "../../../catalogs/NewGamePlusCatalog";
import { useGame } from "../state/GameContext";
import { LazyDetails, PagedList, StatRow, css } from "../components/common";
import { factionFor } from "./shared";

export function RelicsAndVeterans() {
  const { game, revision } = useGame();
  const relics = useMemo(() => game.worldRelicChronicle(), [game, revision]);
  const veterans = useMemo(
    () =>
      game.save.enemies.filter((enemy) => enemy.carriedFromCycle !== undefined),
    [game, revision],
  );
  return (
    <>
      <section className="living-world-section world-relics paper-panel">
        <p className="eyebrow">ВЕЩИ С СОБСТВЕННОЙ ИСТОРИЕЙ</p>
        <h2>Мировые реликвии · {relics.length}</h2>
        <PagedList
          className="world-relic-list"
          items={relics}
          getKey={(record) => record.id}
          empty="Реликвия рождается из легендарной вещи после великих побед владельца."
          render={(record) => (
            <article className={`world-relic-entry ${record.status}`}>
              <strong>{record.item.relicName ?? record.item.name}</strong>
              <small>
                {record.status === "lost"
                  ? "Утрачена и может появиться снова"
                  : record.status === "shop"
                    ? "Замечена в лавке Ионы"
                    : `Владелец: ${record.currentOwnerName ?? "неизвестен"}`}
              </small>
              <p>
                {record.history[record.history.length - 1] ??
                  "История только начинается."}
              </p>
              <LazyDetails summary="История реликвии">
                {() => (
                  <div>
                    {record.history.map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                )}
              </LazyDetails>
            </article>
          )}
        />
      </section>
      <section className="living-world-section world-veterans paper-panel">
        <p className="eyebrow">ПАМЯТЬ ПРОШЛЫХ ЭПОХ</p>
        <h2>Ветераны · {veterans.length}</h2>
        <PagedList
          className="living-world-list"
          items={veterans}
          getKey={(fighter) => fighter.id}
          empty="Бойцы прошлых эпох пока не появились в этом мире."
          render={(fighter) => (
            <article
              style={css({
                "--faction-accent":
                  factionFor(fighter.factionId)?.accent ?? "#776e5f",
              })}
            >
              <div>
                <strong>{fighter.name}</strong>
                <small>
                  Эпоха {fighter.carriedFromCycle} ·{" "}
                  {CLASS_DEFINITIONS[fighter.classId].name} · уровень{" "}
                  {fighter.level}
                </small>
              </div>
              <span>
                {fighter.retiredDay !== undefined
                  ? "Завершил карьеру"
                  : fighter.alive
                    ? "Продолжает путь"
                    : "Погиб"}{" "}
                · {factionFor(fighter.factionId)?.name ?? "Независимый"}
              </span>
            </article>
          )}
        />
      </section>
    </>
  );
}

export function EpochArchive() {
  const { game, revision } = useGame();
  const archives = useMemo(
    () => [...game.legacyArchives()].reverse(),
    [game, revision],
  );
  return (
    <section id="epoch-history-view">
      <div id="epoch-history-summary" className="leader-summary">
        <StatRow label="Текущая эпоха" value={game.save.legacy.cycle} />
        <StatRow label="Завершено эпох" value={archives.length} />
        <StatRow label="Печатей летописи" value={game.save.legacy.seals} />
        <StatRow
          label="Всего заработано"
          value={game.save.legacy.totalSealsEarned}
        />
      </div>
      <PagedList
        items={archives}
        getKey={(archive) => String(archive.cycle)}
        className="epoch-history-list"
        pageSize={12}
        empty="Первая эпоха ещё продолжается. Здесь появится её итог после начала новой летописи."
        render={(archive) => (
          <article className="epoch-card paper-panel">
            <header className="epoch-hero-summary">
              <div>
                <p className="eyebrow">
                  ЭПОХА {archive.cycle} · {archive.worldDay} ДНЕЙ
                </p>
                <h3>{archive.name}</h3>
                <p>
                  {CLASS_DEFINITIONS[archive.classId].name} · {archive.title}
                </p>
                {archive.worldRole && (
                  <p className="epoch-world-role">
                    {
                      {
                        legend: "Легенда новой эпохи",
                        boss: "Противник новой эпохи",
                        mentor: "Основатель школы",
                        "faction-founder": "Основатель фракционной школы",
                      }[archive.worldRole]
                    }
                    {archive.schoolName && ` · ${archive.schoolName}`}
                  </p>
                )}
              </div>
              <strong>Ур. {archive.level}</strong>
            </header>
            <div className="epoch-stat-grid">
              {[
                ["Рейтинг", archive.rating],
                ["Турниры", archive.tournamentWins],
                ["Победы", archive.wins],
                ["Поражения", archive.losses],
                ["Убийства", archive.kills],
                ["Короны", archive.crownLeagueWins],
                ["Защиты", archive.legendDefenses],
                ["Элита", archive.eliteRank ? `#${archive.eliteRank}` : "—"],
              ].map(([label, value]) => (
                <StatRow key={label} label={String(label)} value={value} />
              ))}
            </div>
            <LazyDetails
              className="epoch-details"
              summary="Соперники, павшие и снаряжение"
            >
              {() => (
                <>
                  <div className="epoch-rival-list">
                    {archive.notableFighters.map((fighter, index) => (
                      <p key={index}>
                        {fighter.name} ·{" "}
                        {CLASS_DEFINITIONS[fighter.classId].name} ·{" "}
                        {fighter.wins} побед · {fighter.losses} поражений
                      </p>
                    ))}
                  </div>
                  <p className="epoch-legacy">
                    Наследие эпохи:{" "}
                    {LEGACY_BOONS.find((boon) => boon.id === archive.boonId)
                      ?.name ?? "первый путь"}
                    . Законы:{" "}
                    {(archive.lawIds ?? [])
                      .map((id) => ERA_LAWS.find((law) => law.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "без законов"}
                    .
                    {archive.inheritedItemName &&
                      ` Переданный предмет: ${archive.inheritedItemName}.`}
                  </p>
                  <p className="epoch-gear">
                    Финальное снаряжение:{" "}
                    {archive.equipment
                      .map((item) => item.relicName ?? item.name)
                      .join(", ") || "без предметов"}
                    .
                  </p>
                  <p className="epoch-fallen">
                    {archive.fallenNames.length
                      ? `Погибли навсегда: ${archive.fallenNames.join(", ")}.`
                      : "Список павших пуст."}
                  </p>
                </>
              )}
            </LazyDetails>
          </article>
        )}
      />
    </section>
  );
}
