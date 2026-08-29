import { EQUIPMENT_SETS } from "../catalogs/WorldCatalog";
import type { EquipmentItem, EquipmentResonance, ItemAffix, Stats } from "./WorldTypes";

export type EquipmentDeedKind = "championship" | "lethal" | "survival" | "legend";

export interface EquipmentDeedResult {
  item: EquipmentItem;
  changed: boolean;
  property?: ItemAffix;
  growth: Partial<Stats>;
}

const DEEDS: Record<EquipmentDeedKind, { prefix: string; property: Omit<ItemAffix, "value">; step: number }> = {
  championship: {
    prefix: "Победа в финале",
    property: { name: "Выучка финалов", description: "Победы в финалах учат находить решающий момент.", stat: "crit" },
    step: 1,
  },
  lethal: {
    prefix: "Смертельная победа",
    property: { name: "Кровавая закалка", description: "Предмет запомнил смертельные поединки и стал опаснее.", stat: "attack" },
    step: 2,
  },
  survival: {
    prefix: "На грани гибели",
    property: { name: "Упрямство выжившего", description: "Снаряжение пережило бой на последнем дыхании и укрепило владельца.", stat: "health" },
    step: 6,
  },
  legend: {
    prefix: "Победа над легендой",
    property: { name: "Памятная клятва", description: "Поединки с легендами научили предмет выдерживать исключительное давление.", stat: "defense" },
    step: 2,
  },
};

export function recordEquipmentDeed(
  source: EquipmentItem,
  kind: EquipmentDeedKind,
  witness: string,
  day: number,
): EquipmentDeedResult {
  if (source.rarity !== "legendary" && source.rarity !== "mythic" && source.rarity !== "relic") {
    return { item: source, changed: false, growth: {} };
  }
  const definition = DEEDS[kind];
  const feat = `${definition.prefix}: ${witness}`;
  const feats = [...(source.relicFeats ?? [])];
  if (feats.includes(feat)) return { item: source, changed: false, growth: {} };
  feats.push(feat);
  const count = feats.filter((entry) => entry.startsWith(`${definition.prefix}:`)).length;
  const stage = Math.min(3, Math.ceil(count / 2));
  const previous = source.relicProperties?.find((candidate) => candidate.name === definition.property.name);
  const property: ItemAffix = { ...definition.property, value: Math.max(stage * definition.step, previous?.value ?? 0) };
  const growth = Math.max(0, property.value - (previous?.value ?? 0));
  return {
    item: {
      ...source,
      stats: { ...source.stats },
      relicFeats: feats.slice(-40),
      relicHistory: [...new Set([...(source.relicHistory ?? []), `День ${Math.max(1, Math.floor(day))}: ${feat.toLocaleLowerCase("ru-RU")}.`])].slice(-50),
      relicProperties: [...(source.relicProperties ?? []).filter((candidate) => candidate.name !== property.name), property],
      appearanceVariant: `${source.relicPath ?? "unbound"}-${source.relicTier ?? 0}-${kind}-${stage}`,
    },
    changed: growth > 0,
    property,
    growth: growth > 0 ? { [property.stat]: growth } : {},
  };
}

export function equipmentResonance(items: readonly EquipmentItem[]): EquipmentResonance | undefined {
  const sets = EQUIPMENT_SETS.map((set) => {
    const matching = items.filter((item) => item.setId === set.id);
    const paths = (["might", "guard", "tempo"] as const).map((path) => ({
      path,
      items: matching.filter((item) => item.relicPath === path && (item.relicTier ?? 0) > 0),
    })).sort((first, second) => second.items.length - first.items.length);
    const path = paths[0];
    if (matching.length < 4 || path.items.length < 2) return undefined;
    const tiers = path.items.reduce((total, item) => total + (item.relicTier ?? 0), 0);
    const stage = Math.min(3, tiers >= 12 ? 3 : tiers >= 6 ? 2 : 1) as 1 | 2 | 3;
    const descriptions = {
      might: `Удары по цели с горением, кровотечением или меткой сильнее на ${4 + stage * 2}%.`,
      guard: `Один раз за бой при здоровье ниже 40% входящий удар слабее на ${12 + stage * 4}%, затем включается защитная стойка.`,
      tempo: `Применение навыка на каждом ${stage >= 3 ? "третьем" : "четвёртом"} действии сокращает перезарядку остальных навыков на один ход.`,
    };
    return {
      setId: set.id,
      setName: set.name,
      path: path.path,
      stage,
      pieces: matching.length,
      description: descriptions[path.path],
    };
  }).filter((resonance): resonance is EquipmentResonance => Boolean(resonance));
  return sets.sort((first, second) => second.stage - first.stage || second.pieces - first.pieces)[0];
}

export function resonanceDamageMultiplier(resonance: EquipmentResonance | undefined, afflicted: boolean): number {
  return resonance?.path === "might" && afflicted ? 1 + (4 + resonance.stage * 2) / 100 : 1;
}

export function resonanceGuardMultiplier(resonance: EquipmentResonance | undefined): number {
  return resonance?.path === "guard" ? 1 - (12 + resonance.stage * 4) / 100 : 1;
}

export function resonanceCooldownCadence(resonance: EquipmentResonance | undefined): number | undefined {
  return resonance?.path === "tempo" ? resonance.stage >= 3 ? 3 : 4 : undefined;
}
