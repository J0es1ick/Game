import { WorldGame } from "../src/gameplay/core/WorldGame";
import { createWorldSavePreparer, type WorldSavePreparationRequest, type WorldSavePreparationResponse } from "../src/gameplay/save/WorldSavePreparation";
import { WorldSaveRepository, type KeyValueStorage } from "../src/gameplay/save/WorldSaveStorage";
import { WorldSaveWriter, type WorldSaveWorkerPort } from "../src/gameplay/save/WorldSaveWriter";
import type { GameSave } from "../src/gameplay/core/WorldTypes";

class MemoryStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

class FakeWorker implements WorldSaveWorkerPort {
  public onmessage: WorldSaveWorkerPort["onmessage"] = null;
  public onerror: WorldSaveWorkerPort["onerror"] = null;
  public readonly requests: WorldSavePreparationRequest[] = [];
  public stopped = false;
  private readonly prepare = createWorldSavePreparer();

  public postMessage(request: WorldSavePreparationRequest): void { this.requests.push(structuredClone(request)); }
  public terminate(): void { this.stopped = true; }
  public reply(index = this.requests.length - 1): void {
    this.onmessage?.({ data: this.prepare(this.requests[index]) } as MessageEvent<WorldSavePreparationResponse>);
  }
}

describe("background world saves", () => {
  let initial: GameSave;
  beforeAll(() => { initial = WorldGame.create("Летописец", "Swordsman", 18500).save; });

  function setup() {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const worker = new FakeWorker();
    const writer = new WorldSaveWriter(repository, () => worker);
    return { storage, repository, worker, writer, save: structuredClone(initial) };
  }

  test("captures the state at the requested revision without writing on the main thread", async () => {
    const { repository, worker, writer, save } = setup();
    const expectedGold = save.hero.gold;
    const pending = writer.save(save);
    save.hero.gold += 100;
    expect(repository.load()).toBeNull();
    expect(writer.isSaving).toBe(true);
    worker.reply();
    await pending;
    expect(repository.load()?.save.hero.gold).toBe(expectedGold);
    expect(writer.isSaving).toBe(false);
  });

  test("coalesces a burst to the latest snapshot and resolves superseded requests after it is durable", async () => {
    const { repository, worker, writer, save } = setup();
    const requests = [writer.save(save)];
    save.worldDay = 2;
    requests.push(writer.save(save));
    save.worldDay = 3;
    requests.push(writer.save(save));
    expect(worker.requests).toHaveLength(1);
    worker.reply(0);
    expect(repository.load()).toBeNull();
    expect(worker.requests.map((request) => request.save.worldDay)).toEqual([1, 3]);
    worker.reply(1);
    await Promise.all(requests);
    expect(repository.load()?.save.worldDay).toBe(3);
  });

  test("flushes the newest in-memory state and ignores late worker replies", async () => {
    const { repository, worker, writer, save } = setup();
    const pending = writer.save(save);
    const lateHandler = worker.onmessage!;
    const response = createWorldSavePreparer()(worker.requests[0]);
    save.worldDay = 7;
    writer.flushSync(save);
    lateHandler({ data: response } as MessageEvent<WorldSavePreparationResponse>);
    await pending;
    expect(worker.stopped).toBe(true);
    expect(repository.load()?.save.worldDay).toBe(7);
  });

  test("cancels old snapshots before replacing a campaign", async () => {
    const { storage, repository, worker, writer, save } = setup();
    const pending = writer.save(save);
    const lateHandler = worker.onmessage!;
    const response = createWorldSavePreparer()(worker.requests[0]);
    writer.cancel();
    storage.removeItem(repository.primaryKey);
    const replacement = WorldGame.create("Новая эпоха", "Archer", 18501).save;
    repository.save(replacement);
    lateHandler({ data: response } as MessageEvent<WorldSavePreparationResponse>);
    await pending;
    expect(repository.load()?.save.hero.name).toBe("Новая эпоха");
  });

  test("falls back safely if workers are unavailable", async () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const writer = new WorldSaveWriter(repository, () => { throw new Error("blocked"); });
    await writer.save(initial);
    expect(repository.load()?.save.hero.name).toBe(initial.hero.name);
  });

  test("falls back to the latest queued revision after a worker crash", async () => {
    const { repository, worker, writer, save } = setup();
    const first = writer.save(save);
    save.worldDay = 9;
    const second = writer.save(save);
    worker.onerror?.({ preventDefault: () => undefined } as ErrorEvent);
    await Promise.all([first, second]);
    expect(repository.load()?.save.worldDay).toBe(9);
  });

  test("does not overwrite a good snapshot when worker-side validation rejects a save", async () => {
    const { repository, worker, writer, save } = setup();
    repository.save(save);
    const invalid = structuredClone(save);
    invalid.hero.gold = Number.NaN;
    const pending = writer.save(invalid);
    const rejected = expect(pending).rejects.toThrow();
    worker.reply();
    await rejected;
    expect(repository.load()?.save.hero.gold).toBe(save.hero.gold);
  });

  test("persists the complete base before checkpointing while a full snapshot is in flight", async () => {
    const { repository, writer } = setup();
    const game = WorldGame.restore(structuredClone(initial));
    game.beginDuel();
    const pending = writer.save(game.save);
    game.stepPendingBattle();
    writer.saveBattleProgress(game.save);
    await pending;
    expect(repository.load()?.save.pendingBattle?.session.turns).toEqual(game.save.pendingBattle?.session.turns);
    expect(writer.isSaving).toBe(false);
  });

  test("a first battle checkpoint preserves world changes queued behind an unrelated snapshot", async () => {
    const { repository, worker, writer } = setup();
    const game = WorldGame.restore(structuredClone(initial));
    repository.save(game.save);
    const preBattleWrite = writer.save(game.save);
    const oldHandler = worker.onmessage!;
    const oldResponse = createWorldSavePreparer()(worker.requests[0]);
    game.save.hero.gold += 1234;
    game.save.completedContracts += 1;
    game.beginDuel();
    const battleWrite = writer.save(game.save);
    game.stepPendingBattle();
    writer.saveBattleProgress(game.save);
    oldHandler({ data: oldResponse } as MessageEvent<WorldSavePreparationResponse>);
    await Promise.all([preBattleWrite, battleWrite]);
    const restored = repository.load()!.save;
    expect(restored.hero.gold).toBe(game.save.hero.gold);
    expect(restored.completedContracts).toBe(game.save.completedContracts);
    expect(restored.pendingBattle?.session).toEqual(game.save.pendingBattle?.session);
  });

  test("a checkpoint flushes unrelated changes from a newer snapshot of the same battle", async () => {
    const { repository, worker, writer } = setup();
    const game = WorldGame.restore(structuredClone(initial));
    game.beginDuel();
    repository.save(game.save);
    game.save.hero.gold += 1234;
    const pending = writer.save(game.save);
    const oldHandler = worker.onmessage!;
    const oldResponse = createWorldSavePreparer()(worker.requests[0]);
    game.stepPendingBattle();
    writer.saveBattleProgress(game.save);
    game.stepPendingBattle();
    writer.saveBattleProgress(game.save);
    oldHandler({ data: oldResponse } as MessageEvent<WorldSavePreparationResponse>);
    await pending;
    expect(repository.load()?.save.hero.gold).toBe(game.save.hero.gold);
    expect(repository.load()?.save.pendingBattle?.session.turns).toHaveLength(2);
  });

  test("a late error from a cancelled worker cannot stop its replacement", async () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const workers = [new FakeWorker(), new FakeWorker()];
    let workerIndex = 0;
    const writer = new WorldSaveWriter(repository, () => workers[workerIndex++]);
    const first = writer.save(initial);
    const lateError = workers[0].onerror!;
    writer.cancel();
    const replacement = structuredClone(initial);
    replacement.worldDay = 8;
    const second = writer.save(replacement);
    lateError({ preventDefault: () => undefined } as ErrorEvent);
    expect(workers[1].stopped).toBe(false);
    expect(writer.isSaving).toBe(true);
    workers[1].reply();
    await Promise.all([first, second]);
    expect(repository.load()?.save.worldDay).toBe(8);
  });

  test("coalesces queued state changes before cloning them for the worker", async () => {
    const { repository, worker, writer, save } = setup();
    const clone = jest.spyOn(globalThis, "structuredClone");
    try {
      const promises = [writer.save(save)];
      for (let day = 2; day <= 30; day += 1) {
        save.worldDay = day;
        promises.push(writer.save(save));
      }
      expect(clone).toHaveBeenCalledTimes(1);
      expect(worker.requests).toHaveLength(1);
      worker.reply(0);
      expect(clone).toHaveBeenCalledTimes(2);
      expect(worker.requests.map((request) => request.save.worldDay)).toEqual([1, 30]);
      worker.reply(1);
      await Promise.all(promises);
      expect(repository.load()?.save.worldDay).toBe(30);
    } finally {
      clone.mockRestore();
    }
  });

  test("disposed writers reject late checkpoints and synchronous writes", async () => {
    const { repository, writer, save } = setup();
    repository.save(save);
    writer.dispose();
    save.worldDay = 9;
    expect(() => writer.flushSync(save)).toThrow(/завершена/);
    expect(() => writer.saveBattleProgress(save)).toThrow(/завершена/);
    await expect(writer.save(save)).rejects.toThrow(/завершена/);
    expect(repository.load()?.save.worldDay).toBe(1);
  });

  test("reuses identical prepared data without weakening later validation", () => {
    const prepare = createWorldSavePreparer();
    const save = structuredClone(initial);
    const before = JSON.stringify(save);
    const first = prepare({ id: 1, save });
    const second = prepare({ id: 2, save });
    expect(first).toHaveProperty("serialized");
    expect(second).toMatchObject({ ...first, id: 2 });
    expect(JSON.stringify(save)).toBe(before);
    save.hero.inventory[0].id = save.hero.inventory[1].id;
    expect(prepare({ id: 3, save })).toHaveProperty("error");
  });
});
