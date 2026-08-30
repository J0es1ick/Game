import { useMemo } from "react";
import { ARENAS, DUNGEONS } from "../../../../../../catalogs/WorldCatalog";
import { FACTIONS } from "../../../../../../catalogs/WorldExpansionCatalog";
import { worldEliteSeasonStandings } from "../../../../../../gameplay/world/WorldSeason";
import { currentWorldSeasonNotice } from "../../utils/SeasonNotices";
import { useGame } from "../../../../app/state/GameContext";
import { PagedList, StatRow, css } from "../../../../shared/ui/common";
import { factionFor } from "../../utils/chronicle";

export function WorldSeasonPanel() {
  const { game, openDialog } = useGame();
  const season = game.currentWorldSeason();
  const elite = worldEliteSeasonStandings(
    season,
    game.save.enemies,
    game.save.hero.name,
  )[0];
  return (
    <section className="living-world-section world-season paper-panel">
      <header className="world-season-heading">
        <div>
          <p className="eyebrow" data-term="worldSeason" tabIndex={0}>
            ЭПОХА {game.save.legacy.cycle} · МИРОВОЙ СЕЗОН {season.number}
          </p>
          <h2>{season.rule.name}</h2>
          <p>{season.rule.description}</p>
        </div>
        <div className="world-season-controls">
          <div className="world-season-stats">
            <StatRow
              label="Дни сезона"
              value={`${season.startsDay}–${season.endsDay}`}
            />
            <StatRow label="Осталось" value={`${season.remainingDays} дн.`} />
          </div>
          <button
            className="plain-button"
            onClick={() => {
              const notice = currentWorldSeasonNotice(game.save);
              if (notice) openDialog({ kind: "season", notice });
            }}
          >
            Узнать изменения
          </button>
        </div>
      </header>
      <div className="world-season-championships">
        {ARENAS.map((arena) => {
          const leader = game.worldSeasonLeaderboard(arena.id)[0];
          return (
            <article key={arena.id}>
              <small>{arena.name}</small>
              <strong>{leader?.fighterName ?? "Сезон ещё не начат"}</strong>
              <span>
                {leader
                  ? `${leader.points} сезонных очков`
                  : "Первый турнир определит лидера"}
              </span>
            </article>
          );
        })}
        <article>
          <small>Элита · чемпионат сезона</small>
          <strong>{elite?.fighterName ?? "Лидер ещё не определён"}</strong>
          <span>
            {elite
              ? `${elite.points} сезонных очков`
              : "Результаты элитных боёв определят лидера"}
          </span>
        </article>
      </div>
      <PagedList
        className="world-season-history"
        items={game.completedWorldSeasons()}
        getKey={(entry) => String(entry.number)}
        empty="Первый сезон ещё продолжается. Его итоги останутся в летописи."
        render={(entry) => (
          <p>
            {entry.summary}
            {entry.eliteChampion &&
              ` Чемпион элиты: ${entry.eliteChampion.fighterName} · ${entry.eliteChampion.points} очков.`}
          </p>
        )}
      />
    </section>
  );
}

export function TerritoriesPanel() {
  const { game, revision } = useGame();
  const territories = useMemo(() => {
    const arenas = ARENAS.map((arena) => {
      const owner = game.factionController(arena.id);
      return {
        id: arena.id,
        kind: "АРЕНА",
        name: arena.name,
        faction: owner,
        note: owner.effect,
      };
    });
    const dungeons = DUNGEONS.map((dungeon) => ({
      id: dungeon.id,
      kind: "ДАНЖ",
      name: dungeon.name,
      faction:
        factionFor(
          game.save.factionControl?.dungeonControllers?.[dungeon.id],
        ) ?? FACTIONS[0],
      note: "Контроль влияет на награды похода и на то, чьи бойцы чаще ищут здесь добычу.",
    }));
    const owner = game.shopController(),
      mentor = game
        .livingMentors()
        .find(
          (entry) => entry.id === game.save.factionControl?.shopOwnerMentorId,
        );
    return [
      ...arenas,
      ...dungeons,
      {
        id: "shop",
        kind: "ЛАВКА",
        name: mentor ? `Лавка наставника ${mentor.name}` : "Лавка Ионы",
        faction: owner,
        note: owner.effect,
      },
    ];
  }, [game, revision]);
  return (
    <section className="living-world-section world-territories paper-panel">
      <p className="eyebrow">ВЛИЯНИЕ ФРАКЦИЙ</p>
      <h2 data-term="factionControl" tabIndex={0}>
        Кто распоряжается миром
      </h2>
      <div className="territory-ledger">
        {territories.map((territory) => (
          <article
            key={territory.id}
            style={css({ "--faction-accent": territory.faction.accent })}
          >
            <small>{territory.kind}</small>
            <strong>{territory.name}</strong>
            <span>{territory.faction.name}</span>
            <p>{territory.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
