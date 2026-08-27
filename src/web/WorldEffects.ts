import { InterfaceSound, gameAudio } from "./GameAudio";
import { PriorityNotificationQueue } from "./NotificationCenter";
import { PausableTimeout } from "./UiRuntime";

export type WorldEffectTone = "positive" | "negative" | "neutral" | "legendary";
export type WorldEffectVariant = "standard" | "victory" | "defeat" | "season";

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
  variant?: WorldEffectVariant;
  replaceKey?: string;
  action?: { label: string; run: () => void };
  aggregation?: WorldEffectAggregation;
}

type EffectChannel = "corner" | "banner";
const channels = {
  corner: { queue: new PriorityNotificationQueue<WorldEffectPresentation>(), playing: false, host: "#world-effect-stage" },
  banner: { queue: new PriorityNotificationQueue<WorldEffectPresentation>(), playing: false, host: "#world-announcement-stage" },
};
let sequence = 0;

const blockingLayerSelectors = [
  "#mode-screen",
  "#creation-screen",
  "#new-chronicle-layer",
  ".save-recovery-screen",
] as const;

function hasBlockingLayer(): boolean {
  return blockingLayerSelectors.some((selector) => {
    const layer = document.querySelector<HTMLElement>(selector);
    return Boolean(layer && !layer.hidden && !layer.classList.contains("hidden"));
  });
}

export function queueWorldEffect(effect: WorldEffectPresentation): void {
  if (typeof document === "undefined") return;
  const channel: EffectChannel = effect.variant && effect.variant !== "standard" ? "banner" : "corner";
  const { queue } = channels[channel];
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
  const priority = effect.tone === "negative" ? 30 : effect.tone === "legendary" ? 20 : 10;
  const battleResult = effect.variant === "victory" || effect.variant === "defeat";
  const id = effect.replaceKey ?? (battleResult ? "battle-result" : `${effect.aggregation?.key ?? effect.title}:${sequence++}`);
  queue.enqueue({ id, payload: effect, priority });
  if (!channels[channel].playing) playNext(channel);
}

function playNext(channel: EffectChannel): void {
  const state = channels[channel];
  const host = document.querySelector<HTMLElement>(state.host);
  if (state.queue.size === 0 || !host) { state.playing = false; return; }
  if (hasBlockingLayer()) {
    state.playing = true;
    window.setTimeout(() => playNext(channel), 180);
    return;
  }
  const effect = state.queue.take()?.payload;
  if (!effect) { state.playing = false; return; }
  state.playing = true;
  if (effect.sound) gameAudio.event(effect.sound);

  const card = document.createElement("article");
  card.className = `world-effect-card ${effect.tone ?? "neutral"} effect-${effect.variant ?? "standard"}`;
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
  const expiry = new PausableTimeout();
  let leaving = false;
  const dismiss = () => {
    if (leaving) return;
    leaving = true;
    expiry.cancel();
    card.classList.add("leaving");
    window.setTimeout(() => {
      card.remove();
      state.playing = false;
      playNext(channel);
    }, 360);
  };
  if (effect.action) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "world-effect-action";
    action.textContent = effect.action.label;
    action.addEventListener("click", () => { effect.action!.run(); dismiss(); });
    copy.append(action);
  }
  card.append(symbol, copy);
  if (channel === "banner") {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "world-effect-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Закрыть уведомление");
    close.addEventListener("click", dismiss);
    card.append(close);
  }
  let hovered = false;
  const resume = () => {
    if (!hovered && !card.contains(document.activeElement)) expiry.resume();
  };
  card.addEventListener("pointerenter", () => { hovered = true; expiry.pause(); });
  card.addEventListener("pointerleave", () => { hovered = false; resume(); });
  card.addEventListener("focusin", () => expiry.pause());
  card.addEventListener("focusout", () => window.setTimeout(resume, 0));
  host.append(card);
  const duration = effect.duration ?? 2200;
  expiry.start(dismiss, Math.max(700, duration - 360));
}
