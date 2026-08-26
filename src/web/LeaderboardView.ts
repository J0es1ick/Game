type RankingSnapshot = Record<string, number>;

const observers = new Map<string, IntersectionObserver>();

function createMarker(className: string, text: string): HTMLSpanElement {
  const marker = document.createElement("span");
  marker.className = className;
  marker.textContent = text;
  return marker;
}

export interface EraVeteranBadgeCopy {
  text: string;
  label: string;
}

export function eraVeteranBadgeCopy(cycle: number | undefined): EraVeteranBadgeCopy | undefined {
  if (cycle === undefined || !Number.isInteger(cycle) || cycle < 1) return undefined;
  return {
    text: `эп. ${cycle}`,
    label: `Ветеран, перенесённый из эпохи ${cycle}`,
  };
}

export function appendEraVeteranBadge(
  nameCell: HTMLTableCellElement,
  cycle: number | undefined,
): HTMLSpanElement | undefined {
  const copy = eraVeteranBadgeCopy(cycle);
  if (!copy) return undefined;

  const badge = nameCell.ownerDocument.createElement("span");
  badge.className = "era-veteran-badge";
  badge.textContent = copy.text;
  badge.title = copy.label;
  badge.setAttribute("aria-label", copy.label);
  nameCell.append(badge);
  return badge;
}

export function loadRankingSnapshot(key: string): RankingSnapshot {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0));
  } catch {
    return {};
  }
}

export function saveRankingSnapshot(key: string, entries: Array<{ id: string }>): void {
  const snapshot = Object.fromEntries(entries.map((entry, index) => [entry.id, index + 1]));
  localStorage.setItem(key, JSON.stringify(snapshot));
}

export function markRankMovement(
  row: HTMLTableRowElement,
  nameCell: HTMLTableCellElement,
  previousRank: number | undefined,
  currentRank: number,
  hasSnapshot: boolean,
): void {
  if (!hasSnapshot) return;
  if (previousRank === undefined) {
    row.classList.add("rank-newcomer");
    const marker = createMarker("rank-change newcomer", "вошёл");
    marker.title = "Вошёл в отображаемую сотню с прошлого посещения";
    nameCell.append(marker);
    return;
  }

  const places = previousRank - currentRank;
  if (places === 0) return;
  const movedUp = places > 0;
  row.classList.add(movedUp ? "rank-moved-up" : "rank-moved-down");
  row.style.setProperty("--rank-offset", `${Math.max(-72, Math.min(72, places * 11))}px`);
  const marker = createMarker(`rank-change ${movedUp ? "up" : "down"}`, `${movedUp ? "↑" : "↓"}${Math.abs(places)}`);
  marker.title = `${movedUp ? "Поднялся" : "Опустился"} на ${Math.abs(places)} мест с прошлого посещения`;
  nameCell.append(marker);
}

export function observeLeaderboardRows(body: HTMLTableSectionElement): void {
  observers.get(body.id)?.disconnect();
  const rows = Array.from(body.querySelectorAll("tr"));
  rows.forEach((row) => row.classList.add("leader-row-awaiting"));
  if (!("IntersectionObserver" in window)) {
    rows.forEach((row) => row.classList.add("leader-row-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("leader-row-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

  rows.forEach((row) => observer.observe(row));
  observers.set(body.id, observer);
}
