import {
  BattleSession,
  type BattleAction,
  type BattleActionOption,
  type BattleSessionSnapshot,
} from "../gameplay/AdvancedBattle";
import {
  ARENAS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  ENDGAME_ACTIVITIES,
} from "../catalogs/WorldCatalog";
import type {
  ActivityDefinition,
  BattleReport,
  DailyActivityReport,
  ExpeditionStepReport,
  PendingBattle,
  PendingBattleFinalization,
  TournamentReport,
} from "../gameplay/WorldTypes";

export interface PendingBattleStep {
  turn: BattleReport["turns"][number];
  finished: boolean;
  pendingBattle: PendingBattle;
}

export interface PendingBattleGamePort {
  currentPendingBattle(): PendingBattle | undefined;
  pendingBattleActions(): BattleActionOption[];
  stepPendingBattle(action?: BattleAction): PendingBattleStep;
  finalizePendingBattle(): PendingBattleFinalization;
  runPendingBattleAutomatically(): DailyActivityReport | TournamentReport | ExpeditionStepReport | BattleReport | undefined;
}

function fallbackActivity(pending: PendingBattle): ActivityDefinition {
  const kind = pending.kind === "arena-tournament"
    ? "arena"
    : pending.kind === "crown-league" || pending.kind.startsWith("legend-")
      ? "endgame"
      : pending.kind === "expedition" ? "dungeon"
        : pending.kind === "legacy-champion" ? "boss" : pending.kind;
  if (kind === "arena") {
    return {
      id: pending.activityId, kind, name: pending.activityId, place: "Турнирная арена",
      description: "Незавершённый турнирный бой.", minLevel: 1, enemyLevel: [1, 1],
      winsToAdvance: 1, rewardGold: 0, rewardExperience: 0, lethalChance: 0,
      tournamentInterval: 1, participants: 8, prestige: "local", accent: "#a54f3d",
    };
  }
  if (kind === "endgame") {
    return {
      id: pending.kind === "crown-league" ? "crown-league" : "legend-hunt",
      kind, name: pending.activityId, place: "Элитный круг", description: "Незавершённый бой элиты.",
      rewardGold: 0, rewardExperience: 0, accent: "#725775",
    };
  }
  if (kind === "duel") {
    return {
      id: pending.activityId, kind, name: pending.activityId, place: "Дуэльный круг",
      description: "Незавершённая дуэль.", minLevel: 1, requiredDuelWins: 0,
      requiredArena: 0, enemyLevelOffset: [0, 0], rewardGold: 0, rewardExperience: 0, accent: "#667b70",
    };
  }
  if (kind === "boss") {
    return {
      id: pending.activityId, kind, name: pending.activityId, place: "Особая арена",
      description: "Незавершённый бой с особым противником.", classId: pending.enemy.classId,
      level: pending.enemy.level, requiredLevel: 1, requiredDuelWins: 0, requiredArena: 0,
      rewardGold: 0, rewardExperience: 0,
      lootTemplateIds: {
        Knight: "", Archer: "", Wizard: "", Monk: "", Gunsmith: "", Swordsman: "",
      },
      accent: "#934a3d",
    };
  }
  return {
    id: pending.activityId, kind: "dungeon", name: pending.activityId, place: "Подземелье",
    description: "Незавершённый этап похода.", minLevel: 1, requiredArena: 0,
    requiredWorldDay: 1, enemyLevel: [1, 1], rewardGold: 0, rewardExperience: 0,
    minimumRarity: "common", cooldownDays: 0, accent: "#5d7466",
  };
}

export function pendingBattleActivity(pending: PendingBattle): ActivityDefinition {
  if (pending.kind === "arena-tournament") {
    return ARENAS.find((activity) => activity.id === pending.activityId) ?? fallbackActivity(pending);
  }
  if (pending.kind === "crown-league") {
    return ENDGAME_ACTIVITIES.find((activity) => activity.id === "crown-league") ?? fallbackActivity(pending);
  }
  if (pending.kind === "legend-hunt" || pending.kind === "legend-defense") {
    return ENDGAME_ACTIVITIES.find((activity) => activity.id === "legend-hunt") ?? fallbackActivity(pending);
  }
  if (pending.kind === "duel") {
    return DUEL_TIERS.find((activity) => activity.id === pending.activityId) ?? fallbackActivity(pending);
  }
  if (pending.kind === "boss") {
    return DUEL_BOSSES.find((activity) => activity.id === pending.activityId) ?? fallbackActivity(pending);
  }
  if (pending.kind === "dungeon" || pending.kind === "expedition") {
    return DUNGEONS.find((activity) => activity.id === pending.activityId) ?? fallbackActivity(pending);
  }
  return fallbackActivity(pending);
}

export function pendingBattleReport(pending: PendingBattle): BattleReport {
  const { session } = pending;
  const winnerId = session.winnerId ?? "";
  const heroWon = winnerId === "hero";
  return {
    activity: pendingBattleActivity(pending),
    heroBefore: session.heroBefore,
    enemyBefore: session.enemyBefore,
    winnerId,
    loserId: winnerId ? (heroWon ? pending.enemyId : "hero") : "",
    heroWon,
    enemyDied: false,
    turns: [...session.turns],
    rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] },
    worldEvents: [],
    ruleIds: pending.tournament?.ruleIds,
  };
}

export class PendingBattleUiController {
  public constructor(private readonly game: PendingBattleGamePort) {}

  public current(): PendingBattle | undefined {
    return this.game.currentPendingBattle();
  }

  public report(pending = this.requireCurrent()): BattleReport {
    return pendingBattleReport(pending);
  }

  public session(pending = this.requireCurrent()): BattleSession {
    return new BattleSession(pending.session);
  }

  public snapshot(pending = this.requireCurrent()): BattleSessionSnapshot {
    return pending.session;
  }

  public actions(): BattleActionOption[] {
    return this.game.pendingBattleActions();
  }

  public step(action?: BattleAction): PendingBattleStep {
    return this.game.stepPendingBattle(action);
  }

  public finalize(): PendingBattleFinalization {
    return this.game.finalizePendingBattle();
  }

  public runAutomatically() {
    return this.game.runPendingBattleAutomatically();
  }

  private requireCurrent(): PendingBattle {
    const pending = this.current();
    if (!pending) throw new Error("Незавершённый бой не найден.");
    return pending;
  }
}
