import { createRoot } from "react-dom/client";
import { App, AppErrorBoundary } from "./react/App";
import { GameStore } from "./react/state/GameStore";
import { GameProvider } from "./react/state/GameContext";
import { createBrowserStorage } from "./react/state/BrowserStorage";
import "./styles.css";

const store = new GameStore(
  createBrowserStorage(),
  () =>
    new Worker(new URL("../gameplay/WorldSaveWorker.ts", import.meta.url), {
      type: "module",
    }),
);
const root = createRoot(document.getElementById("root")!);
root.render(
  <GameProvider store={store}>
    <AppErrorBoundary store={store}>
      <App />
    </AppErrorBoundary>
  </GameProvider>,
);

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
    store.dispose();
  });
