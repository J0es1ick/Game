import * as fs from "node:fs";
import * as path from "node:path";

import {
  exportWorldSave,
  parseWorldSave,
  safeParseWorldSave,
} from "../../gameplay/WorldSaveStorage";
import { GameSave } from "../../gameplay/WorldTypes";

export type ConsoleSaveSource = "primary" | "temporary" | "backup";

export interface LoadedConsoleWorldSave {
  save: GameSave;
  source: ConsoleSaveSource;
}

export class ConsoleWorldSaveRepository {
  public readonly backupPath: string;
  public readonly temporaryPath: string;

  public constructor(public readonly primaryPath: string) {
    const extension = path.extname(primaryPath) || ".json";
    const stem = primaryPath.slice(0, primaryPath.length - extension.length);
    this.backupPath = `${stem}.backup${extension}`;
    this.temporaryPath = `${stem}.temporary${extension}`;
  }

  public exists(): boolean {
    return [this.primaryPath, this.temporaryPath, this.backupPath]
      .some((filePath) => fs.existsSync(filePath));
  }

  public load(): LoadedConsoleWorldSave | null {
    const temporary = this.tryRead(this.temporaryPath);
    if (temporary) {
      const primary = this.tryRead(this.primaryPath);
      if (primary) this.copyVerified(this.primaryPath, this.backupPath);
      this.writePrimaryFromVerifiedTemporary();
      return { save: temporary, source: "temporary" };
    }
    this.removeIfPresent(this.temporaryPath);

    const primary = this.tryRead(this.primaryPath);
    if (primary) return { save: primary, source: "primary" };
    const backup = this.tryRead(this.backupPath);
    if (!backup) return null;
    this.ensureDirectory();
    fs.copyFileSync(this.backupPath, this.primaryPath);
    return { save: backup, source: "backup" };
  }

  public save(save: GameSave, now = Date.now()): void {
    this.ensureDirectory();
    const serialized = exportWorldSave(save, now);
    this.writeDurably(this.temporaryPath, serialized);
    const verified = this.tryRead(this.temporaryPath);
    if (!verified) throw new Error("Не удалось проверить временную копию сохранения.");

    if (this.tryRead(this.primaryPath)) this.copyVerified(this.primaryPath, this.backupPath);
    this.writePrimaryFromVerifiedTemporary();
  }

  public import(serialized: string, now = Date.now()): GameSave {
    const save = parseWorldSave(serialized);
    this.save(save, now);
    return save;
  }

  public export(): string {
    const loaded = this.load();
    if (!loaded) throw new Error("Сохранение для экспорта не найдено.");
    return exportWorldSave(loaded.save);
  }

  public exportTo(filePath: string): string {
    const destination = path.resolve(filePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    this.writeDurably(destination, this.export());
    if (!this.tryRead(destination)) throw new Error("Экспортированное сохранение не прошло проверку.");
    return destination;
  }

  public importFrom(filePath: string, now = Date.now()): GameSave {
    const source = path.resolve(filePath);
    if (!fs.existsSync(source)) throw new Error("Файл импорта не найден.");
    return this.import(fs.readFileSync(source, "utf8"), now);
  }

  private ensureDirectory(): void {
    fs.mkdirSync(path.dirname(this.primaryPath), { recursive: true });
  }

  private tryRead(filePath: string): GameSave | undefined {
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const serialized = fs.readFileSync(filePath, "utf8");
      return safeParseWorldSave(serialized).save;
    } catch {
      return undefined;
    }
  }

  private copyVerified(source: string, destination: string): void {
    this.ensureDirectory();
    fs.copyFileSync(source, destination);
    if (!this.tryRead(destination)) throw new Error("Не удалось создать проверенную резервную копию сохранения.");
  }

  private writePrimaryFromVerifiedTemporary(): void {
    this.ensureDirectory();
    fs.copyFileSync(this.temporaryPath, this.primaryPath);
    if (!this.tryRead(this.primaryPath)) throw new Error("Основной файл сохранения повреждён при записи.");
    this.removeIfPresent(this.temporaryPath);
  }

  private writeDurably(filePath: string, value: string): void {
    const descriptor = fs.openSync(filePath, "w");
    try {
      fs.writeFileSync(descriptor, value, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  private removeIfPresent(filePath: string): void {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
