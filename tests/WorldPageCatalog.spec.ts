import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType } from "react";
import type { GameStore as GameStoreType } from "../src/web/react/state/GameStore";
import { pageFromHash, pageHash } from "../src/web/UiRuntime";
import { baseTutorialSteps } from "../src/web/TutorialCatalog";
import { createReactEnvironment, ReactMemoryStorage } from "./helpers/ReactEnvironment";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
} from "../src/web/WorldPageCatalog";

jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));

const environment = createReactEnvironment();
const { createElement } = require("react") as typeof import("react");
const { cleanup, fireEvent, render, within } = require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { GameProvider } = require("../src/web/react/state/GameContext") as typeof import("../src/web/react/state/GameContext");
const { GameStore } = require("../src/web/react/state/GameStore") as typeof import("../src/web/react/state/GameStore");
const { WorldGame } = require("../src/gameplay/WorldGame") as typeof import("../src/gameplay/WorldGame");
const { Header } = require("../src/web/react/components/Header") as typeof import("../src/web/react/components/Header");
const { ForgePage } = require("../src/web/react/equipment/ForgePage") as typeof import("../src/web/react/equipment/ForgePage");
const { LegacyPage } = require("../src/web/react/equipment/LegacyPage") as typeof import("../src/web/react/equipment/LegacyPage");
const { ChroniclePage } = require("../src/web/react/pages/ChroniclePage") as typeof import("../src/web/react/pages/ChroniclePage");

afterAll(() => environment.restore());

describe("world page catalog", () => {
  it("routes the legacy page through a GitHub Pages-safe hash", () => {
    expect(pageHash("legacy")).toBe("#/legacy");
    expect(pageFromHash("#/legacy", WORLD_PAGE_IDS, "map")).toBe("legacy");
  });

  it("keeps the shop top-level and legacy inside the equipment group", () => {
    expect(WORLD_PAGE_NAV_GROUP.shop).toBe("shop");
    expect(WORLD_PAGE_NAV_GROUP.legacy).toBe("equipment");
  });

  it("gates legacy behind equipment-legacy without gating the shop", () => {
    const locked = (feature: "contracts" | "equipment-legacy") => feature === "contracts";
    const unlocked = () => true;

    expect(isWorldPageAvailable("legacy", locked)).toBe(false);
    expect(isWorldPageAvailable("legacy", unlocked)).toBe(true);
    expect(isWorldPageAvailable("shop", locked)).toBe(true);
  });
});

describe("world page markup", () => {
  let store: GameStoreType;

  beforeEach(() => {
    environment.reset();
    store = new GameStore(new ReactMemoryStorage());
    store.attach(WorldGame.create("Каталог страниц", "Knight", 59021));
  });
  afterEach(() => { cleanup(); store.dispose(); });

  const show = (component: ComponentType) => render(createElement(GameProvider, { store, children: createElement(component) }));

  it("loads the React browser entry from a GitHub Pages-safe relative path", () => {
    const html = readFileSync(resolve(process.cwd(), "src/web/index.html"), "utf8");
    const document = new environment.window.DOMParser().parseFromString(html, "text/html");
    expect(document.documentElement.lang).toBe("ru");
    expect(document.getElementById("root")).not.toBeNull();
    const entry = document.querySelector('script[type="module"]')?.getAttribute("src");
    expect(entry).toBe("./main.tsx");
    expect(document.querySelector('script[src="./ui.ts"]')).toBeNull();
    const bootstrap = readFileSync(resolve(process.cwd(), "src/web", entry!), "utf8");
    expect(bootstrap).toContain('from "react-dom/client"');
    expect(bootstrap).toContain("root.render(");
    expect(bootstrap).toContain("<GameProvider");
  });

  it("renders shop only in primary navigation and legacy in equipment navigation", () => {
    store.game!.save.hero.arenaWins[3] = 1;
    store.setPage("legacy");
    const ui = show(Header);
    const primary = ui.container.querySelector<HTMLElement>(".nav-primary")!;
    const secondary = ui.container.querySelector<HTMLElement>(".nav-secondary")!;
    expect(within(primary).getByRole("button", { name: "Лавка" })).toBeTruthy();
    expect(secondary.querySelector('[data-page="shop"]')).toBeNull();
    expect(within(secondary).getByRole("button", { name: "Наследие" }).getAttribute("data-page")).toBe("legacy");
    expect(within(secondary).getByRole("button", { name: "Наследие" }).getAttribute("aria-current")).toBe("page");
  });

  it("does not offer legacy navigation before the required milestone", () => {
    store.setPage("arsenal");
    const ui = show(Header);
    expect(ui.container.querySelector('[data-page="legacy"]')).toBeNull();
    expect(ui.getByRole("button", { name: "Лавка" })).toBeTruthy();
  });

  it("keeps forge focused and gives legacy both workshops", () => {
    store.game!.save.hero.arenaWins[3] = 1;
    const forge = show(ForgePage);
    expect(forge.container.querySelector("#forge-grid")).not.toBeNull();
    expect(forge.container.querySelector("#loot-target-workshop")).toBeNull();
    expect(forge.container.querySelector("#relic-workshop")).toBeNull();
    forge.unmount();
    const legacy = show(LegacyPage);
    expect(legacy.container.querySelector("#loot-target-workshop")).not.toBeNull();
    expect(legacy.container.querySelector("#relic-workshop")).not.toBeNull();
    expect(legacy.getByRole("heading", { name: "Предметы помнят победы" })).toBeTruthy();
  });

  it("keeps the world boards and epoch archive without the duplicate event feed", () => {
    const ui = show(ChroniclePage);
    expect(ui.container.querySelector("#living-world-board")).not.toBeNull();
    expect(ui.container.querySelector(".world-season")).not.toBeNull();
    expect(ui.container.querySelector("#event-list, .chronicle-layout, .world-rules")).toBeNull();
    fireEvent.click(ui.getByRole("tab", { name: /Архив эпох/ }));
    expect(ui.container.querySelector("#epoch-history-view")).not.toBeNull();
    expect(ui.container.querySelector("#living-world-board")).toBeNull();
    fireEvent.click(ui.getByRole("tab", { name: "Текущий мир" }));
    expect(ui.container.querySelector("#living-world-board")).not.toBeNull();
    expect(baseTutorialSteps.find((step) => step.page === "chronicle")?.target).toBe(".world-season");
  });
});
