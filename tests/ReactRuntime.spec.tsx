import type { GameStore as Store } from "../src/web/react/app/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { GameProvider, useAppSelector, useGame } =
  require("../src/web/react/app/state/GameContext") as typeof import("../src/web/react/app/state/GameContext");
const { GameStore } =
  require("../src/web/react/app/state/GameStore") as typeof import("../src/web/react/app/state/GameStore");
const { WorldGame } =
  require("../src/gameplay/core/WorldGame") as typeof import("../src/gameplay/core/WorldGame");
const { PagedList, LazyDetails, Modal, DialogVisibility } =
  require("../src/web/react/shared/ui/common") as typeof import("../src/web/react/shared/ui/common");

describe("React update boundaries and long lists", () => {
  let store: Store;

  beforeEach(() => {
    environment.reset();
    store = new GameStore(new ReactMemoryStorage());
    store.attach(WorldGame.create("Проверка обновлений", "Knight", 35482));
  });
  afterEach(() => {
    cleanup();
    store.dispose();
  });
  afterAll(() => environment.restore());

  test("notification changes do not render page or game subscribers", () => {
    const gameRenders = jest.fn(),
      pageRenders = jest.fn(),
      effectRenders = jest.fn();
    function GameObserver() {
      const { game } = useGame();
      gameRenders();
      return <p>{game.save.hero.name}</p>;
    }
    function PageObserver() {
      const page = useAppSelector((state) => state.page);
      pageRenders();
      return <p>{page}</p>;
    }
    function EffectObserver() {
      const effects = useAppSelector((state) => state.effects);
      effectRenders();
      return <p>{effects.length}</p>;
    }
    render(
      <GameProvider store={store}>
        <GameObserver />
        <PageObserver />
        <EffectObserver />
      </GameProvider>,
    );
    for (let index = 0; index < 60; index += 1) {
      act(() =>
        store.notify({
          eyebrow: "ПРОВЕРКА",
          title: `Событие ${index}`,
          description: "",
        }),
      );
    }
    expect(store.getSnapshot().effects).toHaveLength(6);
    expect(gameRenders).toHaveBeenCalledTimes(1);
    expect(pageRenders).toHaveBeenCalledTimes(1);
    expect(effectRenders.mock.calls.length).toBeGreaterThan(1);
    act(() => store.setPage("hero"));
    expect(pageRenders).toHaveBeenCalledTimes(2);
    expect(gameRenders).toHaveBeenCalledTimes(1);
    act(() => store.publish());
    expect(gameRenders).toHaveBeenCalledTimes(2);
    expect(pageRenders).toHaveBeenCalledTimes(2);
  });

  test("long chronicles mount only one page and build dossiers only when opened", () => {
    const details = jest.fn((name: string) => <p>История: {name}</p>);
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      name: `Боец ${index}`,
    }));
    const ui = render(
      <PagedList
        items={entries}
        getKey={(entry) => entry.id}
        className="test-list"
        render={(entry) => (
          <article>
            <strong>{entry.name}</strong>
            <LazyDetails summary={`Подробнее: ${entry.name}`}>
              {() => details(entry.name)}
            </LazyDetails>
          </article>
        )}
      />,
    );
    expect(ui.container.querySelectorAll(".test-list > article")).toHaveLength(
      30,
    );
    expect(details).not.toHaveBeenCalled();
    expect(ui.getByRole("region", { name: "Записи: 1000" }).tabIndex).toBe(0);
    const disclosure = ui.getByText("Подробнее: Боец 0").closest("details")!;
    act(() => {
      disclosure.open = true;
      fireEvent(disclosure, new environment.window.Event("toggle"));
    });
    expect(ui.getByText("История: Боец 0")).toBeTruthy();
    expect(details).toHaveBeenCalledTimes(1);
    fireEvent.click(ui.getByRole("button", { name: "Далее →" }));
    expect(ui.container.querySelectorAll(".test-list > article")).toHaveLength(
      30,
    );
    expect(ui.getByText("Боец 30")).toBeTruthy();
    expect(ui.queryByText("Боец 0")).toBeNull();
    expect(details).toHaveBeenCalledTimes(1);
  });

  test("stacked dialogs keep their controls and release body scroll on unmount", () => {
    const close = jest.fn();
    const content = (top: boolean) => (
      <>
        <DialogVisibility.Provider value={!top}>
          <Modal id="first" title="Выбор" onClose={close}>
            <input aria-label="Фильтр" defaultValue="меч" />
          </Modal>
        </DialogVisibility.Provider>
        {top && (
          <Modal id="second" title="Сравнение" onClose={close}>
            <p>Характеристики</p>
          </Modal>
        )}
      </>
    );
    const ui = render(content(false));
    const input = ui.getByRole("textbox", { name: "Фильтр" });
    expect(document.body.style.overflow).toBe("hidden");
    ui.rerender(content(true));
    expect(document.getElementById("first")?.hidden).toBe(true);
    expect(ui.getAllByRole("dialog")).toHaveLength(1);
    ui.rerender(content(false));
    expect(ui.getByRole("textbox", { name: "Фильтр" })).toBe(input);
    ui.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.classList.contains("ui-modal-open")).toBe(false);
  });

  test("keeps independently scrolled lists in place during game updates", () => {
    const entries = [{ id: "first" }, { id: "second" }];
    function Lists() {
      useGame();
      return (
        <>
          {["Реликвии", "Наставники"].map((label) => (
            <PagedList
              key={label}
              label={label}
              items={entries}
              getKey={(entry) => entry.id}
              render={(entry) => <p>{entry.id}</p>}
            />
          ))}
        </>
      );
    }
    const ui = render(
      <GameProvider store={store}>
        <Lists />
      </GameProvider>,
    );
    const relics = ui.getByRole("region", { name: "Реликвии: 2" });
    const mentors = ui.getByRole("region", { name: "Наставники: 2" });
    relics.scrollTop = 730;
    mentors.scrollTop = 240;
    act(() => store.publish());
    expect(ui.getByRole("region", { name: "Реликвии: 2" })).toBe(relics);
    expect(ui.getByRole("region", { name: "Наставники: 2" })).toBe(mentors);
    expect(relics.scrollTop).toBe(730);
    expect(mentors.scrollTop).toBe(240);
  });
});
