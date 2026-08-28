import { act, cleanup, fireEvent, render } from "@testing-library/react/pure";
import { WorldGame } from "../src/gameplay/WorldGame";
import { baseTutorialSteps } from "../src/web/TutorialCatalog";
import { DialogVisibility } from "../src/web/react/components/common";
import { TutorialDialog } from "../src/web/react/dialogs/TutorialDialog";
import { GameProvider, useAppState } from "../src/web/react/state/GameContext";
import { GameStore } from "../src/web/react/state/GameStore";

jest.mock("../src/web/react/dialogs/tutorial-react.css", () => ({}));

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

describe("interactive React tutorial", () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  let dom: { window: Window & typeof globalThis };
  let store: GameStore;
  let game: WorldGame;
  let scroll: jest.SpyInstance;
  let cancelFrame: jest.SpyInstance;
  let disconnect: jest.SpyInstance;

  beforeEach(() => {
    const { JSDOM } = require("jsdom");
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/Game/#/shop",
      pretendToBeVisual: true,
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element,
      Node: dom.window.Node,
      MutationObserver: dom.window.MutationObserver,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    Object.entries(globals).forEach(([key, value]) => {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value,
        writable: true,
      });
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 440,
      writable: true,
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    jest
      .spyOn(dom.window.HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({
        top: 80,
        left: 20,
        right: 520,
        bottom: 180,
        width: 500,
        height: 100,
        x: 20,
        y: 80,
        toJSON: () => ({}),
      }));
    scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    cancelFrame = jest.spyOn(window, "cancelAnimationFrame");
    disconnect = jest.spyOn(
      dom.window.MutationObserver.prototype,
      "disconnect",
    );
    game = WorldGame.create("Ученик", "Knight", 130090);
    store = new GameStore(new MemoryStorage());
    store.attach(game);
    jest.spyOn(store, "persist").mockImplementation(() => undefined);
    store.setPage("shop");
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    store.dispose();
    jest.useRealTimers();
    jest.restoreAllMocks();
    dom.window.close();
    originals.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
    originals.clear();
  });

  function Shell({ onAction = () => undefined }: { onAction?: () => void }) {
    const state = useAppState();
    const tutorial = state.dialogs.find((dialog) => dialog.kind === "tutorial");
    return (
      <>
        <main id="app">
          <header className="game-header">
            <div className="hero-summary">
              <button type="button" onClick={onAction}>
                Действие героя
              </button>
            </div>
            <div className="resources">Ресурсы</div>
          </header>
          <nav className="main-nav">
            <button data-page="map">Карта</button>
          </nav>
          <p>{state.page}</p>
          <section id="hero-rivalries">Соперники</section>
          <section id="skill-tactics">Тактика</section>
        </main>
        {tutorial?.kind === "tutorial" && (
          <DialogVisibility.Provider
            value={state.dialogs[state.dialogs.length - 1]?.kind === "tutorial"}
          >
            <TutorialDialog {...tutorial} />
          </DialogVisibility.Provider>
        )}
      </>
    );
  }

  test("skipping restores the original page and scroll, marks completion and removes observers", () => {
    store.openDialog({ kind: "tutorial", firstVisit: true });
    const ui = render(
      <GameProvider store={store}>
        <Shell />
      </GameProvider>,
    );
    expect(store.getSnapshot().page).toBe("map");
    expect(document.body.style.overflow).toBe("");
    act(() => {
      jest.advanceTimersByTime(20);
    });
    fireEvent.click(ui.getByRole("button", { name: "Пропустить" }));
    expect(game.save.tutorialCompleted).toBe(true);
    expect(store.getSnapshot().dialogs).toEqual([]);
    expect(store.getSnapshot().page).toBe("shop");
    expect(window.location.hash).toBe("#/shop");
    expect(scroll).toHaveBeenLastCalledWith({ top: 440, behavior: "auto" });
    expect(disconnect).toHaveBeenCalled();
    expect(document.getElementById("tutorial-layer")).toBeNull();
  });

  test("real controls remain interactive and actions are acknowledged without advancing automatically", () => {
    store.openDialog({ kind: "tutorial" });
    const action = jest.fn();
    const ui = render(
      <GameProvider store={store}>
        <Shell onAction={action} />
      </GameProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(20);
    });
    fireEvent.click(ui.getByRole("button", { name: "Действие героя" }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(ui.getByText("ВЫ ПОПРОБОВАЛИ ЭТО ДЕЙСТВИЕ")).toBeTruthy();
    expect(ui.getByText("Это ваш герой")).toBeTruthy();
  });

  test("unopened features are omitted from the first-visit route", () => {
    store.openDialog({ kind: "tutorial" });
    const ui = render(
      <GameProvider store={store}>
        <Shell />
      </GameProvider>,
    );
    const expected = baseTutorialSteps.filter(
      (step) => !step.feature || game.isFeatureUnlocked(step.feature),
    );
    expect(document.getElementById("tutorial-progress")!.textContent).toBe(
      `1 / ${expected.length}`,
    );
    expect(
      expected.some(
        (step) => step.page === "contracts" || step.page === "legacy",
      ),
    ).toBe(false);
    fireEvent.click(ui.getByRole("button", { name: "Завершить обучение" }));
    expect(store.getSnapshot().dialogs).toHaveLength(0);
  });

  test("contextual tutorials can finish and remain acknowledged in a restored save", () => {
    store.openDialog({ kind: "tutorial", id: "adaptation" });
    const ui = render(
      <GameProvider store={store}>
        <Shell />
      </GameProvider>,
    );
    expect(ui.getByText("Соперник начал адаптацию")).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "Далее" }));
    expect(ui.getByText("Меняйте рисунок боя")).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "Понятно" }));
    expect(WorldGame.restore(game.save).hasSeenTutorial("adaptation")).toBe(
      true,
    );
    expect(store.getSnapshot().page).toBe("shop");
  });

  test("an overlaid battle hides the guide without losing its step and cancels scheduled positioning", () => {
    store.openDialog({ kind: "tutorial" });
    const ui = render(
      <GameProvider store={store}>
        <Shell />
      </GameProvider>,
    );
    fireEvent.click(ui.getByRole("button", { name: "Далее" }));
    expect(ui.getByText("Следите за ресурсами")).toBeTruthy();
    act(() => store.openDialog({ kind: "battle" }));
    expect(document.getElementById("tutorial-layer")).toBeNull();
    expect(cancelFrame).toHaveBeenCalled();
    act(() => store.closeDialog());
    expect(ui.getByText("Следите за ресурсами")).toBeTruthy();
    expect(document.getElementById("tutorial-progress")!.textContent).toMatch(
      /^2 \/ /,
    );
    const calls = disconnect.mock.calls.length;
    ui.unmount();
    expect(disconnect.mock.calls.length).toBeGreaterThan(calls);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(document.getElementById("tutorial-layer")).toBeNull();
  });
});
