import {
  readUiPreferences,
  UiPreferencesStore,
  UI_PREFERENCES_KEY,
  SOUND_MUTED_KEY,
} from "../src/web/react/app/state/UiPreferences";
import { ReactMemoryStorage } from "./helpers/ReactEnvironment";

describe("interface preferences", () => {
  test("keeps the existing sound choice and rejects malformed preference fields", () => {
    const storage = new ReactMemoryStorage();
    storage.setItem(SOUND_MUTED_KEY, "true");
    storage.setItem(
      UI_PREFERENCES_KEY,
      JSON.stringify({
        theme: "neon",
        autoStartBattle: "true",
        battleSpeed: -1,
      }),
    );
    expect(readUiPreferences(storage)).toEqual({
      theme: "light",
      soundMuted: true,
      autoStartBattle: false,
      battleSpeed: 450,
      reducedMotion: false,
    });
    storage.setItem(UI_PREFERENCES_KEY, "broken json");
    expect(readUiPreferences(storage).soundMuted).toBe(true);
  });

  test("persists settings separately from the campaign and supports another tab's update", () => {
    const storage = new ReactMemoryStorage();
    storage.setItem("campaign", "untouched");
    const first = new UiPreferencesStore(storage);
    const second = new UiPreferencesStore(storage);
    first.update({
      theme: "dark",
      autoStartBattle: true,
      battleSpeed: 160,
      reducedMotion: true,
    });
    second.reload();
    expect(second.getSnapshot()).toEqual(first.getSnapshot());
    expect(new UiPreferencesStore(storage).getSnapshot()).toEqual(
      first.getSnapshot(),
    );
    expect(storage.getItem("campaign")).toBe("untouched");
  });

  test("still applies preferences for this session if the browser refuses writes", () => {
    const preferences = new UiPreferencesStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    const listener = jest.fn();
    preferences.subscribe(listener);
    expect(() => preferences.update({ theme: "dark" })).toThrow("quota");
    expect(preferences.getSnapshot().theme).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
