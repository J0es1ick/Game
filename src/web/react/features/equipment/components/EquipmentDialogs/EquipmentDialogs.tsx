import { useMemo, useState } from "react";
import type {
  EquipmentItem,
  EquipmentSlot,
} from "../../../../../../gameplay/core/WorldTypes";
import { compareEquipment } from "../../../../../../gameplay/equipment/EquipmentComparison";
import {
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../../../../catalogs/WorldCatalog";
import { skillById } from "../../../../../../gameplay/core/WorldGame";
import { Modal } from "../../../../shared/ui/common";
import { useGame } from "../../../../app/state/GameContext";
import { EquipmentArt } from "../Artwork/Artwork";
import { ItemCard } from "../ItemCard/ItemCard";
import {
  isCompatible,
  itemName,
  number,
  pageSlice,
  rarityColors,
  statKeys,
  statShortLabels,
  statsText,
} from "../../utils/model";
import {
  Pagination,
  StatDelta,
  useEquipment,
} from "../EquipmentShared/EquipmentShared";

export function EquipmentPickerDialog({ slot }: { slot: EquipmentSlot }) {
  const { game, act, closeDialog } = useGame();
  const { hero, byId } = useEquipment();
  const [page, setPage] = useState(0);
  const current = byId.get(hero.equipped[slot] ?? "");
  const inventoryIds = hero.inventory.map((item) => item.id).join("|");
  const orderedIds = useMemo(
    () =>
      hero.inventory
        .filter(
          (item) => item.slot === slot && isCompatible(item, hero.classId),
        )
        .sort(
          (first, second) =>
            Number(second.id === current?.id) -
              Number(first.id === current?.id) || second.level - first.level,
        )
        .map((item) => item.id),
    [game, inventoryIds, hero.classId, slot],
  );
  const candidates = orderedIds.flatMap((id) =>
    byId.has(id) ? [byId.get(id)!] : [],
  );
  const shown = pageSlice(candidates, page, 12);
  return (
    <Modal
      id="equipment-picker"
      title={`Выберите: ${SLOT_LABELS[slot].toLowerCase()}`}
      eyebrow="ВЫБОР СНАРЯЖЕНИЯ"
      onClose={closeDialog}
      className="equipment-picker-dialog"
    >
      <p className="equipment-dialog-copy">
        Подходящие вещи из вашего инвентаря. Надетые предметы можно снять.
      </p>
      <div className="picker-current" id="equipment-picker-current">
        <p className="eyebrow">СЕЙЧАС НАДЕТО</p>
        {current ? (
          <div className="picker-current-line">
            <div>
              <strong>{itemName(current)}</strong>
              <small>
                {RARITY_LABELS[current.rarity]} · {statsText(current.stats)}
              </small>
            </div>
            <button
              className="small-button muted"
              type="button"
              onClick={() => act((world) => world.unequip(slot))}
            >
              Снять
            </button>
          </div>
        ) : (
          <p className="empty-copy">Слот пока пуст.</p>
        )}
      </div>
      <div className="equipment-picker-grid" id="equipment-picker-grid">
        {shown.items.map((item) => (
          <ItemCard key={item.id} item={item} picker />
        ))}
        {!candidates.length && (
          <p className="empty-copy">
            В инвентаре пока нет подходящих предметов для этого слота.
          </p>
        )}
      </div>
      <Pagination {...shown} onChange={setPage} />
    </Modal>
  );
}

function ComparisonItem({
  item,
  heading,
  id,
  candidate = false,
}: {
  item?: EquipmentItem;
  heading: string;
  id: string;
  candidate?: boolean;
}) {
  const { game } = useGame();
  return (
    <article
      id={id}
      className={`comparison-item${candidate ? " candidate" : ""}${item ? " has-item" : ""}`}
      style={
        item
          ? ({
              "--rarity-color": rarityColors[item.rarity],
            } as React.CSSProperties)
          : undefined
      }
    >
      <p className="eyebrow">{heading}</p>
      {item ? (
        <>
          <EquipmentArt
            item={item}
            slot={item.slot}
            classId={game.save.hero.classId}
            className="comparison-art equipment-art"
          />
          <div className="comparison-item-copy">
            <small>
              {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]}
            </small>
            <h3>{itemName(item)}</h3>
            <p className="item-stats">{statsText(item.stats)}</p>
            {item.affix && (
              <p className="item-affix">
                {item.affix.name}: +{item.affix.value}{" "}
                {statShortLabels[item.affix.stat]}
              </p>
            )}
            {item.grantedSkillId && (
              <p className="item-skill">
                Навык:{" "}
                {skillById(item.grantedSkillId)?.name ?? "Неизвестный навык"}
              </p>
            )}
            {item.relicProperties?.map((property) => (
              <p
                className="item-relic-property"
                key={`${property.name}-${property.stat}`}
              >
                {property.name}: +{property.value}{" "}
                {statShortLabels[property.stat]}
              </p>
            ))}
          </div>
        </>
      ) : (
        <>
          <h3>Слот пуст</h3>
          <p className="comparison-empty">Предмет этого типа пока не надет.</p>
        </>
      )}
    </article>
  );
}

