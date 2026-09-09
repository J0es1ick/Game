import { useId, type ReactNode } from "react";
import {
  useGame,
  useGameStore,
  useUiPreferences,
} from "../../app/state/GameContext";
import type { UiPreferences } from "../../app/state/UiPreferences";
import { SaveActions } from "./SaveActions";
import { BattleSpeedSelect } from "./BattleSpeedSelect";
import { Modal, PageHeading } from "../../shared/ui/common";
import "./settings.css";

function Setting({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (id: string, descriptionId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="setting-row">
      <div>
        <label htmlFor={id}>{title}</label>
        <p id={`${id}-description`}>{description}</p>
      </div>
      {children(id, `${id}-description`)}
    </div>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Setting title={title} description={description}>
      {(id, descriptionId) => (
        <input
          id={id}
          aria-describedby={descriptionId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      )}
    </Setting>
  );
}

export function InterfaceSettings() {
  const store = useGameStore();
  const preferences = useUiPreferences();
  const update = (patch: Partial<UiPreferences>) => {
    try {
      store.preferences.update(patch);
    } catch {
      store.fail(
        new Error(
          "Настройка действует в этой вкладке, но браузер не разрешил сохранить её для следующего запуска.",
        ),
        "Настройка не сохранена",
      );
    }
  };
  return (
    <>
      <section
        className="settings-section"
        aria-labelledby="appearance-settings-heading"
      >
        <h2 id="appearance-settings-heading">Оформление и звук</h2>
        <Setting
          title="Тема"
          description="Светлая бумага или тёмная палитра с тёплыми оттенками."
        >
          {(id, descriptionId) => (
            <select
              id={id}
              aria-describedby={descriptionId}
              value={preferences.theme}
              onChange={(event) =>
                update({ theme: event.target.value as UiPreferences["theme"] })
              }
            >
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
            </select>
          )}
        </Setting>
        <Toggle
          title="Меньше анимаций"
          description="Убирает движения карточек, вспышки и всплывающие числа. Системное ограничение анимаций учитывается всегда."
          checked={preferences.reducedMotion}
          onChange={(reducedMotion) => update({ reducedMotion })}
        />
        <Toggle
          title="Звуковые эффекты"
          description="Звуки ударов, наград и действий в интерфейсе."
          checked={!preferences.soundMuted}
          onChange={(enabled) => update({ soundMuted: !enabled })}
        />
      </section>
      <section
        className="settings-section"
        id="battle-settings"
        aria-labelledby="battle-settings-heading"
      >
        <h2 id="battle-settings-heading">Бой</h2>
        <Toggle
          title="Начинать бой автоматически"
          description="После выбора сражения или следующего раунда бой начнётся без кнопки «Начать бой». После перезагрузки начатый бой остаётся на паузе."
          checked={preferences.autoStartBattle}
          onChange={(autoStartBattle) => update({ autoStartBattle })}
        />
        <Setting
          title="Скорость боя"
          description="Темп показа ходов. На расчёт урона и исход боя не влияет."
        >
          {(id, descriptionId) => (
            <BattleSpeedSelect id={id} descriptionId={descriptionId} />
          )}
        </Setting>
      </section>
    </>
  );
}

function HeroSettings() {
  const { game, act } = useGame();
  const hero = game.save.hero;
  const inBattle = Boolean(game.currentPendingBattle());
  return (
    <section
      className="settings-section"
      aria-labelledby="automation-settings-heading"
    >
      <h2 id="automation-settings-heading">Управление героем</h2>
      <Setting
        title="Ведение боя"
        description="Автобой выбирает приёмы по вашей тактике. При ручном управлении каждый ход героя ждёт вашего решения."
      >
        {(id, descriptionId) => (
          <select
            id={id}
            aria-describedby={descriptionId}
            value={hero.combatMode}
            onChange={(event) =>
              act((world) =>
                world.setCombatMode(event.target.value as "auto" | "manual"),
              )
            }
          >
            <option value="auto">Автобой</option>
            <option value="manual">Вручную</option>
          </select>
        )}
      </Setting>
      <Toggle
        title="Автоматически надевать лучшее"
        disabled={inBattle}
        description={
          inBattle
            ? "Доступно после завершения боя."
            : "Герой будет надевать добычу с большей общей силой. Может заменить части выбранного комплекта."
        }
        checked={hero.autoEquipBest}
        onChange={(enabled) => act((world) => world.setAutoEquipBest(enabled))}
      />
      <Toggle
        title="Автоматически подбирать навыки"
        description="Выбирает до четырёх доступных приёмов. Собственную сборку и тактику можно настроить в книге навыков."
        checked={hero.autoSelectSkills}
        onChange={(enabled) =>
          act((world) => world.setAutoSelectSkills(enabled))
        }
      />
      <Toggle
        title="Автоматически рассчитывать защиту титула"
        description="В пятёрке элиты: если в день вызова выбрать другое занятие, защита пройдёт в фоне. Поражение может стоить места."
        checked={hero.autoResolveLegendChallenges}
        onChange={(enabled) =>
          act((world) => world.setAutoResolveLegendChallenges(enabled))
        }
      />
    </section>
  );
}

export function SettingsDialog() {
  const store = useGameStore();
  return (
    <Modal
      id="settings-dialog"
      title="Настройки"
      eyebrow="ПЫЛЬ И КОРОНА"
      onClose={store.closeDialog}
      footer={
        <button className="button" onClick={store.closeDialog}>
          Вернуться к бою
        </button>
      }
    >
      <div className="settings-content">
        <InterfaceSettings />
        {store.game && <HeroSettings />}
      </div>
    </Modal>
  );
}

export function SettingsPage() {
  const { store, openDialog } = useGame();
  return (
    <div className="settings-page">
      <PageHeading eyebrow="ПЫЛЬ И КОРОНА" title="Настройки">
        <p>
          Изменения применяются сразу. Тема и темп боя сохраняются в браузере,
          настройки героя — в летописи.
        </p>
      </PageHeading>
      <div className="settings-content paper-panel">
        <InterfaceSettings />
        <HeroSettings />
        <section
          className="settings-section"
          aria-labelledby="save-settings-heading"
        >
          <h2 id="save-settings-heading">Летопись</h2>
          <SaveActions />
        </section>
        <section
          className="settings-section"
          aria-labelledby="help-settings-heading"
        >
          <h2 id="help-settings-heading">Обучение и режим игры</h2>
          <div className="settings-actions">
            <button
              className="plain-button"
              onClick={() => openDialog({ kind: "tutorial", id: "base" })}
            >
              Повторить обучение
            </button>
            <button className="plain-button" onClick={store.exitMode}>
              Сменить режим
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
