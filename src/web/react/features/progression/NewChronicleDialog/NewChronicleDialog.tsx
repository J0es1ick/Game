import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ERA_LAWS,
  LEGACY_BOONS,
} from "../../../../../catalogs/NewGamePlusCatalog";
import {
  CLASS_DEFINITIONS,
  RARITY_LABELS,
  SLOT_LABELS,
} from "../../../../../catalogs/WorldCatalog";
import { skillById } from "../../../../../gameplay/core/WorldGame";
import type {
  EquipmentItem,
  EraLawId,
  HeroClass,
  LegacyBoonId,
} from "../../../../../gameplay/core/WorldTypes";
import { Modal, css } from "../../../shared/ui/common";
import { classIcons } from "../../../shared/utils/gameLabels";
import { useGame } from "../../../app/state/GameContext";
import { EquipmentArt } from "../../equipment/components/Artwork/Artwork";
import { itemName, pageSlice, rarityColors } from "../../equipment/utils/model";
import { Pagination } from "../../equipment/components/EquipmentShared/EquipmentShared";

const stepNames = ["Наследие", "Предмет", "Закон мира", "Подтверждение"];

function StageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="new-chronicle-stage-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3 tabIndex={-1}>{title}</h3>
      </div>
      <p>{children}</p>
    </header>
  );
}

