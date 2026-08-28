import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glossary } from "../../Glossary";

export function GlossaryProvider() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const tooltip = useRef<HTMLDivElement>(null);
  const id = useId();
  const term = target ? glossary[target.dataset.term ?? ""] : undefined;
  useEffect(() => {
    const enter = (event: Event) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-term]")
          : null;
      setTarget(
        element && glossary[element.dataset.term ?? ""] ? element : null,
      );
    };
    const hide = () => setTarget(null);
    document.addEventListener("pointerover", enter);
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("focusin", enter);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  useLayoutEffect(() => {
    if (!target || !term || !tooltip.current) return;
    const anchor = target.getBoundingClientRect(),
      box = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(
          innerWidth - box.width - 12,
          anchor.left + anchor.width / 2 - box.width / 2,
        ),
      ),
      top:
        anchor.bottom + box.height + 20 < innerHeight
          ? anchor.bottom + 10
          : Math.max(12, anchor.top - box.height - 10),
    });
    const described = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", id);
    return () => {
      if (described) target.setAttribute("aria-describedby", described);
      else target.removeAttribute("aria-describedby");
    };
  }, [target, term, id]);
  return term
    ? createPortal(
        <div
          ref={tooltip}
          id={id}
          className="term-tooltip"
          role="tooltip"
          style={{ ...position, width: "min(320px, calc(100vw - 24px))" }}
        >
          <strong>{term.title}</strong>
          <span>{term.description}</span>
        </div>,
        document.body,
      )
    : null;
}
