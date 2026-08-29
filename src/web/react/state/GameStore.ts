import { WorldGame } from "../../../gameplay/WorldGame";
import {
  parseWorldSave,
  WorldSaveRepository,
  type KeyValueStorage,
} from "../../../gameplay/WorldSaveStorage";
import {
  WorldSaveWriter,
  type WorldSaveWorkerPort,
} from "../../../gameplay/WorldSaveWriter";
import type {
  ContextualTutorialId,
  EquipmentItem,
  EquipmentSlot,
  HeroClass,
} from "../../../gameplay/WorldTypes";
import { SeasonNoticeTracker, type SeasonNotice } from "../../SeasonNotices";
import {
  enqueueEffect,
  type EffectNotice,
  type WorldEffectPresentation,
} from "./NotificationState";
export type { EffectNotice } from "./NotificationState";
import {
  WORLD_PAGE_IDS,
  isWorldPageAvailable,
  type WorldPageId,
} from "../../WorldPageCatalog";
import { pageFromHash } from "../../UiRuntime";

export type GameDialog =
  | { kind: "equipment"; slot: EquipmentSlot }
  | { kind: "comparison"; itemId: string; shopIndex?: number }
  | { kind: "battle" }
  | { kind: "dungeon" }
  | { kind: "new-chronicle" }
  | {
      kind: "tutorial";
      id?: ContextualTutorialId | "base";
      firstVisit?: boolean;
    }
  | { kind: "season"; notice: SeasonNotice }
  | { kind: "narrative" };

export interface ActionOptions {
  notify?: string;
  deferFeatureUnlocks?: boolean;
}

export interface LootNotice {
  id: number;
  itemId: string;
  equippedItemId: string | null;
}

export interface AppSnapshot {
  mode: "choose" | "loading" | "creation" | "basic" | "world" | "error";
  page: WorldPageId;
  dialogs: GameDialog[];
  error: string | null;
  worldNotice: string | null;
  effects: EffectNotice[];
  loot: LootNotice[];
  navigation: { id: number; page: WorldPageId; anchor?: string } | null;
}

export const SAVE_KEY = "dust-and-crown-save-v2";
export const MODE_KEY = "dust-and-crown-mode";
const rankingKeys = [
  "dust-and-crown-leader-snapshot-v1",
  "dust-and-crown-elite-snapshot-v1",
];

export class GameStore {
  public game: WorldGame | null = null;
  public readonly repository: WorldSaveRepository;
  private readonly writer: WorldSaveWriter;
  private revision = 0;
  private sequence = 0;
  private generation = 0;
  private importRequest = 0;
  private initialized = false;
  private disposed = false;
  private listeners = new Set<() => void>();
  private appListeners = new Set<() => void>();
  private seasons = new SeasonNoticeTracker();
  private snapshot: AppSnapshot = {
    mode: "choose",
    page: "map",
    dialogs: [],
    error: null,
    worldNotice: null,
    effects: [],
    loot: [],
    navigation: null,
  };
  private tutorialQueue: ContextualTutorialId[] = [];

  public constructor(
    public readonly storage: KeyValueStorage,
    createWorker?: () => WorldSaveWorkerPort,
  ) {
    this.repository = new WorldSaveRepository(storage, SAVE_KEY);
    this.writer = new WorldSaveWriter(this.repository, createWorker);
  }

