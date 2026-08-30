import { useLayoutEffect, useRef } from "react";

type NoticeSlot = "panel" | "corner" | "banner";
const slots: NoticeSlot[] = ["panel", "corner", "banner"];
const layouts = new WeakMap<Document, NotificationLayout>();

export function fitNoticeHeights(
  heights: Partial<Record<NoticeSlot, number>>,
  available: number,
): Partial<Record<NoticeSlot, number>> {
  const result: Partial<Record<NoticeSlot, number>> = {};
  let pending = slots.filter((slot) => (heights[slot] ?? 0) > 0);
  let remaining = Math.max(0, available);
  const weight = (slot: NoticeSlot) => (slot === "panel" ? 3 : 1);
  while (pending.length) {
    const totalWeight = pending.reduce((sum, slot) => sum + weight(slot), 0);
    const fitted = pending.filter(
      (slot) => heights[slot]! <= (remaining * weight(slot)) / totalWeight,
    );
    if (!fitted.length) {
      pending.forEach((slot) => {
        result[slot] = Math.floor((remaining * weight(slot)) / totalWeight);
      });
      break;
    }
    fitted.forEach((slot) => {
      result[slot] = heights[slot]!;
      remaining -= heights[slot]!;
    });
    pending = pending.filter((slot) => !fitted.includes(slot));
  }
  return result;
}

class NotificationLayout {
  private elements = new Map<NoticeSlot, HTMLElement>();
  private frame = 0;
  private observer: ResizeObserver | undefined;
  private readonly view: Window;

  constructor(private readonly document: Document) {
    this.view = document.defaultView!;
    const Observer = (
      this.view as Window & { ResizeObserver?: typeof ResizeObserver }
    ).ResizeObserver;
    if (Observer) this.observer = new Observer(this.schedule);
    this.view.addEventListener("resize", this.schedule);
    this.view.addEventListener("scroll", this.schedule, { passive: true });
    this.view.visualViewport?.addEventListener("resize", this.schedule);
  }

  private schedule = () => {
    if (!this.frame)
      this.frame = this.view.requestAnimationFrame(() => {
        this.frame = 0;
        this.update();
      });
  };

  private card(slot: NoticeSlot, element: HTMLElement): HTMLElement | null {
    return slot === "panel"
      ? element
      : element.querySelector<HTMLElement>(".react-event-notice");
  }

  private clear(element: HTMLElement): void {
    element.style.removeProperty("bottom");
    element.style.removeProperty("top");
    element.style.removeProperty("--notice-max-height");
  }

  private update(): void {
    const width = this.view.innerWidth;
    if (width > 1020) {
      this.elements.forEach((element) => this.clear(element));
      return;
    }
    const margin = width <= 620 ? 12 : 20;
    const gap = 10;
    const viewport = this.view.visualViewport?.height ?? this.view.innerHeight;
    const header = parseFloat(
      this.view
        .getComputedStyle(this.document.documentElement)
        .getPropertyValue("--announcement-top"),
    );
    const top = Math.max(
      margin,
      Math.min(
        Number.isFinite(header) ? header : width <= 620 ? 90 : 156,
        viewport - margin - 100,
      ),
    );
    const heights: Partial<Record<NoticeSlot, number>> = {};
    this.elements.forEach((element, slot) => {
      const card = this.card(slot, element);
      if (card)
        heights[slot] = Math.max(
          card.scrollHeight + 2,
          card.getBoundingClientRect().height,
        );
    });
    const count = Object.keys(heights).length;
    const limits = fitNoticeHeights(
      heights,
      viewport - top - margin - Math.max(0, count - 1) * gap,
    );
    this.elements.forEach((element, slot) => {
      const limit = `${limits[slot] ?? 0}px`;
      if (element.style.getPropertyValue("--notice-max-height") !== limit)
        element.style.setProperty("--notice-max-height", limit);
    });
    let bottom = margin;
    for (const slot of slots) {
      const element = this.elements.get(slot);
      if (!element) continue;
      const height = limits[slot] ?? 0;
      if (slot === "banner") {
        if (element.style.top !== `${top}px`) element.style.top = `${top}px`;
      } else {
        if (element.style.bottom !== `${bottom}px`)
          element.style.bottom = `${bottom}px`;
        bottom += height + gap;
      }
    }
  }

  register(slot: NoticeSlot, element: HTMLElement): () => void {
    this.elements.set(slot, element);
    this.observer?.observe(element);
    this.update();
    return () => {
      this.observer?.unobserve(element);
      this.clear(element);
      if (this.elements.get(slot) === element) this.elements.delete(slot);
      if (this.elements.size) this.update();
      else {
        this.observer?.disconnect();
        this.view.cancelAnimationFrame(this.frame);
        this.view.removeEventListener("resize", this.schedule);
        this.view.removeEventListener("scroll", this.schedule);
        this.view.visualViewport?.removeEventListener("resize", this.schedule);
        layouts.delete(this.document);
      }
    };
  }
}

export function useNoticeLayout<T extends HTMLElement>(
  slot: NoticeSlot,
  visible = true,
) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const document = ref.current.ownerDocument;
    let layout = layouts.get(document);
    if (!layout) {
      layout = new NotificationLayout(document);
      layouts.set(document, layout);
    }
    return layout.register(slot, ref.current);
  }, [slot, visible]);
  return ref;
}
