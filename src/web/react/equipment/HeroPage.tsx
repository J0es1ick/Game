import { useMemo, useState } from "react";
import {
  CLASS_DEFINITIONS,
  EQUIPMENT_SETS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../catalogs/WorldCatalog";
import { combatantSnapshot } from "../../../gameplay/AdvancedBattle";
import {
  CLASS_CHANGE_GOLD_COST,
  CLASS_CHANGE_MARK_COST,
} from "../../../gameplay/WorldGame";
import type { EquipmentSlot, HeroClass } from "../../../gameplay/WorldTypes";
import { useGame } from "../state/GameContext";
import { PageHeading } from "../components/common";
import { CharacterArt, EquipmentArt } from "./Artwork";
import { HeroHistory } from "./HeroHistory";
import { itemName, number, statsText } from "./model";
import { GearActions, StatRow, useEquipment } from "./shared";

function ClassChange() {
  const { game, act, notify, queueLoot } = useGame();
  const hero = game.save.hero;
  const [selected, setSelected] = useState<HeroClass>(
    hero.classId === "Knight" ? "Archer" : "Knight",
  );
  const classes = Object.values(CLASS_DEFINITIONS).filter(
    (definition) => definition.id !== hero.classId,
  );
  const choice =
    classes.find((entry) => entry.id === selected)?.id ?? classes[0].id;
  const availability = game.classChangeAvailability();
  const change = () => {
    if (
      !window.confirm(
        `Сменить класс на «${CLASS_DEFINITIONS[choice].name}» за ${number.format(CLASS_CHANGE_GOLD_COST)} ¤ и ${CLASS_CHANGE_MARK_COST} печатей?`,
      )
    )
      return;
    const previousIds = new Set(hero.inventory.map((item) => item.id));
    const equipmentBefore = { ...hero.equipped };
    const completed = act((world) => {
      world.changeHeroClass(choice);
      return true;
    });
    if (completed) {
      const newItems = game.save.hero.inventory.filter(
        (item) => !previousIds.has(item.id),
      );
      if (newItems.length) queueLoot(newItems, equipmentBefore);
      notify({
        eyebrow: "НОВАЯ СПЕЦИАЛИЗАЦИЯ",
        title: CLASS_DEFINITIONS[choice].name,
        description:
          "Класс изменён. Навыки и подходящее снаряжение собраны заново.",
        symbol: "✦",
        tone: "legendary",
        sound: "reputation",
      });
    }
  };
  return (
    <section className="class-change-panel paper-panel" id="class-change-panel">
      <div>
        <p className="eyebrow">ПОЗДНЯЯ СПЕЦИАЛИЗАЦИЯ</p>
        <h2>Смена класса</h2>
        <p>
          Уровень, рейтинг, история и инвентарь сохраняются. Несовместимые
          предметы снимаются, навыки нового класса подбираются заново.
        </p>
        <small>{availability.reason}</small>
      </div>
      <div className="class-change-controls">
        <select
          value={choice}
          aria-label="Новый класс"
          onChange={(event) => setSelected(event.target.value as HeroClass)}
        >
          {classes.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name} — {definition.epithet}
            </option>
          ))}
        </select>
        <button
          className="button primary"
          type="button"
          disabled={!availability.unlocked}
          onClick={change}
        >
          Сменить класс
        </button>
        <small>Смен класса: {hero.classChanges}</small>
      </div>
    </section>
  );
}

