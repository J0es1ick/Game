import type { GameSave } from "./WorldTypes";
import type { WorldSaveRepository } from "./WorldSaveStorage";
import type {
  WorldSavePreparationRequest,
  WorldSavePreparationResponse,
} from "./WorldSavePreparation";

export interface WorldSaveWorkerPort {
  onmessage:
    ((event: MessageEvent<WorldSavePreparationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (request: WorldSavePreparationRequest) => void;
  terminate: () => void;
}

interface SaveJob {
  id: number;
  save: GameSave;
}

interface SaveWaiter {
  id: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class WorldSaveWriter {
  private worker: WorldSaveWorkerPort | null = null;
  private workerUnavailable = false;
  private active: SaveJob | null = null;
  private pending: SaveJob | null = null;
  private waiters: SaveWaiter[] = [];
  private revision = 0;
  private disposed = false;

  public constructor(
    private readonly repository: WorldSaveRepository,
    private readonly createWorker?: () => WorldSaveWorkerPort,
  ) {}

  public get isSaving(): boolean {
    return this.active !== null || this.pending !== null;
  }

  public save(save: GameSave): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error("Запись сохранений уже завершена."));
    const id = ++this.revision;
    const promise = new Promise<void>((resolve, reject) =>
      this.waiters.push({ id, resolve, reject }),
    );
    this.pending = { id, save };
    this.dispatch();
    return promise;
  }

  public saveBattleProgress(save: GameSave): void {
    this.assertOpen();
    if (this.isSaving) this.flushSync(save);
    else this.repository.saveBattleProgress(save);
  }

  public flushSync(save: GameSave): void {
    this.assertOpen();
    ++this.revision;
    this.pending = null;
    this.active = null;
    this.stopWorker();
    try {
      this.repository.save(save);
      this.resolveThrough(this.revision);
    } catch (error) {
      this.failThrough(this.revision, error);
      throw error;
    }
  }

  public cancel(): void {
    ++this.revision;
    this.pending = null;
    this.active = null;
    this.stopWorker();
    this.resolveThrough(this.revision);
  }

  public dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Запись сохранений уже завершена.");
  }

  private dispatch(): void {
    if (this.active || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.active = job;
    if (!this.createWorker || this.workerUnavailable) {
      try {
        this.repository.save(job.save);
        this.active = null;
        this.resolveThrough(job.id);
      } catch (error) {
        this.active = null;
        this.failThrough(job.id, error);
      }
      this.dispatch();
      return;
    }
    try {
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        worker.onmessage = (event) => {
          if (this.worker === worker) this.receive(event.data);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker === worker) this.fallback();
        };
      }
      this.worker.postMessage(job);
    } catch {
      this.fallback();
    }
  }

  private receive(response: WorldSavePreparationResponse): void {
    const job = this.active;
    if (!job || response.id !== job.id) return;
    this.active = null;
    if (this.pending) {
      this.dispatch();
      return;
    }
    if ("error" in response) {
      this.failThrough(job.id, new Error(response.error));
      return;
    }
    try {
      this.repository.savePrepared(
        response.serialized,
        response.pendingBattleId,
        response.identity,
      );
      this.resolveThrough(job.id);
    } catch (error) {
      this.failThrough(job.id, error);
    }
  }

  private fallback(): void {
    this.workerUnavailable = true;
    this.stopWorker();
    this.pending ??= this.active;
    this.active = null;
    this.dispatch();
  }

  private stopWorker(): void {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }

  private resolveThrough(id: number): void {
    const completed = this.waiters.filter((waiter) => waiter.id <= id);
    this.waiters = this.waiters.filter((waiter) => waiter.id > id);
    completed.forEach((waiter) => waiter.resolve());
  }

  private failThrough(id: number, error: unknown): void {
    const failed = this.waiters.filter((waiter) => waiter.id <= id);
    this.waiters = this.waiters.filter((waiter) => waiter.id > id);
    const reason = error instanceof Error ? error : new Error(String(error));
    failed.forEach((waiter) => waiter.reject(reason));
  }
}
