import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function css(
  values: Record<string, string | number | undefined>,
): CSSProperties {
  return values as CSSProperties;
}

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children && <div className="page-heading-copy">{children}</div>}
    </header>
  );
}

export function StatRow({
  label,
  value,
  term,
}: {
  label: string;
  value: ReactNode;
  term?: string;
}) {
  return (
    <div className="stat-row">
      <span data-term={term} tabIndex={term ? 0 : undefined}>
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-copy">{children}</p>;
}

let modalCount = 0;
let previousOverflow = "";
export const DialogVisibility = createContext(true);
export const useDialogActive = () => useContext(DialogVisibility);

export function Modal({
  id,
  title,
  eyebrow,
  onClose,
  children,
  className = "",
  footer,
  dismissible = true,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const active = useDialogActive();
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    if (modalCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    document.body.classList.add("ui-modal-open");
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (--modalCount === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.classList.remove("ui-modal-open");
      }
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      id={id}
      className={`react-modal-layer ${className}`}
      hidden={!active}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget)
          close.current();
      }}
    >
      <div
        className="react-modal-paper"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && dismissible) {
            event.stopPropagation();
            close.current();
          }
          if (event.key !== "Tab") return;
          const nodes = Array.from(
            panel.current!.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
            ),
          ).filter((node) => node.getClientRects().length);
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="react-modal-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          {dismissible && (
            <button
              type="button"
              className="plain-button modal-close"
              aria-label="Закрыть окно"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </header>
        <div className="react-modal-body">{children}</div>
        {footer && <footer className="react-modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function LazyDetails({
  summary,
  children,
  className = "",
  open: controlledOpen,
}: {
  summary: ReactNode;
  children: ReactNode | (() => ReactNode);
  className?: string;
  open?: boolean;
}) {
  const [open, setOpen] = useState(controlledOpen ?? false);
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      {open && (typeof children === "function" ? children() : children)}
    </details>
  );
}

export function PagedList<T>({
  items,
  render,
  getKey,
  pageSize = 30,
  className = "",
  empty = "Пока нет записей.",
  label = "Записи",
}: {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  pageSize?: number;
  className?: string;
  empty?: string;
  label?: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages - 1);
  const list = useRef<HTMLDivElement>(null);
  const move = (value: number) => {
    setPage(value);
    list.current?.scrollTo({ top: 0 });
  };
  return (
    <>
      <div
        className={className}
        ref={list}
        role="region"
        aria-label={`${label}: ${items.length}`}
        tabIndex={0}
      >
        {items.length ? (
          items
            .slice(current * pageSize, (current + 1) * pageSize)
            .map((item, index) => (
              <Fragment key={getKey(item)}>
                {render(item, current * pageSize + index)}
              </Fragment>
            ))
        ) : (
          <Empty>{empty}</Empty>
        )}
      </div>
      {pages > 1 && (
        <nav className="list-pagination" aria-label="Страницы списка">
          <button
            className="plain-button"
            disabled={current === 0}
            onClick={() => move(current - 1)}
          >
            ← Назад
          </button>
          <span>
            {current * pageSize + 1}–
            {Math.min(items.length, (current + 1) * pageSize)} из {items.length}
          </span>
          <button
            className="plain-button"
            disabled={current === pages - 1}
            onClick={() => move(current + 1)}
          >
            Далее →
          </button>
        </nav>
      )}
    </>
  );
}

export function Hint({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const id = useId();
  return (
    <span className="react-hint" tabIndex={0} aria-describedby={id}>
      {children}
      <span className="react-hint-body" id={id} role="tooltip">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </span>
  );
}

export function useVisibilityMotion() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !window.IntersectionObserver ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    element.classList.add("reveal-pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.remove("reveal-pending");
          element.classList.add("reveal-visible");
          observer.disconnect();
        }
      },
      { rootMargin: "20px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
