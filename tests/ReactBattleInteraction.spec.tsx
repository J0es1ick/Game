import { act, cleanup, fireEvent, render } from "@testing-library/react/pure";
import { WorldGame } from "../src/gameplay/WorldGame";
import { GameProvider } from "../src/web/react/state/GameContext";
import { GameStore } from "../src/web/react/state/GameStore";
import { BattleDialog } from "../src/web/react/battle/BattleDialog";
import { LootNotifications } from "../src/web/react/battle/LootNotifications";
import { BasicTournament } from "../src/web/react/basic/BasicTournament";
import { gameAudio } from "../src/web/GameAudio";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/basic/basic-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));

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
