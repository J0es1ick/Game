import type { HeroClass, Stats } from "../../../gameplay/WorldTypes";

export const classIcons: Record<HeroClass, string> = {
  Knight: "♜",
  Archer: "➶",
  Wizard: "✦",
  Monk: "◉",
  Gunsmith: "⚙",
  Swordsman: "⚔",
};
export const statLabels: Record<keyof Stats, string> = {
  health: "Здоровье",
  attack: "Атака",
  defense: "Защита",
  speed: "Скорость",
  crit: "Критический шанс",
};
export function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
export function statsCopy(stats: Partial<Stats>): string {
  return Object.entries(stats)
    .filter(([, value]) => value)
    .map(
      ([key, value]) => `${signed(value!)} ${statLabels[key as keyof Stats]}`,
    )
    .join(" · ");
}
