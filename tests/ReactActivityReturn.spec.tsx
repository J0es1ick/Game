import type { RenderResult } from "@testing-library/react/pure";
import type { WorldGame as WorldGameType } from "../src/gameplay/WorldGame";
import type {
  DungeonExpedition,
  ExpeditionStepReport,
} from "../src/gameplay/WorldTypes";
import type { GameStore as GameStoreType } from "../src/web/react/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/basic/basic-react.css", () => ({}));
jest.mock("../src/web/react/dialogs/tutorial-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));
jest.mock("../src/web/react/components/notifications-react.css", () => ({}), {
  virtual: true,
});
jest.mock("../src/web/react/map/map-react.css", () => ({}));

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render, waitFor, within } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { App, AppErrorBoundary } =
  require("../src/web/react/App") as typeof import("../src/web/react/App");
const { GameProvider } =
  require("../src/web/react/state/GameContext") as typeof import("../src/web/react/state/GameContext");
const { GameStore } =
  require("../src/web/react/state/GameStore") as typeof import("../src/web/react/state/GameStore");
const { WorldGame } =
  require("../src/gameplay/WorldGame") as typeof import("../src/gameplay/WorldGame");
const { DUNGEONS } =
  require("../src/catalogs/WorldCatalog") as typeof import("../src/catalogs/WorldCatalog");
const { pendingBattleReport } =
  require("../src/web/PendingBattleUi") as typeof import("../src/web/PendingBattleUi");
const { gameAudio } =
  require("../src/web/GameAudio") as typeof import("../src/web/GameAudio");

