export type UiPageRenderer<Page extends string> = (animate: boolean) => void;

/**
 * Keeps expensive pages lazy and makes invalidation explicit. A mutation can
 * invalidate several views without rebuilding any of them until they become
 * visible.
 */
export class DirtyPageRegistry<Page extends string> {
  private readonly dirty = new Set<Page>();

  constructor(private readonly renderers: Record<Page, UiPageRenderer<Page>>) {
    this.invalidate(...Object.keys(renderers) as Page[]);
  }

  invalidate(...pages: Page[]): void {
    pages.forEach((page) => this.dirty.add(page));
  }

  invalidateAll(): void {
    this.invalidate(...Object.keys(this.renderers) as Page[]);
  }

  isDirty(page: Page): boolean {
    return this.dirty.has(page);
  }

  render(page: Page, options: { force?: boolean; animate?: boolean } = {}): boolean {
    if (!options.force && !this.dirty.has(page)) return false;
    this.renderers[page](options.animate ?? true);
    this.dirty.delete(page);
    return true;
  }
}

export function pageHash(page: string): string {
  return `#/${encodeURIComponent(page)}`;
}

export function pageFromHash<Page extends string>(hash: string, pages: readonly Page[], fallback: Page): Page {
  const raw = hash.replace(/^#\/?/, "").split(/[?&]/, 1)[0];
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
  return pages.includes(decoded as Page) ? decoded as Page : fallback;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** A timeout whose remaining time survives hover/focus pauses. */
export class PausableTimeout {
  private handle: TimerHandle | null = null;
  private startedAt = 0;
  private remaining = 0;
  private callback: (() => void) | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly schedule: (callback: () => void, delay: number) => TimerHandle = (callback, delay) => setTimeout(callback, delay),
    private readonly unschedule: (handle: TimerHandle) => void = (handle) => clearTimeout(handle),
  ) {}

  start(callback: () => void, delay: number): void {
    this.cancel();
    this.callback = callback;
    this.remaining = Math.max(0, delay);
    this.resume();
  }

  pause(): void {
    if (this.handle === null) return;
    this.unschedule(this.handle);
    this.handle = null;
    this.remaining = Math.max(0, this.remaining - (this.now() - this.startedAt));
  }

  resume(): void {
    if (this.handle !== null || !this.callback) return;
    this.startedAt = this.now();
    const callback = this.callback;
    this.handle = this.schedule(() => {
      this.handle = null;
      this.callback = null;
      this.remaining = 0;
      callback();
    }, this.remaining);
  }

  cancel(): void {
    if (this.handle !== null) this.unschedule(this.handle);
    this.handle = null;
    this.callback = null;
    this.remaining = 0;
  }

  get paused(): boolean {
    return this.handle === null && this.callback !== null;
  }
}

export interface ModalOptions {
  initialFocus?: string | HTMLElement;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
  onRequestClose?: () => void;
  restoreFocus?: boolean;
}

interface OpenModal {
  layer: HTMLElement;
  options: ModalOptions;
  returnFocus: HTMLElement | null;
}

const focusableSelector = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Shared focus, Escape and background-lock behaviour for blocking dialogs. */
export class ModalController {
  private readonly stack: OpenModal[] = [];
  private readonly backgroundSelector = ".game-header, .main-nav, .game-shell, .basic-shell";

  constructor(private readonly document: Document) {
    document.addEventListener("keydown", (event) => this.onKeydown(event));
    document.addEventListener("click", (event) => this.onClick(event));
  }

  open(layer: HTMLElement, options: ModalOptions = {}): void {
    const existing = this.stack.findIndex((entry) => entry.layer === layer);
    if (existing >= 0) this.stack.splice(existing, 1);
    this.stack.push({
      layer,
      options,
      returnFocus: this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null,
    });
    layer.hidden = false;
    layer.setAttribute("aria-modal", "true");
    this.syncBackground();
    requestAnimationFrame(() => this.focusInitial(layer, options.initialFocus));
  }

  close(layer: HTMLElement, restoreFocus = true): void {
    const index = this.stack.findIndex((entry) => entry.layer === layer);
    if (index < 0) {
      layer.hidden = true;
      return;
    }
    const [entry] = this.stack.splice(index, 1);
    layer.hidden = true;
    layer.inert = false;
    layer.removeAttribute("aria-hidden");
    this.syncBackground();
    if (restoreFocus && entry.options.restoreFocus !== false) {
      requestAnimationFrame(() => {
        if (entry.returnFocus?.isConnected) entry.returnFocus.focus({ preventScroll: true });
      });
    }
  }

  isOpen(layer: HTMLElement): boolean {
    return this.stack.some((entry) => entry.layer === layer);
  }

  private top(): OpenModal | undefined {
    return this.stack[this.stack.length - 1];
  }

  private focusable(layer: HTMLElement): HTMLElement[] {
    return Array.from(layer.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.offsetParent !== null);
  }

  private focusInitial(layer: HTMLElement, requested?: string | HTMLElement): void {
    const candidate = typeof requested === "string" ? layer.querySelector<HTMLElement>(requested) : requested;
    const target = candidate ?? this.focusable(layer)[0] ?? layer;
    if (target === layer && !layer.hasAttribute("tabindex")) layer.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  private onClick(event: MouseEvent): void {
    const current = this.top();
    if (!current || event.target !== current.layer || !current.options.dismissOnBackdrop) return;
    current.options.onRequestClose?.();
  }

  private onKeydown(event: KeyboardEvent): void {
    const current = this.top();
    if (!current) return;
    if (event.key === "Escape") {
      if (current.options.dismissOnEscape !== false && current.options.onRequestClose) {
        event.preventDefault();
        current.options.onRequestClose();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = this.focusable(current.layer);
    if (!focusable.length) { event.preventDefault(); current.layer.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!current.layer.contains(this.document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  private syncBackground(): void {
    const locked = this.stack.length > 0;
    const top = this.top()?.layer;
    this.stack.forEach(({ layer }) => {
      const covered = layer !== top;
      layer.inert = covered;
      layer.setAttribute("aria-modal", String(!covered));
      if (covered) layer.setAttribute("aria-hidden", "true");
      else layer.removeAttribute("aria-hidden");
    });
    this.document.body.classList.toggle("ui-modal-open", locked);
    this.document.querySelectorAll<HTMLElement>(this.backgroundSelector).forEach((node) => {
      node.inert = locked;
      if (locked) node.setAttribute("aria-hidden", "true");
      else node.removeAttribute("aria-hidden");
    });
  }
}
