import { useMemo, useState, type CSSProperties } from "react";
import { RARITY_LABELS, SLOT_LABELS } from "../../../catalogs/WorldCatalog";
import { factionModifier } from "../../../gameplay/FactionSystem";
import { reforgeCost } from "../../../gameplay/LootProgression";
import type { EquipmentItem, Stats } from "../../../gameplay/WorldTypes";
import { PageHeading, LazyDetails } from "../components/common";
import { useGame } from "../state/GameContext";
import { EquipmentArt } from "./Artwork";
import {
  itemName,
  number,
  pageSlice,
  rarityColors,
  statKeys,
  statLabels,
  statsText,
} from "./model";
import { Pagination, useEquipment } from "./shared";
import { useEquipmentSessionState } from "./sessionState";

function ReforgeForm({ item }: { item: EquipmentItem }) {
  const { game, act, notify } = useGame();
  const sources = statKeys.filter((stat) => item.stats[stat] !== undefined);
  const [selectedSource, setSource] = useState<keyof Stats>(
    sources[0] ?? "attack",
  );
  const source = sources.includes(selectedSource) ? selectedSource : sources[0];
  const targets = statKeys.filter(
    (stat) => stat === source || item.stats[stat] === undefined,
  );
  const [selectedTarget, setTarget] = useState<keyof Stats>(source ?? "attack");
  const target = targets.includes(selectedTarget) ? selectedTarget : source;
  const attempts = game.save.reforgeAttempts[item.id] ?? 0;
  const cost = reforgeCost(item, attempts);
  const discount = Math.min(
    0.75,
    factionModifier(game.save.hero.factionReputation, "forgeDiscount"),
  );
  const gold = Math.max(0, Math.round(cost.gold * (1 - discount)));
  const reforge = () => {
    if (!source || !target) return;
    const result = act((world) =>
      world.reforgeItem(item.id, { sourceStat: source, targetStat: target }),
    );
    if (!result) return;
    setSource(result.targetStat as keyof Stats);
    setTarget(result.targetStat as keyof Stats);
    notify({
      eyebrow: "ПЕРЕКОВКА",
      title: itemName(item),
      description: `${statLabels[result.sourceStat as keyof Stats]} ${result.previousValue} → ${statLabels[result.targetStat as keyof Stats]} ${result.nextValue}.`,
      stats: [
        `Сила предмета ${result.powerDelta >= 0 ? "+" : ""}${result.powerDelta}`,
      ],
      symbol: "⚒",
      tone: result.powerDelta >= 0 ? "positive" : "neutral",
      sound: "forge",
    });
  };
  return (
    <div className="reforge-control-body">
      <label>
        Что заменить
        <select
          value={source}
          onChange={(event) => setSource(event.target.value as keyof Stats)}
        >
          {sources.map((stat) => (
            <option key={stat} value={stat}>
              {statLabels[stat]} +{item.stats[stat]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Во что перековать
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value as keyof Stats)}
        >
          {targets.map((stat) => (
            <option key={stat} value={stat}>
              {statLabels[stat]}
              {stat === source ? " — перебросить значение" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="reforge-price">
        {number.format(gold)} ¤ · {cost.temperingMarks} печ. · попытка{" "}
        {attempts + 1}
      </p>
      <button
        type="button"
        className="plain-button"
        disabled={
          !source ||
          !target ||
          game.save.hero.gold < gold ||
          game.save.hero.temperingMarks < cost.temperingMarks
        }
        onClick={reforge}
      >
        Перековать
      </button>
    </div>
  );
}

function ForgeCard({
  item,
  equipped,
}: {
  item: EquipmentItem;
  equipped: boolean;
}) {
  const { game, act, notify } = useGame();
  const enhancement = item.enhancement ?? 0;
  const cost = game.upgradeCostFor(item);
  const improve = () => {
    const upgraded = act((world) => world.upgradeItem(item.id));
    if (upgraded)
      notify({
        eyebrow: "КУЗНИЦА",
        title: `${itemName(upgraded)} · закалка +${upgraded.enhancement}`,
        description: "Характеристики предмета повышены навсегда.",
        symbol: "⚒",
        tone: "positive",
        sound: "forge",
      });
  };
  return (
    <article
      className={`forge-card paper-panel ${item.rarity}${equipped ? " equipped" : ""}`}
      data-item-id={item.id}
      style={{ "--rarity-color": rarityColors[item.rarity] } as CSSProperties}
    >
      <EquipmentArt
        item={item}
        slot={item.slot}
        classId={game.save.hero.classId}
        className="forge-art equipment-art"
      />
      <div className="forge-card-copy">
        <small>
          {equipped ? "НАДЕТО · " : ""}
          {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]}
        </small>
        <h3>{itemName(item)}</h3>
        <p>
          {item.level} ур. · закалка +{enhancement}/5
        </p>
        <p className="item-stats">{statsText(item.stats)}</p>
      </div>
      <div className="forge-card-actions">
        <button
          className="button"
          type="button"
          disabled={enhancement >= 5 || game.save.hero.temperingMarks < cost}
          onClick={improve}
        >
          {enhancement >= 5
            ? "Максимальная закалка"
            : `Улучшить · ${cost} печ.`}
        </button>
      </div>
      <LazyDetails
        className="reforge-control"
        summary="Перековать одно свойство"
      >
        {() => <ReforgeForm item={item} />}
      </LazyDetails>
    </article>
  );
}

export function ForgePage() {
  const { game } = useGame();
  const { hero, byId, equippedIds } = useEquipment();
  const [page, setPage] = useEquipmentSessionState(game, "forge.page", 0);
  const itemIds = hero.inventory.map((item) => item.id).join("|");
  const wornIds = [...equippedIds].sort().join("|");
  const orderedIds = useMemo(
    () =>
      [...hero.inventory]
        .sort(
          (first, second) =>
            Number(equippedIds.has(second.id)) -
              Number(equippedIds.has(first.id)) ||
            (second.enhancement ?? 0) - (first.enhancement ?? 0) ||
            second.level - first.level,
        )
        .map((item) => item.id),
    [game, itemIds, wornIds],
  );
  const ordered = orderedIds.flatMap((id) =>
    byId.has(id) ? [byId.get(id)!] : [],
  );
  const shown = pageSlice(ordered, page, 18);
  return (
    <section className="page active equipment-page" id="page-forge">
      <PageHeading eyebrow="ЗАКАЛКА И ПЕРЕКОВКА" title="Кузница">
        <p>
          Закаляйте вещи печатями или заменяйте одно свойство за монеты и
          печати. Оба улучшения навсегда меняют предмет.
        </p>
      </PageHeading>
      <div className="forge-summary paper-panel">
        <div>
          <small>ДОСТУПНЫЙ РЕСУРС</small>
          <strong id="forge-marks">
            {number.format(hero.temperingMarks)} печатей
          </strong>
        </div>
        <p>
          Каждый следующий уровень закалки дороже. Максимум — +5; характеристики
          предмета растут при каждом улучшении. Надетые вещи расположены
          первыми.
        </p>
      </div>
      <Pagination {...shown} onChange={setPage} />
      <div className="forge-grid" id="forge-grid">
        {shown.items.map((item) => (
          <ForgeCard
            key={item.id}
            item={item}
            equipped={equippedIds.has(item.id)}
          />
        ))}
        {!ordered.length && (
          <p className="empty-copy">В инвентаре нет предметов для закалки.</p>
        )}
      </div>
      <Pagination {...shown} onChange={setPage} />
    </section>
  );
}
