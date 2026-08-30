import { WorldGame } from "../src/gameplay/core/WorldGame";
import { parseWorldSave, WorldSaveRepository, type KeyValueStorage } from "../src/gameplay/save/WorldSaveStorage";
import { worldSaveChecksum } from "../src/gameplay/save/WorldSaveCodec";
import type { GameSave } from "../src/gameplay/core/WorldTypes";

class MemoryStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();
  public readonly writes: string[] = [];
  public rejectCheckpoint = false;
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void {
    if (this.rejectCheckpoint && key.endsWith(".battle")) {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.writes.push(key);
    this.values.set(key, value);
  }
  public removeItem(key: string): void { this.values.delete(key); }
}

describe("battle progress checkpoints", () => {
  let initial: GameSave;
  beforeAll(() => {
    const game = WorldGame.create("Дуэлянт", "Knight", 19500);
    game.beginDuel();
    initial = structuredClone(game.save);
  });

  function setup() {
    const game = WorldGame.restore(structuredClone(initial));
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    repository.save(game.save);
    storage.writes.length = 0;
    return { game, storage, repository };
  }

  test("writes only the compact battle state on each turn and resumes it after reload", () => {
    const { game, repository, storage } = setup();
    const base = storage.getItem(repository.primaryKey);
    game.stepPendingBattle();
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    expect(storage.writes).toEqual([repository.battleCheckpointKey]);
    expect(storage.getItem(repository.primaryKey)).toBe(base);
    expect(storage.getItem(repository.battleCheckpointKey)!.length).toBeLessThan(JSON.stringify(game.save).length / 10);
    const restored = new WorldSaveRepository(storage, "save").load()!.save;
    expect(restored.pendingBattle?.session).toEqual(game.save.pendingBattle?.session);
    expect(WorldGame.restore(restored).stepPendingBattle().turn).toEqual(game.stepPendingBattle().turn);
  });

  test("exports the latest checkpoint, not the initial battle state", () => {
    const { game, repository } = setup();
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    expect(parseWorldSave(repository.export()).pendingBattle?.session).toEqual(game.save.pendingBattle?.session);
  });

  test("clears checkpoints only after a successful full snapshot", () => {
    const { game, repository, storage } = setup();
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    expect(storage.getItem(repository.battleCheckpointKey)).not.toBeNull();
    repository.save(game.save);
    expect(storage.getItem(repository.battleCheckpointKey)).toBeNull();
    expect(repository.load()?.save.pendingBattle?.session).toEqual(game.save.pendingBattle?.session);
  });

  test("does not apply a stale checkpoint to another base or a backup", () => {
    const { game, repository, storage } = setup();
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    const checkpoint = storage.getItem(repository.battleCheckpointKey)!;
    game.save.hero.gold += 50;
    game.stepPendingBattle();
    repository.save(game.save);
    storage.setItem(repository.battleCheckpointKey, checkpoint);
    const restored = repository.load()!.save;
    expect(restored.hero.gold).toBe(game.save.hero.gold);
    expect(restored.pendingBattle?.session.turns).toHaveLength(2);
  });

  test("ignores malformed and checksum-valid but invalid sessions", () => {
    const { game, repository, storage } = setup();
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    const envelope = JSON.parse(storage.getItem(repository.battleCheckpointKey)!) as { checksum: string; payload: string };
    const checkpoint = JSON.parse(envelope.payload);
    checkpoint.session.hero.health = -5;
    envelope.payload = JSON.stringify(checkpoint);
    envelope.checksum = worldSaveChecksum(envelope.payload);
    storage.setItem(repository.battleCheckpointKey, JSON.stringify(envelope));
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(0);
    storage.setItem(repository.battleCheckpointKey, "{broken");
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(0);
  });

  test("creates a safe full base if a checkpoint is requested before the battle has been saved", () => {
    const { game, storage } = setup();
    const repository = new WorldSaveRepository(storage, "new-save");
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(1);
    expect(storage.getItem(repository.battleCheckpointKey)).toBeNull();
  });

  test("does not reuse a battle base belonging to a different campaign epoch", () => {
    const { game, repository, storage } = setup();
    game.save.legacy.cycle += 1;
    game.stepPendingBattle();
    repository.saveBattleProgress(game.save);
    expect(repository.load()?.save.legacy.cycle).toBe(game.save.legacy.cycle);
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(1);
    expect(storage.getItem(repository.battleCheckpointKey)).toBeNull();
  });

  test("falls back to compressed full persistence when a checkpoint exceeds remaining quota", () => {
    const { game, repository, storage } = setup();
    game.stepPendingBattle();
    storage.rejectCheckpoint = true;
    repository.saveBattleProgress(game.save);
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(1);
    expect(storage.getItem(repository.battleCheckpointKey)).toBeNull();
  });
});
