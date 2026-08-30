import type {
  EquipmentItem,
  ExpeditionStepReport,
} from "../../../../../../gameplay/core/WorldTypes";
import {
  DUNGEONS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../../../../catalogs/WorldCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { Modal, css } from "../../../../shared/ui/common";
import { EquipmentArt } from "../../../equipment/components/Artwork/Artwork";
import { itemName, number, rarityColors } from "../../../equipment/utils/model";

export function ExpeditionRewards({
  result,
  items,
  onClose,
}: {
  result: ExpeditionStepReport;
  items: EquipmentItem[];
  onClose: () => void;
}) {
  const { game } = useGame();
  const dungeon = DUNGEONS.find(
    (candidate) => candidate.id === result.expedition?.dungeonId,
  );
  const rewards = result.rewards;
  return (
    <Modal
      id="dungeon-layer"
      className="react-dungeon-dialog"
      dismissible={false}
      eyebrow={
        result.completed ? "ЭКСПЕДИЦИЯ ЗАВЕРШЕНА" : "ВОЗВРАЩЕНИЕ ИЗ ПОХОДА"
      }
      title={
        result.completed
          ? `Исследован данж «${dungeon?.name ?? "Неизвестный путь"}»`
          : "Часть добычи удалось спасти"
      }
      onClose={onClose}
      footer={
        <>
          <p>
            После закрытия можно сразу сравнить каждую находку с надетым
            предметом.
          </p>
          <button
            className="button primary"
            id="continue-expedition-rewards"
            type="button"
            onClick={onClose}
          >
            Забрать награды
          </button>
        </>
      }
    >
      <section className="dungeon-reward-view" id="dungeon-reward-view">
        <p className="expedition-reward-copy">{result.message}</p>
        <div className="expedition-reward-stats">
          {[
            [
              "Пройдено этапов",
              result.expedition
                ? `${result.expedition.stage} / ${result.expedition.maxStages}`
                : "—",
            ],
            ["Получено опыта", `+${number.format(rewards?.experience ?? 0)}`],
            ["Получено монет", `+${number.format(rewards?.gold ?? 0)}`],
            ["Новых уровней", `+${rewards?.levelsGained ?? 0}`],
            ...(rewards?.temperingMarks
              ? [["Печати закалки", `+${rewards.temperingMarks}`]]
              : []),
          ].map(([label, value]) => (
            <article className="expedition-reward-stat" key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        {rewards?.unlockedSkills.length ? (
          <p>
            Открыты навыки:{" "}
            {rewards.unlockedSkills.map((skill) => skill.name).join(", ")}
          </p>
        ) : null}
        <section className="expedition-reward-loot">
          <header>
            <div>
              <p className="eyebrow">СОХРАНЁННАЯ ДОБЫЧА</p>
              <h3>Находки из похода</h3>
            </div>
            <span>{items.length} предметов</span>
          </header>
          <div id="expedition-reward-items">
            {items.length ? (
              items.map((item) => (
                <article
                  className="expedition-reward-item"
                  style={css({ "--rarity-color": rarityColors[item.rarity] })}
                  key={item.id}
                >
                  <EquipmentArt
                    item={item}
                    slot={item.slot}
                    classId={game.save.hero.classId}
                  />
                  <div>
                    <small>
                      {RARITY_LABELS[item.rarity]} · {SLOT_LABELS[item.slot]}
                    </small>
                    <strong>{itemName(item)}</strong>
                    <span>Уровень {item.level}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="expedition-reward-empty">
                {result.completed
                  ? "В этот раз снаряжение не найдено, но опыт и монеты уже начислены."
                  : "При отступлении найденные предметы сохранить не удалось."}
              </p>
            )}
          </div>
        </section>
      </section>
    </Modal>
  );
}
