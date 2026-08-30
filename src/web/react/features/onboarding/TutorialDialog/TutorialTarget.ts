import { useEffect, useState, type RefObject } from "react";
import type { TutorialStep } from "./TutorialCatalog";

interface Spotlight {
  left: number;
  top: number;
  width: number;
  height: number;
}

function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element || element.closest('[hidden], [aria-hidden="true"]'))
    return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    element.getBoundingClientRect().width > 0
  );
}

function findTarget(step: TutorialStep): HTMLElement | null {
  const preferred = document.querySelector<HTMLElement>(step.target);
  if (visible(preferred)) return preferred;
  const navigation = document.querySelector<HTMLElement>(
    `.main-nav button[data-page="${step.page}"]`,
  );
  if (visible(navigation)) return navigation;
  const header = document.querySelector<HTMLElement>(".game-header");
  return visible(header) ? header : null;
}

export function useTutorialTarget(
  step: TutorialStep | undefined,
  page: string,
  active: boolean,
  panel: RefObject<HTMLElement | null>,
  onAction: () => void,
) {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  useEffect(() => {
    if (!active || !step) {
      setSpotlight(null);
      return;
    }
    let frame: number | null = null;
    let target: HTMLElement | null = null;
    let scrolled = false;
    let disposed = false;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => schedule());
    const measure = () => {
      frame = null;
      if (disposed) return;
      const next = findTarget(step);
      if (next !== target) {
        if (target) resizeObserver?.unobserve(target);
        target = next;
        if (target) resizeObserver?.observe(target);
      }
      if (!target) {
        setSpotlight(null);
        return;
      }
      if (!scrolled && page === step.page) {
        scrolled = true;
        if (target.closest(".main-nav"))
          target.scrollIntoView({
            behavior: "auto",
            block: "nearest",
            inline: "center",
          });
        else if (!target.closest(".game-header")) {
          const bounds = target.getBoundingClientRect();
          const navigation = document
            .querySelector<HTMLElement>(".main-nav")
            ?.getBoundingClientRect();
          const top = Math.max(
            16,
            Math.min(window.innerHeight * 0.32, navigation?.bottom ?? 16) + 16,
          );
          const cardTop =
            panel.current?.getBoundingClientRect().top ?? window.innerHeight;
          const usableBottom = Math.max(top + 72, cardTop - 20);
          const offset =
            top +
            Math.max(
              0,
              (usableBottom -
                top -
                Math.min(bounds.height, usableBottom - top)) /
                2,
            );
          window.scrollTo({
            top: Math.max(0, window.scrollY + bounds.top - offset),
            behavior: "auto",
          });
        }
      }
      const bounds = target.getBoundingClientRect();
      const left = Math.max(6, bounds.left - 8);
      const top = Math.max(6, bounds.top - 8);
      const right = Math.min(window.innerWidth - 6, bounds.right + 8);
      const bottom = Math.min(window.innerHeight - 6, bounds.bottom + 8);
      const nextSpotlight =
        right <= left || bottom <= top
          ? null
          : { left, top, width: right - left, height: bottom - top };
      setSpotlight((previous) =>
        previous?.left === nextSpotlight?.left &&
        previous?.top === nextSpotlight?.top &&
        previous?.width === nextSpotlight?.width &&
        previous?.height === nextSpotlight?.height
          ? previous
          : nextSpotlight,
      );
    };
    function schedule() {
      if (!disposed && frame === null)
        frame = window.requestAnimationFrame(measure);
    }
    const interaction = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      const control = element?.closest<HTMLElement>(
        'button, a, input, select, textarea, summary, [role="button"]',
      );
      if (
        !control ||
        control.closest("#tutorial-layer") ||
        control.hasAttribute("disabled")
      )
        return;
      if (target?.contains(control) || control === target) onAction();
    };
    const changes = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) ||
            !record.target.closest("#tutorial-layer"),
        )
      )
        schedule();
    });
    changes.observe(document.getElementById("app") ?? document.body, {
      childList: true,
      subtree: true,
    });
    if (panel.current) resizeObserver?.observe(panel.current);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    document.addEventListener("click", interaction, true);
    document.addEventListener("change", interaction, true);
    schedule();
    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      changes.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("click", interaction, true);
      document.removeEventListener("change", interaction, true);
    };
  }, [step, page, active, panel, onAction]);
  return spotlight;
}
