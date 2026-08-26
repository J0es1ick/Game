class FakeClassList {
  private readonly values = new Set<string>();

  constructor(...values: string[]) {
    values.forEach((value) => this.values.add(value));
  }

  add(...values: string[]): void {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values: string[]): void {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class FakeElement {
  public readonly classList = new FakeClassList();
  public readonly children: FakeElement[] = [];
  public className = "";
  public hidden = false;
  public textContent: string | null = null;
  private parent: FakeElement | null = null;

  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parent = this;
      this.children.push(child);
    });
  }

  setAttribute(): void {}

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

interface WorldEffectsFixture {
  body: FakeElement;
  stage: FakeElement;
  creation: FakeElement;
  newChronicle: FakeElement;
}

function installDom(): WorldEffectsFixture {
  const body = new FakeElement();
  const stage = new FakeElement();
  const creation = new FakeElement();
  const newChronicle = new FakeElement();
  creation.hidden = true;
  newChronicle.hidden = true;
  const elements = new Map<string, FakeElement>([
    ["#world-effect-stage", stage],
    ["#creation-screen", creation],
    ["#new-chronicle-layer", newChronicle],
  ]);
  const fakeDocument = {
    body,
    createElement: () => new FakeElement(),
    querySelector: (selector: string) => elements.get(selector) ?? null,
  };
  const fakeWindow = {
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  return { body, stage, creation, newChronicle };
}

jest.mock("../src/web/GameAudio", () => ({
  gameAudio: { event: jest.fn() },
}));

describe("world effect playback", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as { document?: Document }).document;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: Window }).window;
  });

  it.each([
    ["battle overlay", ["ui-modal-open", "battle-open"]],
    ["loot reminder", ["loot-notification-open"]],
  ] as const)("starts during an open %s", (_context, bodyClasses) => {
    const { body, stage } = installDom();
    body.classList.add(...bodyClasses);
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");

    queueWorldEffect({
      eyebrow: "АРЕНА",
      title: "Победа",
      description: "Бой завершён.",
      sound: "reputation",
    });

    expect(stage.children).toHaveLength(1);
    expect(stage.children[0].children[1].children[1].textContent).toBe("Победа");
    const { gameAudio } = require("../src/web/GameAudio") as typeof import("../src/web/GameAudio");
    expect(gameAudio.event).toHaveBeenCalledWith("reputation");
  });

  it.each(["creation", "newChronicle"] as const)("waits while the %s flow is open", (blocker) => {
    const fixture = installDom();
    fixture.body.classList.add("ui-modal-open");
    fixture[blocker].hidden = false;
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");

    queueWorldEffect({ eyebrow: "МИР", title: "Изменение", description: "Эффект сохранён в очереди." });

    expect(fixture.stage.children).toHaveLength(0);
    fixture[blocker].hidden = true;
    jest.advanceTimersByTime(180);
    expect(fixture.stage.children).toHaveLength(1);
  });
});
