import { act, cleanup, fireEvent, render } from "@testing-library/react/pure";
import { WorldGame } from "../src/gameplay/WorldGame";
import { ARENAS } from "../src/catalogs/WorldCatalog";
import { pendingBattleReport } from "../src/web/PendingBattleUi";
import { GameProvider } from "../src/web/react/state/GameContext";
import { GameStore } from "../src/web/react/state/GameStore";
import { BattleDialog } from "../src/web/react/battle/BattleDialog";
import { LootNotifications } from "../src/web/react/battle/LootNotifications";
import { BasicTournament } from "../src/web/react/basic/BasicTournament";
import { gameAudio } from "../src/web/GameAudio";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/basic/basic-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));
jest.mock("../src/web/react/components/notifications-react.css", () => ({}));

class MemoryStorage {
  private entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

describe("interactive React battle screens", () => {
  const original = new Map<string, PropertyDescriptor | undefined>();
  let dom: { window: Window & typeof globalThis };

  beforeEach(() => {
    const { JSDOM } = require("jsdom");
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/Game/",
      pretendToBeVisual: true,
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value(
        this: HTMLElement,
        options: ScrollToOptions | number,
        top?: number,
      ) {
        this.scrollTop =
          typeof options === "number"
            ? (top ?? this.scrollTop)
            : (options.top ?? this.scrollTop);
      },
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      Node: dom.window.Node,
      MutationObserver: dom.window.MutationObserver,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    Object.entries(globals).forEach(([key, value]) => {
      original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value,
        writable: true,
      });
    });
    jest.spyOn(gameAudio, "battleStart").mockImplementation(() => undefined);
    jest.spyOn(gameAudio, "battleTurn").mockImplementation(() => undefined);
    jest.spyOn(gameAudio, "basicTurn").mockImplementation(() => undefined);
    jest.spyOn(gameAudio, "battleResult").mockImplementation(() => undefined);
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    dom.window.close();
    original.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
    original.clear();
  });

  function storeFor(game: WorldGame): GameStore {
    const store = new GameStore(new MemoryStorage());
    store.attach(game);
    jest.spyOn(store, "persist").mockImplementation(() => undefined);
    jest.spyOn(store, "checkpoint").mockImplementation(() => undefined);
    return store;
  }

  test("manual actions keep the fighter DOM and checkpoint only the battle", () => {
    const game = WorldGame.create("Ручной ход", "Knight", 93201);
    game.save.hero.combatMode = "manual";
    const pending = game.beginDuel();
    pending.session.nextActorId = "hero";
    const store = storeFor(game);
    const step = jest.spyOn(game, "stepPendingBattle");
    const ui = render(
      <GameProvider store={store}>
        <BattleDialog />
      </GameProvider>,
    );
    const fighter = document.getElementById("battle-hero");
    fireEvent.click(ui.getByRole("button", { name: "Обычная атака" }));
    expect(step).toHaveBeenCalledWith({ type: "basic" });
    expect(store.checkpoint).toHaveBeenCalledTimes(1);
    expect(store.persist).not.toHaveBeenCalled();
    expect(document.getElementById("battle-hero")).toBe(fighter);
    expect(game.currentPendingBattle()!.session.turns).toHaveLength(1);
  });

