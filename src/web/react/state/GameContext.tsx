import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { GameStore } from "./GameStore";
import type { AppSnapshot } from "./GameStore";
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
  return <Context.Provider value={store}>{children}</Context.Provider>;
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
