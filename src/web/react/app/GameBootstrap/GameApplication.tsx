import { useEffect, useState } from "react";
import { App, AppErrorBoundary } from "../App";
import { GameStore } from "../state/GameStore";
import { GameProvider } from "../state/GameContext";
import { createBrowserStorage } from "../state/BrowserStorage";
import type { GameMode } from "../../features/onboarding/ModeChoice/ModeChoice";

export default function GameApplication({
  initialMode,
}: {
  initialMode?: GameMode;
}) {
  const [store] = useState(
    () =>
      new GameStore(
        createBrowserStorage(),
        () =>
          new Worker(
            new URL(
              "../../../../gameplay/save/WorldSaveWorker",
              import.meta.url,
            ),
            { type: "module" },
          ),
      ),
  );
  useEffect(() => () => store.dispose(), [store]);
  return (
    <GameProvider store={store}>
      <AppErrorBoundary store={store}>
        <App initialMode={initialMode} />
      </AppErrorBoundary>
    </GameProvider>
  );
}
