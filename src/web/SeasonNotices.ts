import { ARENAS } from "../catalogs/WorldCatalog";
import { TOURNAMENT_RULES } from "../catalogs/WorldExpansionCatalog";
import { worldSeasonRule, type WorldSeasonRule, type WorldSeasonState } from "../gameplay/WorldSeason";
import type { CrownSeasonState } from "../gameplay/CrownSeason";
import type { GameSave } from "../gameplay/WorldTypes";

export interface SeasonChangeLine {
  label: string;
  description?: string;
  before: string;
  after: string;
}

export interface SeasonNotice {
  kind: "world" | "crown";
  cycle: number;
  number: number;
  title: string;
  previousTitle: string;
  description: string;
  startsDay: number;
  endsDay: number;
  changes: SeasonChangeLine[];
  note: string;
}

interface SeasonSnapshot {
  cycle: number;
  world?: Pick<WorldSeasonState, "number" | "startsDay" | "endsDay" | "ruleId">;
  crown: Pick<CrownSeasonState, "number" | "startsDay" | "endsDay" | "ruleIds">;
}

function snapshot(save: GameSave): SeasonSnapshot {
  const world = save.worldSeason;
  const crown = save.crownSeason;
  return {
    cycle: save.legacy.cycle,
    world: world && { number: world.number, startsDay: world.startsDay, endsDay: world.endsDay, ruleId: world.ruleId },
    crown: { number: crown.number, startsDay: crown.startsDay, endsDay: crown.endsDay, ruleIds: [...crown.ruleIds] },
  };
}

function modifier(value: number): string {
  const percent = Math.round((value - 1) * 100);
  return percent === 0 ? "Обычные условия" : `${percent > 0 ? "+" : ""}${percent}%`;
}

function worldNotice(cycle: number, season: NonNullable<SeasonSnapshot["world"]>, before?: WorldSeasonRule): SeasonNotice {
  const after = worldSeasonRule(season.ruleId);
  return {
    kind: "world", cycle, number: season.number,
    title: after.name, previousTitle: before?.name ?? "Обычные условия", description: after.description,
    startsDay: season.startsDay, endsDay: season.endsDay,
    changes: [
      { label: "Риск гибели на аренах", before: modifier(before?.lethalityMultiplier ?? 1), after: modifier(after.lethalityMultiplier) },
      { label: "Монетные выплаты", before: modifier(before?.goldMultiplier ?? 1), after: modifier(after.goldMultiplier) },
      { label: "Награды данжей", before: modifier(before?.dungeonRewardMultiplier ?? 1), after: modifier(after.dungeonRewardMultiplier) },
      { label: "Влияние побед на фракции", before: modifier(before?.factionInfluenceMultiplier ?? 1), after: modifier(after.factionInfluenceMultiplier) },
      { label: "Опыт соперников", before: modifier(before?.npcExperienceMultiplier ?? 1), after: modifier(after.npcExperienceMultiplier) },
    ],
    note: "Проценты указаны относительно обычных условий. Сезонные очки начинаются с нуля; общий рейтинг и снаряжение не сбрасываются. Итоги прошлого сезона остаются в летописи.",
  };
}

export function currentWorldSeasonNotice(save: GameSave): SeasonNotice | undefined {
  const current = save.worldSeason;
  if (!current) return;
  const previous = save.worldSeasonHistory?.find((season) => season.number === current.number - 1);
  return worldNotice(save.legacy.cycle, current, previous ? worldSeasonRule(previous.ruleId) : undefined);
}

export class SeasonNoticeTracker {
  private previous?: SeasonSnapshot;

  public reset(save: GameSave): void {
    this.previous = snapshot(save);
  }

  public collect(save: GameSave): SeasonNotice[] {
    const previous = this.previous;
    const next = snapshot(save);
    this.previous = next;
    if (!previous || previous.cycle !== next.cycle) return [];
    const notices: SeasonNotice[] = [];
    if (next.world && previous.world && next.world.number > previous.world.number) {
      notices.push(worldNotice(next.cycle, next.world, worldSeasonRule(previous.world.ruleId)));
    }
    if (next.crown.number > previous.crown.number && save.hero.highestArena >= ARENAS.length - 1) {
      const before = new Set(previous.crown.ruleIds);
      const after = new Set(next.crown.ruleIds);
      notices.push({
        kind: "crown", cycle: next.cycle, number: next.crown.number,
        title: `Сезон ${next.crown.number} Лиги короны`, previousTitle: `Сезон ${previous.crown.number}`,
        description: "Начался новый элитный сезон. Обновлены турнирные правила и сезонный зачёт.",
        startsDay: next.crown.startsDay, endsDay: next.crown.endsDay,
        changes: TOURNAMENT_RULES.filter((rule) => before.has(rule.id) || after.has(rule.id)).map((rule) => ({
          label: rule.name, description: rule.description,
          before: before.has(rule.id) ? "Действует" : "Не действует",
          after: after.has(rule.id) ? "Действует" : "Не действует",
        })),
        note: "Очки и защиты нового сезона считаются с нуля. Место в элите сохраняется. Награды за прошлый сезон начисляются автоматически, если герой занял призовое место.",
      });
    }
    return notices;
  }
}
