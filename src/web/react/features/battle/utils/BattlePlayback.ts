import {
  BattleSession,
  type BattleAction,
} from "../../../../../gameplay/combat/AdvancedBattle";
import type { WorldGame } from "../../../../../gameplay/core/WorldGame";
import type {
  BattleReport,
  BattleTurn,
  EquipmentItem,
  EquipmentSet,
  FighterFeatureChange,
  PendingBattle,
  PendingBattleFinalization,
} from "../../../../../gameplay/core/WorldTypes";
import { pendingBattleReport } from "./PendingBattleUi";

export interface BattleLootBatch {
  items: EquipmentItem[];
  equipmentBefore: EquipmentSet;
}

export type BattleLootHandler = (batch: BattleLootBatch) => void;

export interface BattlePlaybackPort {
  save: Pick<WorldGame["save"], "hero">;
  currentPendingBattle: WorldGame["currentPendingBattle"];
  stepPendingBattle: WorldGame["stepPendingBattle"];
  finalizePendingBattle: WorldGame["finalizePendingBattle"];
  consumeFeatureChanges: WorldGame["consumeFeatureChanges"];
}

export class BattlePlayback {
  private readonly inventoryBefore: Set<string>;
  private readonly equipmentBefore: EquipmentSet;
  private pending: PendingBattle;
  private finalized?: PendingBattleFinalization;
  private changes: FighterFeatureChange[] = [];
  private lootTaken = false;

  public constructor(private readonly game: BattlePlaybackPort) {
    const pending = game.currentPendingBattle();
    if (!pending) throw new Error("Незавершённый бой не найден.");
    this.pending = pending;
    this.inventoryBefore = new Set(
      game.save.hero.inventory.map((item) => item.id),
    );
    this.equipmentBefore = { ...game.save.hero.equipped };
  }

  public get id(): string {
    return this.pending.id;
  }
  public get snapshot() {
    return this.pending.session;
  }
  public get tournament() {
    return this.pending.tournament;
  }
  public get kind() {
    return this.pending.kind;
  }
  public get completion() {
    return this.finalized;
  }
  public get featureChanges() {
    return this.changes;
  }
  public get report(): BattleReport {
    return this.finalized?.battle ?? pendingBattleReport(this.pending);
  }
  public get turn(): BattleTurn | undefined {
    return this.snapshot.turns[this.snapshot.turns.length - 1];
  }
  public get finished(): boolean {
    return Boolean(this.snapshot.winnerId);
  }
  public get awaitingNextRound(): boolean {
    return this.finalized?.status === "next-battle";
  }
  public get session(): BattleSession {
    return new BattleSession(this.snapshot);
  }

  public step(action?: BattleAction): BattleTurn | undefined {
    if (this.finalized || this.finished) return undefined;
    const result = this.game.stepPendingBattle(action);
    this.pending = result.pendingBattle;
    return result.turn;
  }

  public finalize(): PendingBattleFinalization {
    if (this.finalized) return this.finalized;
    if (!this.finished) throw new Error("Сначала завершите все ходы боя.");
    this.finalized = this.game.finalizePendingBattle();
    this.changes = this.game.consumeFeatureChanges();
    return this.finalized;
  }

  public nextRound(): void {
    if (!this.awaitingNextRound)
      throw new Error("Следующего боя в этой сетке нет.");
    const pending = this.game.currentPendingBattle();
    if (!pending) throw new Error("Следующий бой турнирной сетки не найден.");
    this.pending = pending;
    this.finalized = undefined;
    this.changes = [];
  }

  public acquiredLoot(): BattleLootBatch {
    return {
      items: this.game.save.hero.inventory.filter(
        (item) => !this.inventoryBefore.has(item.id),
      ),
      equipmentBefore: this.equipmentBefore,
    };
  }

  public takeLoot(): BattleLootBatch | undefined {
    if (this.lootTaken || !this.finalized || this.awaitingNextRound)
      return undefined;
    this.lootTaken = true;
    const batch = this.acquiredLoot();
    return batch.items.length ? batch : undefined;
  }
}

export function battleTurnSummary(turn: BattleTurn): string {
  return [
    turn.damage ? `${turn.damage} урона` : "без урона",
    ...(turn.healing ? [`+${turn.healing} HP`] : []),
    ...(turn.critical ? ["критический удар"] : []),
    ...(turn.resourceChange
      ? [`ресурс ${turn.resourceChange > 0 ? "+" : ""}${turn.resourceChange}`]
      : []),
  ].join(" · ");
}

export function battleTurnDetail(turn: BattleTurn): string {
  const lines = [
    battleTurnSummary(turn),
    ...(turn.resourceTriggered ? [`сработало: ${turn.resourceTriggered}`] : []),
    ...(turn.statusComboIds?.length
      ? [`комбинация: ${turn.statusComboIds.join(", ")}`]
      : []),
    ...(turn.detail ? [turn.detail] : []),
    ...(turn.decisionReason && !turn.detail?.includes(turn.decisionReason)
      ? [`Выбор: ${turn.decisionReason}`]
      : []),
  ];
  return lines.join(" · ");
}

export function battleTurnLogLine(turn: BattleTurn): string {
  return `${turn.turn}. ${turn.actorName} — ${turn.action}: ${battleTurnDetail(turn)}`;
}