export function HeroPage() {
  const { game, revision, act, openDialog } = useGame();
  const { hero, equipped, byId } = useEquipment();
  const snapshot = useMemo(() => combatantSnapshot(hero), [game, revision]);
  const features = game.fighterFeatures(hero);
  return (
    <section className="page active equipment-page" id="page-hero">
      <PageHeading eyebrow="ЭКИПИРОВКА ГЕРОЯ" title="Ваш герой">
        <p>
          Предметы отображаются на герое и снимаются независимо. Нажмите на
          слот, чтобы выбрать замену.
        </p>
      </PageHeading>
      <GearActions id="hero-gear-actions" />
      <ClassChange />
      <div className="hero-visual-layout">
        <section className="character-showcase">
          <div className="character-backdrop">
            <span id="visual-class-name">
              {CLASS_DEFINITIONS[hero.classId].name.toUpperCase()} · УРОВЕНЬ{" "}
              {hero.level}
            </span>
            <strong id="visual-hero-name">{hero.name}</strong>
          </div>
          <CharacterArt
            id="paper-doll"
            classId={hero.classId}
            items={equipped}
            appearance={hero.appearance}
          />
        </section>
        <section className="worn-designs" id="worn-designs">
          <h2>Надетые предметы</h2>
          {(
            [
              "head",
              "chest",
              "hands",
              "feet",
              "weapon",
              "offhand",
            ] as EquipmentSlot[]
          ).map((slot) => {
            const item = byId.get(hero.equipped[slot] ?? "");
            const setName = item?.setId
              ? EQUIPMENT_SETS.find((set) => set.id === item.setId)?.name
              : undefined;
            return (
              <article
                key={slot}
                className={`worn-item selectable ${item?.rarity ?? "empty"}`}
              >
                <button
                  type="button"
                  className="worn-item-choice"
                  onClick={() => openDialog({ kind: "equipment", slot })}
                  aria-label={`Выбрать предмет: ${SLOT_LABELS[slot]}`}
                >
                  {item ? (
                    <EquipmentArt
                      item={item}
                      slot={slot}
                      classId={hero.classId}
                      className="gear-swatch equipment-art"
                    />
                  ) : (
                    <span className="gear-swatch">—</span>
                  )}
                  <span>
                    <small>{SLOT_LABELS[slot]}</small>
                    <strong>
                      {item ? itemName(item) : "Ничего не надето"}
                    </strong>
                    <span className="worn-item-description">
                      {item
                        ? `${RARITY_LABELS[item.rarity]} · ${statsText(item.stats)}${setName ? ` · комплект ${setName}` : ""}`
                        : "Слот не даёт характеристик."}
                    </span>
                  </span>
                </button>
                {item && (
                  <button
                    className="small-button unequip-inline"
                    type="button"
                    onClick={() => act((world) => world.unequip(slot))}
                  >
                    Снять
                  </button>
                )}
              </article>
            );
          })}
        </section>
        <aside className="paper-panel visual-stats" id="visual-stats">
          <p className="eyebrow">ОБРАЗ В БОЮ</p>
          <h2>{CLASS_DEFINITIONS[hero.classId].epithet}</h2>
          <StatRow label="Сила вещей" value={snapshot.equipmentScore} />
          <StatRow label="Крит. шанс" value={`${snapshot.crit}%`} />
          <StatRow label="Скорость" value={snapshot.speed} />
          <p className="passive">{CLASS_DEFINITIONS[hero.classId].passive}</p>
          <div className="fighter-feature-list">
            <strong>Черты и последствия</strong>
            {features.map((feature) => (
              <div key={feature.id}>
                <small>{feature.kind}</small>
                <b>{feature.name}</b>
                <span>{feature.description}</span>
                {statsText(feature.stats) && (
                  <em className="feature-stat-line">
                    {statsText(feature.stats)}
                  </em>
                )}
              </div>
            ))}
            {hero.injuries.map((injury) => (
              <div className="injury" key={injury.id}>
                <small>ТРАВМА · {injury.remainingDays} ДН.</small>
                <b>{injury.name}</b>
                <span>{injury.description}</span>
                <em className="feature-stat-line">{statsText(injury.stats)}</em>
              </div>
            ))}
            {!features.length && !hero.injuries.length && (
              <p>Постоянных черт и травм пока нет.</p>
            )}
          </div>
          <div className="appearance-editor">
            <strong>Внешность</strong>
            <label>
              Причёска
              <select
                value={hero.appearance.hairStyle}
                onChange={(event) =>
                  act((world) => {
                    world.save.hero.appearance.hairStyle = Number(
                      event.target.value,
                    ) as 0 | 1 | 2;
                  })
                }
              >
                <option value="0">Короткая</option>
                <option value="1">Зачёс назад</option>
                <option value="2">Длинная</option>
              </select>
            </label>
          </div>
        </aside>
      </div>
      <HeroHistory />
    </section>
  );
}
