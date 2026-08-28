import type { GameSave } from "../src/gameplay/WorldTypes";
import type { GameStore as Store } from "../src/web/react/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/battle/battle-react.css", () => ({}));
jest.mock("../src/web/react/basic/basic-react.css", () => ({}));
jest.mock("../src/web/react/dialogs/tutorial-react.css", () => ({}));
jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));

const environment = createReactEnvironment();
const { act, cleanup, fireEvent, render, waitFor } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { App, AppErrorBoundary } =
  require("../src/web/react/App") as typeof import("../src/web/react/App");
const { GameProvider, useGame } =
  require("../src/web/react/state/GameContext") as typeof import("../src/web/react/state/GameContext");
const { GameStore } =
  require("../src/web/react/state/GameStore") as typeof import("../src/web/react/state/GameStore");
const { createBrowserStorage } =
  require("../src/web/react/state/BrowserStorage") as typeof import("../src/web/react/state/BrowserStorage");
const { SaveActions } =
  require("../src/web/react/components/Header") as typeof import("../src/web/react/components/Header");
const { SaveRecovery } =
  require("../src/web/react/components/ModeScreens") as typeof import("../src/web/react/components/ModeScreens");
const { WorldGame } =
  require("../src/gameplay/WorldGame") as typeof import("../src/gameplay/WorldGame");

