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
  public type = "";
  private parent: FakeElement | null = null;
  private readonly listeners = new Map<string, Array<() => void>>();

  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parent = this;
      this.children.push(child);
    });
  }

  setAttribute(): void {}

  addEventListener(type: string, callback: () => void): void {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], callback]);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.forEach((callback) => callback());
  }

  contains(node: FakeElement | null): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }

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
  banner: FakeElement;
  creation: FakeElement;
  newChronicle: FakeElement;
  focus: (element: FakeElement | null) => void;
}

function installDom(): WorldEffectsFixture {
  const body = new FakeElement();
  const stage = new FakeElement();
  const banner = new FakeElement();
  const creation = new FakeElement();
  const newChronicle = new FakeElement();
  creation.hidden = true;
  newChronicle.hidden = true;
  const elements = new Map<string, FakeElement>([
    ["#world-effect-stage", stage],
    ["#world-announcement-stage", banner],
    ["#creation-screen", creation],
    ["#new-chronicle-layer", newChronicle],
  ]);
  const fakeDocument = {
    body,
    activeElement: null as FakeElement | null,
    createElement: () => new FakeElement(),
    querySelector: (selector: string) => elements.get(selector) ?? null,
  };
  const fakeWindow = {
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  return { body, stage, banner, creation, newChronicle, focus: (element) => { fakeDocument.activeElement = element; } };
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

  it.each(["victory", "defeat"] as const)("shows %s above while equipment progresses in the corner", (variant) => {
    const { stage, banner } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");

    queueWorldEffect({ eyebrow: "НАСЛЕДИЕ", title: "Новая ступень", description: "+2 к атаке", duration: 3000 });
    queueWorldEffect({ variant, eyebrow: "АРЕНА", title: "Бой завершён", description: "Результат", duration: 1800 });

    expect(stage.children).toHaveLength(1);
    expect(banner.children).toHaveLength(1);
    expect(banner.children[0].className).toContain(`effect-${variant}`);
    jest.advanceTimersByTime(1800);
    expect(banner.children).toHaveLength(0);
    expect(stage.children).toHaveLength(1);
  });

  it("keeps only the latest pending battle result without dropping a season change", () => {
    const { banner } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    queueWorldEffect({ variant: "victory", eyebrow: "АРЕНА", title: "Первый бой", description: "", duration: 1000 });
    queueWorldEffect({ variant: "season", replaceKey: "season-world", eyebrow: "СЕЗОН", title: "Новый сезон", description: "", tone: "legendary", duration: 1000 });
    for (let index = 0; index < 20; index += 1) {
      queueWorldEffect({ variant: "victory", eyebrow: "АРЕНА", title: `Старый бой ${index}`, description: "", duration: 1000 });
    }
    queueWorldEffect({ variant: "defeat", eyebrow: "АРЕНА", title: "Последний бой", description: "", tone: "negative", duration: 1000 });

    jest.advanceTimersByTime(1060);
    expect(banner.children[0].children[1].children[1].textContent).toBe("Последний бой");
    jest.advanceTimersByTime(1060);
    expect(banner.children[0].children[1].children[1].textContent).toBe("Новый сезон");
    jest.advanceTimersByTime(1060);
    expect(banner.children).toHaveLength(0);
  });

  it("opens season changes using the action and dismisses the banner", () => {
    const { banner } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    const open = jest.fn();
    queueWorldEffect({ variant: "season", eyebrow: "СЕЗОН", title: "Зов глубин", description: "Награды выше", action: { label: "Узнать изменения", run: open }, duration: 7000 });
    const card = banner.children[0];
    const action = card.children[1].children[3];
    expect(action.textContent).toBe("Узнать изменения");

    action.dispatch("click");

    expect(open).toHaveBeenCalledTimes(1);
    expect(card.classList.contains("leaving")).toBe(true);
    jest.advanceTimersByTime(360);
    expect(banner.children).toHaveLength(0);
  });

  it("closes a banner without closing or interrupting corner notifications", () => {
    const { stage, banner } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    queueWorldEffect({ eyebrow: "НАСЛЕДИЕ", title: "Новая ступень", description: "", duration: 5000 });
    queueWorldEffect({ variant: "victory", eyebrow: "АРЕНА", title: "Победа", description: "", duration: 5000 });
    banner.children[0].children[2].dispatch("click");
    jest.advanceTimersByTime(360);
    expect(banner.children).toHaveLength(0);
    expect(stage.children).toHaveLength(1);
  });

  it("pauses a season notice while hovered or keyboard-focused", () => {
    const { banner, focus } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    queueWorldEffect({ variant: "season", eyebrow: "СЕЗОН", title: "Зов глубин", description: "", action: { label: "Узнать изменения", run: jest.fn() }, duration: 7000 });
    const card = banner.children[0];
    jest.advanceTimersByTime(500);
    card.dispatch("pointerenter");
    jest.advanceTimersByTime(10_000);
    expect(card.classList.contains("leaving")).toBe(false);

    focus(card.children[1].children[3]);
    card.dispatch("focusin");
    card.dispatch("pointerleave");
    jest.advanceTimersByTime(10_000);
    expect(card.classList.contains("leaving")).toBe(false);

    focus(null);
    card.dispatch("focusout");
    jest.advanceTimersByTime(6500);
    expect(banner.children).toHaveLength(0);
  });

  it("coalesces training spam independently of battle announcements", () => {
    const { stage, banner } = installDom();
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    for (let index = 0; index < 40; index += 1) {
      queueWorldEffect({
        eyebrow: "ТРЕНИРОВКА", title: "Тренировочный день", description: "", duration: 1700,
        aggregation: { key: "training", count: 1, totals: { experience: 100 }, format: (count, totals) => ({ title: `${count} дней`, description: `${totals.experience} опыта` }) },
      });
    }
    queueWorldEffect({ variant: "victory", eyebrow: "АРЕНА", title: "Победа", description: "", duration: 5000 });
    jest.advanceTimersByTime(1700);
    expect(stage.children[0].children[1].children[1].textContent).toBe("39 дней");
    expect(stage.children[0].children[1].children[2].textContent).toBe("3900 опыта");
    expect(banner.children).toHaveLength(1);
    jest.advanceTimersByTime(1700);
    expect(stage.children).toHaveLength(0);
    expect(banner.children).toHaveLength(1);
  });

  it("keeps only the newest pending announcement of each season type", () => {
    const { creation, banner } = installDom();
    creation.hidden = false;
    const { queueWorldEffect } = require("../src/web/WorldEffects") as typeof import("../src/web/WorldEffects");
    [2, 3, 4].forEach((number) => queueWorldEffect({ variant: "season", replaceKey: "season-world", eyebrow: "СЕЗОН", title: `Мир ${number}`, description: "", duration: 1700 }));
    queueWorldEffect({ variant: "season", replaceKey: "season-crown", eyebrow: "СЕЗОН", title: "Корона 5", description: "", duration: 1700 });
    expect(banner.children).toHaveLength(0);
    creation.hidden = true;
    jest.advanceTimersByTime(180);
    expect(banner.children[0].children[1].children[1].textContent).toBe("Мир 4");
    jest.advanceTimersByTime(1700);
    expect(banner.children[0].children[1].children[1].textContent).toBe("Корона 5");
    jest.advanceTimersByTime(1700);
    expect(banner.children).toHaveLength(0);
  });
});
