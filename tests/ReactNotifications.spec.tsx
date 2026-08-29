import type { ReactNode } from "react";
import type { GameStore as Store } from "../src/web/react/state/GameStore";
import type { WorldEffectPresentation } from "../src/web/react/state/NotificationState";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));
jest.mock("../src/web/react/components/notifications-react.css", () => ({}));

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render, within } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { GameStore } =
  require("../src/web/react/state/GameStore") as typeof import("../src/web/react/state/GameStore");
const { GameProvider, useAppState } =
  require("../src/web/react/state/GameContext") as typeof import("../src/web/react/state/GameContext");
const { NotificationDeck, TournamentReminder } =
  require("../src/web/react/components/Notifications") as typeof import("../src/web/react/components/Notifications");
const { LootNotifications } =
  require("../src/web/react/battle/LootNotifications") as typeof import("../src/web/react/battle/LootNotifications");
const { BattleDialog } =
  require("../src/web/react/battle/BattleDialog") as typeof import("../src/web/react/battle/BattleDialog");
const { WorldGame } =
  require("../src/gameplay/WorldGame") as typeof import("../src/gameplay/WorldGame");
const { ARENAS } =
  require("../src/catalogs/WorldCatalog") as typeof import("../src/catalogs/WorldCatalog");
const { gameAudio } =
  require("../src/web/GameAudio") as typeof import("../src/web/GameAudio");
const { fitNoticeHeights } =
  require("../src/web/react/components/NotificationLayout") as typeof import("../src/web/react/components/NotificationLayout");

function NativeNotices() {
  const { dialogs } = useAppState();
  return (
    <>
      <NotificationDeck />
      <LootNotifications />
      <TournamentReminder />
      {dialogs.some((dialog) => dialog.kind === "battle") && <BattleDialog />}
    </>
  );
}

