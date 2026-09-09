import type { RenderResult } from "@testing-library/react/pure";
import type { GameStore as GameStoreType } from "../src/web/react/app/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/features/battle/styles/components.css", () => ({}));
jest.mock("../src/web/react/features/basic/styles/components.css", () => ({}));
jest.mock(
  "../src/web/react/features/onboarding/TutorialDialog/TutorialDialog.css",
  () => ({}),
);
jest.mock(
  "../src/web/react/features/equipment/styles/components.css",
  () => ({}),
);
jest.mock("../src/web/react/app/Notifications/Notifications.css", () => ({}));
jest.mock("../src/web/react/features/map/styles/components.css", () => ({}));

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render, waitFor, within } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { App, AppErrorBoundary } =
  require("../src/web/react/app/App") as typeof import("../src/web/react/app/App");
const { GameProvider } =
  require("../src/web/react/app/state/GameContext") as typeof import("../src/web/react/app/state/GameContext");
const { GameStore } =
  require("../src/web/react/app/state/GameStore") as typeof import("../src/web/react/app/state/GameStore");
const { WorldGame } =
  require("../src/gameplay/core/WorldGame") as typeof import("../src/gameplay/core/WorldGame");
const { ARENAS } =
  require("../src/catalogs/WorldCatalog") as typeof import("../src/catalogs/WorldCatalog");
