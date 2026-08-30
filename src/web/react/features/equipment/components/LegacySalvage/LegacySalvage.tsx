import { useMemo, type CSSProperties } from "react";
import { buildLegacySalvageEntries } from "../../../../../../gameplay/equipment/EquipmentLegacy";
import {
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../../../../catalogs/WorldCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { EquipmentArt } from "../Artwork/Artwork";
import {
  itemName,
  pageSlice,
  rarityColors,
  statsText,
} from "../../utils/model";
import { Pagination, useEquipment } from "../EquipmentShared/EquipmentShared";
import { useEquipmentSessionState } from "../../utils/sessionState";

export function LegacySalvage() {
  const { game, revision, act, notify } = useGame();
  const { hero, equippedIds, byId } = useEquipment();
  const [selected, setSelected] = useEquipmentSessionState<ReadonlySet<string>>(
    game,
    "legacy.salvageSelection",
    () => new Set(),
  );
  const [page, setPage] = useEquipmentSessionState(
    game,
    "legacy.salvagePage",
    0,
  );
  const entries = useMemo(
    () =>
      buildLegacySalvageEntries(hero.inventory, equippedIds, (id) => {
        const item = byId.get(id);
        return Boolean(item && game.canSellItem(item));
      }),
    [game, revision, equippedIds, byId],
  );
  const available = entries.filter((entry) => entry.status === "available");
  const selectedEntries = available.filter((entry) =>
    selected.has(entry.item.id),
  );
  const totalDust = selectedEntries.reduce(
    (total, entry) => total + entry.dust,
    0,
  );
  const shown = pageSlice(entries, page, 24);
  const select = (id: string, checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const salvage = (ids: string[], dust: number) => {
    const names =
      ids.length === 1
        ? `«${itemName(byId.get(ids[0])!)}»`
        : `выбранные предметы (${ids.length})`;
    if (
      !window.confirm(
        `Разобрать ${names} без возможности восстановления?\nБудет получено: ${dust} пыли.`,
      )
    )
      return;
    const result = act((world) => world.salvageItems(ids));
    if (result === undefined) return;
    setSelected((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    notify({
      eyebrow: "НАСЛЕДИЕ СНАРЯЖЕНИЯ",
      title:
        ids.length === 1 ? "Предмет разобран" : "Выбранные предметы разобраны",
      description: `Разобрано предметов: ${ids.length}.`,
      stats: [`+${result} пыли`],
      symbol: "✦",
      tone: "neutral",
      sound: "forge",
    });
  };
  return (
    <section className="relic-salvage" id="legacy-salvage">
      <div className="relic-salvage-heading">
        <div className="relic-salvage-heading-copy">
          <h3 className="relic-salvage-title">Разобрать предметы в пыль</h3>
          <small>
            Доступно для разбора: {available.length} из {entries.length}
          </small>
        </div>
        <div className="relic-salvage-bulk">
          <small className="relic-salvage-selection">
            {selectedEntries.length
              ? `Выбрано: ${selectedEntries.length} · будет получено ${totalDust} пыли`
              : "Ничего не выбрано"}
          </small>
          <button
            className="button relic-salvage-bulk-button"
            type="button"
            disabled={!selectedEntries.length}
            onClick={() =>
              salvage(
                selectedEntries.map((entry) => entry.item.id),
                totalDust,
              )
            }
          >
            Разобрать выбранное
            {selectedEntries.length ? ` · ${selectedEntries.length}` : ""}
          </button>
        </div>
      </div>
      <Pagination {...shown} onChange={setPage} />
      <div className="relic-salvage-list">
        {shown.items.map((entry) => {
          const item = entry.item;
          const checked = entry.status === "available" && selected.has(item.id);
          return (
            <article
              key={item.id}
              className={`relic-salvage-card rarity-${item.rarity} status-${entry.status}${checked ? " selected" : ""}`}
              style={
                {
                  "--rarity-accent": rarityColors[item.rarity],
                } as CSSProperties
              }
            >
              <label className="relic-salvage-selector">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={entry.status !== "available"}
                  aria-label={`Выбрать для разбора: ${itemName(item)}`}
                  onChange={(event) => select(item.id, event.target.checked)}
                />
                <span>
                  {entry.status === "available" ? "Выбрать" : "Недоступно"}
                </span>
              </label>
              <EquipmentArt
                item={item}
                slot={item.slot}
                classId={hero.classId}
                className="equipment-art relic-salvage-art"
              />
              <div className="relic-salvage-copy">
                <small className="relic-item-kicker">
                  {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]} ·{" "}
                  {item.level} ур.
                  {item.enhancement ? ` · закалка +${item.enhancement}` : ""}
                </small>
                <strong>{itemName(item)}</strong>
                <span className="relic-salvage-stats">
                  {statsText(item.stats) || "Без базовых характеристик"}
                </span>
              </div>
              <div className="relic-salvage-state">
                {entry.status === "equipped" ? (
                  <>
                    <span className="relic-item-status equipped">Надето</span>
                    <small>После снятия: {entry.dust} пыли</small>
                  </>
                ) : entry.status === "protected" ? (
                  <>
                    <span className="relic-item-status protected">
                      Не разбирается
                    </span>
                    <small>Регалия элиты защищена</small>
                  </>
                ) : (
                  <button
                    className="plain-button relic-salvage-button"
                    type="button"
                    onClick={() => salvage([item.id], entry.dust)}
                  >
                    Разобрать · +{entry.dust} пыли
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!entries.length && (
          <p className="empty-copy">В инвентаре пока нет предметов.</p>
        )}
      </div>
      <Pagination {...shown} onChange={setPage} />
    </section>
  );
}
