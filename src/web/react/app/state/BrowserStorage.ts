import type { KeyValueStorage } from "../../../../gameplay/save/WorldSaveStorage";

export function createBrowserStorage(
  resolve: () => KeyValueStorage = () => window.localStorage,
): KeyValueStorage {
  return {
    getItem: (key) => resolve().getItem(key),
    setItem: (key, value) => resolve().setItem(key, value),
    removeItem: (key) => resolve().removeItem(key),
  };
}
