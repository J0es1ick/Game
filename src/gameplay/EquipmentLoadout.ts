import { combatantSnapshot } from "./AdvancedBattle";
import { combatActionRate } from "./CombatBalance";

import type { CombatantSnapshot, EquipmentItem, EquipmentSet, EquipmentSlot, HeroProfile } from "./WorldTypes";

const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];

export function evaluateEquipmentLoadout(hero: HeroProfile, equipped: EquipmentSet): number {
  return evaluateCombatantPower(combatantSnapshot({ ...hero, equipped }));
}

export function evaluateCombatantPower(fighter: CombatantSnapshot): number {
  const tempo = combatActionRate(fighter.speed);
  const offense = Math.max(1, fighter.attack) * (1 + fighter.crit * 0.007) * tempo;
  const endurance = Math.max(1, fighter.maxHealth) * (1 + Math.max(0, fighter.defense) / 180);
  const skillBonus = new Set(fighter.skills).size * 0.025;
  const resonanceBonus = (fighter.equipmentResonance?.stage ?? 0) * 0.025;
  return Math.log(offense) + Math.log(endurance) * 0.8 + skillBonus + resonanceBonus;
}

export function findBestEquipmentLoadout(hero: HeroProfile, mode: "power" | "set" = "power"): EquipmentSet {
  const compatible = hero.inventory.filter((item) => item.allowedClasses === "all" || item.allowedClasses.includes(hero.classId));
  const current: EquipmentSet = {};
  slots.forEach((slot) => {
    if (compatible.some((item) => item.slot === slot && item.id === hero.equipped[slot])) current[slot] = hero.equipped[slot];
  });
  const cache = new Map<string, number>();
  const score = (equipped: EquipmentSet) => {
    const key = slots.map((slot) => equipped[slot] ?? "").join("|");
    if (!cache.has(key)) cache.set(key, evaluateEquipmentLoadout(hero, equipped));
    return cache.get(key)!;
  };
  const sets = [...new Set(compatible.map((item) => item.setId).filter((id): id is string => Boolean(id)))];
  const optimize = (seed: EquipmentSet, setId?: string): EquipmentSet => {
    const result = { ...seed };
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false;
      for (const slot of slots) {
        const pool = compatible.filter((item) => item.slot === slot);
        const preferred = setId ? pool.filter((item) => item.setId === setId) : [];
        let best = result[slot];
        let bestScore = best && (!preferred.length || preferred.some((item) => item.id === best)) ? score(result) : -Infinity;
        for (const item of preferred.length ? preferred : pool) {
          const candidateScore = score({ ...result, [slot]: item.id });
          if (candidateScore > bestScore + 0.000001) { best = item.id; bestScore = candidateScore; }
        }
        if (best !== result[slot]) { result[slot] = best; changed = true; }
      }
      if (!changed) break;
    }
    return result;
  };
  let best = optimize(current);
  let bestCount = 0;
  for (const setId of sets) {
    const count = new Set(compatible.filter((item) => item.setId === setId).map((item) => item.slot)).size;
    if (count < 2) continue;
    const seed = optimize(current, setId);
    const candidate = mode === "set" ? seed : optimize(seed);
    if ((mode === "set" && count > bestCount) || ((mode !== "set" || count === bestCount) && score(candidate) > score(best) + 0.000001)) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function equipmentItemsForLoadout(hero: HeroProfile, equipped: EquipmentSet): EquipmentItem[] {
  const ids = new Set(Object.values(equipped));
  return hero.inventory.filter((item) => ids.has(item.id));
}
