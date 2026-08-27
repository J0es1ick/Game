import { normalizeWorldSave } from "./WorldSaveMigration";
import { GameSave } from "./WorldTypes";
import { assertRestorableWorldSave, InvalidWorldSaveError } from "./WorldSaveValidation";
import { decodeWorldSaveStorage, encodeWorldSaveStorage, isCompressedWorldSave, worldSaveChecksum } from "./WorldSaveCodec";

export const WORLD_SAVE_EXPORT_FORMAT = "dust-and-crown-world-save";
export const WORLD_SAVE_EXPORT_SCHEMA = 1;

export interface WorldSaveExportEnvelope {
  format: typeof WORLD_SAVE_EXPORT_FORMAT;
  schemaVersion: typeof WORLD_SAVE_EXPORT_SCHEMA;
  exportedAt: number;
  checksum: string;
  save: GameSave;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadedWorldSave {
  save: GameSave;
  source: "primary" | "temporary" | "backup";
}

export interface SafeWorldSaveParseResult {
  save?: GameSave;
  error?: Error;
}

function cloneSave(save: GameSave): GameSave {
  return JSON.parse(JSON.stringify(save)) as GameSave;
}

function migratedClone(value: unknown): GameSave {
  assertRestorableWorldSave(value);
  return normalizeWorldSave(cloneSave(value));
}

export function serializeWorldSave(save: GameSave): string {
  return JSON.stringify(migratedClone(save));
}

export function parseWorldSave(serialized: string): GameSave {
  serialized = decodeWorldSaveStorage(serialized);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new InvalidWorldSaveError([{ path: "$", message: "Файл не является корректным JSON." }]);
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
    && (parsed as Record<string, unknown>).format === WORLD_SAVE_EXPORT_FORMAT) {
    const envelope = parsed as Partial<WorldSaveExportEnvelope>;
    if (envelope.schemaVersion !== WORLD_SAVE_EXPORT_SCHEMA || !envelope.save) {
      throw new InvalidWorldSaveError([{ path: "$", message: "Версия экспортированного файла не поддерживается." }]);
    }
    const payload = JSON.stringify(envelope.save);
    if (envelope.checksum !== worldSaveChecksum(payload)) {
      throw new InvalidWorldSaveError([{ path: "$.checksum", message: "Контрольная сумма не совпала: файл повреждён." }]);
    }
    return migratedClone(envelope.save);
  }
  return migratedClone(parsed);
}

export function safeParseWorldSave(serialized: string): SafeWorldSaveParseResult {
  try {
    return { save: parseWorldSave(serialized) };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function exportWorldSave(save: GameSave, now = Date.now()): string {
  const migrated = migratedClone(save);
  const payload = JSON.stringify(migrated);
  const envelope: WorldSaveExportEnvelope = {
    format: WORLD_SAVE_EXPORT_FORMAT,
    schemaVersion: WORLD_SAVE_EXPORT_SCHEMA,
    exportedAt: now,
    checksum: worldSaveChecksum(payload),
    save: migrated,
  };
  return JSON.stringify(envelope, null, 2);
}

export class WorldSaveRepository {
  public readonly backupKey: string;
  public readonly temporaryKey: string;
  private verifiedPrimary: string | null = null;

  public constructor(
    private readonly storage: KeyValueStorage,
    public readonly primaryKey: string,
  ) {
    this.backupKey = `${primaryKey}.backup`;
    this.temporaryKey = `${primaryKey}.temporary`;
  }

  public load(): LoadedWorldSave | null {
    this.compactStoredCopies();
    const interrupted = this.storage.getItem(this.temporaryKey);
    if (interrupted) {
      const parsed = safeParseWorldSave(interrupted);
      if (parsed.save) {
        try {
          this.writePrimary(interrupted);
        } catch {
          return { save: parsed.save, source: "temporary" };
        }
        return { save: parsed.save, source: "temporary" };
      }
      this.storage.removeItem(this.temporaryKey);
    }
    const candidates: Array<[LoadedWorldSave["source"], string]> = [
      ["primary", this.primaryKey],
      ["backup", this.backupKey],
    ];
    for (const [source, key] of candidates) {
      const serialized = this.storage.getItem(key);
      if (!serialized) continue;
      const parsed = safeParseWorldSave(serialized);
      if (parsed.save) {
        if (source === "primary") this.verifiedPrimary = serialized;
        return { save: parsed.save, source };
      }
    }
    return null;
  }

  public save(save: GameSave): void {
    const serialized = encodeWorldSaveStorage(serializeWorldSave(save));
    this.compactStoredCopies();
    this.writePrimary(serialized);
  }

  public import(serialized: string): GameSave {
    const save = parseWorldSave(serialized);
    this.save(save);
    return save;
  }

  public export(now = Date.now()): string {
    const loaded = this.load();
    if (!loaded) throw new Error("Сохранение для экспорта не найдено.");
    return exportWorldSave(loaded.save, now);
  }

  private compactStoredCopies(): void {
    for (const key of [this.primaryKey, this.backupKey, this.temporaryKey]) {
      const stored = this.storage.getItem(key);
      if (!stored || isCompressedWorldSave(stored) || !safeParseWorldSave(stored).save) continue;
      try {
        const packed = encodeWorldSaveStorage(stored);
        if (packed.length < stored.length) this.storage.setItem(key, packed);
      } catch {
        continue;
      }
    }
  }

  private writePrimary(serialized: string): void {
    const current = this.storage.getItem(this.primaryKey);
    if (current === serialized) {
      this.verifiedPrimary = serialized;
      this.storage.removeItem(this.temporaryKey);
      return;
    }
    const previous = current && (this.verifiedPrimary === current || safeParseWorldSave(current).save) ? current : null;
    try {
      this.storage.setItem(this.primaryKey, serialized);
    } catch (error) {
      const backup = this.storage.getItem(this.backupKey);
      if (!isStorageQuotaError(error) || !previous || !backup) throw storageWriteError(error);
      this.storage.removeItem(this.backupKey);
      try {
        this.storage.setItem(this.primaryKey, serialized);
      } catch (retryError) {
        this.tryWriteBackup(backup);
        throw storageWriteError(retryError);
      }
    }
    this.verifiedPrimary = serialized;
    this.storage.removeItem(this.temporaryKey);
    if (previous) this.tryWriteBackup(previous);
  }

  private tryWriteBackup(serialized: string): void {
    try {
      this.storage.setItem(this.backupKey, serialized);
    } catch {
      return;
    }
  }
}

function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; code?: number };
  return value.name === "QuotaExceededError" || value.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || value.code === 22 || value.code === 1014;
}

function storageWriteError(error: unknown): Error {
  return new Error(isStorageQuotaError(error)
    ? "В хранилище браузера не хватает места даже для сжатого сохранения. Последняя записанная летопись не удалена. Не закрывайте вкладку: скачайте текущий прогресс через меню «Летопись» → «Скачать сохранение»."
    : "Браузер не разрешил записать сохранение. Не закрывайте вкладку: скачайте текущую летопись через меню «Летопись» → «Скачать сохранение».");
}
