import { Component, Suspense, lazy, useState, type ReactNode } from "react";
import {
  ModeChoice,
  type GameMode,
} from "../../features/onboarding/ModeChoice/ModeChoice";
import { LoadingScreen } from "../LoadingScreen/LoadingScreen";
import { createBrowserStorage } from "../state/BrowserStorage";
import { MODE_KEY, SAVE_KEY } from "../state/StorageKeys";

const GameApplication = lazy(() => import("./GameApplication"));

function readStartup(): {
  mode?: GameMode;
  hasSave: boolean;
  needsRecovery?: boolean;
} {
  try {
    const storage = createBrowserStorage();
    const value = storage.getItem(MODE_KEY);
    return {
      mode: value === "world" || value === "basic" ? value : undefined,
      hasSave: [SAVE_KEY, `${SAVE_KEY}.backup`, `${SAVE_KEY}.temporary`].some(
        (key) => storage.getItem(key) !== null,
      ),
    };
  } catch {
    return { hasSave: false, needsRecovery: true };
  }
}

class RuntimeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="mode-screen">
          <section className="mode-paper">
            <h1>Не удалось загрузить игру</h1>
            <p role="alert">
              Проверьте соединение и обновите страницу. Сохранение не удалено.
            </p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Повторить загрузку
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}

export function GameBootstrap() {
  const [startup] = useState(readStartup);
  const [mode, setMode] = useState(startup.mode);
  return mode || startup.needsRecovery ? (
    <RuntimeBoundary>
      <Suspense fallback={<LoadingScreen full />}>
        <GameApplication initialMode={mode} />
      </Suspense>
    </RuntimeBoundary>
  ) : (
    <ModeChoice hasSave={startup.hasSave} onChoose={setMode} />
  );
}