export function EquipmentComparisonDialog({
  itemId,
  shopIndex,
}: {
  itemId: string;
  shopIndex?: number;
}) {
  const { game, revision, act, closeDialog, notify } = useGame();
  const { hero, byId } = useEquipment();
  const offer =
    shopIndex === undefined ? undefined : game.save.shopOffers[shopIndex];
  const item = offer?.item ?? byId.get(itemId);
  const current = item ? byId.get(hero.equipped[item.slot] ?? "") : undefined;
  const comparison = useMemo(
    () => (item ? compareEquipment(hero, item, current) : undefined),
    [game, revision, itemId, shopIndex],
  );
  const equipped = item && hero.equipped[item.slot] === item.id;
  const disabled =
    !item ||
    (offer
      ? offer.sold || hero.gold < item.price
      : equipped || !isCompatible(item, hero.classId));
  const submit = () => {
    if (!item) return;
    const completed = act((world) => {
      if (shopIndex !== undefined) world.buy(shopIndex);
      else world.equip(item.id);
      return true;
    });
    if (completed) {
      if (shopIndex !== undefined)
        notify({
          eyebrow: "НОВАЯ ПОКУПКА",
          title: itemName(item),
          description: "Снаряжение добавлено в инвентарь.",
          symbol: "◆",
          tone: "positive",
          sound: "loot",
        });
      closeDialog();
    }
  };
  return (
    <Modal
      id="equipment-comparison"
      title="Что изменится"
      eyebrow="СРАВНЕНИЕ СНАРЯЖЕНИЯ"
      onClose={closeDialog}
      className="comparison-dialog"
      footer={
        <div className="comparison-actions">
          <button className="button" type="button" onClick={closeDialog}>
            Закрыть
          </button>
          <button
            id="comparison-equip"
            className="button primary"
            type="button"
            disabled={Boolean(disabled)}
            onClick={submit}
          >
            {offer
              ? offer.sold
                ? "Продано"
                : `Купить · ${number.format(item?.price ?? 0)} ¤`
              : equipped
                ? "Уже надето"
                : item && !isCompatible(item, hero.classId)
                  ? "Не подходит классу"
                  : "Надеть выбранное"}
          </button>
        </div>
      }
    >
      {item && comparison ? (
        <>
          <div className="comparison-columns">
            <ComparisonItem
              id="comparison-equipped"
              item={current}
              heading="СЕЙЧАС НАДЕТО"
            />
            <div className="comparison-arrow" aria-hidden="true">
              →
            </div>
            <ComparisonItem
              id="comparison-candidate"
              item={item}
              heading="ВЫБРАННЫЙ ПРЕДМЕТ"
              candidate
            />
          </div>
          <section className="comparison-difference">
            <div>
              <p className="eyebrow">ИЗМЕНЕНИЕ ХАРАКТЕРИСТИК</p>
              <h3>Разница после замены</h3>
            </div>
            <div id="comparison-stat-list" className="comparison-stat-list">
              {statKeys.map((stat) => (
                <StatDelta
                  key={stat}
                  stat={stat}
                  current={comparison.current[stat]}
                  candidate={comparison.candidate[stat]}
                />
              ))}
            </div>
            <p className="comparison-note">
              Итоговые характеристики героя: учтены комплекты, наследие и предел
              критического шанса 60%. Условия арены могут изменить их в бою.
            </p>
          </section>
        </>
      ) : (
        <p className="empty-copy">
          Предмет больше не находится в инвентаре или лавке.
        </p>
      )}
    </Modal>
  );
}
