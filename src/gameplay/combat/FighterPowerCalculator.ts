import { EQUIPMENT_SETS, SKILLS } from "../../catalogs/WorldCatalog";
import { EquipmentItem, Stats } from "../core/WorldTypes";

export class FighterPowerCalculator {
  private static readonly statWeights: Readonly<Record<keyof Stats, number>> = {
    health: 0.25,
    attack: 1.5,
    defense: 1.25,
    speed: 1.4,
    crit: 1.1,
  };

  public static stats(stats: Partial<Stats>): number {
    return (Object.entries(stats) as Array<[keyof Stats, number]>).reduce(
      (sum, [stat, value]) =>
        sum + (Number(value) || 0) * this.statWeights[stat],
      0,
    );
  }

  public static item(item: EquipmentItem, levelCap?: number): number {
    const scale =
      levelCap && item.level > levelCap
        ? Math.max(0.35, levelCap / item.level)
        : 1;
    const stats = (
      Object.entries(item.stats) as Array<[keyof Stats, number]>
    ).reduce<Partial<Stats>>((result, [stat, value]) => {
      const scaled = Math.round(value * scale);
      result[stat] =
        value > 0 ? Math.max(1, scaled) : value < 0 ? Math.min(-1, scaled) : 0;
      return result;
    }, {});
    if (item.affix)
      stats[item.affix.stat] =
        (stats[item.affix.stat] ?? 0) +
        Math.max(1, Math.round(item.affix.value * scale));
    (item.relicProperties ?? []).forEach((property) => {
      stats[property.stat] =
        (stats[property.stat] ?? 0) +
        Math.max(1, Math.round(property.value * scale));
    });
    const skill = item.grantedSkillId
      ? SKILLS.find((candidate) => candidate.id === item.grantedSkillId)
      : undefined;
    const skillPower = skill
      ? 5 +
        skill.priority * 0.18 +
        Math.max(0, skill.power) * (skill.kind === "attack" ? 5 : 1.5)
      : 0;
    return this.round(this.stats(stats) + skillPower);
  }

  public static equipment(items: EquipmentItem[], levelCap?: number): number {
    const base = items.reduce(
      (sum, item) => sum + this.item(item, levelCap),
      0,
    );
    const counts = items.reduce<Record<string, number>>((result, item) => {
      if (item.setId) result[item.setId] = (result[item.setId] ?? 0) + 1;
      return result;
    }, {});
    const setPower = EQUIPMENT_SETS.reduce((sum, set) => {
      const pieces = counts[set.id] ?? 0;
      return (
        sum +
        set.bonuses.reduce((bonusSum, bonus) => {
          if (pieces < bonus.pieces) return bonusSum;
          if (bonus.stats) return bonusSum + this.stats(bonus.stats);
          return bonusSum + bonus.pieces * 2.5;
        }, 0)
      );
    }, 0);
    return Math.round(base + setPower);
  }

  public static fighter(stats: Stats, items: EquipmentItem[] = []): number {
    return Math.round(this.stats(stats) + this.equipment(items));
  }

  private static round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
