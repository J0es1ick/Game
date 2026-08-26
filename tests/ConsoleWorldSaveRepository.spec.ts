import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { WorldGame } from "../src/gameplay/WorldGame";
import { exportWorldSave } from "../src/gameplay/WorldSaveStorage";
import { ConsoleWorldSaveRepository } from "../src/utils/input/ConsoleWorldSaveRepository";

describe("ConsoleWorldSaveRepository", () => {
  let directory: string;
  let repository: ConsoleWorldSaveRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "dust-crown-cli-"));
    repository = new ConsoleWorldSaveRepository(path.join(directory, "world.json"));
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("stores a checksummed save and keeps the previous version as backup", () => {
    const game = WorldGame.create("Летописец", "Knight", 10_000);
    repository.save(game.save, 10_001);
    const firstDay = game.save.worldDay;
    game.train();
    repository.save(game.save, 10_002);

    expect(repository.load()?.save.worldDay).toBe(firstDay + 1);
    expect(fs.existsSync(repository.backupPath)).toBe(true);
  });

  it("recovers a verified temporary write ahead of an older primary", () => {
    const oldGame = WorldGame.create("Старый", "Archer", 20_000);
    repository.save(oldGame.save, 20_001);
    const nextGame = WorldGame.restore(oldGame.save);
    nextGame.train();
    fs.writeFileSync(repository.temporaryPath, exportWorldSave(nextGame.save, 20_002), "utf8");

    const loaded = repository.load();

    expect(loaded?.source).toBe("temporary");
    expect(loaded?.save.worldDay).toBe(nextGame.save.worldDay);
    expect(fs.existsSync(repository.temporaryPath)).toBe(false);
  });

  it("falls back to backup when the primary file is damaged", () => {
    const game = WorldGame.create("Страж", "Monk", 30_000);
    repository.save(game.save, 30_001);
    game.train();
    repository.save(game.save, 30_002);
    fs.writeFileSync(repository.primaryPath, "{broken", "utf8");

    const loaded = repository.load();

    expect(loaded?.source).toBe("backup");
    expect(loaded?.save.worldDay).toBe(1);
  });

  it("exports a verified portable file and imports it as the active campaign", () => {
    const exportPath = path.join(directory, "transfer", "chronicle.json");
    const source = WorldGame.create("Экспорт", "Gunsmith", 40_000);
    source.train();
    repository.save(source.save, 40_001);

    expect(repository.exportTo(exportPath)).toBe(path.resolve(exportPath));
    expect(fs.existsSync(exportPath)).toBe(true);

    const other = WorldGame.create("Замена", "Knight", 40_100);
    repository.save(other.save, 40_101);
    const imported = repository.importFrom(exportPath, 40_102);

    expect(imported.hero.name).toBe("Экспорт");
    expect(imported.hero.classId).toBe("Gunsmith");
    expect(repository.load()?.save.worldDay).toBe(source.save.worldDay);
  });
});