function Choice({
  id,
  selected,
  disabled,
  accent,
  title,
  children,
  onSelect,
}: {
  id: string;
  selected: boolean;
  disabled?: boolean;
  accent?: string;
  title?: string;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`new-chronicle-choice${selected ? " selected" : ""}`}
      data-choice-id={id}
      style={css({ "--choice-accent": accent })}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

function HeirloomChoices({
  candidates,
  classId,
  selectedId,
  onSelect,
}: {
  candidates: EquipmentItem[];
  classId: HeroClass;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [page, setPage] = useState(0);
  const shown = pageSlice(candidates, page, 12);
  return (
    <>
      <div
        className="new-chronicle-choice-grid heirloom-grid"
        role="group"
        aria-label="Предмет-наследие"
      >
        <Choice
          id="none"
          selected={selectedId === null}
          onSelect={() => onSelect(null)}
        >
          <small>БЕЗ ПРЕДМЕТА</small>
          <strong>Чистое начало</strong>
          <p>Начать только с обычного классового снаряжения.</p>
          <b>Никаких скрытых штрафов.</b>
        </Choice>
        {shown.items.map((item) => (
          <Choice
            key={item.id}
            id={item.id}
            selected={selectedId === item.id}
            accent={rarityColors[item.rarity]}
            onSelect={() => onSelect(item.id)}
          >
            <EquipmentArt
              item={item}
              slot={item.slot}
              classId={classId}
              className="new-chronicle-item-art equipment-art"
            />
            <small>
              {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]}
            </small>
            <strong>{itemName(item)}</strong>
            <p>
              В новой эпохе станет редким предметом 1 уровня без прежней
              закалки.
            </p>
            <b>
              {item.grantedSkillId
                ? `Сохранит навык: ${skillById(item.grantedSkillId)?.name ?? "навык предмета"}`
                : "Сохранит внешний вид и историю."}
            </b>
          </Choice>
        ))}
      </div>
      <Pagination {...shown} onChange={setPage} />
    </>
  );
}

export function NewChronicleDialog() {
  const { game, revision, closeDialog, notify, store } = useGame();
  const status = useMemo(() => game.newGamePlusStatus(), [game, revision]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(game.save.hero.name);
  const [classId, setClassId] = useState<HeroClass>(game.save.hero.classId);
  const [boonId, setBoonId] = useState<LegacyBoonId | null>(
    () =>
      LEGACY_BOONS.find((boon) => boon.sealCost <= status.availableSeals)?.id ??
      null,
  );
  const [itemId, setItemId] = useState<string | null>(() => {
    const items = game.heirloomCandidates();
    const worn = new Set(Object.values(game.save.hero.equipped));
    return items.find((item) => worn.has(item.id))?.id ?? items[0]?.id ?? null;
  });
  const [lawIds, setLawIds] = useState<EraLawId[]>(() =>
    ERA_LAWS.slice(0, status.lawLimit).map((law) => law.id),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const transitionStarted = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => {
    const worn = new Set(Object.values(game.save.hero.equipped));
    return game
      .heirloomCandidates(classId)
      .sort(
        (first, second) =>
          Number(worn.has(second.id)) - Number(worn.has(first.id)),
      );
  }, [game, revision, classId]);
  const selectedBoon = LEGACY_BOONS.find((boon) => boon.id === boonId);
  const selectedItem = candidates.find((item) => item.id === itemId);
  const validBoon = Boolean(
    selectedBoon && selectedBoon.sealCost <= status.availableSeals,
  );
  const validName = name.trim().length >= 2;
  const validLaws = lawIds.length === status.lawLimit;
  const validItem = itemId === null || Boolean(selectedItem);
  const canContinue =
    status.unlocked &&
    !busy &&
    [validBoon, validName && validItem, validLaws, confirmed][step];
  const canStart =
    status.unlocked &&
    validBoon &&
    validName &&
    validItem &&
    validLaws &&
    confirmed &&
    !busy;

  useLayoutEffect(() => {
    stage.current
      ?.querySelector<HTMLElement>("h3")
      ?.focus({ preventScroll: true });
    stage.current
      ?.closest<HTMLElement>(".react-modal-body")
      ?.scrollTo?.({ top: 0 });
  }, [step]);

  const move = (direction: -1 | 1) => {
    if (busy || (direction > 0 && !canContinue)) return;
    if (step === 3) setConfirmed(false);
    setError("");
    setStep((current) => Math.max(0, Math.min(3, current + direction)));
  };
  const changeClass = (next: HeroClass) => {
    setClassId(next);
    setConfirmed(false);
    if (
      itemId &&
      !game.heirloomCandidates(next).some((item) => item.id === itemId)
    )
      setItemId(null);
  };
  const chooseLaw = (id: EraLawId) => {
    setConfirmed(false);
    if (lawIds.includes(id)) setLawIds(lawIds.filter((law) => law !== id));
    else if (status.lawLimit === 1) setLawIds([id]);
    else if (lawIds.length < status.lawLimit) setLawIds([...lawIds, id]);
    else {
      setError(
        `Можно выбрать не больше ${status.lawLimit} законов. Сначала снимите один из выбранных.`,
      );
      return;
    }
    setError("");
  };
  const begin = () => {
    if (!canStart || !boonId || transitionStarted.current) return;
    transitionStarted.current = true;
    setBusy(true);
    setError("");
    try {
      const next = game.beginNewChronicle({
        name,
        classId,
        boonId,
        lawIds,
        heirloomItemId: itemId ?? undefined,
      });
      store.replaceGame(next);
      notify({
        eyebrow: "НОВАЯ ЛЕТОПИСЬ",
        title: `Началась эпоха ${next.save.legacy.cycle}`,
        description: `${next.save.hero.name} принимает мир с новыми законами. Большинство знакомых бойцов продолжает карьеру, а освободившиеся места занимают новички.`,
        symbol: "Ⅱ",
        tone: "legendary",
        sound: "reputation",
        duration: 3600,
      });
    } catch (cause) {
      transitionStarted.current = false;
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Modal
      id="new-chronicle-layer"
      className="new-chronicle-layer"
      title="Начать новую летопись"
      eyebrow="ЗАВЕРШЕНИЕ ЭПОХИ"
      onClose={closeDialog}
      dismissible={!busy}
      footer={
        <div className="new-chronicle-actions">
          <button
            id="new-chronicle-back"
            type="button"
            className="button"
            disabled={step === 0 || busy}
            onClick={() => move(-1)}
          >
            Назад
          </button>
          {step < 3 ? (
            <button
              id="new-chronicle-next"
              type="button"
              className="button primary"
              disabled={!canContinue}
              onClick={() => move(1)}
            >
              Продолжить
            </button>
          ) : (
            <button
              id="new-chronicle-confirm"
              type="button"
              className="button primary"
              disabled={!canStart}
              onClick={begin}
            >
              {busy
                ? "Начинается новая эпоха…"
                : `Начать эпоху ${status.targetCycle}`}
            </button>
          )}
        </div>
      }
    >
      <p id="new-chronicle-progress" role="status">
        Шаг {step + 1} из 4
      </p>
      <ol className="new-chronicle-steps" id="new-chronicle-steps">
        {stepNames.map((label, index) => (
          <li
            key={label}
            className={
              index === step ? "active" : index < step ? "complete" : ""
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{label}</b>
          </li>
        ))}
      </ol>
      <div ref={stage} id="new-chronicle-stage" className="new-chronicle-stage">
        {!status.unlocked ? (
          <>
            <StageHeading
              eyebrow="ЭПОХА ЕЩЁ НЕ ЗАВЕРШЕНА"
              title="Сначала выполните условия"
            >
              {status.reason}
            </StageHeading>
            <ul>
              {status.requirements.map((requirement) => (
                <li key={requirement.id}>
                  {requirement.met ? "✓" : "—"} {requirement.label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {step === 0 && (
              <>
                <StageHeading
                  eyebrow="ПОСТОЯННЫЙ СЛЕД"
                  title="Выберите наследие"
                >
                  Доступно {status.availableSeals} печатей. Стоимость будет
                  списана только после подтверждения перехода.
                </StageHeading>
                <div
                  className="new-chronicle-choice-grid"
                  role="group"
                  aria-label="Варианты наследия"
                >
                  {LEGACY_BOONS.map((boon) => (
                    <Choice
                      key={boon.id}
                      id={boon.id}
                      selected={boonId === boon.id}
                      disabled={boon.sealCost > status.availableSeals}
                      accent="#715063"
                      title={
                        boon.sealCost > status.availableSeals
                          ? `Нужно печатей летописи: ${boon.sealCost}. Доступно: ${status.availableSeals}.`
                          : undefined
                      }
                      onSelect={() => {
                        setBoonId(boon.id);
                        setConfirmed(false);
                      }}
                    >
                      <small>{boon.sealCost} ПЕЧ.</small>
                      <strong>{boon.name}</strong>
                      <p>{boon.description}</p>
                      <b>{boon.effect}</b>
                    </Choice>
                  ))}
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <StageHeading
                  eyebrow="ИМЯ И РЕЛИКВИЯ"
                  title="Кто продолжит путь"
                >
                  Выберите класс наследника и одну вещь прошлого. Её
                  характеристики, уровень и закалка будут пересчитаны для начала
                  игры.
                </StageHeading>
                <div className="new-chronicle-identity">
                  <label className="new-chronicle-name">
                    <span>Имя нового героя</span>
                    <input
                      value={name}
                      maxLength={28}
                      autoComplete="off"
                      onChange={(event) => {
                        setName(event.target.value);
                        setConfirmed(false);
                      }}
                    />
                  </label>
                  <div
                    className="new-chronicle-class-grid"
                    role="radiogroup"
                    aria-label="Класс нового героя"
                  >
                    {Object.values(CLASS_DEFINITIONS).map((definition) => (
                      <button
                        key={definition.id}
                        type="button"
                        role="radio"
                        aria-checked={classId === definition.id}
                        className={`new-chronicle-class${classId === definition.id ? " selected" : ""}`}
                        style={css({ "--choice-accent": definition.accent })}
                        onClick={() => changeClass(definition.id)}
                      >
                        {classIcons[definition.id]} {definition.name}
                      </button>
                    ))}
                  </div>
                </div>
                <HeirloomChoices
                  key={classId}
                  candidates={candidates}
                  classId={classId}
                  selectedId={itemId}
                  onSelect={(id) => {
                    setItemId(id);
                    setConfirmed(false);
                  }}
                />
              </>
            )}
            {step === 2 && (
              <>
                <StageHeading
                  eyebrow="ПРАВИЛА НОВОГО МИРА"
                  title={`Выберите ${status.lawLimit} ${status.lawLimit === 1 ? "закон" : "закона"}`}
                >
                  Законы меняют условия боёв, наград и жизни элиты. Их нельзя
                  заменить внутри эпохи.
                </StageHeading>
                <div
                  className="new-chronicle-choice-grid"
                  role="group"
                  aria-label="Законы новой эпохи"
                >
                  {ERA_LAWS.map((law) => (
                    <Choice
                      key={law.id}
                      id={law.id}
                      selected={lawIds.includes(law.id)}
                      accent={law.accent}
                      onSelect={() => chooseLaw(law.id)}
                    >
                      <small>
                        {lawIds.includes(law.id) ? "ВЫБРАН" : "ЗАКОН ЭПОХИ"}
                      </small>
                      <strong>{law.name}</strong>
                      <p>{law.description}</p>
                      <b>{law.effect}</b>
                    </Choice>
                  ))}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <StageHeading
                  eyebrow="ПОСЛЕДНЯЯ ЗАПИСЬ"
                  title={`Эпоха ${status.targetCycle}: ${name.trim()}`}
                >
                  Проверьте условия. После подтверждения прежний мир попадёт в
                  архив и останется доступен для просмотра.
                </StageHeading>
                <div className="new-chronicle-summary">
                  <article>
                    <h4>Сохранится</h4>
                    <ul>
                      <li>Коллекция найденных предметов</li>
                      <li>Архив героев и павших бойцов</li>
                      <li>Ветераны мира, их история и связи</li>
                      <li>Внешность и настройки боя</li>
                      <li>
                        Наследие: {selectedBoon?.name ?? "—"} ·{" "}
                        {selectedBoon?.sealCost ?? 0} печ.
                      </li>
                      <li>
                        Предмет:{" "}
                        {selectedItem ? itemName(selectedItem) : "без предмета"}
                      </li>
                      <li>
                        Законы:{" "}
                        {lawIds
                          .map(
                            (id) => ERA_LAWS.find((law) => law.id === id)?.name,
                          )
                          .join(", ")}
                      </li>
                    </ul>
                  </article>
                  <article>
                    <h4>Начнётся заново</h4>
                    <ul>
                      <li>Уровень, опыт и мировой рейтинг</li>
                      <li>Золото, печати закалки и обычный инвентарь</li>
                      <li>Арены, данжи, боссы и контракты</li>
                      <li>Позиции в рейтинге и состав элиты</li>
                      <li>Свободные места займут новые бойцы</li>
                    </ul>
                    <p>
                      Новый герой: {name.trim()} ·{" "}
                      {CLASS_DEFINITIONS[classId].name}
                    </p>
                  </article>
                </div>
                <label className="new-chronicle-confirmation">
                  <input
                    id="new-chronicle-acknowledge"
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Я понимаю, что текущая эпоха будет завершена и продолжится
                  новым миром.
                </label>
              </>
            )}
          </>
        )}
        {error && (
          <p className="new-chronicle-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
