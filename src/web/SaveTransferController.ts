import type { GameSave } from "../gameplay/WorldTypes";
import type { KeyValueStorage, WorldSaveRepository } from "../gameplay/WorldSaveStorage";

export interface SaveDownload {
  fileName: string;
  content: string;
}

export class SaveTransferController {
  public constructor(
    private readonly repository: WorldSaveRepository,
    private readonly storage: KeyValueStorage,
  ) {}

  public export(heroName: string, worldDay: number): SaveDownload {
    const safeName = heroName.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "hero";
    return {
      fileName: `dust-and-crown-${safeName}-day-${Math.max(1, Math.floor(worldDay))}.json`,
      content: this.repository.export(),
    };
  }

  public import(content: string): GameSave {
    return this.repository.import(content);
  }

  public canRestoreBackup(): boolean {
    return this.storage.getItem(this.repository.backupKey) !== null;
  }

  public restoreBackup(): GameSave {
    const backup = this.storage.getItem(this.repository.backupKey);
    if (!backup) throw new Error("Предыдущая исправная копия ещё не создана.");
    return this.repository.import(backup);
  }
}