  public subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public subscribeApp = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.appListeners.add(listener);
    return () => this.appListeners.delete(listener);
  };

  public getRevision = (): number => this.revision;
  public getSnapshot = (): AppSnapshot => this.snapshot;
  public getGeneration = (): number => this.generation;

  private assertActive(): void {
    if (this.disposed) throw new Error("Эта игровая сессия уже закрыта.");
  }

  public hasSavedGame(): boolean {
    if (this.game) return true;
    try {
      return [
        this.repository.primaryKey,
        this.repository.temporaryKey,
        this.repository.backupKey,
      ].some((key) => this.storage.getItem(key) !== null);
    } catch {
      return false;
    }
  }

  public hasBackup(): boolean {
    try {
      return this.storage.getItem(this.repository.backupKey) !== null;
    } catch {
      return false;
    }
  }

  private rememberMode(mode: "basic" | "world" | null): void {
    try {
      if (mode) this.storage.setItem(MODE_KEY, mode);
      else this.storage.removeItem(MODE_KEY);
    } catch {
      this.fail(
        new Error(
          "Браузер не разрешил запомнить выбранный режим. В этой вкладке можно продолжить игру.",
        ),
        "Режим не сохранён",
      );
    }
  }

  private clearRankingSnapshots(): void {
    rankingKeys.forEach((key) => {
      try {
        this.storage.removeItem(key);
      } catch {
        return;
      }
    });
  }

  private update(patch: Partial<AppSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.appListeners.forEach((listener) => listener());
  }

  public publish = (): void => {
    if (this.disposed) return;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  };

  public initialize(): void {
    if (this.disposed || this.initialized) return;
    this.initialized = true;
    try {
      const mode = this.storage.getItem(MODE_KEY);
      if (mode === "basic") this.chooseMode("basic");
      else if (mode === "world") this.chooseMode("world");
    } catch {
      this.update({
        mode: "error",
        error:
          "Браузер не разрешил прочитать сохранение. Данные не удалены: проверьте доступ к хранилищу или загрузите файл летописи.",
        navigation: null,
      });
    }
  }

  public chooseMode(mode: "basic" | "world"): void {
    if (this.disposed) return;
    this.generation += 1;
    if (mode === "basic") {
      this.update({
        mode,
        dialogs: [],
        effects: [],
        loot: [],
        navigation: null,
      });
      this.rememberMode(mode);
      return;
    }
    this.rememberMode(mode);
    if (this.game) {
      this.update({ mode: "world", error: null, navigation: null });
      this.resumeRestoredActivities();
      return;
    }
    this.update({ mode: "loading", navigation: null });
    try {
      const loaded = this.repository.load();
      if (!loaded) {
        const unreadable = [
          this.repository.primaryKey,
          this.repository.temporaryKey,
          this.repository.backupKey,
        ].some((key) => this.storage.getItem(key) !== null);
        this.update(
          unreadable
            ? {
                mode: "error",
                error:
                  "Основное сохранение и резервные копии не прошли проверку. Ваши данные не удалены.",
              }
            : { mode: "creation" },
        );
        return;
      }
      const game = WorldGame.restore(loaded.save);
      const elapsed = game.simulateElapsed();
      this.attach(game);
      this.update({
        mode: "world",
        error: null,
        page:
          typeof location === "undefined"
            ? "map"
            : pageFromHash(location.hash, WORLD_PAGE_IDS, "map"),
        navigation: null,
        worldNotice:
          elapsed > 0
            ? `Мир продолжал жить без вас: прошло ${elapsed} дн. фоновых турниров, дуэлей и вылазок.`
            : null,
      });
      this.persist();
      this.publish();
      if (loaded.source !== "primary")
        this.notify({
          eyebrow: "ВОССТАНОВЛЕНИЕ",
          title: "Летопись спасена",
          description: "Загружена последняя исправная резервная копия.",
          tone: "positive",
          symbol: "↺",
        });
      this.resumeRestoredActivities();
    } catch (error) {
      this.update({ mode: "error", error: (error as Error).message });
    }
  }

  public attach(game: WorldGame): void {
    this.assertActive();
    this.generation += 1;
    this.writer.cancel();
    this.game = game;
    this.seasons.reset(game.save);
    this.publish();
  }

  public createHero(
    name: string,
    classId: HeroClass,
    hairStyle: 0 | 1 | 2,
  ): void {
    if (this.disposed) return;
    try {
      if (name.trim().length < 2)
        throw new Error("Имя должно состоять минимум из двух символов.");
      const game = WorldGame.create(name.trim(), classId);
      game.save.hero.appearance = { hairStyle, faceStyle: 0 };
      this.attach(game);
      this.clearRankingSnapshots();
      this.update({
        mode: "world",
        page: "map",
        error: null,
        navigation: null,
      });
      this.rememberMode("world");
      this.persist();
      this.openDialog({ kind: "tutorial", firstVisit: true });
    } catch (error) {
      this.fail(error);
    }
  }

  public replaceGame = (game: WorldGame): void => {
    this.attach(game);
    this.clearRankingSnapshots();
    this.tutorialQueue = [];
    this.update({
      mode: "world",
      page: "map",
      dialogs: [],
      loot: [],
      effects: [],
      worldNotice: null,
      error: null,
      navigation: null,
    });
    this.rememberMode("world");
    this.persist();
    if (typeof window !== "undefined" && location.hash !== "#/map")
      history.replaceState(null, "", "#/map");
  };

  public async importSave(
    source: string | { text(): Promise<string> },
  ): Promise<boolean> {
    this.assertActive();
    const generation = this.generation;
    const request = ++this.importRequest;
    const isCurrent = () =>
      !this.disposed &&
      generation === this.generation &&
      request === this.importRequest;
    let serialized: string;
    try {
      serialized = typeof source === "string" ? source : await source.text();
    } catch (error) {
      if (!isCurrent()) return false;
      throw error;
    }
    if (!isCurrent()) return false;
    const game = WorldGame.restore(parseWorldSave(serialized));
    if (!isCurrent()) return false;
    this.installImportedGame(game);
    return true;
  }

  public restoreBackup(): void {
    this.assertActive();
    ++this.importRequest;
    const serialized = this.storage.getItem(this.repository.backupKey);
    if (!serialized)
      throw new Error("Предыдущая исправная копия ещё не создана.");
    this.installImportedGame(WorldGame.restore(parseWorldSave(serialized)));
  }

  private installImportedGame(game: WorldGame): void {
    this.assertActive();
    if (this.game) {
      try {
        this.writer.flushSync(this.game.save);
      } catch {
        this.writer.cancel();
      }
    }
    this.writer.cancel();
    try {
      this.repository.save(game.save);
    } catch (error) {
      this.enqueueSave();
      throw error;
    }
    this.replaceGame(game);
    this.resumeRestoredActivities();
  }

  private resumeRestoredActivities(): void {
    if (!this.game || this.disposed) return;
    if (this.game.currentPendingBattle()) this.openDialog({ kind: "battle" });
    else if (this.game.save.activeExpedition)
      this.openDialog({ kind: "dungeon" });
    else if (!this.game.save.tutorialCompleted)
      this.openDialog({ kind: "tutorial", firstVisit: true });
    this.queueAvailableTutorials();
  }

  public exitMode = (): void => {
    if (this.disposed) return;
    this.generation += 1;
    this.persist();
    this.rememberMode(null);
    this.update({
      mode: "choose",
      dialogs: [],
      effects: [],
      loot: [],
      navigation: null,
    });
  };

  public reset(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.writer.cancel();
    try {
      [
        this.repository.temporaryKey,
        this.repository.backupKey,
        this.repository.battleCheckpointKey,
        this.repository.primaryKey,
      ].forEach((key) => this.storage.removeItem(key));
    } catch {
      this.persist();
      this.fail(
        new Error(
          "Браузер не разрешил удалить сохранение. Текущая игра остаётся открытой.",
        ),
        "Летопись не удалена",
      );
      return;
    }
    this.clearRankingSnapshots();
    this.game = null;
    this.tutorialQueue = [];
    this.update({
      mode: "creation",
      dialogs: [],
      effects: [],
      loot: [],
      worldNotice: null,
      error: null,
      navigation: null,
    });
    this.rememberMode("world");
    this.publish();
  }

  public navigate = (page: WorldPageId, anchor?: string): void => {
    if (this.disposed) return;
    if (
      this.game &&
      !isWorldPageAvailable(page, (feature) =>
        this.game!.isFeatureUnlocked(feature),
      )
    )
      return;
    this.update({ page, navigation: { id: ++this.sequence, page, anchor } });
    if (typeof window !== "undefined") {
      const nextHash = `#/${page}`;
      if (location.hash !== nextHash) history.pushState(null, "", nextHash);
    }
  };

  public completeNavigation = (id: number): void => {
    if (this.snapshot.navigation?.id === id) this.update({ navigation: null });
  };

  public setPage = (page: WorldPageId): void => {
    if (
      !this.game ||
      isWorldPageAvailable(page, (feature) =>
        this.game!.isFeatureUnlocked(feature),
      )
    )
      this.update({ page, navigation: null });
  };

  public openDialog = (dialog: GameDialog): void => {
    if (this.disposed) return;
    if (this.snapshot.dialogs.some((entry) => entry.kind === dialog.kind))
      return;
    if (dialog.kind === "tutorial" && dialog.firstVisit && this.game) {
      this.game.save.tutorialCompleted = true;
      this.persist();
    }
    this.update({ dialogs: [...this.snapshot.dialogs, dialog] });
  };

  public closeDialog = (): void => {
    this.update({ dialogs: this.snapshot.dialogs.slice(0, -1) });
  };

  public clearDialogs = (): void => this.update({ dialogs: [] });

  public act = <T>(
    action: (game: WorldGame) => T,
    options: ActionOptions = {},
  ): T | undefined => {
    if (!this.game || this.disposed) return;
    try {
      const result = action(this.game);
      this.persist(options);
      this.publish();
      if (options.notify)
        this.notify({
          eyebrow: "ГОТОВО",
          title: options.notify,
          description: "",
          tone: "positive",
        });
      return result;
    } catch (error) {
      this.fail(error);
      return;
    }
  };

  public persist = (options: ActionOptions = {}): void => {
    if (!this.game || this.disposed) return;
    const unlocks = options.deferFeatureUnlocks
      ? []
      : this.game.consumeFeatureUnlocks();
    this.enqueueSave();
    this.seasons.collect(this.game.save).forEach((notice) =>
      this.notify({
        variant: "season",
        replaceKey: `season-${notice.kind}`,
        eyebrow:
          notice.kind === "world"
            ? `ЭПОХА ${notice.cycle} · СЕЗОН ${notice.number}`
            : "СМЕНА СЕЗОНА · ЭЛИТА",
        title:
          notice.kind === "world"
            ? `Новый сезон: ${notice.title}`
            : notice.title,
        description: notice.description,
        symbol: "◈",
        tone: "legendary",
        sound: "reputation",
        duration: 7000,
        action: {
          label: "Узнать изменения",
          run: () => this.openDialog({ kind: "season", notice }),
        },
      }),
    );
    unlocks.forEach((unlock) => {
      this.queueTutorial(unlock.tutorialId);
      this.notify({
        eyebrow: `НОВАЯ ВОЗМОЖНОСТЬ · ДЕНЬ ${unlock.day}`,
        title: unlock.title,
        description: unlock.description,
        symbol: "✦",
        tone: "legendary",
        sound: "reputation",
        duration: 8000,
        action: {
          label: "Открыть обучение",
          run: () => this.openDialog({ kind: "tutorial", id: unlock.tutorialId }),
        },
      });
    });
    const defense = this.game.consumeAutomaticLegendDefense();
    if (defense)
      this.notify({
        eyebrow: "АВТОМАТИЧЕСКАЯ ЗАЩИТА ТИТУЛА",
        variant: defense.heroWon ? "victory" : "defeat",
        replaceKey: "legend-defense-result",
        title: defense.heroWon
          ? "Место легенды сохранено"
          : "Место легенды потеряно",
        description: `${defense.enemyBefore.name}: ${defense.heroWon ? "вы защитили позицию в элите" : "соперник занял вашу позицию в элите"}.`,
        symbol: defense.heroWon ? "♛" : "↓",
        tone: defense.heroWon ? "positive" : "negative",
        sound: "reputation",
      });
  };

  private enqueueSave(): void {
    const game = this.game;
    if (!game || this.disposed) return;
    const generation = this.generation;
    void this.writer.save(game.save).catch((error) => {
      if (
        !this.disposed &&
        this.generation === generation &&
        this.game === game
      )
        this.fail(error, "Прогресс не записан");
    });
  }

  public checkpoint = (): void => {
    if (!this.game || this.disposed) return;
    try {
      this.writer.saveBattleProgress(this.game.save);
    } catch (error) {
      this.fail(error, "Ход не записан");
    }
  };

  public flush = (): void => {
    if (!this.game || this.disposed) return;
    try {
      this.writer.flushSync(this.game.save);
    } catch (error) {
      this.fail(error, "Прогресс не записан");
    }
  };

  public cancelSave = (): void => {
    this.assertActive();
    this.generation += 1;
    this.writer.cancel();
  };

  public dispose = (): void => {
    if (this.disposed) return;
    this.flush();
    this.disposed = true;
    this.generation += 1;
    this.writer.dispose();
    this.listeners.clear();
    this.appListeners.clear();
  };

  public notify = (effect: WorldEffectPresentation): void => {
    if (this.disposed) return;
    const visible =
      this.snapshot.mode === "world" &&
      !this.snapshot.dialogs.some((dialog) => dialog.kind === "new-chronicle");
    this.update({
      effects: enqueueEffect(
        this.snapshot.effects,
        { ...effect, id: ++this.sequence },
        visible,
      ),
    });
  };

  public dismissEffect = (id: number): void =>
    this.update({
      effects: this.snapshot.effects.filter((entry) => entry.id !== id),
    });

  public queueLoot = (
    items: EquipmentItem[],
    equippedBefore: Partial<Record<EquipmentSlot, string>> | null = null,
  ): void => {
    if (this.disposed) return;
    const existing = new Set(this.snapshot.loot.map((entry) => entry.itemId));
    const entries = items
      .filter((item) => {
        if (existing.has(item.id)) return false;
        existing.add(item.id);
        return true;
      })
      .map((item) => ({
        id: ++this.sequence,
        itemId: item.id,
        equippedItemId: equippedBefore
          ? (equippedBefore[item.slot] ?? null)
          : (this.game?.save.hero.equipped[item.slot] ?? null),
      }));
    if (entries.length)
      this.update({ loot: [...this.snapshot.loot, ...entries] });
  };

  public dismissLoot = (id: number): void =>
    this.update({
      loot: this.snapshot.loot.filter((entry) => entry.id !== id),
    });

  public fail = (error: unknown, title = "Проверьте условие"): void => {
    this.notify({
      eyebrow: "ДЕЙСТВИЕ НЕ ВЫПОЛНЕНО",
      title,
      description: error instanceof Error ? error.message : String(error),
      tone: "negative",
      symbol: "!",
      replaceKey: "action-error",
      duration: 5000,
    });
  };

  public queueTutorial(id: ContextualTutorialId): void {
    if (this.disposed) return;
    if (!this.game?.hasSeenTutorial(id) && !this.tutorialQueue.includes(id))
      this.tutorialQueue.push(id);
  }

  private queueAvailableTutorials(): void {
    if (!this.game) return;
    (["contracts", "equipment-legacy"] as const).forEach((id) => {
      if (this.game!.isFeatureUnlocked(id)) this.queueTutorial(id);
    });
    if (
      Object.values(this.game.save.hero.rivalries).some(
        (rival) => rival.memoryStage && rival.memoryStage !== "unknown",
      )
    )
      this.queueTutorial("adaptation");
  }

  public presentNextTutorial(): void {
    if (
      this.disposed ||
      this.snapshot.mode !== "world" ||
      this.snapshot.dialogs.length ||
      !this.game
    )
      return;
    let id = this.tutorialQueue.shift();
    while (id && this.game.hasSeenTutorial(id)) id = this.tutorialQueue.shift();
    if (id) this.openDialog({ kind: "tutorial", id });
  }
}
