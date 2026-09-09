import { createRoot } from "react-dom/client";
import { GameBootstrap } from "./react/app/GameBootstrap/GameBootstrap";
import "./react/app/styles/index.css";
import {
  applyAppearance,
  readUiPreferences,
} from "./react/app/state/UiPreferences";
import { createBrowserStorage } from "./react/app/state/BrowserStorage";

applyAppearance(readUiPreferences(createBrowserStorage()));
const root = createRoot(document.getElementById("root")!);
root.render(<GameBootstrap />);

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
  });