describe("native React notifications", () => {
  let store: Store;

  beforeEach(() => {
    environment.reset();
    jest.useFakeTimers();
    store = new GameStore(new ReactMemoryStorage());
    for (const method of [
      "event",
      "battleStart",
      "battleTurn",
      "battleResult",
    ] as const)
      jest.spyOn(gameAudio, method).mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    store.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  afterAll(() => environment.restore());

  function enterWorld() {
    const game = WorldGame.create("Проверка уведомлений", "Knight", 996201);
    game.save.tutorialCompleted = true;
    store.attach(game);
    store.chooseMode("world");
    return game;
  }

  function mount(children: ReactNode = <NotificationDeck />) {
    return render(<GameProvider store={store}>{children}</GameProvider>);
  }

  function notify(
    title: string,
    options: Partial<WorldEffectPresentation> = {},
  ) {
    act(() =>
      store.notify({
        eyebrow: "МИР",
        title,
        description: "",
        duration: 1000,
        ...options,
      }),
    );
  }

  function advance(milliseconds: number) {
    act(() => {
      jest.advanceTimersByTime(milliseconds);
    });
  }

  test.each(["victory", "defeat"] as const)(
    "shows %s separately from equipment progression without blocking the battle",
    (variant) => {
      const game = enterWorld();
      game.save.hero.combatMode = "manual";
      const pending = game.beginDuel();
      pending.session.nextActorId = "hero";
      store.openDialog({ kind: "battle" });
      const ui = mount(<NativeNotices />);
      notify("Наследие выросло", {
        duration: 3000,
        stats: ["+2 ATK"],
        sound: "reputation",
      });
      notify("Бой завершён", { variant });
      expect(ui.getByRole("dialog")).toBeTruthy();
      expect(document.body.classList.contains("battle-open")).toBe(true);
      expect(
        document.getElementById("world-effect-stage")!.textContent,
      ).toContain("Наследие выросло");
      expect(
        document
          .getElementById("world-announcement-stage")!
          .querySelector(`.effect-${variant}`),
      ).not.toBeNull();
      expect(gameAudio.event).toHaveBeenCalledWith("reputation");
      advance(1000);
      expect(ui.queryByText("Бой завершён")).toBeNull();
      expect(ui.getByText("Наследие выросло")).toBeTruthy();
      expect(game.currentPendingBattle()!.session.turns).toHaveLength(0);
    },
  );

  test("defers notices during character creation and keeps only the latest pending season of each kind", () => {
    store.chooseMode("world");
    const ui = mount();
    for (const number of [2, 3, 4])
      notify(`Мир ${number}`, {
        variant: "season",
        replaceKey: "season-world",
      });
    notify("Корона 5", { variant: "season", replaceKey: "season-crown" });
    advance(20_000);
    expect(ui.queryByText("Мир 4")).toBeNull();
    expect(store.getSnapshot().effects).toHaveLength(2);
    act(() => {
      enterWorld();
    });
    expect(ui.getByText("Мир 4")).toBeTruthy();
    advance(1000);
    expect(ui.getByText("Корона 5")).toBeTruthy();
    advance(1000);
    expect(store.getSnapshot().effects).toHaveLength(0);
  });

  test("waits for new chronicle configuration without expiring queued effects", () => {
    enterWorld();
    store.openDialog({ kind: "new-chronicle" });
    const ui = mount();
    notify("Изменение эпохи", { variant: "season" });
    advance(10_000);
    expect(ui.queryByText("Изменение эпохи")).toBeNull();
    act(() => store.closeDialog());
    expect(ui.getByText("Изменение эпохи")).toBeTruthy();
    advance(1000);
    expect(store.getSnapshot().effects).toHaveLength(0);
  });

  test("preserves the visible battle and prioritizes seasons ahead of the latest pending result", () => {
    enterWorld();
    const ui = mount();
    notify("Первый бой", { variant: "victory" });
    const active = ui.getByText("Первый бой").closest("article");
    notify("Новый сезон", {
      variant: "season",
      replaceKey: "season-world",
      tone: "legendary",
    });
    for (let index = 0; index < 40; index += 1)
      notify(`Бой ${index}`, { variant: "victory" });
    notify("Последний бой", { variant: "defeat", tone: "negative" });
    expect(ui.getByText("Первый бой").closest("article")).toBe(active);
    expect(store.getSnapshot().effects).toHaveLength(3);
    advance(1000);
    expect(ui.getByText("Новый сезон")).toBeTruthy();
    advance(1000);
    expect(ui.getByText("Последний бой")).toBeTruthy();
    advance(1000);
    expect(store.getSnapshot().effects).toHaveLength(0);
  });

  test("bounds both queues and retains urgent notices when ordinary messages are spammed", () => {
    enterWorld();
    const ui = mount();
    notify("Текущее действие");
    notify("Текущий бой", { variant: "victory" });
    notify("Важная ошибка", { tone: "negative" });
    for (let index = 0; index < 80; index += 1) {
      notify(`Действие ${index}`);
      notify(`Сезон ${index}`, {
        variant: "season",
        replaceKey: `season-${index}`,
      });
    }
    expect(store.getSnapshot().effects).toHaveLength(12);
    advance(1000);
    expect(ui.getByText("Важная ошибка")).toBeTruthy();
    for (let index = 0; index < 5; index += 1) advance(1000);
    expect(store.getSnapshot().effects).toHaveLength(0);
  });

  test("coalesces forty training actions without restarting the timer, sound or DOM", () => {
    enterWorld();
    const ui = mount();
    const training = (): WorldEffectPresentation => ({
      eyebrow: "ТРЕНИРОВКА",
      title: "Тренировочный день",
      description: "",
      duration: 1700,
      sound: "reputation",
      aggregation: {
        key: "training",
        count: 1,
        totals: { experience: 100 },
        format: (count, totals) => ({
          title: `${count} дней`,
          description: `${totals.experience} опыта`,
        }),
      },
    });
    act(() => store.notify(training()));
    const active = ui.getByText("Тренировочный день").closest("article");
    advance(700);
    act(() => {
      for (let index = 1; index < 40; index += 1) store.notify(training());
    });
    expect(ui.getByText("40 дней").closest("article")).toBe(active);
    expect(ui.getByText("4000 опыта")).toBeTruthy();
    expect(gameAudio.event).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().effects).toHaveLength(1);
    advance(1000);
    expect(store.getSnapshot().effects).toHaveLength(0);
  });

  test("pauses while either pointer or keyboard focus remains inside the card", () => {
    enterWorld();
    const ui = mount();
    notify("Пауза сезона", {
      variant: "season",
      duration: 7000,
      action: { label: "Узнать изменения", run: jest.fn() },
    });
    const card = ui.getByText("Пауза сезона").closest("article")!;
    const button = ui.getByRole("button", { name: "Узнать изменения" });
    advance(500);
    fireEvent.pointerEnter(card);
    fireEvent.focus(button);
    fireEvent.blur(button, { relatedTarget: document.body });
    advance(10_000);
    expect(card.isConnected).toBe(true);
    fireEvent.focus(button);
    fireEvent.pointerLeave(card);
    advance(10_000);
    expect(card.isConnected).toBe(true);
    fireEvent.blur(button, { relatedTarget: document.body });
    advance(6499);
    expect(card.isConnected).toBe(true);
    advance(1);
    expect(card.isConnected).toBe(false);
  });

  test("opens seasonal details and dismisses only its banner", () => {
    enterWorld();
    const ui = mount();
    const open = jest.fn();
    notify("Новая ступень", { duration: 5000 });
    notify("Зов глубин", {
      variant: "season",
      action: { label: "Узнать изменения", run: open },
    });
    fireEvent.click(ui.getByRole("button", { name: "Узнать изменения" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(ui.queryByText("Зов глубин")).toBeNull();
    expect(ui.getByText("Новая ступень")).toBeTruthy();
    notify("Победа", { variant: "victory" });
    fireEvent.click(
      within(document.getElementById("world-announcement-stage")!).getByRole(
        "button",
        { name: "Закрыть уведомление" },
      ),
    );
    expect(ui.queryByText("Победа")).toBeNull();
    expect(ui.getByText("Новая ступень")).toBeTruthy();
  });

  test("shows every dropped item after the battle and restores the tournament reminder after the loot queue", () => {
    const game = enterWorld();
    const arena = ARENAS[0];
    game.save.worldDay = game.registerTournament(arena.id);
    game.save.hero.combatMode = "manual";
    const pending = game.beginDuel();
    pending.session.nextActorId = "hero";
    const template = game.save.hero.inventory[0];
    const items = Array.from({ length: 6 }, (_, index) => ({
      ...template,
      id: `notice-loot-${index}`,
      name: `Уникальная находка ${index + 1}`,
    }));
    game.save.hero.inventory.push(...items);
    store.queueLoot([...items, items[0]]);
    store.queueLoot(items);
    expect(store.getSnapshot().loot).toHaveLength(6);
    store.openDialog({ kind: "battle" });
    const ui = mount(<NativeNotices />);
    notify("Оружие помнит победу", { duration: 15_000 });
    expect(ui.getByText("Оружие помнит победу")).toBeTruthy();
    expect(document.getElementById("loot-reminder")).toBeNull();
    advance(6000);
    expect(store.getSnapshot().loot).toHaveLength(6);
    act(() => store.closeDialog());
    expect(ui.getByText("Уникальная находка 1")).toBeTruthy();
    expect(document.getElementById("tournament-reminder")).toBeNull();
    fireEvent.mouseEnter(document.getElementById("loot-reminder")!);
    advance(6000);
    expect(ui.getByText("Уникальная находка 1")).toBeTruthy();
    fireEvent.mouseLeave(document.getElementById("loot-reminder")!);
    for (let index = 2; index <= 6; index += 1) {
      advance(5000);
      expect(ui.getByText(`Уникальная находка ${index}`)).toBeTruthy();
    }
    advance(5000);
    expect(store.getSnapshot().loot).toHaveLength(0);
    expect(document.getElementById("tournament-reminder")).not.toBeNull();
  });

  test("styles tournament controls independently of the application root", () => {
    const game = enterWorld();
    game.save.worldDay = game.registerTournament(ARENAS[0].id);
    const stylesheet = document.createElement("style");
    stylesheet.textContent = require("node:fs").readFileSync(
      require.resolve("../src/web/react/components/notifications-react.css"),
      "utf8",
    );
    document.head.append(stylesheet);
    try {
      const ui = mount(<TournamentReminder />);
      const panel = document.getElementById("tournament-reminder")!;
      const button = ui.getByRole("button", { name: "Начать" });
      expect(getComputedStyle(panel).position).toBe("fixed");
      expect(getComputedStyle(panel).backgroundColor).toBe(
        "rgb(240, 235, 220)",
      );
      expect(getComputedStyle(button).minHeight).toBe("40px");
      expect(getComputedStyle(button).fontSize).toBe("14px");
      expect(getComputedStyle(button).backgroundColor).toBe("rgb(147, 75, 57)");
      expect(
        getComputedStyle(panel.querySelector(".notice-tournament-row")!)
          .display,
      ).toBe("grid");
    } finally {
      stylesheet.remove();
    }
  });

  test.each([100, 248, 648, 1000])(
    "fits simultaneous notices into %i pixels without overlap",
    (available) => {
      const natural = { panel: 520, corner: 180, banner: 180 };
      const sizes = fitNoticeHeights(natural, available);
      expect(
        Object.values(sizes).reduce((sum, height) => sum + height, 0),
      ).toBeLessThanOrEqual(available);
      for (const slot of ["panel", "corner", "banner"] as const) {
        expect(sizes[slot]).toBeGreaterThan(0);
        expect(sizes[slot]).toBeLessThanOrEqual(natural[slot]);
      }
    },
  );

  test("stacks narrow-screen notices, remeasures the panel and cleans its observer", () => {
    const width = environment.window.innerWidth;
    const height = environment.window.innerHeight;
    const previousObserver = Object.getOwnPropertyDescriptor(
      environment.window,
      "ResizeObserver",
    );
    const root = document.documentElement;
    const previousTop = root.style.getPropertyValue("--announcement-top");
    let panelHeight = 260;
    let resize: () => void = () => undefined;
    const disconnect = jest.fn();
    const unobserve = jest.fn();
    const removeListener = jest.spyOn(
      environment.window,
      "removeEventListener",
    );
    class Observer {
      observe = jest.fn();
      unobserve = unobserve;
      disconnect = disconnect;
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver);
      }
    }
    Object.defineProperty(environment.window, "ResizeObserver", {
      configurable: true,
      value: Observer,
    });
    Object.defineProperty(environment.window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(environment.window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    root.style.setProperty("--announcement-top", "120px");
    jest
      .spyOn(environment.window.HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("react-notice-panel")
          ? panelHeight
          : this.classList.contains("react-event-notice")
            ? 140
            : 0;
      });
    try {
      const game = enterWorld();
      game.save.worldDay = game.registerTournament(ARENAS[0].id);
      const ui = mount(<NativeNotices />);
      notify("Наследие изменилось", { duration: 5000 });
      const corner = document.getElementById("world-effect-stage")!;
      const panel = document.getElementById("tournament-reminder")!;
      const card = ui.getByText("Наследие изменилось").closest("article");
      expect(corner.style.bottom).toBe("284px");
      panelHeight = 360;
      act(() => resize());
      advance(17);
      expect(corner.style.bottom).toBe("384px");
      expect(ui.getByText("Наследие изменилось").closest("article")).toBe(card);
      notify("Начался новый сезон", { variant: "season", duration: 5000 });
      Object.defineProperty(environment.window, "innerHeight", {
        configurable: true,
        value: 400,
      });
      fireEvent.resize(environment.window);
      advance(17);
      const banner = document.getElementById("world-announcement-stage")!;
      const limit = (element: HTMLElement) =>
        parseFloat(element.style.getPropertyValue("--notice-max-height"));
      const cornerBottom = parseFloat(corner.style.bottom);
      expect(cornerBottom).toBeGreaterThanOrEqual(
        parseFloat(panel.style.bottom) + limit(panel) + 10,
      );
      expect(400 - cornerBottom - limit(corner)).toBeGreaterThanOrEqual(
        parseFloat(banner.style.top) + limit(banner) + 10,
      );
      expect(limit(panel)).toBeLessThan(panelHeight);
      expect(store.getSnapshot().effects).toHaveLength(2);
      Object.defineProperty(environment.window, "innerWidth", {
        configurable: true,
        value: 1280,
      });
      fireEvent.resize(environment.window);
      advance(17);
      expect(corner.style.bottom).toBe("");
      expect(panel.style.getPropertyValue("--notice-max-height")).toBe("");
      ui.unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(unobserve).toHaveBeenCalledTimes(3);
      expect(removeListener).toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
      );
      expect(removeListener).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
      );
    } finally {
      Object.defineProperty(environment.window, "innerWidth", {
        configurable: true,
        value: width,
      });
      Object.defineProperty(environment.window, "innerHeight", {
        configurable: true,
        value: height,
      });
      if (previousObserver)
        Object.defineProperty(
          environment.window,
          "ResizeObserver",
          previousObserver,
        );
      else Reflect.deleteProperty(environment.window, "ResizeObserver");
      if (previousTop)
        root.style.setProperty("--announcement-top", previousTop);
      else root.style.removeProperty("--announcement-top");
    }
  });

  test("cleans active timers on unmount and ignores notices after disposal", () => {
    enterWorld();
    const ui = mount();
    notify("Сообщение в углу");
    notify("Сообщение сверху", { variant: "season" });
    const dismiss = jest.spyOn(store, "dismissEffect");
    ui.unmount();
    advance(10_000);
    expect(dismiss).not.toHaveBeenCalled();
    store.dispose();
    const snapshot = store.getSnapshot();
    store.notify({ eyebrow: "МИР", title: "Не показывать", description: "" });
    expect(store.getSnapshot()).toBe(snapshot);
  });
});
