import { normalizeWorldSave } from "./WorldSaveMigration";
import { GameSave } from "./WorldTypes";
import { assertRestorableWorldSave, InvalidWorldSaveError } from "./WorldSaveValidation";

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

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function migratedClone(value: unknown): GameSave {
  assertRestorableWorldSave(value);
  return normalizeWorldSave(cloneSave(value));
}

export function serializeWorldSave(save: GameSave): string {
  return JSON.stringify(migratedClone(save));
}

export function parseWorldSave(serialized: string): GameSave {
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
    if (envelope.checksum !== checksum(payload)) {
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
    checksum: checksum(payload),
    save: migrated,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Local-storage compatible repository with a last-known-good backup and a
 * temporary write. It intentionally has no browser dependency and is therefore
 * reusable by tests, the SPA and future desktop builds.
 */
export class WorldSaveRepository {
  public readonly backupKey: string;
  public readonly temporaryKey: string;

  public constructor(
    private readonly storage: KeyValueStorage,
    public readonly primaryKey: string,
  ) {
    this.backupKey = `${primaryKey}.backup`;
    this.temporaryKey = `${primaryKey}.temporary`;
  }

  public load(): LoadedWorldSave | null {
    // A temporary copy only survives when the previous two-phase save was
    // interrupted after its verified write. Prefer and promote it before the
    // older primary, otherwise a browser crash silently loses recent progress.
    const interrupted = this.storage.getItem(this.temporaryKey);
    if (interrupted) {
      const parsed = safeParseWorldSave(interrupted);
      if (parsed.save) {
        const current = this.storage.getItem(this.primaryKey);
        if (current && safeParseWorldSave(current).save) this.storage.setItem(this.backupKey, current);
        this.storage.setItem(this.primaryKey, interrupted);
        this.storage.removeItem(this.temporaryKey);
        return { save: parsed.save, source: "temporary" };
      }
      // A damaged interrupted write must not shadow a valid primary forever.
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
      if (parsed.save) return { save: parsed.save, source };
    }
    return null;
  }

  public save(save: GameSave): void {
    const serialized = serializeWorldSave(save);
    const current = this.storage.getItem(this.primaryKey);
    if (current && safeParseWorldSave(current).save) this.storage.setItem(this.backupKey, current);

    this.storage.setItem(this.temporaryKey, serialized);
    // Verify what the adapter actually persisted before replacing the primary.
    const temporary = this.storage.getItem(this.temporaryKey);
    if (!temporary || !safeParseWorldSave(temporary).save) {
      throw new Error("Не удалось проверить временную копию сохранения.");
    }
    this.storage.setItem(this.primaryKey, temporary);
    this.storage.removeItem(this.temporaryKey);
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
}
