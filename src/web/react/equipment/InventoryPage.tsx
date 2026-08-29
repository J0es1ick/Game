import { useMemo } from "react";
import { describeSetProgress } from "../../../gameplay/AdvancedBattle";
import {
  EQUIPMENT_SETS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../catalogs/WorldCatalog";
import type { Rarity } from "../../../gameplay/WorldTypes";
import { useGame } from "../state/GameContext";
import { PageHeading } from "../components/common";
import { EquipmentArt } from "./Artwork";
import { ItemCard } from "./ItemCard";
import {
  equipmentSlots,
  filteredInventory,
  itemName,
  pageSlice,
  statsText,
  type InventoryFilters,
} from "./model";
import { GearActions, HeroStats, Pagination, useEquipment } from "./shared";
import { useEquipmentSessionState } from "./sessionState";

export function InventoryPage() {
  const { game, revision, act, openDialog } = useGame();
  const { hero, byId, equippedIds, equipped } = useEquipment();
  const [filters, setFilters] = useEquipmentSessionState<InventoryFilters>(
    game,
    "inventory.filters",
    { slot: "all", set: "all", rarity: "all", order: "newest" },
  );
  const [page, setPage] = useEquipmentSessionState(game, "inventory.page", 0);
  const items = useMemo(
    () => filteredInventory(hero.inventory, filters),
    [game, revision, filters],
  );
  const shown = pageSlice(items, page, 24);
  const bonuses = useMemo(() => describeSetProgress(equipped), [equipped]);
  const sellableCount = useMemo(
    () =>
      hero.inventory.filter(
        (item) => !equippedIds.has(item.id) && game.canSellItem(item),
      ).length,
    [game, revision, equippedIds],
  );
  const filter = (next: Partial<InventoryFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(0);
  };
  const sellUnused = () => {
    if (
      !window.confirm(
        `Продать неиспользуемые предметы (${sellableCount})? Надетые вещи и регалии короны останутся у героя.`,
      )
    )
      return;
    act((world) => world.sellUnequipped());
  };
  return (
    <section className="page active equipment-page" id="page-arsenal">
      <PageHeading eyebrow="СНАРЯЖЕНИЕ ГЕРОЯ" title="Инвентарь">
        <p>
          Сравнивайте характеристики и выбирайте вещи перед следующей
          активностью.
        </p>
      </PageHeading>
      <div className="arsenal-layout">
        <section className="paper-panel equipment-panel">
          <h2>Надето</h2>
          <GearActions compact id="inventory-gear-actions" />
          <div className="equipment-grid" id="equipment-grid">
            {equipmentSlots.map((slot) => {
              const item = byId.get(hero.equipped[slot] ?? "");
              return (
                <button
                  type="button"
                  key={slot}
                  className={`equipment-slot ${item?.rarity ?? "empty"}`}
                  aria-label={`Выбрать предмет: ${SLOT_LABELS[slot]}`}
                  onClick={() => openDialog({ kind: "equipment", slot })}
                >
                  {item && (
                    <EquipmentArt
                      slot={slot}
                      item={item}
                      classId={hero.classId}
                    />
                  )}
                  <small>{SLOT_LABELS[slot]}</small>
                  <strong>{item ? itemName(item) : "Пусто"}</strong>
                  {item && <span>{statsText(item.stats)}</span>}
                </button>
              );
            })}
          </div>
          <div id="set-bonuses">
            <h3>Активные комплекты</h3>
            {bonuses.length ? (
              bonuses.map((set) => (
                <p className="set-progress" key={set.name}>
                  {set.name}: {set.count} ч. {set.active.join(" · ")}
                </p>
              ))
            ) : (
              <p className="empty-copy">
                Две части одного комплекта открывают первый бонус.
              </p>
            )}
          </div>
        </section>
        <section className="paper-panel inventory-panel">
          <header className="inventory-heading">
            <div className="inventory-title">
              <p className="eyebrow">СОДЕРЖИМОЕ РЮКЗАКА</p>
              <h2>Предметы</h2>
              <small id="inventory-result-count">
                {shown.total
                  ? `${shown.current * 24 + 1}–${shown.current * 24 + shown.items.length}`
                  : "0"}{" "}
                из {shown.total}
              </small>
            </div>
            <button
              className="plain-button inventory-sell-all"
              id="inventory-sell-unequipped"
              type="button"
              disabled={!sellableCount}
              onClick={sellUnused}
            >
              <span>
                {sellableCount
                  ? `Продать неиспользуемое · ${sellableCount}`
                  : "Нет неиспользуемых вещей"}
              </span>
              <small>Надетое и регалии останутся</small>
            </button>
          </header>
          <div className="inventory-filter-stack">
            <div className="filter-row" id="inventory-filters">
              {(["all", ...equipmentSlots] as const).map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={filters.slot === slot ? "active" : ""}
                  aria-pressed={filters.slot === slot}
                  onClick={() => filter({ slot })}
                >
                  {slot === "all" ? "Все" : SLOT_LABELS[slot]}
                </button>
              ))}
            </div>
            <label>
              <span data-term="set">Комплект</span>
              <select
                id="inventory-set-filter"
                value={filters.set}
                onChange={(event) => filter({ set: event.target.value })}
              >
                <option value="all">Все комплекты</option>
                <option value="none">Без комплекта</option>
                {EQUIPMENT_SETS.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span data-term="rarity">Редкость</span>
              <select
                id="inventory-rarity-filter"
                value={filters.rarity}
                onChange={(event) =>
                  filter({ rarity: event.target.value as Rarity | "all" })
                }
              >
                <option value="all">Все редкости</option>
                {Object.entries(RARITY_LABELS).map(([rarity, label]) => (
                  <option key={rarity} value={rarity}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Новизна
              <select
                id="inventory-sort"
                value={filters.order}
                onChange={(event) =>
                  filter({
                    order: event.target.value as InventoryFilters["order"],
                  })
                }
              >
                <option value="newest">Сначала новые</option>
                <option value="oldest">Сначала старые</option>
              </select>
            </label>
          </div>
          <Pagination {...shown} onChange={setPage} />
          <div className="item-grid" id="inventory-grid">
            {shown.items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
            {!items.length && (
              <p className="empty-copy">По выбранным фильтрам предметов нет.</p>
            )}
          </div>
          <Pagination {...shown} onChange={setPage} />
        </section>
        <HeroStats />
      </div>
    </section>
  );
}