describe("React activity return navigation", () => {
  let store: GameStoreType;
  let scrollY: number;
  let scrollTo: jest.Mock;

  beforeEach(() => {
    environment.reset();
    scrollY = 0;
    scrollTo = jest.fn((options: ScrollToOptions | number, top?: number) => {
      scrollY =
        typeof options === "number"
          ? (top ?? scrollY)
          : (options.top ?? scrollY);
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      writable: true,
      value: scrollTo,
    });
    store = new GameStore(new ReactMemoryStorage());
    store.initialize();
    jest.spyOn(store, "persist").mockImplementation(() => undefined);
    jest.spyOn(store, "checkpoint").mockImplementation(() => undefined);
    for (const method of [
      "event",
      "battleStart",
      "battleTurn",
      "battleResult",
      "basicTurn",
    ] as const)
      jest.spyOn(gameAudio, method).mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    store.dispose();
    jest.restoreAllMocks();
  });

  afterAll(() => environment.restore());

  function tab(ui: RenderResult, label: string) {
    return within(
      ui.getByRole("navigation", { name: "Разделы игры" }),
    ).getByRole("button", { name: label });
  }

  async function frames() {
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        );
      });
    });
  }

  async function loadedWorld(page: "map" | "shop" = "map") {
    const game = WorldGame.create("Возвращение из боя", "Knight", 94901);
    game.save.tutorialCompleted = true;
    jest.spyOn(game, "pendingNarrativeEvent").mockReturnValue(undefined);
    store.replaceGame(game);
    const ui = render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <App />
        </AppErrorBoundary>
      </GameProvider>,
    );
    await ui.findByRole(
      "heading",
      { name: "Карта окрестностей" },
      { timeout: 5000 },
    );
    if (page === "shop") {
      fireEvent.click(tab(ui, "Лавка"));
      await ui.findByRole("heading", { name: "Лавка Ионы" });
      await waitFor(() => expect(store.getSnapshot().navigation).toBeNull());
    }
    await frames();
    scrollY = 1180;
    scrollTo.mockClear();
    const pageElement = document.getElementById(`page-${page}`);
    expect(pageElement).not.toBeNull();
    return { game, ui, pageElement };
  }

  function expedition(): DungeonExpedition {
    return {
      dungeonId: DUNGEONS[0].id,
      stage: 2,
      maxStages: 3,
      health: 62,
      accumulatedGold: 120,
      accumulatedExperience: 50,
      loot: [],
      path: ["Первый зал", "Развилка"],
    };
  }

  function expeditionResult(retreated = false): ExpeditionStepReport {
    return {
      expedition: { ...expedition(), stage: retreated ? 2 : 3 },
      completed: !retreated,
      retreated,
      message: retreated
        ? "Герой вернулся с частью добычи."
        : "Все этапы данжа пройдены.",
      rewards: {
        gold: 120,
        experience: 50,
        levelsGained: 0,
        unlockedSkills: [],
        items: [],
      },
    };
  }

  function completedBattle(
    game: WorldGameType,
    heroWon: boolean,
    result?: ExpeditionStepReport,
  ) {
    const pending = game.beginDuel();
    if (result) {
      pending.kind = "expedition";
      pending.activityId = DUNGEONS[0].id;
      game.save.activeExpedition = expedition();
    }
    pending.session.winnerId = heroWon ? "hero" : pending.enemyId;
    pending.session.hero.health = heroWon ? pending.session.hero.maxHealth : 0;
    pending.session.enemy.health = heroWon
      ? 0
      : pending.session.enemy.maxHealth;
    const battle = pendingBattleReport(pending);
    return jest.spyOn(game, "finalizePendingBattle").mockImplementation(() => {
      game.save.pendingBattle = undefined;
      if (result) game.save.activeExpedition = undefined;
      return {
        status: "complete",
        battle,
        result: result ? { ...result, battle } : battle,
      };
    });
  }

  async function expectReturn(
    page: "map" | "shop",
    pageElement: HTMLElement | null,
  ) {
    await frames();
    expect(store.getSnapshot().dialogs).toHaveLength(0);
    expect(store.getSnapshot().page).toBe(page);
    expect(store.getSnapshot().navigation).toBeNull();
    expect(location.hash).toBe(`#/${page}`);
    expect(document.getElementById(`page-${page}`)).toBe(pageElement);
    expect(window.scrollY).toBe(1180);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
  }

  test.each([
    ["map", true],
    ["shop", false],
  ] as const)(
    "closing a finished battle on %s preserves the page and scroll (victory: %s)",
    async (page, heroWon) => {
      const { game, ui, pageElement } = await loadedWorld(page);
      const finalize = completedBattle(game, heroWon);
      act(() => store.openDialog({ kind: "battle" }));
      const close = await ui.findByRole(
        "button",
        { name: "Продолжить игру" },
        { timeout: 5000 },
      );
      expect(finalize).toHaveBeenCalledTimes(1);
      fireEvent.click(close);
      await expectReturn(page, pageElement);
      expect(game.currentPendingBattle()).toBeUndefined();
    },
  );

  test("closing final dungeon battle rewards keeps the current tab and its scroll", async () => {
    const { game, ui, pageElement } = await loadedWorld("shop");
    const finalize = completedBattle(game, true, expeditionResult());
    act(() => store.openDialog({ kind: "battle" }));
    fireEvent.click(
      await ui.findByRole("button", { name: "Посмотреть итоги похода" }),
    );
    await ui.findByRole("heading", {
      name: `Исследован данж «${DUNGEONS[0].name}»`,
    });
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().page).toBe("shop");
    fireEvent.click(ui.getByRole("button", { name: "Забрать награды" }));
    await expectReturn("shop", pageElement);
  });

  test.each([false, true])(
    "closing dungeon route rewards preserves the map scroll (retreated: %s)",
    async (retreated) => {
      const { game, ui, pageElement } = await loadedWorld();
      game.save.activeExpedition = expedition();
      const result = expeditionResult(retreated);
      const complete = () => {
        game.save.activeExpedition = undefined;
        return result;
      };
      const resolve = retreated
        ? jest.spyOn(game, "retreatExpedition").mockImplementation(complete)
        : jest
            .spyOn(game, "beginExpeditionChoice")
            .mockImplementation(complete);
      jest.spyOn(window, "confirm").mockReturnValue(true);
      act(() => store.openDialog({ kind: "dungeon" }));
      if (retreated) {
        fireEvent.click(
          await ui.findByRole("button", {
            name: "Отступить и сохранить часть найденного",
          }),
        );
      } else {
        fireEvent.click(
          (await ui.findAllByRole("button", { name: "Выбрать путь" }))[0],
        );
      }
      fireEvent.click(
        await ui.findByRole("button", { name: "Забрать награды" }),
      );
      expect(resolve).toHaveBeenCalledTimes(1);
      await expectReturn("map", pageElement);
    },
  );

  test("ordinary tab navigation still resets scroll after returning from a battle", async () => {
    const { game, ui, pageElement } = await loadedWorld();
    completedBattle(game, true);
    act(() => store.openDialog({ kind: "battle" }));
    fireEvent.click(await ui.findByRole("button", { name: "Продолжить игру" }));
    await expectReturn("map", pageElement);
    fireEvent.click(tab(ui, "Лавка"));
    await ui.findByRole("heading", { name: "Лавка Ионы" });
    await waitFor(() => expect(store.getSnapshot().navigation).toBeNull());
    expect(store.getSnapshot().page).toBe("shop");
    expect(location.hash).toBe("#/shop");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(window.scrollY).toBe(0);
    scrollY = 750;
    scrollTo.mockClear();
    fireEvent.click(tab(ui, "Карта"));
    await ui.findByRole("heading", { name: "Карта окрестностей" });
    await waitFor(() => expect(store.getSnapshot().navigation).toBeNull());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(window.scrollY).toBe(0);
  });
});
