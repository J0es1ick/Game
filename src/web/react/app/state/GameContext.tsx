import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { GameStore } from "./GameStore";
import type { AppSnapshot } from "./GameStore";
import { applyAppearance, UI_PREFERENCES_KEY } from "./UiPreferences";
import { gameAudio } from "../audio/GameAudio";
export type {
  GameDialog,
  ActionOptions,
  AppSnapshot,
  LootNotice,
} from "./GameStore";

const Context = createContext<GameStore | null>(null);

export function GameProvider({
  store,
  children,
}: {
  store: GameStore;
  children: ReactNode;
}) {
  const preferences = useSyncExternalStore(
    store.preferences.subscribe,
    store.preferences.getSnapshot,
    store.preferences.getSnapshot,
  );
  useLayoutEffect(() => {
    applyAppearance(preferences);
    if (gameAudio.isMuted !== preferences.soundMuted)
      gameAudio.setMuted(preferences.soundMuted);
  }, [preferences]);
  useLayoutEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === UI_PREFERENCES_KEY || event.key === null)
        store.preferences.reload();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useUiPreferences() {
  const store = useGameStore();
  return useSyncExternalStore(
    store.preferences.subscribe,
    store.preferences.getSnapshot,
    store.preferences.getSnapshot,
  );
}

export function useGameStore(): GameStore {
  const store = useContext(Context);
  if (!store) throw new Error("Игровое состояние недоступно.");
  return store;
}

export function useAppState() {
  const store = useGameStore();
  return useSyncExternalStore(
    store.subscribeApp,
    store.getSnapshot,
    store.getSnapshot,
  );
}

export function useAppSelector<T>(select: (state: AppSnapshot) => T): T {
  const store = useGameStore();
  const snapshot = useCallback(
    () => select(store.getSnapshot()),
    [store, select],
  );
  return useSyncExternalStore(store.subscribeApp, snapshot, snapshot);
}

export function useGame() {
  const store = useGameStore();
  const revision = useSyncExternalStore(
    store.subscribe,
    store.getRevision,
    store.getRevision,
  );
  if (!store.game) throw new Error("Герой ещё не создан.");
  return useMemo(
    () => ({
      game: store.game!,
      revision,
      act: store.act,
      navigate: store.navigate,
      openDialog: store.openDialog,
      closeDialog: store.closeDialog,
      notify: store.notify,
      checkpoint: store.checkpoint,
      publish: store.publish,
      queueLoot: store.queueLoot,
      replaceGame: store.replaceGame,
      store,
    }),
    [store, revision],
  );
}
