import { useGameStore, useUiPreferences } from "../../app/state/GameContext";
import type { UiPreferences } from "../../app/state/UiPreferences";

export function BattleSpeedSelect({
  id,
  descriptionId,
  disabled = false,
}: {
  id?: string;
  descriptionId?: string;
  disabled?: boolean;
}) {
  const store = useGameStore();
  const preferences = useUiPreferences();
  return (
    <select
      id={id}
      aria-label={id ? undefined : "Скорость боя"}
      aria-describedby={descriptionId}
      value={preferences.battleSpeed}
      disabled={disabled}
      onChange={(event) => {
        try {
          store.preferences.update({
            battleSpeed: Number(
              event.target.value,
            ) as UiPreferences["battleSpeed"],
          });
        } catch {
          store.fail(
            new Error(
              "Скорость изменена, но браузер не разрешил сохранить её для следующего запуска.",
            ),
            "Настройка не сохранена",
          );
        }
      }}
    >
      <option value={900}>Медленно</option>
      <option value={450}>Обычно</option>
      <option value={160}>Быстро</option>
    </select>
  );
}
