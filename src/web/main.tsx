import { createRoot } from "react-dom/client";
import { GameBootstrap } from "./react/app/GameBootstrap/GameBootstrap";
import "./react/app/styles/index.css";

const root = createRoot(document.getElementById("root")!);
root.render(<GameBootstrap />);

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
  });
