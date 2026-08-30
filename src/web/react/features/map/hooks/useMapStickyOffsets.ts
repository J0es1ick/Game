import { useLayoutEffect, useRef } from "react";

export function useMapStickyOffsets() {
  const page = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = page.current;
    const navigation = shortcuts.current;
    if (!root || !navigation) return;
    let previousHeight = -1;

    const measure = () => {
      const height = Math.ceil(navigation.getBoundingClientRect().height);
      if (height === previousHeight) return;
      previousHeight = height;
      root.style.setProperty("--map-shortcuts-height", `${height}px`);
    };

    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(navigation);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--map-shortcuts-height");
    };
  }, []);

  return { page, shortcuts };
}
