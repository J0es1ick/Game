import { useMemo } from "react";
import {
  EQUIPMENT_SETS,
  SLOT_LABELS,
} from "../../../../../../catalogs/WorldCatalog";
import type { EquipmentSlot } from "../../../../../../gameplay/core/WorldTypes";
import { useGame } from "../../../../app/state/GameContext";
import { equipmentSlots } from "../../utils/model";
import { StatRow } from "../EquipmentShared/EquipmentShared";
import { useEquipmentSessionState } from "../../utils/sessionState";

export function LootTarget() {
  const { game, revision, act } = useGame();
  const target = game.save.lootTarget;
  const [slot, setSlot] = useEquipmentSessionState<EquipmentSlot | "">(
    game,
    "legacy.targetSlot",
    target?.slot ?? "",
  );
  const [setId, setSetId] = useEquipmentSessionState(
    game,
    "legacy.targetSet",
    target?.setId ?? "",
  );
  const best = useMemo(() => game.bestEquipmentEvaluation(), [game, revision]);
  const misses = game.save.lootPity?.misses ?? 0;
  const targetSet = EQUIPMENT_SETS.find((set) => set.id === target?.setId);
  const validSets = EQUIPMENT_SETS.filter(
    (set) =>
      set.classes === "all" || set.classes.includes(game.save.hero.classId),
  );
  const effectiveSet = validSets.some((set) => set.id === setId) ? setId : "";
  const reset = () => {
    act((world) => world.setLootTarget(undefined));
    setSlot("");
    setSetId("");
  };
  return (
    <section
      className="loot-target-workshop paper-panel"
      id="loot-target-workshop"
      aria-labelledby="loot-target-title"
    >
      <div className="loot-target-copy">
        <p className="eyebrow">ЦЕЛЕВАЯ ОХОТА</p>
        <h2 id="loot-target-title">Назначьте желанную добычу</h2>
        <p>
          Другая добыча продолжит выпадать. Неудачи повышают шанс выбранного
          слота или комплекта, а седьмая попытка гарантирует совпадение.
        </p>
      </div>
      <form
        className="loot-target-controls"
        onSubmit={(event) => {
          event.preventDefault();
          act((world) =>
            world.setLootTarget({
              slot: slot || undefined,
              setId: effectiveSet || undefined,
            }),
          );
        }}
      >
        <label>
          Слот
          <select
            value={slot}
            onChange={(event) =>
              setSlot(event.target.value as EquipmentSlot | "")
            }
          >
            <option value="">Любой слот</option>
            {equipmentSlots.map((entry) => (
              <option key={entry} value={entry}>
                {SLOT_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Комплект
          <select
            value={effectiveSet}
            onChange={(event) => setSetId(event.target.value)}
          >
            <option value="">Любой комплект</option>
            {validSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>
        <div className="loot-target-actions">
          <button
            className="button primary"
            type="submit"
            disabled={!slot && !effectiveSet}
          >
            {target ? "Изменить цель" : "Начать охоту"}
          </button>
          <button
            className="plain-button"
            type="button"
            disabled={!target}
            onClick={reset}
          >
            Сбросить цель
          </button>
        </div>
      </form>
      <aside className="loot-target-status">
        <StatRow
          label="Текущая цель"
          value={
            target
              ? [
                  target.slot ? SLOT_LABELS[target.slot] : "Любой слот",
                  targetSet?.name,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Цель не выбрана"
          }
        />
        <StatRow
          label="Базовый шанс"
          value={target ? `${Math.min(95, 18 + misses * 9)}%` : "—"}
        />
        <StatRow
          label="Гарантия"
          value={target ? `через ${Math.max(1, 7 - misses)} находок` : "—"}
        />
        <StatRow
          label="Лучшая сборка"
          value={`${best.completeSlots}/6 слотов · сила ${Math.round(best.score)}`}
        />
        {best.activeSetBonuses.length > 0 && (
          <p className="loot-target-best-set">
            {best.activeSetBonuses.join(" · ")}
          </p>
        )}
      </aside>
    </section>
  );
}
