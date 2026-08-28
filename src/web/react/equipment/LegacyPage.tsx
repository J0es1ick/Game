import { type CSSProperties } from "react";
import {
  RELIC_PATHS,
  RELIC_TIER_THRESHOLDS,
} from "../../../catalogs/WorldExpansionCatalog";
import { RARITY_LABELS, SLOT_LABELS } from "../../../catalogs/WorldCatalog";
import { sortLegacyPathCandidates } from "../../../gameplay/EquipmentLegacy";
import { PageHeading, LazyDetails } from "../components/common";
import { useGame } from "../state/GameContext";
import { EquipmentArt } from "./Artwork";
import { LegacySalvage } from "./LegacySalvage";
import { LootTarget } from "./LootTarget";
import { RelicGifts } from "./RelicGifts";
import { itemName, pageSlice, rarityColors, statsText } from "./model";
import { Pagination, StatRow, useEquipment } from "./shared";
import { useEquipmentSessionState } from "./sessionState";

export function LegacyPage() {
  const { game, act, notify } = useGame();
  const { hero, equippedIds } = useEquipment();
  const [page, setPage] = useEquipmentSessionState(game, "legacy.page", 0);
  const relics = sortLegacyPathCandidates(
    hero.inventory.filter(
      (item) => item.rarity === "legendary" || item.rarity === "mythic",
    ),
    equippedIds,
  );
  const shown = pageSlice(relics, page, 18);
  if (!game.isFeatureUnlocked("equipment-legacy"))
    return (
      <section className="page active" id="page-legacy">
        <PageHeading eyebrow="ПОЗДНЕЕ РАЗВИТИЕ" title="Наследие" />
        <p className="empty-copy">
          Наследие снаряжения откроется по мере прохождения арен.
        </p>
      </section>
    );
  return (
    <section className="page active" id="page-legacy">
      <PageHeading eyebrow="ДОБЫЧА И ИСТОРИЯ СНАРЯЖЕНИЯ" title="Наследие">
        <p>
          Направляйте будущие находки и развивайте легендарные вещи, которые
          заслужили имя в боях.
        </p>
      </PageHeading>
      <div className="legacy-layout">
        <LootTarget />
        <section
          className="relic-workshop paper-panel"
          id="relic-workshop"
          aria-labelledby="relic-workshop-title"
        >
          <div className="relic-workshop-head">
            <p className="eyebrow">РАЗВИТИЕ РЕЛИКВИЙ</p>
            <h2 id="relic-workshop-title">Предметы помнят победы</h2>
            <p>
              Надетые легендарные и мифические вещи получают известность в боях.
              На первой ступени можно выбрать постоянный путь за 8 единиц
              реликтовой пыли.
            </p>
          </div>
          <div id="legacy-relic-dust">
            <StatRow label="Реликтовая пыль" value={hero.relicDust} />
          </div>
          <Pagination {...shown} onChange={setPage} />
          <div className="relic-ready-list">
            {shown.items.map((item) => {
              const equipped = equippedIds.has(item.id);
              const tier = item.relicTier ?? 0;
              const chosen = RELIC_PATHS.find(
                (path) => path.id === item.relicPath,
              );
              return (
                <article
                  key={item.id}
                  className={`relic-ready-card rarity-${item.rarity}${equipped ? " equipped" : ""}`}
                  data-relic-ready-item-id={item.id}
                  style={
                    {
                      "--rarity-accent": rarityColors[item.rarity],
                    } as CSSProperties
                  }
                >
                  <div className="relic-ready-copy">
                    <div className="relic-ready-identity">
                      <EquipmentArt
                        item={item}
                        slot={item.slot}
                        classId={hero.classId}
                        className="equipment-art relic-ready-art"
                      />
                      <div>
                        <small className="relic-item-kicker">
                          {SLOT_LABELS[item.slot]} ·{" "}
                          {RARITY_LABELS[item.rarity]} · {item.level} ур.
                        </small>
                        <strong>{itemName(item)}</strong>
                      </div>
                      {equipped && (
                        <span className="relic-item-status equipped">
                          Надето
                        </span>
                      )}
                    </div>
                    <small className="relic-progress-copy">
                      Наследие {tier}/3 · известность {item.relicRenown ?? 0}
                      {tier < 3
                        ? ` · следующий порог ${RELIC_TIER_THRESHOLDS[tier + 1]}`
                        : " · высшая ступень"}
                    </small>
                    {chosen && (
                      <p>
                        {chosen.name} · {statsText(chosen.stats)}
                      </p>
                    )}
                    {item.relicProperties?.map((property, index) => (
                      <p key={`${property.name}-${index}`}>
                        {property.name}: +{property.value} ·{" "}
                        {property.description}
                      </p>
                    ))}
                    {!!item.relicHistory?.length && (
                      <LazyDetails
                        summary="История предмета"
                        className="relic-history"
                      >
                        {() => (
                          <ul>
                            {item.relicHistory!.map((event, index) => (
                              <li key={index}>{event}</li>
                            ))}
                          </ul>
                        )}
                      </LazyDetails>
                    )}
                  </div>
                  <div>
                    {RELIC_PATHS.map((path) => {
                      const tooltipId = `relic-path-${item.id}-${path.id}`;
                      return (
                        <div className="relic-path-option" key={path.id}>
                          <button
                            className={`plain-button${item.relicPath === path.id ? " active" : ""}`}
                            type="button"
                            aria-describedby={tooltipId}
                            disabled={
                              hero.relicDust < 8 ||
                              tier < 1 ||
                              Boolean(item.relicPath)
                            }
                            onClick={() => {
                              const result = act((world) =>
                                world.awakenRelic(item.id, path.id),
                              );
                              if (result)
                                notify({
                                  eyebrow: "ПРОБУЖДЕНИЕ РЕЛИКВИИ",
                                  title: path.name,
                                  description: path.description,
                                  stats: statsText(path.stats)
                                    .split(" · ")
                                    .filter(Boolean),
                                  symbol: "✦",
                                  tone: "legendary",
                                  sound: "loot",
                                  duration: 2800,
                                });
                            }}
                          >
                            {item.relicPath === path.id ? "✓ " : ""}
                            {path.name}
                          </button>
                          <aside
                            className="relic-path-tooltip"
                            id={tooltipId}
                            role="tooltip"
                          >
                            <small>ПОСТОЯННЫЙ ВЫБОР</small>
                            <strong>{path.name}</strong>
                            <p>{path.description}</p>
                            <b className="feature-stats">
                              {statsText(path.stats)}
                            </b>
                          </aside>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
            {!relics.length && (
              <p className="empty-copy">Легендарных предметов пока нет.</p>
            )}
          </div>
          <Pagination {...shown} onChange={setPage} />
          <RelicGifts />
          <LegacySalvage />
        </section>
      </div>
    </section>
  );
}
