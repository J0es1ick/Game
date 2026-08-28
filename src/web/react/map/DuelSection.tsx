import { DUEL_BOSSES, DUEL_TIERS } from "../../../catalogs/WorldCatalog";
import type {
  BossDefinition,
  DuelDefinition,
} from "../../../gameplay/WorldTypes";
import { css } from "../components/common";
import { useGame } from "../state/GameContext";
import { useBeginBattle } from "../state/useBeginBattle";
import { RouteSection } from "./RouteSection";

function DuelCard({ duel, index }: { duel: DuelDefinition; index: number }) {
  const { game } = useGame();
  const begin = useBeginBattle();
  const availability = game.availability(duel);

  return (
    <article
      className={`activity-card duel${availability.unlocked ? "" : " locked"}`}
      style={css({ "--activity-accent": duel.accent })}
    >
      <div className="activity-head">
        СТУПЕНЬ {String(index + 1).padStart(2, "0")}
      </div>
      <h3>{duel.name}</h3>
      <p>{duel.description}</p>
      <div className="activity-state">{availability.reason}</div>
      <button
        type="button"
        className="button activity-button"
        disabled={!availability.unlocked}
        onClick={() => begin((current) => current.beginDuel(duel.id))}
      >
        {availability.unlocked ? "Начать дуэль" : "Закрыто"}
      </button>
    </article>
  );
}

function BossCard({ boss }: { boss: BossDefinition }) {
  const { game } = useGame();
  const begin = useBeginBattle();
  const availability = game.availability(boss);
  const defeated = game.save.defeatedBosses.includes(boss.id);

  return (
    <article
      className={`activity-card boss${availability.unlocked ? "" : " locked"}${defeated ? " defeated" : ""}`}
      style={css({ "--activity-accent": boss.accent })}
    >
      <div className="activity-head">
        {defeated ? "ПОБЕЖДЁН" : "УНИКАЛЬНАЯ ПОБЕДА"}
      </div>
      <h3>{boss.name}</h3>
      <p>{boss.description}</p>
      <div className="activity-levels">
        Уровень {boss.level} · уникальная добыча
      </div>
      <div className="activity-state">{availability.reason}</div>
      <button
        type="button"
        className="button activity-button"
        disabled={!availability.unlocked || defeated}
        onClick={() => begin((current) => current.beginBoss(boss.id))}
      >
        {defeated
          ? "История завершена"
          : availability.unlocked
            ? "Вызвать на бой"
            : "Закрыто"}
      </button>
    </article>
  );
}

export function DuelSection() {
  const { game } = useGame();
  const hero = game.save.hero;

  return (
    <RouteSection
      id="duels-section"
      number="00"
      title="Дуэльный круг"
      copy={`Победы ${hero.duelWins} · поражения ${hero.duelLosses}. Мировой рейтинг от этих боёв не меняется.`}
      className="duel-section"
    >
      <div className="activity-route duel-route" id="duel-route">
        {DUEL_TIERS.map((duel, index) => (
          <DuelCard key={duel.id} duel={duel} index={index} />
        ))}
      </div>
      <h3 className="boss-heading" id="bosses-section">
        Особые противники
      </h3>
      <div className="activity-route boss-route" id="boss-route">
        {DUEL_BOSSES.map((boss) => (
          <BossCard key={boss.id} boss={boss} />
        ))}
      </div>
    </RouteSection>
  );
}
