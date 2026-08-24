import { InterfaceSound, gameAudio } from "./GameAudio";

export type WorldEffectTone = "positive" | "negative" | "neutral" | "legendary";

interface WorldEffectAggregation {
  key: string;
  count: number;
  totals: Record<string, number>;
  format: (count: number, totals: Record<string, number>) => Partial<WorldEffectPresentation>;
}

export interface WorldEffectPresentation {
  eyebrow: string;
  title: string;
  description: string;
  symbol?: string;
  stats?: string[];
  tone?: WorldEffectTone;
  sound?: InterfaceSound;
  duration?: number;
  aggregation?: WorldEffectAggregation;
}

const queue: WorldEffectPresentation[] = [];
let playing = false;

export function queueWorldEffect(effect: WorldEffectPresentation): void {
  if (typeof document === "undefined") return;
  if (effect.aggregation) {
    const existing = queue.find((queued) => queued.aggregation?.key === effect.aggregation?.key);
    if (existing?.aggregation) {
      existing.aggregation.count += effect.aggregation.count;
      Object.entries(effect.aggregation.totals).forEach(([key, value]) => {
        existing.aggregation!.totals[key] = (existing.aggregation!.totals[key] ?? 0) + value;
      });
      Object.assign(existing, existing.aggregation.format(existing.aggregation.count, existing.aggregation.totals));
      return;
    }
  }
  queue.push(effect);
  if (!playing) playNext();
}

function playNext(): void {
  const host = document.querySelector<HTMLElement>("#world-effect-stage");
  const effect = queue.shift();
  if (!host || !effect) { playing = false; return; }
  playing = true;
  if (effect.sound) gameAudio.event(effect.sound);

  const card = document.createElement("article");
  card.className = `world-effect-card ${effect.tone ?? "neutral"}`;
  const symbol = document.createElement("span");
  symbol.className = "world-effect-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = effect.symbol ?? "✦";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = effect.eyebrow;
  const title = document.createElement("h3");
  title.textContent = effect.title;
  const description = document.createElement("p");
  description.textContent = effect.description;
  copy.append(eyebrow, title, description);
  if (effect.stats?.length) {
    const stats = document.createElement("div");
    stats.className = "world-effect-stats";
    effect.stats.forEach((value) => {
      const chip = document.createElement("span");
      chip.textContent = value;
      stats.append(chip);
    });
    copy.append(stats);
  }
  card.append(symbol, copy);
  host.append(card);
  const duration = effect.duration ?? 2200;
  window.setTimeout(() => card.classList.add("leaving"), Math.max(700, duration - 360));
  window.setTimeout(() => {
    card.remove();
    playing = false;
    playNext();
  }, duration);
}
