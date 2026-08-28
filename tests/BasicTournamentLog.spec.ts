import {
  appendTournamentLog,
  BASIC_TOURNAMENT_LOG_LIMIT,
  type BasicLogEntry,
} from "../src/web/react/basic/BasicTournamentLog";

function entry(id: number): BasicLogEntry {
  return {
    id,
    time: "12:00:00",
    message: `Событие ${id}`,
    result: id % 10 === 0,
  };
}

describe("bounded basic tournament log", () => {
  test("keeps entries in newest-first order without changing existing objects or arrays", () => {
    const older = Object.freeze(entry(1));
    const previous = Object.freeze([older]);
    const newest = entry(2);
    const result = appendTournamentLog(previous, newest);
    expect(result).toEqual([newest, older]);
    expect(result[0]).toBe(newest);
    expect(result[1]).toBe(older);
    expect(previous).toEqual([older]);
  });

  test("never retains more than the last 3000 entries across repeated tournament-sized batches", () => {
    expect(BASIC_TOURNAMENT_LOG_LIMIT).toBe(3000);
    let logs: BasicLogEntry[] = [];
    const total = BASIC_TOURNAMENT_LOG_LIMIT * 4;
    for (let id = 1; id <= total; id += 1) {
      logs = appendTournamentLog(logs, entry(id));
      expect(logs.length).toBe(Math.min(id, BASIC_TOURNAMENT_LOG_LIMIT));
    }
    expect(logs.map((event) => event.id)).toEqual(
      Array.from(
        { length: BASIC_TOURNAMENT_LOG_LIMIT },
        (_, index) => total - index,
      ),
    );
    expect(
      logs.some((event) => event.id <= total - BASIC_TOURNAMENT_LOG_LIMIT),
    ).toBe(false);
    expect(logs[0].result).toBe(true);
  });

  test("restarts an explicitly cleared journal while preserving the next entry identity", () => {
    const next = entry(BASIC_TOURNAMENT_LOG_LIMIT + 1);
    const logs = appendTournamentLog([], next);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toBe(next);
  });
});
