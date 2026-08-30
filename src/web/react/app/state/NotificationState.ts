import type { InterfaceSound } from "../audio/GameAudio";

export type WorldEffectTone = "positive" | "negative" | "neutral" | "legendary";
export type WorldEffectVariant = "standard" | "victory" | "defeat" | "season";

interface WorldEffectAggregation {
  key: string;
  count: number;
  totals: Record<string, number>;
  format: (
    count: number,
    totals: Record<string, number>,
  ) => Partial<WorldEffectPresentation>;
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

export interface EffectNotice extends WorldEffectPresentation {
  id: number;
}

export function effectChannel(
  effect: WorldEffectPresentation,
): "banner" | "corner" {
  return effect.variant && effect.variant !== "standard" ? "banner" : "corner";
}

function priority(effect: WorldEffectPresentation): number {
  if (effect.variant === "season") return 40;
  if (effect.tone === "negative") return 30;
  if (effect.tone === "legendary") return 20;
  return 10;
}

function replacementKey(effect: WorldEffectPresentation): string {
  return (
    effect.replaceKey ??
    (effect.variant === "victory" || effect.variant === "defeat"
      ? "battle-result"
      : `${effect.variant ?? "standard"}:${effect.eyebrow}:${effect.title}`)
  );
}

export function enqueueEffect(
  current: EffectNotice[],
  incoming: EffectNotice,
  preserveVisible: boolean,
): EffectNotice[] {
  const channel = effectChannel(incoming);
  const lane = current.filter((effect) => effectChannel(effect) === channel);
  const active = preserveVisible ? lane[0] : undefined;
  const aggregate = incoming.aggregation;
  const found =
    aggregate &&
    lane.find((effect) => effect.aggregation?.key === aggregate.key);
  if (found?.aggregation && aggregate) {
    const totals = { ...found.aggregation.totals };
    Object.entries(aggregate.totals).forEach(([key, value]) => {
      totals[key] = (totals[key] ?? 0) + value;
    });
    const count = found.aggregation.count + aggregate.count;
    const updated = {
      ...found,
      ...aggregate.format(count, totals),
      aggregation: { ...aggregate, count, totals },
    };
    return current.map((effect) => (effect.id === found.id ? updated : effect));
  }
  const pending = lane.filter((effect) => effect !== active);
  const entry = { ...incoming, replaceKey: replacementKey(incoming) };
  const replaced = pending.findIndex(
    (effect) => replacementKey(effect) === entry.replaceKey,
  );
  if (replaced >= 0) pending[replaced] = entry;
  else pending.push(entry);
  pending.sort((a, b) => priority(b) - priority(a) || a.id - b.id);
  const next = [...(active ? [active] : []), ...pending].slice(0, 6);
  return [
    ...current.filter((effect) => effectChannel(effect) !== channel),
    ...next,
  ];
}
