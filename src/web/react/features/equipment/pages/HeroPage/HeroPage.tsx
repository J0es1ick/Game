import { useMemo, useState } from "react";
import {
  CLASS_DEFINITIONS,
  EQUIPMENT_SETS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../../../../catalogs/WorldCatalog";
import { combatantSnapshot } from "../../../../../../gameplay/combat/AdvancedBattle";
import {
  CLASS_CHANGE_GOLD_COST,
  CLASS_CHANGE_MARK_COST,
} from "../../../../../../gameplay/core/WorldGame";
import type {
  EquipmentSlot,
  HeroClass,
} from "../../../../../../gameplay/core/WorldTypes";
import { useGame } from "../../../../app/state/GameContext";
import { Modal, PageHeading } from "../../../../shared/ui/common";
import { classIcons } from "../../../../shared/utils/gameLabels";
import { CharacterArt, EquipmentArt } from "../../components/Artwork/Artwork";
import { HeroHistory } from "../../components/HeroHistory/HeroHistory";
import { itemName, number, statsText } from "../../utils/model";
import {
  StatRow,
  useEquipment,
} from "../../components/EquipmentShared/EquipmentShared";

type HeroSection = "equipment" | "history";

function sentenceCase(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function ClassChangeDialog({ onClose }: { onClose: () => void }) {
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
      onClose();
    }
  };
  return (
    <Modal
      id="class-change-layer"
      className="class-change-layer"
      title="Сменить класс"
      eyebrow="НОВАЯ СПЕЦИАЛИЗАЦИЯ"
      onClose={onClose}
      footer={
        <div className="class-change-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!availability.unlocked}
            onClick={change}
          >
            Сменить за {number.format(CLASS_CHANGE_GOLD_COST)} ¤ ·{" "}
            {CLASS_CHANGE_MARK_COST} печ.
          </button>
        </div>
      }
    >
      <div className="class-change-dialog-copy">
        <p>
          Уровень, рейтинг, история и инвентарь сохраняются. Несовместимые
          предметы снимаются, навыки нового класса подбираются заново.
        </p>
        <strong>{availability.reason}</strong>
      </div>
      <div className="class-change-controls">
        <label htmlFor="hero-class-choice">Новый класс</label>
        <select
          id="hero-class-choice"
          value={choice}
          aria-label="Новый класс"
          onChange={(event) => setSelected(event.target.value as HeroClass)}
        >
          {classes.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name} — {sentenceCase(definition.epithet)}
            </option>
          ))}
        </select>
        <article>
          <span aria-hidden="true">{classIcons[choice]}</span>
          <div>
            <strong>{sentenceCase(CLASS_DEFINITIONS[choice].epithet)}</strong>
            <p>{CLASS_DEFINITIONS[choice].passive}</p>
          </div>
        </article>
      </div>
    </Modal>
  );
}

function HeroClassSummary({ onChange }: { onChange: () => void }) {
  const { game } = useGame();
  const { hero } = game.save;
  const definition = CLASS_DEFINITIONS[hero.classId];
  const availability = game.classChangeAvailability();

  return (
    <section className="hero-class-summary paper-panel" id="class-change-panel">
      <div className="hero-class-emblem" aria-hidden="true">
        {classIcons[hero.classId]}
      </div>
      <div className="hero-class-identity">
        <strong>{hero.name}</strong>
        <span>
          {definition.name} · уровень {hero.level}
        </span>
      </div>
      <div className="hero-specialization">
        <small>СПЕЦИАЛИЗАЦИЯ</small>
        <strong>{sentenceCase(definition.epithet)}</strong>
        <p>{definition.passive}</p>
      </div>
      <div className="hero-class-action">
        <button type="button" className="button" onClick={onChange}>
          ⇄ Сменить класс
        </button>
        <small>
          {availability.unlocked
            ? `Смен класса: ${hero.classChanges}`
            : availability.reason}
        </small>
      </div>
    </section>
  );
}

export function HeroPage({ section = "equipment" }: { section?: HeroSection }) {
  const { game, revision, act } = useGame();
  const { hero, equipped, byId } = useEquipment();
  const snapshot = useMemo(() => combatantSnapshot(hero), [game, revision]);
  const [classChangeOpen, setClassChangeOpen] = useState(false);
  const features = game.fighterFeatures(hero);
  const heading =
    section === "history"
      ? {
          eyebrow: "ПУТЬ ГЕРОЯ",
          title: "Карьера и соперники",
          copy: "Достижения, личные противостояния и последствия прожитых боёв.",
        }
      : {
          eyebrow: "ОБЛИК И ХАРАКТЕР",
          title: "Ваш герой",
          copy: "Класс, внешность, боевые особенности и текущее снаряжение героя.",
        };
  return (
    <section className="page active equipment-page" id="page-hero">
      <PageHeading eyebrow={heading.eyebrow} title={heading.title}>
        <p>{heading.copy}</p>
      </PageHeading>
      {section === "equipment" && (
        <>
          <HeroClassSummary onChange={() => setClassChangeOpen(true)} />
          {classChangeOpen && (
            <ClassChangeDialog onClose={() => setClassChangeOpen(false)} />
          )}
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
                    className={`worn-item ${item?.rarity ?? "empty"}`}
                  >
                    <div className="worn-item-choice worn-item-readonly">
                      {item ? (
                        <EquipmentArt
                          item={item}
                          slot={slot}
                          classId={hero.classId}
                          className="gear-swatch equipment-art"
                        />
                      ) : (
                        <span className="gear-swatch empty-slot" />
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
                    </div>
                  </article>
                );
              })}
            </section>
            <aside className="paper-panel visual-stats" id="visual-stats">
              <p className="eyebrow">ОБРАЗ В БОЮ</p>
              <h2>{sentenceCase(CLASS_DEFINITIONS[hero.classId].epithet)}</h2>
              <StatRow label="Сила вещей" value={snapshot.equipmentScore} />
              <StatRow label="Крит. шанс" value={`${snapshot.crit}%`} />
              <StatRow label="Скорость" value={snapshot.speed} />
              <p className="passive">
                {CLASS_DEFINITIONS[hero.classId].passive}
              </p>
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
                    <em className="feature-stat-line">
                      {statsText(injury.stats)}
                    </em>
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
        </>
      )}
      {section === "history" && <HeroHistory />}
    </section>
  );
}
