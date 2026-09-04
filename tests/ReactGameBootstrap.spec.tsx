import { createReactEnvironment } from "./helpers/ReactEnvironment";
import { MODE_KEY, SAVE_KEY } from "../src/web/react/app/state/StorageKeys";

jest.mock("../src/web/react/app/GameBootstrap/GameApplication", () => ({
  __esModule: true,
  default: jest.fn(({ initialMode }: { initialMode?: string }) =>
    require("react").createElement(
      "p",
      null,
      `runtime:${initialMode ?? "recovery"}`,
    ),
  ),
}));

const environment = createReactEnvironment();
const { cleanup, render, fireEvent } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { GameBootstrap } =
  require("../src/web/react/app/GameBootstrap/GameBootstrap") as typeof import("../src/web/react/app/GameBootstrap/GameBootstrap");
const runtime = require("../src/web/react/app/GameBootstrap/GameApplication")
  .default as jest.Mock;

describe("lightweight game startup", () => {
  beforeEach(() => {
    environment.reset();
    runtime.mockClear();
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });
  afterAll(() => environment.restore());

  test("does not mount the game runtime before an explicit choice", async () => {
    const ui = render(<GameBootstrap />);
    expect(ui.getByRole("heading", { name: "Выберите режим" })).toBeTruthy();
    expect(runtime).not.toHaveBeenCalled();
    fireEvent.click(ui.getByRole("button", { name: /Живой мир/ }));
    expect(await ui.findByText("runtime:world")).toBeTruthy();
  });

  test.each(["basic", "world"])(
    "resumes the remembered %s mode",
    async (mode) => {
      localStorage.setItem(MODE_KEY, mode);
      const ui = render(<GameBootstrap />);
      expect(await ui.findByText(`runtime:${mode}`)).toBeTruthy();
      expect(ui.queryByRole("heading", { name: "Выберите режим" })).toBeNull();
    },
  );

  test.each(["backup", "temporary"])(
    "recognizes a %s save without modifying it",
    (suffix) => {
      localStorage.setItem(`${SAVE_KEY}.${suffix}`, "preserved-save");
      const ui = render(<GameBootstrap />);
      expect(
        ui.getByRole("button", { name: /Продолжить летопись/ }),
      ).toBeTruthy();
      expect(localStorage.getItem(`${SAVE_KEY}.${suffix}`)).toBe(
        "preserved-save",
      );
      expect(runtime).not.toHaveBeenCalled();
    },
  );

  test("hands blocked storage to the runtime recovery flow", async () => {
    jest
      .spyOn(environment.window.Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
    const ui = render(<GameBootstrap />);
    expect(await ui.findByText("runtime:recovery")).toBeTruthy();
  });
});
