import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARENAS,
  CLASS_DEFINITIONS,
} from "../../../../../../catalogs/WorldCatalog";
import { FACTIONS } from "../../../../../../catalogs/WorldExpansionCatalog";
import type { LeaderboardEntry } from "../../../../../../gameplay/core/WorldTypes";
import {
  eraVeteranBadgeCopy,
  loadRankingSnapshot,
  saveRankingSnapshot,
} from "../../utils/LeaderboardView";
import { useGame } from "../../../../app/state/GameContext";
import { PageHeading, StatRow, css } from "../../../../shared/ui/common";

export function RankingsTable({
  elite = false,
  trackMovement = false,
}: {
  elite?: boolean;
  trackMovement?: boolean;
}) {
  const { game, revision } = useGame();
  const entries = useMemo(
    () => (elite ? game.eliteLeaderboard() : game.leaderboard()),
    [game, revision, elite],
  );
  const fighters = useMemo(
    () => new Map(game.save.enemies.map((fighter) => [fighter.id, fighter])),
    [game, revision],
  );
  const storageKey = elite
    ? "dust-and-crown-elite-snapshot-v1"
    : "dust-and-crown-leader-snapshot-v1";
  const [previous] = useState(() =>
    trackMovement ? loadRankingSnapshot(storageKey) : {},
  );
  const hasPrevious = Object.keys(previous).length > 0;
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (!trackMovement) return;
    try {
      saveRankingSnapshot(storageKey, entries);
    } catch {}
  }, [entries, storageKey, trackMovement]);
  useEffect(() => {
    const rows = Array.from(body.current?.rows ?? []);
    if (
      !trackMovement ||
      !window.IntersectionObserver ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (observations) =>
        observations.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("leader-row-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    rows.forEach((row) => {
      row.classList.add("leader-row-awaiting");
      observer.observe(row);
    });
    return () => observer.disconnect();
  }, [trackMovement]);
  const columns = elite
    ? [
        "Место",
        "Титул",
        "Боец",
        "Класс",
        "Школа",
        "Ур.",
        "Очки элиты",
        "Короны",
        "Победы",
        "Поражения",
        "Убийства",
      ]
    : [
        "#",
        "Боец",
        "Класс",
        "Школа",
        "Арена",
        "Ур.",
        "Турниры",
        "Победы",
        "Поражения",
        "Убийства",
        "Рейтинг",
      ];
  const terms: Record<string, string> = {
    "Ур.": "level",
    Турниры: "tournament",
    Убийства: "kill",
    Рейтинг: "rating",
    Титул: "legend",
  };
  const cells = (entry: LeaderboardEntry) =>
    elite
      ? [
          CLASS_DEFINITIONS[entry.classId].name,
          entry.schoolName ?? "—",
          entry.level,
          entry.rating,
          game.save.eliteCrownWins[entry.id] ??
            (entry.isHero ? game.save.hero.crownLeagueWins : 0),
          entry.wins,
          entry.losses,
          entry.kills,
        ]
      : [
          CLASS_DEFINITIONS[entry.classId].name,
          entry.schoolName ?? "—",
          ARENAS[entry.arenaIndex]?.name ?? "—",
          entry.level,
          entry.tournamentWins,
          entry.wins,
          entry.losses,
          entry.kills,
          entry.rating,
        ];
  return (
    <div className="leader-table-wrap">
      <table className="leader-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                data-term={terms[column]}
                tabIndex={terms[column] ? 0 : undefined}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body} id={elite ? "elite-leader-table" : "leader-table"}>
          {entries.map((entry, index) => {
            const rank = index + 1,
              previousRank = previous[entry.id],
              delta = previousRank === undefined ? 0 : previousRank - rank;
            const movement = hasPrevious
              ? previousRank === undefined
                ? "rank-newcomer"
                : delta > 0
                  ? "rank-moved-up"
                  : delta < 0
                    ? "rank-moved-down"
                    : ""
              : "";
            const veteran = eraVeteranBadgeCopy(
                entry.carriedFromCycle,
                game.save.legacy.cycle,
              ),
              fighter = fighters.get(entry.id),
              faction = FACTIONS.find(
                (candidate) => candidate.id === fighter?.factionId,
              );
            return (
              <tr
                key={entry.id}
                className={`${entry.isHero ? "is-hero" : ""} ${elite && rank <= 5 ? "legend" : ""} ${movement}`}
                style={css({
                  "--rank-offset": `${Math.max(-72, Math.min(72, delta * 11))}px`,
                })}
              >
                <td>{elite ? `#${rank}` : rank}</td>
                {elite && (
                  <td className={rank <= 5 ? "elite-title" : ""}>
                    {game.legendTitle(rank) ?? "Элита"}
                  </td>
                )}
                <td className="leader-name-cell">
                  {entry.name}
                  {veteran && (
                    <span
                      className="era-veteran-badge"
                      title={veteran.label}
                      aria-label={veteran.label}
                    >
                      {veteran.text}
                    </span>
                  )}
                  {faction && (
                    <span
                      className="fighter-world-badge"
                      style={css({ "--faction-accent": faction.accent })}
                      title={fighter?.lastActivity?.description}
                    >
                      {faction.name}
                    </span>
                  )}
                  {entry.schoolName && (
                    <span
                      className={`fighter-school-badge ${entry.isMentor ? "mentor" : "student"}`}
                      title={
                        entry.isMentor
                          ? `Наставник школы «${entry.schoolName}» продолжает выступать`
                          : `Ученик наставника ${entry.mentorName ?? "неизвестной школы"}`
                      }
                    >
                      {entry.isMentor ? "наставник" : "ученик"}
                    </span>
                  )}
                  {hasPrevious &&
                    (previousRank === undefined ? (
                      <span
                        className="rank-change newcomer"
                        title="Вошёл в отображаемый рейтинг с прошлого посещения"
                      >
                        вошёл
                      </span>
                    ) : (
                      delta !== 0 && (
                        <span
                          className={`rank-change ${delta > 0 ? "up" : "down"}`}
                          title={`Изменение с прошлого посещения: ${delta > 0 ? "+" : ""}${delta}`}
                        >
                          {delta > 0 ? "↑" : "↓"}
                          {Math.abs(delta)}
                        </span>
                      )
                    ))}
                </td>
                {cells(entry).map((value, cell) => (
                  <td
                    key={cell}
                    className={cell === 1 ? "leader-school-cell" : undefined}
                  >
                    {value}
                    {cell === 1 && entry.schoolName && (
                      <small>
                        {entry.isMentor
                          ? "ведёт школу и выступает"
                          : `наставник: ${entry.mentorName}`}
                      </small>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RankingsPage({ elite = false }: { elite?: boolean }) {
  const { game, navigate } = useGame();
  const eliteRank = game.heroEliteRank();
  const entries = elite ? game.eliteLeaderboard() : game.leaderboard();
  return (
    <>
      <PageHeading
        eyebrow={elite ? "ЗАКРЫТАЯ ЛИГА" : "СОПЕРНИКИ ЖИВОГО МИРА"}
        title={elite ? "Тридцать бойцов элиты" : "Сотня лучших бойцов"}
      >
        <p>
          {elite
            ? "Первые пять носят титулы легенд. Боритесь за корону в турнирах и последовательных вызовах."
            : "Рейтинг отражает турнирные результаты всего живого мира. Ученики представляют свои школы, а боевые наставники могут продолжать выступления."}
        </p>
      </PageHeading>
      <div
        className="leader-summary"
        id={elite ? "elite-leader-summary" : "leader-summary"}
      >
        {elite ? (
          <StatRow
            label="Ваше место"
            value={eliteRank ? `#${eliteRank}` : "Не в элите"}
          />
        ) : eliteRank ? (
          <div className="stat-row elite-rank-link">
            <span>Вы находитесь в другом рейтинге</span>
            <button className="plain-button" onClick={() => navigate("elite")}>
              Открыть элиту · #{eliteRank}
            </button>
          </div>
        ) : (
          <StatRow label="Ваше место" value={`#${game.heroRank() ?? "—"}`} />
        )}
        {elite ? (
          <>
            <StatRow label="Участников" value={entries.length} />
            <StatRow label="Легенд" value={Math.min(5, entries.length)} />
            <StatRow label="Первая корона" value={entries[0]?.name ?? "—"} />
          </>
        ) : (
          <>
            <StatRow
              label="Живых бойцов"
              value={game.save.enemies.filter((enemy) => enemy.alive).length}
            />
            <StatRow
              label="Погибло навсегда"
              value={
                game.save.enemies.filter(
                  (enemy) => !enemy.alive && !enemy.retiredDay,
                ).length
              }
            />
            <StatRow label="Активных арен" value={ARENAS.length} />
          </>
        )}
      </div>
      <RankingsTable
        key={elite ? "elite" : "world"}
        elite={elite}
        trackMovement
      />
    </>
  );
}
