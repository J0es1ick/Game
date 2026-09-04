import { readFileSync } from "fs";
import type { GameStore as GameStoreType } from "../src/web/react/app/state/GameStore";
import type { WorldGame as WorldGameType } from "../src/gameplay/core/WorldGame";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/features/map/styles/components.css", () => ({}));

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render, within } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { WorldGame } =
  require("../src/gameplay/core/WorldGame") as typeof import("../src/gameplay/core/WorldGame");
const { ARENAS, DUNGEONS, ENDGAME_ACTIVITIES } =
  require("../src/catalogs/WorldCatalog") as typeof import("../src/catalogs/WorldCatalog");
const { GameStore } =
  require("../src/web/react/app/state/GameStore") as typeof import("../src/web/react/app/state/GameStore");
const { GameProvider } =
  require("../src/web/react/app/state/GameContext") as typeof import("../src/web/react/app/state/GameContext");
const { MapPage } =
  require("../src/web/react/features/map/pages/MapPage/MapPage") as typeof import("../src/web/react/features/map/pages/MapPage/MapPage");
const { MapShortcuts, mapShortcuts } =
  require("../src/web/react/features/map/components/MapShortcuts/MapShortcuts") as typeof import("../src/web/react/features/map/components/MapShortcuts/MapShortcuts");
const { ActivityCard } =
  require("../src/web/react/features/map/components/ActivityCard/ActivityCard") as typeof import("../src/web/react/features/map/components/ActivityCard/ActivityCard");
const { EndgameActivityCard, LegendDefenseCard } =
  require("../src/web/react/features/map/components/EliteChallenges/EliteChallenges") as typeof import("../src/web/react/features/map/components/EliteChallenges/EliteChallenges");
const { NewChronicleStatus } =
  require("../src/web/react/features/map/components/NewChronicleStatus/NewChronicleStatus") as typeof import("../src/web/react/features/map/components/NewChronicleStatus/NewChronicleStatus");

