import { useMemo, type ReactNode } from "react";
import { combatantSnapshot } from "../../../gameplay/AdvancedBattle";
import { useGame } from "../state/GameContext";
import { equipmentIndex, number, statLabels, statShortLabels } from "./model";
import type { Stats } from "../../../gameplay/WorldTypes";
import "./equipment-react.css";

export function useEquipment() {
  const { game, revision } = useGame();
  const index = useMemo(() => equipmentIndex(game.save.hero), [game, revision]);
  return { ...index, hero: game.save.hero };
}

export function Pagination({
  current,
  pages,
  total,
  onChange,
}: {
  current: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      className="equipment-pagination filter-row"
      aria-label="Страницы списка"
    >
      <button
        type="button"
        disabled={current === 0}
        onClick={() => onChange(current - 1)}
      >
        ← Назад
      </button>
      <span role="status">
        {current + 1} / {pages} · всего {number.format(total)}
      </span>
      <button
        type="button"
        disabled={current === pages - 1}
        onClick={() => onChange(current + 1)}
      >
        Далее →
      </button>
    </nav>
  );
}

export function StatRow({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  const terms: Record<string, string> = {
    Здоровье: "health",
    Атака: "attack",
    Защита: "defense",
    Скорость: "speed",
    "Крит. шанс": "crit",
    "Реликтовая пыль": "relicDust",
  };
  return (
    <div className="stat-row" title={title}>
      <span data-term={terms[label]}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function HeroStats({
  id = "hero-stats",
  className = "paper-panel stats-panel",
}: {
  id?: string;
  className?: string;
}) {
  const { game, revision } = useGame();
  const stats = useMemo(
    () => combatantSnapshot(game.save.hero),
    [game, revision],
  );
  return (
    <aside id={id} className={className}>
      <h2>Итоговые характеристики</h2>
      <StatRow label="Здоровье" value={stats.maxHealth} />
      <StatRow label="Атака" value={stats.attack} />
      <StatRow label="Защита" value={stats.defense} />
      <StatRow label="Скорость" value={stats.speed} />
      <StatRow label="Крит. шанс" value={`${stats.crit}%`} />
      <StatRow label="Сила вещей" value={stats.equipmentScore} />
      <p className="stats-hint">
        Учтены уровень, экипировка, свойства редкости и активные бонусы
        комплектов.
      </p>
    </aside>
  );
}

export function GearActions({
  compact = false,
  id,
}: {
  compact?: boolean;
  id?: string;
}) {
  const { game, act } = useGame();
  return (
    <div
      id={id}
      className={`gear-actions${compact ? " compact" : " paper-panel"}`}
    >
      <button
        className="button"
        type="button"
        onClick={() => act((world) => world.equipBest())}
      >
        Надеть лучшее
      </button>
      <button
        className="button"
        type="button"
        onClick={() => act((world) => world.equipBest("set"))}
      >
        Собрать лучший комплект
      </button>
      <label className="auto-equip-toggle">
        <input
          type="checkbox"
          checked={game.save.hero.autoEquipBest}
          onChange={(event) =>
            act((world) => world.setAutoEquipBest(event.target.checked))
          }
        />{" "}
        Автоматически надевать лучшее
      </label>
    </div>
  );
}

export function StatDelta({
  stat,
  current,
  candidate,
  className = "comparison-stat",
}: {
  stat: keyof Stats;
  current: number;
  candidate: number;
  className?: string;
}) {
  const difference = candidate - current;
  const state =
    difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral";
  return (
    <div
      className={`${className} ${state}`}
      title={`${statLabels[stat]}: ${current} → ${candidate}`}
    >
      <span className="stat-comparison-label">{statShortLabels[stat]}</span>
      <span className="stat-comparison-values">
        <i>{current}</i>
        <b aria-hidden="true">→</b>
        <i>{candidate}</i>
      </span>
      <strong
        className="stat-comparison-delta"
        aria-label={`Изменение: ${difference > 0 ? "+" : ""}${difference}`}
      >
        {difference > 0 ? "+" : ""}
        {difference}
      </strong>
    </div>
  );
}
