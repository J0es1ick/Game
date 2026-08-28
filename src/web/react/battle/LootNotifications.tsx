import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compareEquipment } from "../../../gameplay/EquipmentComparison";
import { RARITY_LABELS } from "../../../catalogs/WorldCatalog";
import type { EquipmentItem } from "../../../gameplay/WorldTypes";
import { css } from "../components/common";
import { useAppState, useGame, type LootNotice } from "../state/GameContext";
import { EquipmentArt } from "../equipment/Artwork";
import {
  itemName,
  isCompatible,
  rarityColors,
  statKeys,
} from "../equipment/model";
import { StatDelta } from "../equipment/shared";
import "./battle-react.css";

export function LootNotifications() {
  const state = useAppState();
  const blocked = state.dialogs.some(
    (dialog) =>
      dialog.kind === "battle" ||
      dialog.kind === "dungeon" ||
      dialog.kind === "new-chronicle" ||
      dialog.kind === "tutorial" ||
      dialog.kind === "narrative",
  );
  const notice = state.loot[0];
  if (!notice || blocked) return null;
  return (
    <LootNotification
      key={notice.id}
      notice={notice}
      remainingCount={state.loot.length}
    />
  );
}

function LootNotification({
  notice,
  remainingCount,
}: {
  notice: LootNotice;
  remainingCount: number;
}) {
  const { game, revision, store, act } = useGame();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(5000);
  const byId = useMemo(
    () => new Map(game.save.hero.inventory.map((item) => [item.id, item])),
    [game, revision],
  );
  const item = byId.get(notice.itemId);
  const equipped = byId.get(notice.equippedItemId ?? "");
  const comparison = useMemo(
    () => (item ? compareEquipment(game.save.hero, item, equipped) : undefined),
    [game, revision, item, equipped],
  );
  const paused = hovered || focused;
  useEffect(() => {
    if (!item) store.dismissLoot(notice.id);
  }, [item, store, notice.id]);
  useEffect(() => {
    if (paused) return;
    const started = performance.now();
    const timer = window.setTimeout(
      () => store.dismissLoot(notice.id),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (performance.now() - started),
      );
    };
  }, [paused, notice.id, store]);
  if (!item || !comparison) return null;
  const alreadyEquipped = game.save.hero.equipped[item.slot] === item.id;
  const compatible = isCompatible(item, game.save.hero.classId);
  const itemCard = (candidate: EquipmentItem | undefined, label: string) => (
    <article
      style={css({
        "--rarity-color": candidate
          ? rarityColors[candidate.rarity]
          : undefined,
      })}
    >
      <small>{label}</small>
      {candidate ? (
        <>
          <EquipmentArt
            item={candidate}
            slot={candidate.slot}
            classId={game.save.hero.classId}
          />
          <strong>{itemName(candidate)}</strong>
          <span>
            {RARITY_LABELS[candidate.rarity]} · ур. {candidate.level}
          </span>
        </>
      ) : (
        <strong>Слот пуст</strong>
      )}
    </article>
  );
  return createPortal(
    <aside
      id="loot-reminder"
      className={`loot-reminder react-loot-reminder${paused ? " timer-paused" : ""}`}
      role="status"
      aria-live="polite"
      aria-labelledby="loot-reminder-title"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <header>
        <div>
          <p className="eyebrow">
            ПОЛУЧЕНА ДОБЫЧА
            {remainingCount > 1 ? ` · ЕЩЁ ${remainingCount - 1}` : ""}
          </p>
          <h2 id="loot-reminder-title">Сравнить предмет</h2>
        </div>
        <button
          className="dialog-close"
          type="button"
          aria-label="Закрыть уведомление"
          onClick={() => store.dismissLoot(notice.id)}
        >
          ×
        </button>
      </header>
      <div className="loot-reminder-items">
        {itemCard(equipped, "Было надето")}
        <span aria-hidden="true">→</span>
        {itemCard(item, "Новая находка")}
      </div>
      <div className="loot-reminder-difference">
        {statKeys.map((stat) => (
          <StatDelta
            key={stat}
            stat={stat}
            current={comparison.current[stat]}
            candidate={comparison.candidate[stat]}
            className="loot-reminder-stat"
          />
        ))}
      </div>
      <button
        className="button primary"
        type="button"
        disabled={alreadyEquipped || !compatible}
        onClick={() => {
          if (
            act((world) => {
              world.equip(item.id);
              return true;
            })
          )
            store.dismissLoot(notice.id);
        }}
      >
        {alreadyEquipped
          ? "Уже надето"
          : compatible
            ? "Надеть"
            : "Не подходит классу"}
      </button>
      <i className="loot-reminder-timebar" aria-hidden="true" />
    </aside>,
    document.body,
  );
}
