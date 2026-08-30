import type {
  BattleReport,
  GameSave,
  HeroClass,
  LeaderboardEntry,
} from "../core/WorldTypes";

export interface CombatBalanceMetrics {
  battles: number;
  heroWinRate: number;
  averageTurns: number;
  oneShotRate: number;
  averageDamagePerTurn: number;
  classResults: Partial<Record<HeroClass, { battles: number; wins: number }>>;
}

export interface WorldBalanceSnapshot {
  day: number;
  heroLevel: number;
  medianNpcLevel: number;
  heroLevelDelta: number;
  heroInventorySize: number;
  largestNpcInventory: number;
  averageNpcInventory: number;
  topNewcomerShare: number;
  currencies: { gold: number; temperingMarks: number; relicDust: number };
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function combatBalanceMetrics(
  reports: readonly BattleReport[],
): CombatBalanceMetrics {
  let wins = 0;
  let turns = 0;
  let oneShots = 0;
  let damage = 0;
  const classResults: CombatBalanceMetrics["classResults"] = {};
  reports.forEach((report) => {
    wins += report.heroWon ? 1 : 0;
    turns += report.turns.length;
    oneShots += report.turns.length <= 2 ? 1 : 0;
    damage += report.turns.reduce((sum, turn) => sum + turn.damage, 0);
    const entry = classResults[report.heroBefore.classId] ?? {
      battles: 0,
      wins: 0,
    };
    entry.battles += 1;
    entry.wins += report.heroWon ? 1 : 0;
    classResults[report.heroBefore.classId] = entry;
  });
  const count = reports.length;
  return {
    battles: count,
    heroWinRate: count ? rounded(wins / count) : 0,
    averageTurns: count ? rounded(turns / count) : 0,
    oneShotRate: count ? rounded(oneShots / count) : 0,
    averageDamagePerTurn: turns ? rounded(damage / turns) : 0,
    classResults,
  };
}

export function worldBalanceSnapshot(
  save: GameSave,
  leaderboard: readonly LeaderboardEntry[],
  previousLeaderboardIds: readonly string[] = [],
): WorldBalanceSnapshot {
  const npcLevels = save.enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => enemy.level);
  const npcInventorySizes = save.enemies.map((enemy) => enemy.equipment.length);
  const previous = new Set(previousLeaderboardIds);
  const top = leaderboard.slice(0, 100).filter((entry) => !entry.isHero);
  const newcomers =
    previous.size === 0
      ? 0
      : top.filter((entry) => !previous.has(entry.id)).length;
  const averageNpcInventory = npcInventorySizes.length
    ? npcInventorySizes.reduce((sum, size) => sum + size, 0) /
      npcInventorySizes.length
    : 0;
  const medianNpcLevel = median(npcLevels);
  return {
    day: save.worldDay,
    heroLevel: save.hero.level,
    medianNpcLevel,
    heroLevelDelta: rounded(save.hero.level - medianNpcLevel),
    heroInventorySize: save.hero.inventory.length,
    largestNpcInventory: Math.max(0, ...npcInventorySizes),
    averageNpcInventory: rounded(averageNpcInventory),
    topNewcomerShare: top.length ? rounded(newcomers / top.length) : 0,
    currencies: {
      gold: save.hero.gold,
      temperingMarks: save.hero.temperingMarks,
      relicDust: save.hero.relicDust,
    },
  };
}

export function balanceWarnings(
  combat: CombatBalanceMetrics,
  world: WorldBalanceSnapshot,
): string[] {
  const warnings: string[] = [];
  if (combat.battles >= 20 && combat.oneShotRate > 0.12)
    warnings.push(
      `Слишком много коротких боёв: ${Math.round(combat.oneShotRate * 100)}%.`,
    );
  if (combat.battles >= 20 && combat.averageTurns < 5)
    warnings.push(`Средний бой длится только ${combat.averageTurns} хода.`);
  if (world.topNewcomerShare > 0.25)
    warnings.push(
      `За один срез обновилось ${Math.round(world.topNewcomerShare * 100)}% топа.`,
    );
  if (world.largestNpcInventory > 12)
    warnings.push(
      `Инвентарь NPC вырос до ${world.largestNpcInventory} предметов.`,
    );
  if (Math.abs(world.heroLevelDelta) > 10)
    warnings.push(
      `Разрыв уровня героя и медианы мира: ${world.heroLevelDelta}.`,
    );
  return warnings;
}
