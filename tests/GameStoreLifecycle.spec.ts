import { WorldGame } from "../src/gameplay/WorldGame";
import { createWorldSavePreparer, type WorldSavePreparationRequest, type WorldSavePreparationResponse } from "../src/gameplay/WorldSavePreparation";
import { parseWorldSave, type KeyValueStorage } from "../src/gameplay/WorldSaveStorage";
import type { WorldSaveWorkerPort } from "../src/gameplay/WorldSaveWriter";
import type { GameSave } from "../src/gameplay/WorldTypes";
import { GameStore, MODE_KEY } from "../src/web/react/state/GameStore";

class MemoryStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();
  public writes = 0;
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.writes += 1; this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

class FakeWorker implements WorldSaveWorkerPort {
  public onmessage: WorldSaveWorkerPort["onmessage"] = null;
  public onerror: WorldSaveWorkerPort["onerror"] = null;
  public requests: WorldSavePreparationRequest[] = [];
  public stopped = false;
  private readonly prepare = createWorldSavePreparer();
  public postMessage(request: WorldSavePreparationRequest): void { this.requests.push(structuredClone(request)); }
  public terminate(): void { this.stopped = true; }
  public response(): WorldSavePreparationResponse { return this.prepare(this.requests[this.requests.length - 1]); }
  public reply(): void { this.onmessage?.({ data: this.response() } as MessageEvent<WorldSavePreparationResponse>); }
}

function deferredText() {
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((success, failure) => { resolve = success; reject = failure; });
  return { text: () => promise, resolve, reject };
}

