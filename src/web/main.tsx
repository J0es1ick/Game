import { createRoot } from "react-dom/client";
import { App, AppErrorBoundary } from "./react/app/App";
import { GameStore } from "./react/app/state/GameStore";
import { GameProvider } from "./react/app/state/GameContext";
import { createBrowserStorage } from "./react/app/state/BrowserStorage";
import "./react/app/styles/index.css";

const store = new GameStore(
  createBrowserStorage(),
  () =>
    new Worker(new URL("../gameplay/save/WorldSaveWorker", import.meta.url), {
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