  test("automatic playback cancels its scheduled turn when unmounted", () => {
    const game = WorldGame.create("Автобой", "Knight", 93202);
    game.beginDuel();
    const store = storeFor(game);
    const step = jest.spyOn(game, "stepPendingBattle");
    const ui = render(
      <GameProvider store={store}>
        <BattleDialog />
      </GameProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(step).toHaveBeenCalledTimes(1);
    ui.unmount();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(step).toHaveBeenCalledTimes(1);
  });

  test("battle results and the next round scroll only the modal body", () => {
    const game = WorldGame.create("Прокрутка итогов", "Knight", 93205);
    game.save.hero.combatMode = "manual";
    game.save.worldDay = game.registerTournament(ARENAS[0].id);
    const pending = game.beginTournament(ARENAS[0].id);
    const next = structuredClone(pending);
    next.id = `${pending.id}-next-round`;
    next.session.nextActorId = "hero";
    pending.session.winnerId = "hero";
    pending.session.enemy.health = 0;
    const battle = pendingBattleReport(pending);
    jest.spyOn(game, "finalizePendingBattle").mockImplementation(() => {
      game.save.pendingBattle = next;
      return { status: "next-battle", battle, pendingBattle: next };
    });
    const bounds = dom.window.HTMLElement.prototype.getBoundingClientRect;
    jest
      .spyOn(dom.window.HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("react-modal-body"))
          return {
            ...bounds.call(this),
            top: 100,
            bottom: 600,
            width: 800,
            height: 500,
          };
        if (this.id === "battle-result")
          return {
            ...bounds.call(this),
            top: 860,
            bottom: 1010,
            width: 800,
            height: 150,
          };
        return bounds.call(this);
      });
    const modalScroll = jest.spyOn(
      dom.window.HTMLElement.prototype,
      "scrollTo",
    );
    const pageScroll = jest
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 1180,
    });
    const store = storeFor(game);
    const ui = render(
      <GameProvider store={store}>
        <BattleDialog />
      </GameProvider>,
    );
    const viewport = document.querySelector<HTMLElement>(".react-modal-body")!;
    expect(ui.getByRole("button", { name: "Следующий бой" })).toBeTruthy();
    expect(modalScroll).toHaveBeenLastCalledWith({
      top: 760,
      behavior: "instant",
    });
    expect(viewport.scrollTop).toBe(760);
    expect(
      modalScroll.mock.contexts.every((element) => element === viewport),
    ).toBe(true);
    expect(pageScroll).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(1180);
    modalScroll.mockClear();
    fireEvent.click(ui.getByRole("button", { name: "Следующий бой" }));
    expect(document.querySelector(".react-modal-body")).toBe(viewport);
    expect(document.getElementById("battle-result")).toBeNull();
    expect(modalScroll).toHaveBeenCalledTimes(1);
    expect(modalScroll).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(modalScroll.mock.contexts[0]).toBe(viewport);
    expect(viewport.scrollTop).toBe(0);
    expect(pageScroll).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(1180);
    ui.unmount();
    store.dispose();
  });

  test("all six loot notifications appear in order and pause while hovered", () => {
    const game = WorldGame.create("Шесть находок", "Knight", 93203);
    const store = storeFor(game);
    const template = game.save.hero.inventory[0];
    const items = Array.from({ length: 6 }, (_, index) => ({
      ...template,
      id: `six-items-${index}`,
      name: `Находка ${index + 1}`,
    }));
    game.save.hero.inventory.push(...items);
    store.queueLoot(items);
    const ui = render(
      <GameProvider store={store}>
        <LootNotifications />
      </GameProvider>,
    );
    expect(ui.getByText("Находка 1")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(ui.getByText("Находка 2")).toBeTruthy();
    fireEvent.mouseEnter(document.getElementById("loot-reminder")!);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(ui.getByText("Находка 2")).toBeTruthy();
    fireEvent.mouseLeave(document.getElementById("loot-reminder")!);
    for (let expected = 3; expected <= 6; expected += 1) {
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(ui.getByText(`Находка ${expected}`)).toBeTruthy();
    }
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(store.getSnapshot().loot).toHaveLength(0);
    expect(document.getElementById("loot-reminder")).toBeNull();
  });

  test("basic tournament retains participant controls while stepping", () => {
    const ui = render(<BasicTournament onExit={() => undefined} />);
    fireEvent.click(ui.getByRole("button", { name: "Добавить" }));
    expect(document.querySelectorAll(".basic-roster-row")).toHaveLength(4);
    fireEvent.click(ui.getByRole("button", { name: "Начать турнир" }));
    const button = ui.getByRole("button", { name: "Выполнить ход" });
    fireEvent.click(button);
    expect(ui.getByRole("button", { name: "Выполнить ход" })).toBe(button);
    expect(document.getElementById("basic-trace")!.textContent).toContain(
      "Template Method",
    );
  });
});