describe("React save lifecycle", () => {
  let initial: GameSave;
  beforeAll(() => {
    initial = WorldGame.create("Текущий герой", "Knight", 70_202).save;
    initial.tutorialCompleted = true;
    initial.lastSimulatedAt = Date.now();
  });

  function gameFor(name = "Текущий герой"): WorldGame {
    const save = structuredClone(initial);
    save.hero.name = name;
    save.lastSimulatedAt = Date.now();
    return WorldGame.restore(save);
  }

  function setup(attach = true) {
    const storage = new MemoryStorage();
    const workers: FakeWorker[] = [];
    const store = new GameStore(storage, () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const game = gameFor();
    if (attach) store.attach(game);
    return { storage, workers, store, game };
  }

  afterEach(() => { jest.restoreAllMocks(); });

  test("validates an import before interrupting a queued save", async () => {
    const { store, game, workers } = setup();
    store.repository.save(game.save);
    game.save.hero.gold += 123;
    store.persist();

    await expect(store.importSave("{invalid")).rejects.toThrow();

    expect(workers[0].stopped).toBe(false);
    workers[0].reply();
    expect(store.repository.load()?.save.hero.gold).toBe(game.save.hero.gold);
    expect(store.game).toBe(game);
    store.dispose();
  });

  test("a broken backup leaves the in-flight current save running", () => {
    const { store, game, workers, storage } = setup();
    store.repository.save(game.save);
    game.save.hero.gold += 17;
    store.persist();
    storage.setItem(store.repository.backupKey, "{invalid");

    expect(() => store.restoreBackup()).toThrow();

    expect(workers[0].stopped).toBe(false);
    workers[0].reply();
    expect(store.repository.load()?.save.hero.gold).toBe(game.save.hero.gold);
    store.dispose();
  });

  test.each(["reset", "replace", "dispose", "exit"] as const)("ignores a file read completed after %s", async (operation) => {
    const { store, game, storage } = setup();
    store.repository.save(game.save);
    const source = deferredText();
    const pending = store.importSave(source);
    if (operation === "reset") store.reset();
    if (operation === "replace") store.replaceGame(gameFor("Новая игра"));
    if (operation === "dispose") store.dispose();
    if (operation === "exit") store.exitMode();
    const current = store.game;

    source.resolve(JSON.stringify(gameFor("Опоздавший импорт").save));

    await expect(pending).resolves.toBe(false);
    expect(store.game).toBe(current);
    if (operation === "reset") {
      expect(storage.getItem(store.repository.primaryKey)).toBeNull();
      expect(store.getSnapshot().mode).toBe("creation");
    } else {
      store.flush();
      expect(store.repository.load()?.save.hero.name).toBe(current!.save.hero.name);
    }
    store.dispose();
  });

  test("a newer import supersedes a slower earlier file without a late overwrite", async () => {
    const { store } = setup();
    const source = deferredText();
    const pending = store.importSave(source);

    await expect(store.importSave(JSON.stringify(gameFor("Выбранный файл").save))).resolves.toBe(true);
    source.resolve(JSON.stringify(gameFor("Старый файл").save));

    await expect(pending).resolves.toBe(false);
    expect(store.game!.save.hero.name).toBe("Выбранный файл");
    expect(store.repository.load()?.save.hero.name).toBe("Выбранный файл");
    store.dispose();
  });

  test("a late file read error does not surface in a closed campaign", async () => {
    const { store } = setup();
    const source = deferredText();
    const pending = store.importSave(source);
    store.dispose();
    source.reject(new Error("File was removed"));
    await expect(pending).resolves.toBe(false);
  });

  test("disposal flushes the latest state and rejects subsequent mutations or imports", async () => {
    const { store, game, workers, storage } = setup();
    store.repository.save(game.save);
    game.save.hero.gold += 10;
    store.persist();
    const late = workers[0].onmessage!;
    const response = workers[0].response();
    game.save.hero.gold += 40;

    store.dispose();

    expect(store.repository.load()?.save.hero.gold).toBe(game.save.hero.gold);
    expect(workers[0].stopped).toBe(true);
    const state = store.getSnapshot();
    const writes = storage.writes;
    const action = jest.fn();
    store.act(action);
    store.persist();
    store.checkpoint();
    store.flush();
    store.reset();
    store.initialize();
    store.chooseMode("basic");
    store.openDialog({ kind: "tutorial", firstVisit: true });
    store.notify({ title: "Late notice", eyebrow: "", description: "", tone: "positive" });
    expect(() => store.attach(gameFor("Нельзя открыть"))).toThrow("сессия уже закрыта");
    expect(() => store.cancelSave()).toThrow("сессия уже закрыта");
    expect(() => store.restoreBackup()).toThrow("сессия уже закрыта");
    await expect(store.importSave(JSON.stringify(game.save))).rejects.toThrow("сессия уже закрыта");
    late({ data: response } as MessageEvent<WorldSavePreparationResponse>);
    store.dispose();
    expect(action).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(state);
    expect(storage.writes).toBe(writes);
  });

  test("an imported game is durable before switching and the latest old progress stays in backup", async () => {
    const { store, game, workers, storage } = setup();
    store.repository.save(game.save);
    game.save.hero.gold += 456;
    store.persist();

    await expect(store.importSave(JSON.stringify(gameFor("Импортирован").save))).resolves.toBe(true);

    expect(workers[0].stopped).toBe(true);
    expect(store.repository.load()?.save.hero.name).toBe("Импортирован");
    expect(parseWorldSave(storage.getItem(store.repository.backupKey)!).hero.gold).toBe(game.save.hero.gold);
    expect(storage.getItem(MODE_KEY)).toBe("world");
    store.dispose();
  });

  test("failed imported-save writes keep the current game and resume its pending persistence", async () => {
    const { store, game, workers } = setup();
    store.repository.save(game.save);
    game.save.hero.gold += 28;
    const save = store.repository.save.bind(store.repository);
    jest.spyOn(store.repository, "save").mockImplementation((state) => {
      if (state.hero.name === "Не записан") throw new Error("Write denied");
      save(state);
    });

    await expect(store.importSave(JSON.stringify(gameFor("Не записан").save))).rejects.toThrow("Write denied");

    expect(store.game).toBe(game);
    workers[0].reply();
    expect(store.repository.load()?.save.hero.gold).toBe(game.save.hero.gold);
    store.dispose();
  });

  test("the backup retains the latest checkpoint when importing during a saved battle", async () => {
    const { store, game, storage } = setup();
    game.beginDuel();
    store.repository.save(game.save);
    game.stepPendingBattle({ type: "basic" });
    store.checkpoint();
    expect(storage.getItem(store.repository.battleCheckpointKey)).not.toBeNull();

    await expect(store.importSave(JSON.stringify(gameFor("Другая летопись").save))).resolves.toBe(true);

    const backup = parseWorldSave(storage.getItem(store.repository.backupKey)!);
    expect(backup.pendingBattle?.session.turns).toEqual(game.currentPendingBattle()?.session.turns);
    expect(backup.pendingBattle?.session.turns).toHaveLength(1);
    store.dispose();
  });

  test("initial loading restores a battle checkpoint without advancing the world", () => {
    const { store, storage, game } = setup(false);
    game.beginDuel();
    store.repository.save(game.save);
    game.stepPendingBattle({ type: "basic" });
    store.repository.saveBattleProgress(game.save);
    storage.setItem(MODE_KEY, "world");

    store.initialize();

    expect(store.getSnapshot().mode).toBe("world");
    expect(store.getSnapshot().dialogs).toEqual([{ kind: "battle" }]);
    expect(store.game!.save.worldDay).toBe(game.save.worldDay);
    expect(store.game!.currentPendingBattle()?.session.turns).toEqual(game.currentPendingBattle()?.session.turns);
    const loaded = store.game;
    store.closeDialog();
    store.initialize();
    expect(store.game).toBe(loaded);
    expect(store.getSnapshot().dialogs).toEqual([]);
    store.dispose();
  });

  test.each(["battle", "dungeon"] as const)("backup recovery reopens a pending %s", (kind) => {
    const { store, game } = setup();
    const previous = gameFor("Возобновлённый");
    if (kind === "battle") previous.beginDuel();
    else {
      previous.save.hero.level = 2;
      previous.save.worldDay = 2;
      previous.startExpedition("cellar");
    }
    store.repository.save(previous.save);
    store.repository.save(game.save);

    store.restoreBackup();

    expect(store.game!.save.hero.name).toBe("Возобновлённый");
    expect(store.getSnapshot().dialogs).toEqual([{ kind }]);
    store.dispose();
  });

  test("unavailable storage enters recovery and save availability reads remain safe", () => {
    const storage: KeyValueStorage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    const store = new GameStore(storage);
    expect(() => store.initialize()).not.toThrow();
    expect(store.getSnapshot().mode).toBe("error");
    expect(store.getSnapshot().error).toContain("Браузер не разрешил прочитать сохранение");
    expect(store.hasSavedGame()).toBe(false);
    expect(store.hasBackup()).toBe(false);
    expect(() => store.chooseMode("basic")).not.toThrow();
    expect(store.getSnapshot().mode).toBe("basic");
    expect(() => store.exitMode()).not.toThrow();
    store.dispose();
  });

  test("a denied mode preference does not block a readable world save", () => {
    const { store, storage, game } = setup(false);
    store.repository.save(game.save);
    const setItem = storage.setItem.bind(storage);
    jest.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === MODE_KEY) throw new Error("Preference blocked");
      setItem(key, value);
    });

    expect(() => store.chooseMode("world")).not.toThrow();
    expect(store.getSnapshot().mode).toBe("world");
    expect(store.game?.save.hero.name).toBe(game.save.hero.name);
    store.dispose();
  });

  test("navigation waits for the matching rendered route and ignores stale completion", () => {
    const { store } = setup();
    store.navigate("chronicle", "epoch-history-view");
    const first = store.getSnapshot().navigation!;
    expect(first).toMatchObject({ page: "chronicle", anchor: "epoch-history-view" });
    store.navigate("shop");
    const second = store.getSnapshot().navigation!;
    expect(second.id).not.toBe(first.id);
    store.completeNavigation(first.id);
    expect(store.getSnapshot().navigation).toBe(second);
    store.completeNavigation(second.id);
    expect(store.getSnapshot().navigation).toBeNull();
    store.navigate("hero");
    store.setPage("map");
    expect(store.getSnapshot().navigation).toBeNull();
    store.navigate("shop");
    store.chooseMode("world");
    expect(store.getSnapshot().navigation).toBeNull();
    store.navigate("hero");
    store.replaceGame(gameFor("Новая летопись"));
    expect(store.getSnapshot().navigation).toBeNull();
    store.dispose();
  });
});
