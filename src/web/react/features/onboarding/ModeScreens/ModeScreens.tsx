import { useRef, useState } from "react";
import { CLASS_DEFINITIONS } from "../../../../../catalogs/WorldCatalog";
import type { HeroClass } from "../../../../../gameplay/core/WorldTypes";
import { useAppSelector, useGameStore } from "../../../app/state/GameContext";
import { css } from "../../../shared/ui/common";
import { classIcons } from "../../../shared/utils/gameLabels";
import { SaveActions } from "../../../app/Header/Header";
import { ModeChoice } from "../ModeChoice/ModeChoice";

export function ModeScreen() {
  const store = useGameStore();
  return (
    <ModeChoice
      hasSave={store.hasSavedGame()}
      onChoose={(mode) => store.chooseMode(mode)}
    />
  );
}

export function CreationScreen() {
  const store = useGameStore();
  const error = useAppSelector((state) => {
    const last = state.effects[state.effects.length - 1];
    return last?.tone === "negative" ? last.description : null;
  });
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<HeroClass>("Knight");
  const [hair, setHair] = useState<0 | 1 | 2>(0);
  const classes = Object.values(CLASS_DEFINITIONS);
  const classButtons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <main className="creation-screen" id="creation-screen">
      <form
        className="creation-paper"
        onSubmit={(event) => {
          event.preventDefault();
          store.createHero(name, classId, hair);
        }}
      >
        <p className="eyebrow">НОВАЯ ЛЕТОПИСЬ</p>
        <h1>Кем вас запомнит арена?</h1>
        <p className="creation-intro">
          Класс определяет стартовое снаряжение, приёмы и поведение в
          автоматическом бою. Позже специализацию можно изменить.
        </p>
        {error && (
          <p className="creation-error" role="alert">
            {error}
          </p>
        )}
        <label className="name-field">
          Имя героя
          <input
            autoFocus
            required
            minLength={2}
            maxLength={20}
            autoComplete="off"
            placeholder="Введите имя"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="appearance-choice">
          <label>
            Причёска
            <select
              value={hair}
              onChange={(event) =>
                setHair(Number(event.target.value) as 0 | 1 | 2)
              }
            >
              <option value={0}>Короткая</option>
              <option value={1}>Зачёс назад</option>
              <option value={2}>Длинная</option>
            </select>
          </label>
        </div>
        <div
          className="class-choice"
          role="radiogroup"
          aria-label="Класс героя"
        >
          {classes.map((definition, index) => (
            <button
              type="button"
              role="radio"
              aria-checked={classId === definition.id}
              tabIndex={classId === definition.id ? 0 : -1}
              ref={(button) => {
                classButtons.current[index] = button;
              }}
              className={`class-option${classId === definition.id ? " selected" : ""}`}
              style={css({ "--class-accent": definition.accent })}
              key={definition.id}
              onClick={() => setClassId(definition.id)}
              onKeyDown={(event) => {
                const offset =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!offset && event.key !== "Home" && event.key !== "End")
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? classes.length - 1
                      : (index + offset + classes.length) % classes.length;
                setClassId(classes[next].id);
                classButtons.current[next]?.focus();
              }}
            >
              <span>{classIcons[definition.id]}</span>
              <strong>{definition.name}</strong>
              <small>{definition.epithet}</small>
              <p>{definition.passive}</p>
            </button>
          ))}
        </div>
        <footer className="creation-footer">
          <button
            type="button"
            className="plain-button"
            onClick={store.exitMode}
          >
            К выбору режима
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={name.trim().length < 2}
          >
            Начать путь
          </button>
        </footer>
      </form>
    </main>
  );
}

export function SaveRecovery({ error }: { error: string }) {
  return (
    <main className="save-recovery-screen">
      <section className="save-recovery-card">
        <p className="eyebrow">СОХРАНЕНИЕ НЕ ПРОЧИТАНО</p>
        <h1>Летопись требует восстановления</h1>
        <p role="alert">{error}</p>
        <p>
          Ваши данные не удалены. Можно повторить чтение, восстановить резервную
          копию или загрузить экспортированный файл.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Попробовать снова
        </button>
        <SaveActions recovery />
      </section>
    </main>
  );
}
