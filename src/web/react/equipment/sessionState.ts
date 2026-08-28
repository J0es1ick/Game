import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorldGame } from "../../../gameplay/WorldGame";

interface SessionValue<T> {
  read: () => T;
  write: Dispatch<SetStateAction<T>>;
  subscribe: (listener: () => void) => () => void;
}

const sessions = new WeakMap<WorldGame, Map<string, SessionValue<unknown>>>();

function getSessionValue<T>(
  game: WorldGame,
  key: string,
  initial: T | (() => T),
): SessionValue<T> {
  let values = sessions.get(game);
  if (!values) {
    values = new Map();
    sessions.set(game, values);
  }
  const existing = values.get(key);
  if (existing) return existing as SessionValue<T>;
  let value = typeof initial === "function" ? (initial as () => T)() : initial;
  const listeners = new Set<() => void>();
  const entry: SessionValue<T> = {
    read: () => value,
    write: (update) => {
      const next =
        typeof update === "function"
          ? (update as (previous: T) => T)(value)
          : update;
      if (Object.is(value, next)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  values.set(key, entry as SessionValue<unknown>);
  return entry;
}

export function useEquipmentSessionState<T>(
  game: WorldGame,
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const entry = useMemo(() => getSessionValue(game, key, initial), [game, key]);
  const value = useSyncExternalStore(entry.subscribe, entry.read, entry.read);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => entry.write(update),
    [entry],
  );
  return [value, setValue];
}
