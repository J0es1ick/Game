import { ARENAS } from "../../../../../../catalogs/WorldCatalog";
import { FACTIONS } from "../../../../../../catalogs/WorldExpansionCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { css } from "../../../../shared/ui/common";

export function ControlBoard() {
  const { game } = useGame();
  return (
    <section
      className="world-control-board paper-panel"
      id="world-control-board"
    >
      <header className="world-control-head">
        <div>
          <p className="eyebrow">БОРЬБА ЗА ГОРОД</p>
          <h2>Кто управляет аренами</h2>
        </div>
        <p className="world-control-copy">
          Экономика обновляется раз в 7 дней, а в сезон войны — раз в 4. Влияние
          на арены пересчитывается по завершённым турнирам; между редкими
          событиями оно сохраняется. Контроль меняет награды и поставки лавки.
        </p>
      </header>
      <div className="world-control-grid">
        {ARENAS.map((arena) => {
          const controller = game.factionController(arena.id),
            influence =
              game.save.factionControl?.arenaInfluence[arena.id] ?? {},
            total = Math.max(
              1,
              Object.values(influence).reduce((sum, value) => sum + value, 0),
            );
          return (
            <article
              className="world-control-card"
              key={arena.id}
              style={css({ "--faction-accent": controller.accent })}
            >
              <small>{arena.name.toUpperCase()}</small>
              <strong>{controller.name}</strong>
              <p>{controller.effect}</p>
              <div className="faction-influence-bars">
                {FACTIONS.map((faction) => (
                  <div
                    className="faction-influence-row"
                    key={faction.id}
                    style={css({ "--influence-color": faction.accent })}
                  >
                    <span>{faction.name}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(0, ((influence[faction.id] ?? 0) / total) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>{influence[faction.id] ?? 0}</b>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
