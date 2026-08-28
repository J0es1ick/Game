import type { ReactNode } from "react";

interface RouteSectionProps {
  id: string;
  number: string;
  title: string;
  copy: string;
  className?: string;
  children: ReactNode;
}

export function RouteSection({
  id,
  number,
  title,
  copy,
  children,
  className = "",
}: RouteSectionProps) {
  return (
    <section
      className={`route-section ${className}`}
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <header>
        <span>{number}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{copy}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
