import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType } from "react";
import type { GameStore as GameStoreType } from "../src/web/react/app/state/GameStore";
import { pageFromHash, pageHash } from "../src/web/react/app/routing/UiRuntime";
import { baseTutorialSteps } from "../src/web/react/features/onboarding/TutorialDialog/TutorialCatalog";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
} from "../src/web/react/app/routing/WorldPageCatalog";

jest.mock(
  "../src/web/react/features/equipment/styles/components.css",
  () => ({}),
);

const environment = createReactEnvironment();
const { createElement } = require("react") as typeof import("react");
const { cleanup, fireEvent, render, within } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { GameProvider } =
  require("../src/web/react/app/state/GameContext") as typeof import("../src/web/react/app/state/GameContext");
const { GameStore } =
  require("../src/web/react/app/state/GameStore") as typeof import("../src/web/react/app/state/GameStore");
const { WorldGame } =
  require("../src/gameplay/core/WorldGame") as typeof import("../src/gameplay/core/WorldGame");
const { Header } =
  require("../src/web/react/app/Header/Header") as typeof import("../src/web/react/app/Header/Header");
const { PagedList } =
  require("../src/web/react/shared/ui/common") as typeof import("../src/web/react/shared/ui/common");
const { ForgePage } =
  require("../src/web/react/features/equipment/pages/ForgePage/ForgePage") as typeof import("../src/web/react/features/equipment/pages/ForgePage/ForgePage");
const { LegacyPage } =
  require("../src/web/react/features/equipment/pages/LegacyPage/LegacyPage") as typeof import("../src/web/react/features/equipment/pages/LegacyPage/LegacyPage");
const { ChroniclePage } =
  require("../src/web/react/features/world/pages/ChroniclePage/ChroniclePage") as typeof import("../src/web/react/features/world/pages/ChroniclePage/ChroniclePage");

afterAll(() => environment.restore());

