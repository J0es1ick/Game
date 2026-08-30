import { normalizeWorldSave } from "./WorldSaveMigration";
import { GameSave } from "../core/WorldTypes";
import {
  assertRestorableWorldSave,
  InvalidWorldSaveError,
} from "./WorldSaveValidation";
import {
  decodeWorldSaveStorage,
  encodeWorldSaveStorage,
  isCompressedWorldSave,
  worldSaveChecksum,
} from "./WorldSaveCodec";
import {
  restoreBattleCheckpoint,
  serializeBattleCheckpoint,
} from "./WorldSaveBattleCheckpoint";

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

export interface WorldSaveIdentity {
  heroId: string;
  worldDay: number;
  cycle: number;
}

function saveIdentity(save: GameSave): WorldSaveIdentity {
  return {
    heroId: save.hero.id,
    worldDay: save.worldDay,
    cycle: save.legacy.cycle,
  };
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

export function normalizeSerializedWorldSave(serialized: string): string {
  const value: unknown = JSON.parse(serialized);
  assertRestorableWorldSave(value);
  return JSON.stringify(normalizeWorldSave(value));
}

export function parseWorldSave(serialized: string): GameSave {
  serialized = decodeWorldSaveStorage(serialized);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new InvalidWorldSaveError([
      { path: "$", message: "Файл не является корректным JSON." },
    ]);
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).format === WORLD_SAVE_EXPORT_FORMAT
  ) {
    const envelope = parsed as Partial<WorldSaveExportEnvelope>;
    if (envelope.schemaVersion !== WORLD_SAVE_EXPORT_SCHEMA || !envelope.save) {
      throw new InvalidWorldSaveError([
        {
          path: "$",
          message: "Версия экспортированного файла не поддерживается.",
        },
      ]);
    }
    const payload = JSON.stringify(envelope.save);
    if (envelope.checksum !== worldSaveChecksum(payload)) {
      throw new InvalidWorldSaveError([
        {
          path: "$.checksum",
          message: "Контрольная сумма не совпала: файл повреждён.",
        },
      ]);
    }
    return migratedClone(envelope.save);
  }
  return migratedClone(parsed);
}

export function safeParseWorldSave(
  serialized: string,
): SafeWorldSaveParseResult {
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
  public readonly battleCheckpointKey: string;
  private verifiedPrimary: string | null = null;
  private lastSerializedInput: string | null = null;
  private lastPreparedSave: string | null = null;
  private baseBattleId: string | undefined;
  private baseIdentity: WorldSaveIdentity | undefined;
  private baseChecksum: string | null = null;

  public constructor(
    private readonly storage: KeyValueStorage,
    public readonly primaryKey: string,
  ) {
    this.backupKey = `${primaryKey}.backup`;
    this.temporaryKey = `${primaryKey}.temporary`;
    this.battleCheckpointKey = `${primaryKey}.battle`;
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
          return this.loaded(parsed.save, "temporary", interrupted);
        }
        return this.loaded(parsed.save, "temporary", interrupted);
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
        return this.loaded(parsed.save, source, serialized);
      }
    }
    return null;
  }

  public save(save: GameSave): void {
    const input = JSON.stringify(save);
    const serialized =
      input === this.lastSerializedInput && this.lastPreparedSave
        ? this.lastPreparedSave
        : encodeWorldSaveStorage(normalizeSerializedWorldSave(input));
    this.savePrepared(serialized, save.pendingBattle?.id, saveIdentity(save));
    this.lastSerializedInput = input;
    this.lastPreparedSave = serialized;
  }

  public savePrepared(
    serialized: string,
    pendingBattleId?: string,
    identity?: WorldSaveIdentity,
  ): void {
    this.compactStoredCopies();
    this.writePrimary(serialized);
    this.storage.removeItem(this.battleCheckpointKey);
    this.baseBattleId = pendingBattleId;
    this.baseIdentity = identity;
    this.baseChecksum = worldSaveChecksum(serialized);
  }

  public saveBattleProgress(save: GameSave): void {
    const battle = save.pendingBattle;
    if (
      !battle ||
      this.baseBattleId !== battle.id ||
      !this.baseChecksum ||
      !this.baseIdentity ||
      this.baseIdentity.heroId !== save.hero.id ||
      this.baseIdentity.worldDay !== save.worldDay ||
      this.baseIdentity.cycle !== save.legacy.cycle ||
      this.storage.getItem(this.primaryKey) !== this.verifiedPrimary
    ) {
      this.save(save);
      return;
    }
    const checkpoint = serializeBattleCheckpoint(save, this.baseChecksum);
    try {
      this.storage.setItem(this.battleCheckpointKey, checkpoint);
    } catch (error) {
      if (!isStorageQuotaError(error)) throw storageWriteError(error);
      this.save(save);
    }
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

  private loaded(
    save: GameSave,
    source: LoadedWorldSave["source"],
    serialized: string,
  ): LoadedWorldSave {
    const checksum = worldSaveChecksum(serialized);
    const checkpoint = this.storage.getItem(this.battleCheckpointKey);
    if (checkpoint) restoreBattleCheckpoint(save, checkpoint, checksum);
    if (source === "primary" || this.verifiedPrimary === serialized) {
      this.baseBattleId = save.pendingBattle?.id;
      this.baseIdentity = saveIdentity(save);
      this.baseChecksum = checksum;
    }
    return { save, source };
  }

  private compactStoredCopies(): void {
    for (const key of [this.primaryKey, this.backupKey, this.temporaryKey]) {
      const stored = this.storage.getItem(key);
      if (
        !stored ||
        isCompressedWorldSave(stored) ||
        !safeParseWorldSave(stored).save
      )
        continue;
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
    const previous =
      current &&
      (this.verifiedPrimary === current || safeParseWorldSave(current).save)
        ? current
        : null;
    try {
      this.storage.setItem(this.primaryKey, serialized);
    } catch (error) {
      const backup = this.storage.getItem(this.backupKey);
      if (!isStorageQuotaError(error) || !previous || !backup)
        throw storageWriteError(error);
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
  return (
    value.name === "QuotaExceededError" ||
    value.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    value.code === 22 ||
    value.code === 1014
  );
}

function storageWriteError(error: unknown): Error {
  return new Error(
    isStorageQuotaError(error)
      ? "В хранилище браузера не хватает места даже для сжатого сохранения. Последняя записанная летопись не удалена. Не закрывайте вкладку: скачайте текущий прогресс через меню «Летопись» → «Скачать сохранение»."
      : "Браузер не разрешил записать сохранение. Не закрывайте вкладку: скачайте текущую летопись через меню «Летопись» → «Скачать сохранение».",
  );
}