describe("React recovery controls", () => {
  let initial: GameSave;
  let store: Store;
  let storage: ReactMemoryStorage;

  beforeAll(() => {
    initial = WorldGame.create("Исправный герой", "Knight", 20_978).save;
    initial.tutorialCompleted = true;
  });
  beforeEach(() => {
    environment.reset();
    storage = new ReactMemoryStorage();
    store = new GameStore(storage);
    jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    store.dispose();
    jest.restoreAllMocks();
  });
  afterAll(() => environment.restore());

  function gameFor(name: string) {
    const save = structuredClone(initial);
    save.hero.name = name;
    return WorldGame.restore(save);
  }

  function fileWithText(text: () => Promise<string>) {
    const file = new environment.window.File([], "hero.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: text });
    return file;
  }

  function CurrentGame() {
    const { game } = useGame();
    if (game.save.hero.name === "Сбой интерфейса")
      throw new Error("Broken visual data");
    return <h1>{game.save.hero.name}</h1>;
  }

  test("a valid recovery import releases a failed app boundary without a page reload", async () => {
    store.attach(gameFor("Сбой интерфейса"));
    const ui = render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <CurrentGame />
        </AppErrorBoundary>
      </GameProvider>,
    );
    expect(
      ui.getByRole("heading", { name: "Летопись требует восстановления" }),
    ).toBeTruthy();
    const importSave = jest.spyOn(store, "importSave");
    const file = fileWithText(async () =>
      JSON.stringify(gameFor("Восстановленный герой").save),
    );

    fireEvent.change(ui.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await ui.findByRole("heading", { name: "Восстановленный герой" });
    expect(importSave).toHaveBeenCalledWith(file);
    expect(
      ui.queryByRole("heading", { name: "Летопись требует восстановления" }),
    ).toBeNull();
    expect(store.repository.load()?.save.hero.name).toBe(
      "Восстановленный герой",
    );
    expect(window.location.hash).toBe("#/map");
  });

  test("a damaged file keeps the recovery controls visible and explains its own error", async () => {
    const game = gameFor("Сбой интерфейса");
    store.attach(game);
    const ui = render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <CurrentGame />
        </AppErrorBoundary>
      </GameProvider>,
    );
    const file = fileWithText(async () => "{invalid");

    fireEvent.change(ui.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(
        ui
          .getAllByRole("alert")
          .some((element) =>
            element.textContent?.includes("Файл не является корректным JSON"),
          ),
      ).toBe(true),
    );
    expect(
      ui.getByRole("heading", { name: "Летопись требует восстановления" }),
    ).toBeTruthy();
    expect(
      ui
        .getByRole("button", { name: "Загрузить из файла" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(store.game).toBe(game);
  });

  test("restoring a backup releases the error boundary and retains its pending encounter", () => {
    const previous = gameFor("Предыдущая летопись");
    previous.beginDuel();
    store.repository.save(previous.save);
    const broken = gameFor("Сбой интерфейса");
    store.repository.save(broken.save);
    store.attach(broken);
    const ui = render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <CurrentGame />
        </AppErrorBoundary>
      </GameProvider>,
    );

    fireEvent.click(
      ui.getByRole("button", { name: "Вернуть предыдущую копию" }),
    );

    expect(
      ui.getByRole("heading", { name: "Предыдущая летопись" }),
    ).toBeTruthy();
    expect(store.getSnapshot().dialogs).toEqual([{ kind: "battle" }]);
    expect(store.repository.load()?.save.pendingBattle?.id).toBe(
      previous.save.pendingBattle?.id,
    );
  });

  test("unmounting and disposing while a file is read prevents a late import and success notice", async () => {
    store.attach(gameFor("Текущая летопись"));
    let finish!: (content: string) => void;
    const text = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const importSave = jest.spyOn(store, "importSave");
    const ui = render(
      <GameProvider store={store}>
        <SaveActions />
      </GameProvider>,
    );
    fireEvent.change(ui.container.querySelector('input[type="file"]')!, {
      target: { files: [fileWithText(() => text)] },
    });
    expect(
      ui
        .getByRole("button", { name: "Проверяем файл…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const pending = importSave.mock.results[0].value as Promise<boolean>;
    ui.unmount();
    store.dispose();
    const notice = jest.spyOn(store, "notify");

    await act(async () => {
      finish(JSON.stringify(gameFor("Опоздавшая летопись").save));
      await expect(pending).resolves.toBe(false);
    });

    expect(store.game!.save.hero.name).toBe("Текущая летопись");
    expect(store.repository.load()?.save.hero.name).toBe("Текущая летопись");
    expect(notice).not.toHaveBeenCalled();
  });

  test("blocked storage cannot crash the recovery controls or hide an import failure", async () => {
    store.dispose();
    store = new GameStore({
      getItem: () => {
        throw new Error("Storage access denied");
      },
      setItem: () => {
        throw new Error("Storage access denied");
      },
      removeItem: () => {
        throw new Error("Storage access denied");
      },
    });
    const ui = render(
      <GameProvider store={store}>
        <SaveRecovery error="Хранилище недоступно" />
      </GameProvider>,
    );
    expect(
      ui
        .getByRole("button", { name: "Вернуть предыдущую копию" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const file = fileWithText(async () =>
      JSON.stringify(gameFor("Исправный файл").save),
    );

    fireEvent.change(ui.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(
        ui
          .getAllByRole("alert")
          .some((element) => element.textContent === "Storage access denied"),
      ).toBe(true),
    );
    expect(store.game).toBeNull();
    expect(
      ui
        .getByRole("button", { name: "Загрузить из файла" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  test("a denied window.localStorage getter reaches recovery instead of crashing before React mounts", async () => {
    store.dispose();
    const accessError = new environment.window.DOMException(
      "Storage access denied",
      "SecurityError",
    );
    const getter = jest
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw accessError;
      });
    const adapter = createBrowserStorage();
    store = new GameStore(adapter);
    expect(getter).not.toHaveBeenCalled();

    const ui = render(
      <GameProvider store={store}>
        <AppErrorBoundary store={store}>
          <App />
        </AppErrorBoundary>
      </GameProvider>,
    );

    await ui.findByRole("heading", { name: "Летопись требует восстановления" });
    expect(store.getSnapshot().mode).toBe("error");
    expect(ui.getByRole("alert").textContent).toContain("Данные не удалены");
    expect(
      ui
        .getByRole("button", { name: "Вернуть предыдущую копию" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(() => adapter.getItem("saved-progress")).toThrow(accessError);
    expect(() => adapter.setItem("saved-progress", "new-progress")).toThrow(
      accessError,
    );
    expect(store.game).toBeNull();
  });
});
