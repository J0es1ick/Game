import { useMemo, useState } from "react";
import { CLASS_DEFINITIONS } from "../../../catalogs/WorldCatalog";
import type { EquipmentItem } from "../../../gameplay/WorldTypes";
import { LazyDetails } from "../components/common";
import { useGame } from "../state/GameContext";
import { EquipmentArt } from "./Artwork";
import { itemName, pageSlice } from "./model";
import { Pagination, useEquipment } from "./shared";
import { useEquipmentSessionState } from "./sessionState";

function RelicGiftForm({ item }: { item: EquipmentItem }) {
  const { game, revision, act, notify } = useGame();
  const recipients = useMemo(
    () => game.relicRecipients(item.id),
    [game, revision, item.id],
  );
  const [selected, setSelected] = useState("");
  const recipient =
    recipients.find((fighter) => fighter.id === selected) ?? recipients[0];
  const give = () => {
    if (
      !recipient ||
      !window.confirm(
        `Передать «${itemName(item)}» бойцу ${recipient.name}? Предмет уйдёт из вашего инвентаря. Вернуть подарок кнопкой отмены нельзя.`,
      )
    )
      return;
    const result = act((world) => {
      world.giftRelic(item.id, recipient.id);
      return true;
    });
    if (result)
      notify({
        eyebrow: "МИРОВАЯ РЕЛИКВИЯ",
        title: "Новый владелец",
        description: `${recipient.name} получил предмет «${itemName(item)}».`,
        symbol: "✦",
        tone: "legendary",
        duration: 3000,
      });
  };
  if (!recipients.length)
    return (
      <p className="empty-copy">
        Сейчас нет живых бойцов, которым подходит эта реликвия.
      </p>
    );
  return (
    <div className="relic-gift-row">
      <EquipmentArt
        item={item}
        slot={item.slot}
        classId={game.save.hero.classId}
      />
      <strong>{itemName(item)}</strong>
      <select
        aria-label={`Получатель реликвии ${itemName(item)}`}
        value={recipient?.id ?? ""}
        onChange={(event) => setSelected(event.target.value)}
      >
        {recipients.map((fighter) => (
          <option key={fighter.id} value={fighter.id}>
            {fighter.name} · {CLASS_DEFINITIONS[fighter.classId].name} · ур.{" "}
            {fighter.level}
          </option>
        ))}
      </select>
      <button className="plain-button" type="button" onClick={give}>
        Передать
      </button>
    </div>
  );
}

export function RelicGifts() {
  const { game } = useGame();
  const { hero, equippedIds } = useEquipment();
  const [page, setPage] = useEquipmentSessionState(game, "legacy.giftsPage", 0);
  const items = hero.inventory.filter(
    (item) => item.worldRelicId && !equippedIds.has(item.id),
  );
  const shown = pageSlice(items, page, 12);
  return (
    <section className="relic-gift-list">
      <h3>Передать реликвию в мир</h3>
      <p>
        Ненадетую мировую реликвию можно подарить совместимому живому бойцу.
        Предмет покинет инвентарь, продолжит свою историю у нового владельца и
        может встретиться вам снова.
      </p>
      {shown.items.map((item) => (
        <LazyDetails
          key={item.id}
          summary={itemName(item)}
          className="relic-gift-details"
        >
          {() => <RelicGiftForm item={item} />}
        </LazyDetails>
      ))}
      {!items.length && (
        <p className="empty-copy">
          Пока нет ненадетых мировых реликвий для передачи.
        </p>
      )}
      <Pagination {...shown} onChange={setPage} />
    </section>
  );
}
