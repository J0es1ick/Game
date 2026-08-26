import { WorldGame } from "../src/gameplay/WorldGame";
import { WorldSaveRepository, type KeyValueStorage } from "../src/gameplay/WorldSaveStorage";
import { SaveTransferController } from "../src/web/SaveTransferController";

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

describe("save transfer UI controller", () => {
  test("exports a portable file with a filesystem-safe descriptive name", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const game = WorldGame.create(" Артём / Первый ", "Knight", 501);
    repository.save(game.save);
    const transfer = new SaveTransferController(repository, storage);

    const download = transfer.export(game.save.hero.name, 17);
    expect(download.fileName).toBe("dust-and-crown-Артём-Первый-day-17.json");
    expect(JSON.parse(download.content).format).toBe("dust-and-crown-world-save");
  });

  test("invalid import leaves the current primary save intact", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const game = WorldGame.create("Текущий", "Archer", 502);
    repository.save(game.save);
    const before = storage.getItem(repository.primaryKey);
    const transfer = new SaveTransferController(repository, storage);

    expect(() => transfer.import("{broken")).toThrow();
    expect(storage.getItem(repository.primaryKey)).toBe(before);
  });

  test("restores the previous verified backup and keeps the newer state as rollback", () => {
    const storage = new MemoryStorage();
    const repository = new WorldSaveRepository(storage, "save");
    const game = WorldGame.create("Летописец", "Wizard", 503);
    repository.save(game.save);
    const firstDay = game.save.worldDay;
    game.save.worldDay += 3;
    repository.save(game.save);
    const transfer = new SaveTransferController(repository, storage);

    expect(transfer.canRestoreBackup()).toBe(true);
    const restored = transfer.restoreBackup();
    expect(restored.worldDay).toBe(firstDay);
    expect(repository.load()?.save.worldDay).toBe(firstDay);
  });
});
