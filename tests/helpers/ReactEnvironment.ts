export class ReactMemoryStorage {
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

export function createReactEnvironment() {
  const { JSDOM } = require("jsdom");
  const dom: { window: Window & typeof globalThis } = new JSDOM(
    "<!doctype html><html><body></body></html>",
    {
      url: "http://localhost/Game/",
      pretendToBeVisual: true,
    },
  );
  Object.defineProperty(dom.window, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    location: dom.window.location,
    history: dom.window.history,
    localStorage: dom.window.localStorage,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    innerWidth: dom.window.innerWidth,
    innerHeight: dom.window.innerHeight,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  Object.entries(globals).forEach(([key, value]) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  });
  return {
    window: dom.window,
    reset() {
      dom.window.document.body.replaceChildren();
      dom.window.document.body.removeAttribute("style");
      dom.window.document.body.className = "";
      dom.window.history.replaceState(null, "", "/Game/");
      dom.window.localStorage.clear();
    },
    restore() {
      dom.window.close();
      originals.forEach((descriptor, key) => {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      });
    },
  };
}
