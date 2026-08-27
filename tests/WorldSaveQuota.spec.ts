import { createHash } from "node:crypto";
import { WorldGame } from "../src/gameplay/WorldGame";
import { decodeWorldSaveStorage, encodeWorldSaveStorage, isCompressedWorldSave } from "../src/gameplay/WorldSaveCodec";
import { parseWorldSave, serializeWorldSave, WorldSaveRepository, type KeyValueStorage } from "../src/gameplay/WorldSaveStorage";
import type { GameSave } from "../src/gameplay/WorldTypes";

class QuotaStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();
  public readonly writes: string[] = [];
  public limit = Infinity;
  public rejectWrites = false;

  public get bytes(): number {
    return Array.from(this.values, ([key, value]) => (key.length + value.length) * 2)
      .reduce((total, size) => total + size, 0);
  }

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }

  public setItem(key: string, value: string): void {
    this.writes.push(key);
    const previous = this.getItem(key);
    const removed = previous === null ? 0 : (key.length + previous.length) * 2;
    if (this.rejectWrites || this.bytes - removed + (key.length + value.length) * 2 > this.limit) {
      const error = new Error("Storage quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
}

describe("world save storage quota", () => {
  let initial: GameSave;
  beforeAll(() => { initial = WorldGame.create("Хранитель памяти", "Swordsman", 1042).save; });

  function saveForDay(day: number): GameSave {
    const save = JSON.parse(JSON.stringify(initial)) as GameSave;
    save.worldDay = day;
    return save;
  }

  function addHistory(save: GameSave, entries = 1000): void {
    save.events.push(...Array.from({ length: entries }, (_, index) => ({
      id: `history-${index}`,
      type: "system" as const,
      day: save.worldDay,
      message: createHash("sha256").update(String(index)).digest("hex"),
    })));
  }

  test("migrates full legacy storage in place without deleting game data or other keys", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    storage.setItem(repository.primaryKey, JSON.stringify(saveForDay(15)));
    storage.setItem(repository.backupKey, JSON.stringify(saveForDay(14)));
    storage.setItem("other-game", "untouched");
    storage.limit = storage.bytes;
    const next = saveForDay(16);
    addHistory(next);

    repository.save(next);

    expect(repository.load()?.save).toEqual(parseWorldSave(serializeWorldSave(next)));
    expect(parseWorldSave(storage.getItem(repository.backupKey)!).worldDay).toBe(15);
    expect(storage.getItem("other-game")).toBe("untouched");
    expect(isCompressedWorldSave(storage.getItem(repository.primaryKey)!)).toBe(true);
    expect(isCompressedWorldSave(storage.getItem(repository.backupKey)!)).toBe(true);
    expect(storage.writes).not.toContain(repository.temporaryKey);
    expect(storage.bytes).toBeLessThan(storage.limit / 2);
  });

  test("stores a new game when only one compressed copy fits", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const save = saveForDay(1);
    const packed = encodeWorldSaveStorage(serializeWorldSave(save));
    storage.limit = (repository.primaryKey.length + packed.length) * 2;
    repository.save(save);
    expect(repository.load()?.save.worldDay).toBe(1);
    expect(storage.getItem(repository.backupKey)).toBeNull();
    expect(storage.getItem(repository.temporaryKey)).toBeNull();
  });

  test("frees only the optional backup if it prevents replacing a valid primary", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    repository.save(saveForDay(1));
    repository.save(saveForDay(2));
    storage.setItem("settings", "keep-me");
    const next = saveForDay(3);
    addHistory(next);
    const nextBytes = (repository.primaryKey.length + encodeWorldSaveStorage(serializeWorldSave(next)).length) * 2;
    storage.limit = Math.max(storage.bytes, nextBytes) + 100;

    repository.save(next);

    expect(repository.load()?.save.worldDay).toBe(3);
    expect(storage.getItem(repository.backupKey)).toBeNull();
    expect(storage.getItem("settings")).toBe("keep-me");
    expect(storage.writes).not.toContain(repository.temporaryKey);
  });

  test("keeps the last primary and restores its backup if the next save still cannot fit", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    repository.save(saveForDay(1));
    repository.save(saveForDay(2));
    const primary = storage.getItem(repository.primaryKey);
    const backup = storage.getItem(repository.backupKey);
    const next = saveForDay(3);
    addHistory(next, 10000);
    storage.limit = storage.bytes;

    expect(() => repository.save(next)).toThrow(/не хватает места.*Скачать сохранение/);
    expect(storage.getItem(repository.primaryKey)).toBe(primary);
    expect(storage.getItem(repository.backupKey)).toBe(backup);
    expect(repository.load()?.save.worldDay).toBe(2);
  });

  test("does not sacrifice the only valid backup to make space for an import", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    storage.setItem(repository.backupKey, encodeWorldSaveStorage(serializeWorldSave(saveForDay(8))));
    storage.setItem(repository.primaryKey, "{broken");
    const backup = storage.getItem(repository.backupKey);
    storage.limit = storage.bytes;

    expect(() => repository.import(JSON.stringify(saveForDay(10)))).toThrow(/не хватает места/);
    expect(storage.getItem(repository.backupKey)).toBe(backup);
    expect(repository.load()).toMatchObject({ source: "backup", save: { worldDay: 8 } });
  });

  test("loads an interrupted save even if the browser refuses all writes", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    storage.setItem(repository.primaryKey, JSON.stringify(saveForDay(8)));
    storage.setItem(repository.temporaryKey, JSON.stringify(saveForDay(9)));
    const temporary = storage.getItem(repository.temporaryKey);
    storage.rejectWrites = true;

    expect(repository.load()).toMatchObject({ source: "temporary", save: { worldDay: 9 } });
    expect(storage.getItem(repository.temporaryKey)).toBe(temporary);
    expect(parseWorldSave(storage.getItem(repository.primaryKey)!).worldDay).toBe(8);
  });

  test("recovers a legacy temporary save at capacity and retains the previous primary", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    storage.setItem(repository.primaryKey, JSON.stringify(saveForDay(8)));
    storage.setItem(repository.temporaryKey, JSON.stringify(saveForDay(9)));
    storage.setItem(repository.backupKey, JSON.stringify(saveForDay(7)));
    storage.limit = storage.bytes;

    expect(repository.load()).toMatchObject({ source: "temporary", save: { worldDay: 9 } });
    expect(storage.getItem(repository.temporaryKey)).toBeNull();
    expect(parseWorldSave(storage.getItem(repository.primaryKey)!).worldDay).toBe(9);
    expect(parseWorldSave(storage.getItem(repository.backupKey)!).worldDay).toBe(8);
  });

  test("loads an old primary without requiring any additional quota", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const raw = JSON.stringify(saveForDay(12));
    storage.setItem(repository.primaryKey, raw);
    storage.limit = storage.bytes;
    expect(repository.load()?.save.worldDay).toBe(12);
    expect(decodeWorldSaveStorage(storage.getItem(repository.primaryKey)!)).toBe(raw);
  });

  test("keeps the previous backup when the same state is saved again", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    repository.save(saveForDay(1));
    const next = saveForDay(2);
    repository.save(next);
    repository.save(next);
    expect(parseWorldSave(storage.getItem(repository.backupKey)!).worldDay).toBe(1);
  });

  test("falls back to a valid backup when compressed primary data is corrupt", () => {
    const storage = new QuotaStorage();
    const repository = new WorldSaveRepository(storage, "save");
    repository.save(saveForDay(1));
    repository.save(saveForDay(2));
    storage.setItem(repository.primaryKey, storage.getItem(repository.primaryKey)!.slice(0, -24));
    expect(repository.load()).toMatchObject({ source: "backup", save: { worldDay: 1 } });
  });
});
