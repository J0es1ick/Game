import { useGame } from "../../../../app/state/GameContext";
import { NewChronicleStatus } from "../NewChronicleStatus/NewChronicleStatus";

export function MapUtilities() {
  const { game, navigate } = useGame();

  return (
    <section className="map-utilities" aria-label="Быстрые переходы">
      <div className="map-quick-actions">
        <div>
          <p className="eyebrow">БЫСТРЫЕ ПЕРЕХОДЫ</p>
          <strong>Подготовка героя</strong>
        </div>
        <button type="button" onClick={() => navigate("arsenal")}>
          <span aria-hidden="true">◈</span>
          <b>Инвентарь</b>
          <small>{game.save.hero.inventory.length} предметов</small>
        </button>
        <button type="button" onClick={() => navigate("skills")}>
          <span aria-hidden="true">✦</span>
          <b>Навыки</b>
          <small>Сборка и тактика</small>
        </button>
      </div>
      <NewChronicleStatus />
    </section>
  );
}