describe("world page catalog", () => {
  it("routes the legacy page through a GitHub Pages-safe hash", () => {
    expect(pageHash("legacy")).toBe("#/legacy");
    expect(pageFromHash("#/legacy", WORLD_PAGE_IDS, "map")).toBe("legacy");
  });

  it("keeps the shop top-level and legacy inside the equipment group", () => {
    expect(WORLD_PAGE_NAV_GROUP.shop).toBe("shop");
    expect(WORLD_PAGE_NAV_GROUP.legacy).toBe("equipment");
    expect(WORLD_PAGE_NAV_GROUP.chronicle).toBe("world");
    expect(WORLD_PAGE_NAV_GROUP.fighters).toBe("world");
    expect(WORLD_PAGE_NAV_GROUP.relics).toBe("world");
    expect(WORLD_PAGE_NAV_GROUP.history).toBe("world");
  });

  it("keeps multi-column lists in reading order", () => {
    const items = ["first", "second", "third", "fourth"];
    const ui = render(
      createElement(PagedList<string>, {
        items,
        columns: 2,
        getKey: (item: string) => item,
        render: (item: string) => createElement("span", null, item),
      }),
    );
    expect(
      Array.from(
        ui.container.querySelectorAll<HTMLElement>(".paged-list-item"),
        (item) => item.textContent,
      ),
    ).toEqual(items);
    expect(ui.container.querySelector(".paged-list-column")).toBeNull();
  });

  it("gates legacy behind equipment-legacy without gating the shop", () => {
    const locked = (feature: "contracts" | "equipment-legacy") =>
      feature === "contracts";
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
  afterEach(() => {
    cleanup();
    store.dispose();
  });

  const show = (component: ComponentType) =>
    render(
      createElement(GameProvider, {
        store,
        children: createElement(component),
      }),
    );

  it("loads the React browser entry from a GitHub Pages-safe relative path", () => {
    const html = readFileSync(
      resolve(process.cwd(), "src/web/index.html"),
      "utf8",
    );
    const document = new environment.window.DOMParser().parseFromString(
      html,
      "text/html",
    );
    expect(document.documentElement.lang).toBe("ru");
    expect(document.getElementById("root")).not.toBeNull();
    const entry = document
      .querySelector('script[type="module"]')
      ?.getAttribute("src");
    expect(entry).toBe("./main.tsx");
    expect(document.querySelector('script[src="./ui.ts"]')).toBeNull();
    const bootstrap = readFileSync(
      resolve(process.cwd(), "src/web", entry!),
      "utf8",
    );
    expect(bootstrap).toContain('from "react-dom/client"');
    expect(bootstrap).toContain("root.render(");
    expect(bootstrap).toContain("<GameBootstrap");
    expect(bootstrap).not.toContain("GameStore");
    const runtime = readFileSync(
      "src/web/react/app/GameBootstrap/GameApplication.tsx",
      "utf8",
    );
    expect(runtime).toContain("<GameProvider");
  });

  it("renders shop only in primary navigation and legacy in equipment navigation", () => {
    store.game!.save.hero.arenaWins[3] = 1;
    store.setPage("legacy");
    const ui = show(Header);
    const primary = ui.container.querySelector<HTMLElement>(".nav-primary")!;
    const secondary =
      ui.container.querySelector<HTMLElement>(".nav-secondary")!;
    expect(within(primary).getByRole("button", { name: "Лавка" })).toBeTruthy();
    expect(secondary.querySelector('[data-page="shop"]')).toBeNull();
    expect(
      within(secondary)
        .getByRole("button", { name: "Наследие" })
        .getAttribute("data-page"),
    ).toBe("legacy");
    expect(
      within(secondary)
        .getByRole("button", { name: "Наследие" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps identity pages under hero and build pages under equipment", () => {
    store.setPage("career");
    const ui = show(Header);
    const labels = Array.from(
      ui.container.querySelectorAll<HTMLButtonElement>(
        '.nav-secondary[data-group="hero"] button',
      ),
      (button) => button.textContent?.trim(),
    );
    expect(labels).toEqual(["Облик и класс", "Карьера"]);
    expect(
      ui.container
        .querySelector('[data-page="career"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    ui.unmount();
    store.setPage("skills");
    const equipmentUi = show(Header);
    const equipmentLabels = Array.from(
      equipmentUi.container.querySelectorAll<HTMLButtonElement>(
        '.nav-secondary[data-group="equipment"] button',
      ),
      (button) => button.textContent?.trim(),
    );
    expect(equipmentLabels.slice(0, 3)).toEqual([
      expect.stringMatching(/^Инвентарь/),
      "Навыки",
      "Кузница",
    ]);
  });

  it("does not offer legacy navigation before the required milestone", () => {
    store.setPage("arsenal");
    const ui = show(Header);
    expect(ui.container.querySelector('[data-page="legacy"]')).toBeNull();
    expect(ui.getByRole("button", { name: "Лавка" })).toBeTruthy();
  });

  it("orders world navigation from the current world to people, relics, contracts and history", () => {
    store.game!.save.hero.arenaWins[0] = 1;
    store.setPage("chronicle");
    const ui = show(Header);
    const labels = Array.from(
      ui.container.querySelectorAll<HTMLButtonElement>(
        '.nav-secondary[data-group="world"] button',
      ),
      (button) => button.textContent?.trim(),
    );
    expect(labels).toEqual([
      "Обзор мира",
      "Бойцы и школы",
      "Реликвии",
      "Контракты",
      "Архив эпох",
    ]);
    expect(
      ui.container
        .querySelector('[data-page="fighters"]')
        ?.getAttribute("title"),
    ).toBe("Соперники, наставники и школы");
  });

  it("keeps forge focused and gives legacy both workshops", () => {
    store.game!.save.hero.arenaWins[3] = 1;
    const forge = show(ForgePage);
    expect(forge.container.querySelector("#forge-grid")).not.toBeNull();
    expect(forge.container.querySelector("#loot-target-workshop")).toBeNull();
    expect(forge.container.querySelector("#relic-workshop")).toBeNull();
    forge.unmount();
    const legacy = show(LegacyPage);
    expect(
      legacy.container.querySelector("#loot-target-workshop"),
    ).not.toBeNull();
    expect(legacy.container.querySelector("#relic-workshop")).not.toBeNull();
    expect(
      legacy.getByRole("heading", { name: "Предметы помнят победы" }),
    ).toBeTruthy();
  });

  it("splits the living world into focused pages without a duplicate event feed", () => {
    const renderSection = (
      section: "chronicle" | "fighters" | "relics" | "history",
    ) =>
      render(
        createElement(GameProvider, {
          store,
          children: createElement(ChroniclePage, { section }),
        }),
      );
    const overview = renderSection("chronicle");
    expect(overview.container.querySelector(".world-season")).not.toBeNull();
    expect(
      overview.container.querySelector(
        ".world-activities, .world-relics, #epoch-history-view",
      ),
    ).toBeNull();
    overview.unmount();
    const fighters = renderSection("fighters");
    expect(
      fighters.container.querySelector(".world-activities"),
    ).not.toBeNull();
    expect(fighters.container.querySelector(".world-careers")).not.toBeNull();
    expect(fighters.container.querySelector(".future-bosses")).not.toBeNull();
    fighters.unmount();
    const relics = renderSection("relics");
    expect(relics.container.querySelector(".world-relics")).not.toBeNull();
    expect(relics.container.querySelector(".world-veterans")).not.toBeNull();
    relics.unmount();
    const history = renderSection("history");
    expect(
      history.container.querySelector("#epoch-history-view"),
    ).not.toBeNull();
    expect(
      history.container.querySelector(
        "#event-list, .chronicle-layout, .world-rules",
      ),
    ).toBeNull();
    expect(
      baseTutorialSteps.find((step) => step.page === "chronicle")?.target,
    ).toBe(".world-season");
    expect(
      baseTutorialSteps.find((step) => step.page === "fighters")?.target,
    ).toBe(".world-activities");
    expect(
      baseTutorialSteps.find((step) => step.page === "relics")?.target,
    ).toBe(".world-relics");
    expect(
      baseTutorialSteps.find((step) => step.page === "history")?.target,
    ).toBe("#epoch-history-view");
  });
});
