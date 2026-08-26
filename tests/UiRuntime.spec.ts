import { DirtyPageRegistry, ModalController, PausableTimeout, pageFromHash, pageHash } from "../src/web/UiRuntime";
import { PriorityNotificationQueue } from "../src/web/NotificationCenter";

describe("UI runtime", () => {
  it("keeps hidden pages dirty until they are opened", () => {
    const rendered: string[] = [];
    const registry = new DirtyPageRegistry({
      map: (animate) => rendered.push(`map:${animate}`),
      inventory: (animate) => rendered.push(`inventory:${animate}`),
    });

    expect(registry.render("map", { animate: false })).toBe(true);
    expect(registry.render("map")).toBe(false);
    registry.invalidate("map", "inventory");
    expect(registry.render("map", { animate: false })).toBe(true);
    expect(registry.isDirty("inventory")).toBe(true);
    expect(rendered).toEqual(["map:false", "map:false"]);
  });

  it("creates and parses GitHub Pages-safe hash routes", () => {
    const pages = ["map", "inventory", "elite"] as const;
    expect(pageHash("inventory")).toBe("#/inventory");
    expect(pageFromHash("#/elite", pages, "map")).toBe("elite");
    expect(pageFromHash("#/unknown", pages, "map")).toBe("map");
  });

  it("pauses a countdown without losing its remaining duration", () => {
    let now = 0;
    let scheduled: (() => void) | null = null;
    let delay = 0;
    const timer = new PausableTimeout(
      () => now,
      (callback, timeout) => { scheduled = callback; delay = timeout; return 1 as unknown as ReturnType<typeof setTimeout>; },
      () => { scheduled = null; },
    );
    const done = jest.fn();
    timer.start(done, 5_000);
    expect(delay).toBe(5_000);
    now = 1_250;
    timer.pause();
    timer.resume();
    expect(delay).toBe(3_750);
    (scheduled as (() => void) | null)?.();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("opens screens that still carry the legacy hidden utility class", () => {
    const remove = jest.fn();
    const layer = {
      hidden: true,
      inert: false,
      classList: { remove },
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
      hasAttribute: jest.fn(() => true),
      focus: jest.fn(),
    } as unknown as HTMLElement;
    const documentStub = {
      activeElement: null,
      body: { classList: { toggle: jest.fn() } },
      addEventListener: jest.fn(),
      querySelectorAll: jest.fn(() => []),
    } as unknown as Document;
    const previousElement = globalThis.HTMLElement;
    const previousAnimationFrame = globalThis.requestAnimationFrame;
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: class HTMLElementStub {} });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: jest.fn(() => 1) });
    try {
      new ModalController(documentStub).open(layer);
      expect(remove).toHaveBeenCalledWith("hidden");
      expect(layer.hidden).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: previousElement });
      Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: previousAnimationFrame });
    }
  });
});

describe("notification priority", () => {
  it("shows urgent feedback first and preserves FIFO order for ties", () => {
    const queue = new PriorityNotificationQueue<string>();
    queue.enqueue({ id: "a", payload: "ordinary-a", priority: 10 });
    queue.enqueue({ id: "b", payload: "urgent", priority: 30 });
    queue.enqueue({ id: "c", payload: "ordinary-c", priority: 10 });
    expect(queue.take()?.payload).toBe("urgent");
    expect(queue.take()?.payload).toBe("ordinary-a");
    expect(queue.take()?.payload).toBe("ordinary-c");
  });
});
