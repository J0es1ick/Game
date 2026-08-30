type RankingSnapshot = Record<string, number>;

export interface EraVeteranBadgeCopy {
  text: string;
  label: string;
}

export function eraVeteranBadgeCopy(
  cycle: number | undefined,
  currentCycle?: number,
): EraVeteranBadgeCopy | undefined {
  if (cycle === undefined || !Number.isInteger(cycle) || cycle < 1)
    return undefined;
  const erasInService =
    currentCycle !== undefined &&
    Number.isInteger(currentCycle) &&
    currentCycle >= cycle
      ? currentCycle - cycle + 1
      : undefined;
  return {
    text: `эп. ${cycle}`,
    label:
      erasInService === undefined
        ? `Ветеран, перенесённый из эпохи ${cycle}`
        : `Ветеран из эпохи ${cycle} · эпох в строю: ${erasInService}`,
  };
}

export function loadRankingSnapshot(key: string): RankingSnapshot {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1]) &&
          entry[1] > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function saveRankingSnapshot(
  key: string,
  entries: Array<{ id: string }>,
): void {
  const snapshot = Object.fromEntries(
    entries.map((entry, index) => [entry.id, index + 1]),
  );
  localStorage.setItem(key, JSON.stringify(snapshot));
}
