import { WorldGame } from "../src/gameplay/WorldGame";
import { normalizeWorldSave } from "../src/gameplay/WorldSaveMigration";
import {
  exportWorldSave,
  parseWorldSave,
  safeParseWorldSave,
  WorldSaveRepository,
} from "../src/gameplay/WorldSaveStorage";
import { GameSave } from "../src/gameplay/WorldTypes";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

function copy(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

describe("world save safety", () => {
  it("preserves an unfinished tutorial and only completes it for version 2 migration", () => {
    const current = copy(WorldGame.create("Новичок", "Knight", 1).save);
    current.tutorialCompleted = false;
    expect(normalizeWorldSave(current).tutorialCompleted).toBe(false);

    const legacy = copy(WorldGame.create("Ветеран", "Archer", 1).save);
    legacy.version = 2;
    delete (legacy as unknown as Record<string, unknown>).tutorialCompleted;
    expect(normalizeWorldSave(legacy).tutorialCompleted).toBe(true);

    const incompleteCurrent = copy(WorldGame.create("Новый", "Monk", 1).save);
    delete (incompleteCurrent as unknown as Record<string, unknown>).tutorialCompleted;
    expect(normalizeWorldSave(incompleteCurrent).tutorialCompleted).toBe(false);
  });

  it("rejects malformed saves before migration can mutate them", () => {
    const malformed = JSON.stringify({ version: 3, hero: null, enemies: [], worldDay: "today" });
    const result = safeParseWorldSave(malformed);
    expect(result.save).toBeUndefined();
    expect(result.error?.message).toContain("$.hero");
  });

  it("exports a checksummed save and detects edited payloads", () => {
    const game = WorldGame.create("Летописец", "Wizard", 1);
    const exported = exportWorldSave(game.save, 42);
    expect(parseWorldSave(exported).hero.name).toBe("Летописец");

    const tampered = JSON.parse(exported) as { save: GameSave };
    tampered.save.hero.gold += 100_000;
    expect(() => parseWorldSave(JSON.stringify(tampered))).toThrow(/Контрольная сумма/);
  });

  it("falls back to the last known good backup when the primary is corrupted", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "game-save");
    const game = WorldGame.create("Хранитель", "Swordsman", 1);
    repository.save(game.save);
    const backedUpDay = game.save.worldDay;
    game.save.worldDay += 5;
    repository.save(game.save);
    storage.setItem(repository.primaryKey, "{broken");

    const loaded = repository.load();
    expect(loaded?.source).toBe("backup");
    expect(loaded?.save.worldDay).toBe(backedUpDay);
  });

  it("recovers the verified temporary copy when a save is interrupted before primary replacement", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "game-save");
    const game = WorldGame.create("Вернувшийся", "Knight", 10);
    repository.save(game.save);
    const oldDay = game.save.worldDay;
    game.save.worldDay += 7;
    storage.setItem(repository.temporaryKey, JSON.stringify(game.save));

    const loaded = repository.load();

    expect(loaded?.source).toBe("temporary");
    expect(loaded?.save.worldDay).toBe(oldDay + 7);
    expect(storage.getItem(repository.temporaryKey)).toBeNull();
    expect(safeParseWorldSave(storage.getItem(repository.primaryKey)!).save?.worldDay).toBe(oldDay + 7);
    expect(safeParseWorldSave(storage.getItem(repository.backupKey)!).save?.worldDay).toBe(oldDay);
  });
});