describe("React world map", () => {
  let game: WorldGameType;
  let store: GameStoreType;

  beforeEach(() => {
    environment.reset();
    game = WorldGame.create("Картограф", "Knight", 941021);
    game.save.tutorialCompleted = true;
    store = new GameStore(new ReactMemoryStorage());
    store.attach(game);
  });
  afterEach(() => {
    cleanup();
    store.dispose();
    jest.restoreAllMocks();
  });
  afterAll(() => environment.restore());

  function placeInElite(rank: number) {
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.hero.arenaWins[ARENAS.length - 1] = 1;
    game.save.eliteLeagueMemberIds[rank - 1] = game.save.hero.id;
  }

  test("quick navigation reports reserved events today and the correct targets", () => {
    game.save.tournamentRegistrations[ARENAS[0].id] = game.save.worldDay;
    game.save.tournamentRegistrations["crown-league"] = game.save.worldDay;
    const shortcuts = mapShortcuts(game);
    expect(
      shortcuts.find((entry) => entry.id === "tournaments-section")?.status,
    ).toBe("1 сегодня");
    expect(
      shortcuts.find((entry) => entry.id === "endgame-section")?.status,
    ).toBe("Лига сегодня");
    expect(shortcuts).toHaveLength(5);
    expect(shortcuts[shortcuts.length - 1]?.name).toBe("Лига короны");
    const ui = render(
      <GameProvider store={store}>
        <MapShortcuts />
      </GameProvider>,
    );
    fireEvent.click(ui.getByRole("button", { name: "Турниры 1 сегодня" }));
    expect(store.getSnapshot().navigation).toMatchObject({
      page: "map",
      anchor: "tournaments-section",
    });
  });

  test("map directions switch in place while keeping every activity available", () => {
    const ui = render(
      <GameProvider store={store}>
        <MapPage />
      </GameProvider>,
    );
    expect(
      (ui.getByRole("button", { name: /Кузница/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (ui.getByRole("button", { name: /Контракты/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(ui.getByRole("heading", { name: "Дуэльный круг" })).toBeTruthy();
    expect(ui.getByRole("heading", { name: "Тренировка" })).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: /Турниры/ }));
    expect(
      ui.getByRole("heading", { name: "Календарь турниров" }),
    ).toBeTruthy();
    ARENAS.forEach((arena) =>
      expect(
        ui.getByRole("heading", { name: arena.name, level: 3 }),
      ).toBeTruthy(),
    );
    const conditionLinks = ui.getAllByText("Условия");
    expect(conditionLinks).toHaveLength(ARENAS.length);
    conditionLinks[0].focus();
    fireEvent.click(conditionLinks[0]);
    const dialog = ui.getByRole("dialog", {
      name: `Условия: ${ARENAS[0].name}`,
    });
    expect(
      within(dialog).getByText(
        `Ареной управляет ${game.factionController(ARENAS[0].id).name}`,
      ),
    ).toBeTruthy();
    game
      .tournamentRules(ARENAS[0].id, game.nextTournamentDay(ARENAS[0].id))
      .forEach((rule) => {
        expect(within(dialog).getByText(rule.description)).toBeTruthy();
      });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(ui.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(conditionLinks[0]);
    expect(ui.queryByText("АРЕНОЙ УПРАВЛЯЕТ")).toBeNull();
    expect(ui.getByRole("heading", { name: "Тренировка" })).toBeTruthy();
  });

  test("quick actions open forge and unlocked contracts", () => {
    game.save.hero.arenaWins[0] = 1;
    const ui = render(
      <GameProvider store={store}>
        <MapPage />
      </GameProvider>,
    );
    fireEvent.click(ui.getByRole("button", { name: /Кузница/ }));
    expect(store.getSnapshot().page).toBe("forge");
    fireEvent.click(ui.getByRole("button", { name: /Контракты/ }));
    expect(store.getSnapshot().page).toBe("contracts");
  });

  test("quick endgame status includes pending defense, available hunt and future league registration", () => {
    placeInElite(10);
    const day = game.registerCrownLeague();
    const status = () =>
      mapShortcuts(game).find((entry) => entry.id === "endgame-section")
        ?.status;
    expect(status()).toBe(`Лига: день ${day}`);
    game.save.eliteLeagueMemberIds[9] = game.save.eliteLeagueMemberIds[5];
    game.save.eliteLeagueMemberIds[5] = game.save.hero.id;
    expect(status()).toBe("Легенда найдена");
    game.save.pendingEliteChallengeId = game.save.eliteLeagueMemberIds[8];
    expect(status()).toBe("Защитите титул");
  });

  test("an active dungeon can be resumed without creating another expedition", () => {
    game.save.hero.level = 8;
    game.save.worldDay = 12;
    const dungeon = DUNGEONS[0];
    const expedition = game.startExpedition(dungeon.id);
    const started = jest.spyOn(game, "startExpedition");
    const ui = render(
      <GameProvider store={store}>
        <ActivityCard activity={dungeon} index={0} />
        <ActivityCard activity={DUNGEONS[1]} index={1} />
      </GameProvider>,
    );
    expect(
      ui
        .getByRole("button", { name: "Сначала завершите текущий поход" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const resume = ui.getByRole("button", { name: "Продолжить поход" });
    expect(resume.parentElement?.lastElementChild).toBe(resume);
    fireEvent.click(resume);
    expect(started).not.toHaveBeenCalled();
    expect(game.save.activeExpedition).toBe(expedition);
    expect(store.getSnapshot().dialogs).toContainEqual({ kind: "dungeon" });
  });

  test("crown league requires registration and opens the reserved thirty-person tournament on its day", () => {
    placeInElite(10);
    const activity = ENDGAME_ACTIVITIES.find(
      (entry) => entry.id === "crown-league",
    )!;
    const ui = render(
      <GameProvider store={store}>
        <EndgameActivityCard activity={activity} />
      </GameProvider>,
    );
    fireEvent.click(ui.getByRole("button", { name: /Записаться на день/ }));
    const day = game.registeredCrownLeagueDay()!;
    expect(day).toBeGreaterThan(game.save.worldDay);
    expect(
      ui
        .getByRole("button", { name: `Записан на день ${day}` })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(game.currentPendingBattle()).toBeUndefined();
    act(() => {
      game.save.worldDay = day;
      store.publish();
    });
    fireEvent.click(
      ui.getByRole("button", { name: "Начать турнир на 30 бойцов" }),
    );
    expect(
      game.currentPendingBattle()?.tournament?.participantIds,
    ).toHaveLength(30);
    expect(store.getSnapshot().dialogs).toContainEqual({ kind: "battle" });
  }, 15000);

  test("legend defense retains its card while toggling automatic resolution and can start manually", () => {
    placeInElite(3);
    game.save.hero.autoResolveLegendChallenges = false;
    game.save.pendingEliteChallengeId = game.save.eliteLeagueMemberIds[8];
    const activity = ENDGAME_ACTIVITIES.find(
      (entry) => entry.id === "legend-hunt",
    )!;
    const ui = render(
      <GameProvider store={store}>
        <EndgameActivityCard activity={activity} />
        <LegendDefenseCard />
      </GameProvider>,
    );
    const card = ui
      .getByRole("button", { name: "Защитить титул" })
      .closest("article")!;
    expect(within(card).getByText(/Смена дня заблокирована/)).toBeTruthy();
    fireEvent.click(
      ui.getByRole("checkbox", {
        name: "Автоматически рассчитывать защиту титула",
      }),
    );
    expect(game.save.hero.autoResolveLegendChallenges).toBe(true);
    expect(
      ui.getByRole("button", { name: "Защитить титул" }).closest("article"),
    ).toBe(card);
    expect(
      within(card).getByText(/защита будет рассчитана автоматически/),
    ).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "Защитить титул" }));
    expect(game.currentPendingBattle()?.activityId).toBe("legend-defense");
    expect(store.getSnapshot().dialogs).toContainEqual({ kind: "battle" });
  });

  test("new chronicle status opens the detailed requirements before qualification", () => {
    const status = game.newGamePlusStatus();
    const ui = render(
      <GameProvider store={store}>
        <NewChronicleStatus />
      </GameProvider>,
    );
    expect(status.unlocked).toBe(false);
    const completed = status.requirements.filter((entry) => entry.met).length;
    expect(
      ui.getByText(`${completed} из ${status.requirements.length} условий`),
    ).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "Условия эпохи" }));
    expect(store.getSnapshot().dialogs).toContainEqual({
      kind: "new-chronicle",
    });
  });

  test("measures shortcut height independently of world renders and disconnects its observers on exit", () => {
    const originalObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      "ResizeObserver",
    );
    const instances: Array<{
      callback: ResizeObserverCallback;
      observe: jest.Mock;
      disconnect: jest.Mock;
    }> = [];
    class TestResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
      constructor(public callback: ResizeObserverCallback) {
        instances.push(this);
      }
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    });
    let height = 89.4;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const rect = originalRect.call(this);
        return this.classList.contains("map-shortcuts")
          ? ({ ...rect, height } as DOMRect)
          : rect;
      });
    const removed = jest.spyOn(window, "removeEventListener");
    try {
      const ui = render(
        <GameProvider store={store}>
          <MapPage />
        </GameProvider>,
      );
      const root = ui.container.querySelector<HTMLElement>(".react-map-page")!;
      const shortcuts = ui.getByRole("navigation", {
        name: "Быстрый доступ к активностям",
      });
      expect(root.style.getPropertyValue("--map-shortcuts-height")).toBe(
        "90px",
      );
      expect(instances).toHaveLength(1);
      expect(instances[0].observe).toHaveBeenCalledWith(shortcuts);
      height = 131.2;
      act(() =>
        instances[0].callback([], instances[0] as unknown as ResizeObserver),
      );
      expect(root.style.getPropertyValue("--map-shortcuts-height")).toBe(
        "132px",
      );
      act(() => store.publish());
      expect(instances).toHaveLength(1);
      ui.unmount();
      expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(root.style.getPropertyValue("--map-shortcuts-height")).toBe("");
    } finally {
      if (originalObserver)
        Object.defineProperty(globalThis, "ResizeObserver", originalObserver);
      else Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  });

  test("sticky offsets and anchor scrolling use measured navigation height and exclude the mobile header", () => {
    const stylesheet = readFileSync(
      "src/web/react/features/map/styles/components.css",
      "utf8",
    );
    expect(stylesheet).toContain(
      "--map-header-offset: var(--game-header-height, 76px)",
    );
    expect(stylesheet).toContain("var(--map-shortcuts-height, 86px)");
    expect(stylesheet).toContain("scroll-margin-top: var(--map-sidebar-top)");
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*820px\)[\s\S]*--map-header-offset:\s*0px/,
    );
    expect(stylesheet).not.toContain("230px");
  });
});
