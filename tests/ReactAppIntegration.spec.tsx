import type { RenderResult } from "@testing-library/react/pure";
import type { GameStore as GameStoreType } from "../src/web/react/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/basic/basic-react.css", () => ({}));
jest.mock("../src/web/react/dialogs/tutorial-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));
jest.mock("../src/web/react/components/notifications-react.css", () => ({}));
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
const { ARENAS } =
  require("../src/catalogs/WorldCatalog") as typeof import("../src/catalogs/WorldCatalog");
const { gameAudio } =
  require("../src/web/GameAudio") as typeof import("../src/web/GameAudio");

describe("React application integration", () => {
  let storage: ReactMemoryStorage;
  let store: GameStoreType;

  beforeEach(() => {
    environment.reset();
    storage = new ReactMemoryStorage();
    store = new GameStore(storage);
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

  function application() {
    return render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <App />
        </AppErrorBoundary>
      </GameProvider>,
    );
  }

  async function createHero(ui: RenderResult) {
    fireEvent.click(ui.getByRole("button", { name: /Живой мир/ }));
    expect(
      ui.getByRole("heading", { name: "Кем вас запомнит арена?" }),
    ).toBeTruthy();
    fireEvent.change(ui.getByRole("textbox", { name: "Имя героя" }), {
      target: { value: "Проверка пути" },
    });
    fireEvent.click(ui.getByRole("radio", { name: /Мечник/ }));
    fireEvent.click(ui.getByRole("button", { name: "Начать путь" }));
    await ui.findByRole("button", { name: "Пропустить" }, { timeout: 5000 });
    fireEvent.click(ui.getByRole("button", { name: "Пропустить" }));
    await ui.findByRole("heading", { name: "Карта окрестностей" });
  }

  async function loadedWorld() {
    const game = WorldGame.create("Готовый герой", "Knight", 54801);
    game.save.tutorialCompleted = true;
    store.replaceGame(game);
    const ui = application();
    await ui.findByRole(
      "heading",
      { name: "Карта окрестностей" },
      { timeout: 5000 },
    );
    return { game, ui };
  }

  function navButton(ui: RenderResult, name: string) {
    return within(
      ui.getByRole("navigation", { name: "Разделы игры" }),
    ).getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) });
  }

  test("creates a hero through the real mode chooser, skips onboarding and reloads the saved campaign", async () => {
    const ui = application();
    expect(ui.getByRole("heading", { name: "Выберите режим" })).toBeTruthy();
    await createHero(ui);
    expect(store.game?.save.hero.name).toBe("Проверка пути");
    expect(store.game?.save.hero.classId).toBe("Swordsman");
    expect(store.game?.save.tutorialCompleted).toBe(true);
    store.flush();
    const saved = store.repository.load();
    expect(saved?.save.hero.name).toBe("Проверка пути");
    expect(saved?.save.tutorialCompleted).toBe(true);
    ui.unmount();
    store.dispose();
    store = new GameStore(storage);
    const resumed = application();
    await resumed.findByRole(
      "heading",
      { name: "Карта окрестностей" },
      { timeout: 5000 },
    );
    expect(store.getSnapshot().mode).toBe("world");
    expect(document.getElementById("tutorial-layer")).toBeNull();
  }, 15000);

  test("navigates the main groups, equipment pages, skills, both rankings and the epoch archive", async () => {
    const { game, ui } = await loadedWorld();
    const veteranId = game.leaderboard()[0].id;
    game.save.enemies.find(
      (fighter) => fighter.id === veteranId,
    )!.carriedFromCycle = 7;
    const routes = [
      ["Герой", "Ваш герой"],
      ["Навыки", "Книга навыков"],
      ["Снаряжение", "Инвентарь"],
      ["Кузница", "Кузница"],
      ["Коллекции", "Коллекции и комплекты"],
      ["Лавка", "Лавка Ионы"],
      ["Рейтинги", "Сотня лучших бойцов"],
      ["Элита 30", "Тридцать бойцов элиты"],
      ["Мир", "Летопись мира"],
    ];
    for (const [button, heading] of routes) {
      fireEvent.click(navButton(ui, button));
      await ui.findByRole(
        "heading",
        { name: heading, level: 1 },
        { timeout: 5000 },
      );
      expect(document.querySelector(".save-recovery-screen")).toBeNull();
      if (heading === "Сотня лучших бойцов") {
        const badge = ui.getByLabelText("Ветеран, перенесённый из эпохи 7");
        expect(badge.textContent).toBe("эп. 7");
        expect(badge.title).toBe("Ветеран, перенесённый из эпохи 7");
      }
    }
    expect(document.getElementById("living-world-board")).toBeTruthy();
    fireEvent.click(ui.getByRole("tab", { name: /Архив эпох/ }));
    expect(document.getElementById("epoch-history-view")).toBeTruthy();
    expect(document.getElementById("living-world-board")).toBeNull();
    fireEvent.click(ui.getByRole("tab", { name: "Текущий мир" }));
    expect(document.getElementById("living-world-board")).toBeTruthy();
    expect(document.getElementById("event-list")).toBeNull();
    expect(window.location.hash).toBe("#/chronicle");
  }, 15000);

  test("training updates the world while retaining the lower activity cards and selected control", async () => {
    const { game, ui } = await loadedWorld();
    const day = game.save.worldDay;
    const route = document.getElementById("arena-route");
    const cards = Array.from(
      document.querySelectorAll(
        "#arena-route .activity-card, #dungeon-route .activity-card, #duel-route .activity-card",
      ),
    );
    const button = ui.getByRole("button", { name: "Тренироваться" });
    button.focus();
    fireEvent.click(button);
    expect(game.save.worldDay).toBe(day + 1);
    expect(document.getElementById("arena-route")).toBe(route);
    expect(
      Array.from(
        document.querySelectorAll(
          "#arena-route .activity-card, #dungeon-route .activity-card, #duel-route .activity-card",
        ),
      ),
    ).toEqual(cards);
    cards.forEach((card) => expect(card.isConnected).toBe(true));
    expect(document.activeElement).toBe(button);
    expect(store.repository.load()?.save.worldDay).toBe(day + 1);
  }, 15000);

  test("opens the epoch archive before completing an anchored navigation", async () => {
    const { ui } = await loadedWorld();
    const scrolled: HTMLElement[] = [];
    jest
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(function (this: HTMLElement) {
        scrolled.push(this);
      });
    act(() => store.navigate("chronicle", "epoch-history-view"));
    await ui.findByRole("tab", { name: /Архив эпох/ }, { timeout: 5000 });
    await waitFor(() => expect(store.getSnapshot().navigation).toBeNull());
    const archive = document.getElementById("epoch-history-view");
    expect(archive).toBeTruthy();
    expect(
      ui.getByRole("tab", { name: /Архив эпох/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(scrolled).toContain(archive);
  }, 15000);

  test("keeps announcement offsets below the visible navigation when the mobile header scrolls away", async () => {
    const { ui } = await loadedWorld();
    const header = document.querySelector<HTMLElement>(".game-header")!;
    const nav = ui.getByRole("navigation", { name: "Разделы игры" });
    const rect = (height: number, bottom: number) => ({
      x: 0,
      y: bottom - height,
      width: 1200,
      height,
      top: bottom - height,
      right: 1200,
      bottom,
      left: 0,
      toJSON: () => ({}),
    });
    jest.spyOn(header, "getBoundingClientRect").mockReturnValue(rect(96, -30));
    jest.spyOn(nav, "getBoundingClientRect").mockReturnValue(rect(80, 80));
    fireEvent.scroll(window);
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--announcement-top"),
      ).toBe("92px"),
    );
    expect(
      document.documentElement.style.getPropertyValue("--game-header-height"),
    ).toBe("96px");
    expect(
      document.documentElement.style.getPropertyValue("--main-nav-height"),
    ).toBe("80px");
  }, 15000);

  test("registers for a tournament and launches the reserved bracket from its day reminder", async () => {
    const { game, ui } = await loadedWorld();
    const arena = ARENAS[0];
    const card = ui
      .getByRole("heading", { name: arena.name, level: 3 })
      .closest("article")!;
    fireEvent.click(
      within(card).getByRole("button", { name: /Записаться на день/ }),
    );
    const registeredDay = game.registeredTournamentDay(arena.id);
    expect(registeredDay).toBeGreaterThan(game.save.worldDay);
    expect(
      within(card)
        .getByRole("button", { name: `Записан на день ${registeredDay}` })
        .hasAttribute("disabled"),
    ).toBe(true);
    while (game.save.worldDay < registeredDay!)
      fireEvent.click(ui.getByRole("button", { name: "Тренироваться" }));
    const reminder = await ui.findByRole("complementary", {
      name: "События сегодняшнего дня",
    });
    expect(within(reminder).getByText(arena.name)).toBeTruthy();
    fireEvent.click(within(reminder).getByRole("button", { name: "Начать" }));
    await ui.findByRole("dialog", { name: arena.name }, { timeout: 5000 });
    expect(
      game.currentPendingBattle()?.tournament?.participantIds.length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      store.getSnapshot().dialogs[store.getSnapshot().dialogs.length - 1].kind,
    ).toBe("battle");
  }, 15000);

  test("keeps the basic tournament playable and returns to mode selection", async () => {
    const ui = application();
    fireEvent.click(ui.getByRole("button", { name: /Базовый турнир/ }));
    await ui.findByRole(
      "heading",
      { name: "Базовый турнир", level: 1 },
      { timeout: 5000 },
    );
    fireEvent.click(ui.getByRole("button", { name: "Добавить" }));
    expect(document.querySelectorAll(".basic-roster-row")).toHaveLength(4);
    fireEvent.click(ui.getByRole("button", { name: "Начать турнир" }));
    fireEvent.click(ui.getByRole("button", { name: "Выполнить ход" }));
    expect(document.getElementById("basic-match")?.textContent).toContain(
      "001",
    );
    fireEvent.click(ui.getByRole("button", { name: "Сменить режим" }));
    await ui.findByRole("heading", { name: "Выберите режим" });
    expect(store.game).toBeNull();
  }, 15000);
});
