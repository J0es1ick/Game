import { useState } from "react";
import { CLASS_DEFINITIONS } from "../../../../../catalogs/WorldCatalog";
import type { HeroClass } from "../../../../../gameplay/core/WorldTypes";
import { useAppSelector, useGameStore } from "../../../app/state/GameContext";
import { css } from "../../../shared/ui/common";
import { classIcons } from "../../../shared/utils/gameLabels";
import { SaveActions } from "../../../app/Header/Header";

export function ModeScreen() {
  const store = useGameStore();
  const hasSave = store.hasSavedGame();
  return (
    <main className="mode-screen" id="mode-screen">
      <div className="mode-paper">
        <p className="eyebrow">ДВА СПОСОБА ИГРАТЬ</p>
        <h1>Выберите режим</h1>
        <p>
          Оба режима используют одни классы бойцов и боевые правила, но
          отличаются масштабом и длительностью партии.
        </p>
        <div className="mode-choice">
          <button
            className="mode-card"
            onClick={() => store.chooseMode("basic")}
          >
            <span>Короткая партия</span>
            <strong>Базовый турнир</strong>
            <p>
              Соберите участников, разыграйте турнирную сетку и наблюдайте за
              каждым ходом. Без сохранения и мета-прогрессии.
            </p>
            <b>Запустить турнир →</b>
          </button>
          <button
            className="mode-card featured"
            onClick={() => store.chooseMode("world")}
          >
            <span>Постоянная кампания</span>
            <strong>Живой мир</strong>
            <p>
              Создайте героя, собирайте экипировку, записывайтесь на турниры и
              следите за развитием соперников.
            </p>
            <b>{hasSave ? "Продолжить летопись →" : "Создать героя →"}</b>
          </button>
        </div>
      </div>
    </main>
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
          {Object.values(CLASS_DEFINITIONS).map((definition) => (
            <button
              type="button"
              role="radio"
              aria-checked={classId === definition.id}
              className={`class-option${classId === definition.id ? " selected" : ""}`}
              style={css({ "--class-accent": definition.accent })}
              key={definition.id}
              onClick={() => setClassId(definition.id)}
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
