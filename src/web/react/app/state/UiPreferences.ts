import type { KeyValueStorage } from "../../../../gameplay/save/WorldSaveStorage";

export const UI_PREFERENCES_KEY = "dust-and-crown-ui-preferences-v1";
export const SOUND_MUTED_KEY = "dust-and-crown-sound-muted";

export interface UiPreferences {
  theme: "light" | "dark";
  reducedMotion: boolean;
  soundMuted: boolean;
  autoStartBattle: boolean;
  battleSpeed: 900 | 450 | 160;
}

const defaults: UiPreferences = {
  theme: "light",
  reducedMotion: false,
  soundMuted: false,
  autoStartBattle: false,
  battleSpeed: 450,
};

export function readUiPreferences(storage: KeyValueStorage): UiPreferences {
  let soundMuted = false;
  try {
    soundMuted = storage.getItem(SOUND_MUTED_KEY) === "true";
    const raw: unknown = JSON.parse(
      storage.getItem(UI_PREFERENCES_KEY) ?? "null",
    );
    const value =
      raw && typeof raw === "object" ? (raw as Partial<UiPreferences>) : {};
    return {
      theme: value.theme === "dark" ? "dark" : "light",
      reducedMotion: value.reducedMotion === true,
      soundMuted:
        typeof value.soundMuted === "boolean" ? value.soundMuted : soundMuted,
      autoStartBattle: value.autoStartBattle === true,
      battleSpeed:
        value.battleSpeed === 900 || value.battleSpeed === 160
          ? value.battleSpeed
          : 450,
    };
  } catch {
    return { ...defaults, soundMuted };
  }
}

export function applyAppearance(preferences: UiPreferences): void {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.motion = preferences.reducedMotion
    ? "reduced"
    : "full";
}

export class UiPreferencesStore {
  private snapshot: UiPreferences | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly storage: KeyValueStorage) {}

  getSnapshot = (): UiPreferences =>
    (this.snapshot ??= readUiPreferences(this.storage));
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  reload = (): void => {
    this.snapshot = readUiPreferences(this.storage);
    this.listeners.forEach((listener) => listener());
  };
  update = (patch: Partial<UiPreferences>): void => {
    this.snapshot = { ...this.getSnapshot(), ...patch };
    this.listeners.forEach((listener) => listener());
    this.storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(this.snapshot));
  };
}
