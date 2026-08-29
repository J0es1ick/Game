import type { EquipmentItem } from "../../../gameplay/WorldTypes";
import { RARITY_LABELS, SLOT_LABELS } from "../../../catalogs/WorldCatalog";
import { skillById } from "../../../gameplay/WorldGame";
import { useGame } from "../state/GameContext";
import { EquipmentArt } from "./Artwork";
import { isCompatible, itemName, number, statShortLabels, statsText } from "./model";

export function ItemCard({
  item,
  shopIndex,
  sold = false,
  picker = false,
}: {
  item: EquipmentItem;
  shopIndex?: number;
  sold?: boolean;
  picker?: boolean;
}) {
  const { game, act, openDialog, notify } = useGame();
  const hero = game.save.hero;
  const equipped = hero.equipped[item.slot] === item.id;
  const compatible = isCompatible(item, hero.classId);
  const protectedItem = !game.canSellItem(item);
  const legacy =
    game.isFeatureUnlocked("equipment-legacy") &&
    (item.rarity === "legendary" || item.rarity === "mythic" || item.rarity === "relic");
  const buy = () => {
    const bought = act((world) => world.buy(shopIndex!));
    if (bought)
      notify({
        eyebrow: "НОВАЯ ПОКУПКА",
        title: itemName(bought),
        description: "Снаряжение добавлено в инвентарь.",
        symbol: "◆",
        tone: "positive",
        sound: "loot",
      });
  };
  return (
    <article
      className={`item-card ${item.rarity}${sold ? " sold" : ""}${equipped ? " equipped" : ""}`}
      data-item-id={item.id}
    >
      <div className="item-head">
        <span className="item-slot">
          {SLOT_LABELS[item.slot]}
          {equipped ? " · НАДЕТО" : ""}
        </span>
        <span className="rarity-label" data-term="rarity">
          {RARITY_LABELS[item.rarity]}
        </span>
      </div>
      <EquipmentArt item={item} slot={item.slot} classId={hero.classId} />
      <h3>{itemName(item)}</h3>
      <small
        data-term={
          legacy ? "relic" : item.enhancement ? "enhancement" : "level"
        }
      >
        Предмет {item.level} уровня
        {item.enhancement ? ` · закалка +${item.enhancement}` : ""}
        {legacy ? ` · наследие ${item.relicTier ?? 0}/3` : ""}
      </small>
      <p className="item-stats">{statsText(item.stats)}</p>
      {item.worldRelicId && (
        <p className="world-relic-mark">
          Высшая редкость · история, имя и сила сохраняются при смене владельца
        </p>
      )}
      {item.affix && (
        <p className="item-affix">
          {item.affix.name}: +{item.affix.value} · {item.affix.description}
        </p>
      )}
      {item.grantedSkillId && (
        <p className="item-skill">
          Навык: {skillById(item.grantedSkillId)?.name ?? "Неизвестный навык"}
        </p>
      )}
      {item.relicProperties?.map((property) => (
        <p className="item-relic-property" key={`${property.name}-${property.stat}`}>
          {property.name}: +{property.value} {statShortLabels[property.stat]} · {property.description}
        </p>
      ))}
      <div className="item-controls">
        <button
          className="small-button muted"
          type="button"
          disabled={sold || (equipped && shopIndex === undefined)}
          onClick={() =>
            openDialog({ kind: "comparison", itemId: item.id, shopIndex })
          }
        >
          Сравнить
        </button>
        {shopIndex !== undefined ? (
          <button
            className="button"
            type="button"
            onClick={buy}
            disabled={sold || hero.gold < item.price}
          >
            {sold ? "Продано" : `Купить · ${number.format(item.price)} ¤`}
          </button>
        ) : (
          <>
            <button
              className="small-button"
              type="button"
              disabled={!equipped && !compatible}
              onClick={() =>
                act((world) =>
                  equipped ? world.unequip(item.slot) : world.equip(item.id),
                )
              }
            >
              {equipped ? "Снять" : compatible ? "Надеть" : "Другой класс"}
            </button>
            {!picker && (
              <button
                className="small-button muted sell-button"
                type="button"
                disabled={equipped || protectedItem}
                title={
                  protectedItem ? "Регалии короны нельзя продать." : undefined
                }
                onClick={() => act((world) => world.sell(item.id))}
              >
                {protectedItem
                  ? "Регалия короны"
                  : `Продать · ${number.format(Math.max(1, Math.round(item.price * 0.45)))} ¤`}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
