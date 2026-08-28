import type { BattleSessionSnapshot } from "./AdvancedBattle";
import type { GameSave } from "./WorldTypes";
import { assertRestorablePendingBattle } from "./WorldSaveValidation";
import { worldSaveChecksum } from "./WorldSaveCodec";

interface BattleCheckpoint {
  version: 1;
  baseChecksum: string;
  heroId: string;
  cycle: number;
  worldDay: number;
  battleId: string;
  session: BattleSessionSnapshot;
}

export function serializeBattleCheckpoint(
  save: GameSave,
  baseChecksum: string,
): string {
  const battle = save.pendingBattle;
  if (!battle) throw new Error("Незавершённого боя для сохранения нет.");
  assertRestorablePendingBattle(battle);
  const checkpoint: BattleCheckpoint = {
    version: 1,
    baseChecksum,
    heroId: save.hero.id,
    cycle: save.legacy.cycle,
    worldDay: save.worldDay,
    battleId: battle.id,
    session: battle.session,
  };
  const payload = JSON.stringify(checkpoint);
  return JSON.stringify({ checksum: worldSaveChecksum(payload), payload });
}

export function restoreBattleCheckpoint(
  save: GameSave,
  serialized: string,
  baseChecksum: string,
): boolean {
  try {
    const envelope = JSON.parse(serialized) as {
      checksum?: unknown;
      payload?: unknown;
    } | null;
    if (
      !envelope ||
      typeof envelope.payload !== "string" ||
      typeof envelope.checksum !== "string" ||
      envelope.payload.length > 2 * 1024 * 1024 ||
      worldSaveChecksum(envelope.payload) !== envelope.checksum
    )
      return false;
    const checkpoint = JSON.parse(envelope.payload) as BattleCheckpoint | null;
    const battle = save.pendingBattle;
    if (
      !checkpoint ||
      checkpoint.version !== 1 ||
      !battle ||
      checkpoint.baseChecksum !== baseChecksum ||
      checkpoint.heroId !== save.hero.id ||
      checkpoint.cycle !== save.legacy.cycle ||
      checkpoint.worldDay !== save.worldDay ||
      checkpoint.battleId !== battle.id
    )
      return false;
    const candidate = { ...battle, session: checkpoint.session };
    assertRestorablePendingBattle(candidate);
    if (candidate.session.turns.length < battle.session.turns.length)
      return false;
    save.pendingBattle = candidate;
    return true;
  } catch {
    return false;
  }
}