const { gameAudio } =
  require("../src/web/react/app/audio/GameAudio") as typeof import("../src/web/react/app/audio/GameAudio");

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

  function mapDirection(ui: RenderResult, name: string) {
    return within(
      ui.getByRole("navigation", { name: "Быстрый доступ к активностям" }),
    ).getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) });
  }

  test("settings apply immediately, preserve campaign progress and survive reload", async () => {
    const { game, ui } = await loadedWorld();
    const before = JSON.stringify(game.save);
    fireEvent.click(navButton(ui, "Настройки"));
    await ui.findByRole("heading", { name: "Настройки", level: 1 });
    fireEvent.change(ui.getByRole("combobox", { name: "Тема" }), {
      target: { value: "dark" },
    });
    fireEvent.click(ui.getByRole("checkbox", { name: "Меньше анимаций" }));
    fireEvent.click(
      ui.getByRole("checkbox", { name: "Начинать бой автоматически" }),
    );
    fireEvent.change(ui.getByRole("combobox", { name: "Скорость боя" }), {
      target: { value: "160" },
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.motion).toBe("reduced");
    expect(JSON.stringify(game.save)).toBe(before);
    fireEvent.change(ui.getByRole("combobox", { name: "Ведение боя" }), {
      target: { value: "manual" },
    });
    expect(game.save.hero.combatMode).toBe("manual");
    expect(
      within(ui.getByRole("main")).getByRole("button", {
        name: "Скачать сохранение",
      }),
    ).toBeTruthy();
    const restored = new GameStore(storage);
    expect(restored.preferences.getSnapshot()).toMatchObject({
      theme: "dark",
      reducedMotion: true,
      autoStartBattle: true,
      battleSpeed: 160,
    });
    restored.dispose();
  });

  test("opening settings pauses a live fight and returns to the same battle", async () => {
    const { game, ui } = await loadedWorld();
    fireEvent.click(ui.getByRole("button", { name: "Начать дуэль" }));
    const battle = await ui.findByRole("dialog");
    fireEvent.change(
      within(battle).getByRole("combobox", { name: "Скорость боя" }),
      { target: { value: "900" } },
    );
    fireEvent.click(
      within(battle).getByRole("button", { name: "Управлять вручную" }),
    );
    fireEvent.click(
      within(battle).getByRole("button", { name: "Настройки боя" }),
    );
    const settings = await ui.findByRole("dialog", { name: "Настройки" });
    const pendingId = game.currentPendingBattle()!.id;
    expect(
      (
        within(settings).getByRole("combobox", {
          name: "Скорость боя",
        }) as HTMLSelectElement
      ).value,
    ).toBe("900");
    expect(
      (
        within(settings).getByRole("combobox", {
          name: "Ведение боя",
        }) as HTMLSelectElement
      ).value,
    ).toBe("manual");
    fireEvent.change(
      within(settings).getByRole("combobox", { name: "Скорость боя" }),
      { target: { value: "160" } },
    );
    fireEvent.change(
      within(settings).getByRole("combobox", { name: "Ведение боя" }),
      { target: { value: "manual" } },
    );
    fireEvent.click(
      within(settings).getByRole("button", { name: "Вернуться к бою" }),
    );
    expect(game.currentPendingBattle()!.id).toBe(pendingId);
    expect(game.currentPendingBattle()!.session.turns).toHaveLength(0);
    expect(
      (
        within(battle).getByRole("combobox", {
          name: "Скорость боя",
        }) as HTMLSelectElement
      ).value,
    ).toBe("160");
    expect(
      within(battle).getByRole("button", { name: "Начать бой" }),
    ).toBeTruthy();
    expect(
      within(battle).getByRole("button", { name: "Включить автобой" }),
    ).toBeTruthy();
  });

  test("hero controls share their state between equipment pages and settings", async () => {
    const { game, ui } = await loadedWorld();
    fireEvent.click(navButton(ui, "Снаряжение"));
    const equipment = await ui.findByRole("checkbox", {
      name: "Автоматически надевать лучшее",
    });
    fireEvent.click(equipment);
    const autoEquip = game.save.hero.autoEquipBest;
    fireEvent.click(navButton(ui, "Навыки"));
    fireEvent.click(await ui.findByRole("button", { name: "Своя сборка" }));
    fireEvent.click(ui.getByRole("button", { name: "Вручную" }));
    fireEvent.click(navButton(ui, "Настройки"));
    expect(
      (
        (await ui.findByRole("checkbox", {
          name: "Автоматически надевать лучшее",
        })) as HTMLInputElement
      ).checked,
    ).toBe(autoEquip);
    const skills = ui.getByRole("checkbox", {
      name: "Автоматически подбирать навыки",
    }) as HTMLInputElement;
    expect(skills.checked).toBe(false);
    expect(
      (ui.getByRole("combobox", { name: "Ведение боя" }) as HTMLSelectElement)
        .value,
    ).toBe("manual");
    fireEvent.click(skills);
    fireEvent.click(
      ui.getByRole("checkbox", { name: "Автоматически надевать лучшее" }),
    );
    fireEvent.change(ui.getByRole("combobox", { name: "Ведение боя" }), {
      target: { value: "auto" },
    });
    fireEvent.click(navButton(ui, "Снаряжение"));
    expect(
      (
        (await ui.findByRole("checkbox", {
          name: "Автоматически надевать лучшее",
        })) as HTMLInputElement
      ).checked,
    ).toBe(!autoEquip);
    fireEvent.click(navButton(ui, "Навыки"));
    expect(
      (await ui.findByRole("button", { name: "Автоподбор" })).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      ui.getByRole("button", { name: "Автобой" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("the next goal follows due tournaments and changes to the elite endgame after the final championship", async () => {
    const { game, ui } = await loadedWorld();
    const goal = () =>
      within(ui.getByRole("region", { name: "Ближайшая цель" }));
    act(() =>
      store.act((current) => {
        current.save.hero.highestArena = 1;
        current.save.tournamentRegistrations[ARENAS[0].id] =
          current.save.worldDay;
      }),
    );
    expect(goal().getByRole("heading").textContent).toContain(
      `${ARENAS[0].name} — сегодня`,
    );
    fireEvent.click(goal().getByRole("button", { name: "К событию" }));
    expect(store.getSnapshot().navigation?.anchor).toBe("tournaments-section");
    act(() =>
      store.act((current) => {
        current.save.tournamentRegistrations = {};
        current.save.hero.highestArena = ARENAS.length - 1;
        current.save.hero.arenaWins[ARENAS.length - 1] = 1;
      }),
    );
    expect(goal().getByRole("heading").textContent).toBe(
      "Путь к вершине элиты",
    );
    fireEvent.click(goal().getByRole("button", { name: "К борьбе за Корону" }));
    expect(store.getSnapshot().navigation?.anchor).toBe("endgame-section");
    act(() =>
      store.act((current) => {
        current.save.hero.crownLeagueWins = 1;
        current.save.hero.legendDefenses = 1;
        current.save.eliteLeagueMemberIds = ["hero"];
      }),
    );
    expect(game.newGamePlusStatus().unlocked).toBe(true);
    expect(goal().getByRole("heading").textContent).toBe(
      "Эпоха готова к завершению",
    );
    fireEvent.click(goal().getByRole("button", { name: "Завершение эпохи" }));
    expect(
      store
        .getSnapshot()
        .dialogs.some((dialog) => dialog.kind === "new-chronicle"),
    ).toBe(true);
    await ui.findByRole("dialog", { name: "Начать новую летопись" });
  });

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
      ["Снаряжение", "Инвентарь"],
      ["Навыки", "Книга навыков"],
      ["Кузница", "Кузница"],
      ["Коллекции", "Коллекции и комплекты"],
      ["Лавка", "Лавка Ионы"],
      ["Рейтинги", "Сотня лучших бойцов"],
      ["Элита 30", "Тридцать бойцов элиты"],
      ["Мир", "Обзор мира"],
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
    expect(document.querySelector(".world-season")).toBeTruthy();
    fireEvent.click(navButton(ui, "Бойцы и школы"));
    await ui.findByRole("heading", { name: "Бойцы и школы", level: 1 });
    expect(document.querySelector(".world-activities")).toBeTruthy();
    fireEvent.click(navButton(ui, "Реликвии"));
    await ui.findByRole("heading", { name: "Реликвии и ветераны", level: 1 });
    expect(document.querySelector(".world-relics")).toBeTruthy();
    fireEvent.click(navButton(ui, "Архив эпох"));
    await ui.findByRole("heading", { name: "Архив эпох", level: 1 });
    expect(document.getElementById("epoch-history-view")).toBeTruthy();
    expect(document.getElementById("event-list")).toBeNull();
    expect(window.location.hash).toBe("#/history");
  }, 15000);

  test("training updates the world while retaining the selected map direction and control", async () => {
    const { game, ui } = await loadedWorld();
    const day = game.save.worldDay;
    const activity = document.getElementById("daily-actions-section");
    const button = ui.getByRole("button", { name: "Тренироваться" });
    button.focus();
    fireEvent.click(button);
    expect(game.save.worldDay).toBe(day + 1);
    expect(document.getElementById("daily-actions-section")).toBe(activity);
    expect(mapDirection(ui, "Дуэли").getAttribute("aria-pressed")).toBe("true");
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
    act(() => store.navigate("history", "epoch-history-view"));
    await ui.findByRole(
      "heading",
      { name: "Архив эпох", level: 1 },
      { timeout: 5000 },
    );
    await waitFor(() => expect(store.getSnapshot().navigation).toBeNull());
    const archive = document.getElementById("epoch-history-view");
    expect(archive).toBeTruthy();
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
    fireEvent.click(mapDirection(ui, "Турниры"));
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
