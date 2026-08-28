import { ARENAS } from "../src/catalogs/WorldCatalog";
import { TOURNAMENT_RULES } from "../src/catalogs/WorldExpansionCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import { SeededRandom } from "../src/gameplay/RandomSource";
import { createWorldSeason } from "../src/gameplay/WorldSeason";
import type { GameSave } from "../src/gameplay/WorldTypes";
import { currentWorldSeasonNotice, SeasonNoticeTracker } from "../src/web/SeasonNotices";

let initial: GameSave;
beforeAll(() => { initial = WorldGame.create("Хронист", "Knight", 15_300).save; });
function save(): GameSave { return structuredClone(initial); }

describe("season change announcements", () => {
  test("does not announce an existing season on first load or on every save", () => {
    const state = save();
    const tracker = new SeasonNoticeTracker();
    expect(tracker.collect(state)).toEqual([]);
    expect(tracker.collect(state)).toEqual([]);
    tracker.reset(state);
    state.worldDay += 1;
    expect(tracker.collect(state)).toEqual([]);
  });

  test("compares actual world modifiers and announces a season only once", () => {
    const state = save();
    state.worldSeason!.ruleId = "bloody-month";
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.worldSeason!.number += 1;
    state.worldSeason!.ruleId = "scarce-coin";
    state.worldSeason!.startsDay = 51;
    state.worldSeason!.endsDay = 101;

    const notices = tracker.collect(state);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "world", title: "Дефицит монеты", previousTitle: "Кровавый месяц", startsDay: 51, endsDay: 101 });
    expect(notices[0].changes).toEqual([
      { label: "Риск гибели на аренах", before: "+55%", after: "-10%" },
      { label: "Монетные выплаты", before: "Обычные условия", after: "-28%" },
      { label: "Награды данжей", before: "Обычные условия", after: "+15%" },
      { label: "Влияние побед на фракции", before: "+10%", after: "Обычные условия" },
      { label: "Опыт соперников", before: "Обычные условия", after: "Обычные условия" },
    ]);
    expect(tracker.collect(state)).toEqual([]);
  });

  test("reports the current conditions only when several seasons elapsed offline", () => {
    const state = save();
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.worldSeason = createWorldSeason(301, 7, new SeededRandom("offline-notice"));
    expect(tracker.collect(state)).toMatchObject([{ kind: "world", number: 7, startsDay: 301 }]);
  });

  test("does not mistake a new epoch or an imported save for a season transition", () => {
    const state = save();
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.legacy.cycle += 1;
    state.worldSeason!.number += 1;
    state.crownSeason.number += 1;
    expect(tracker.collect(state)).toEqual([]);
    const imported = save();
    imported.worldSeason!.number = 15;
    tracker.reset(imported);
    expect(tracker.collect(imported)).toEqual([]);
  });

  test("suppresses crown season notices before reaching the final arena", () => {
    const state = save();
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.crownSeason.number += 1;
    expect(tracker.collect(state)).toEqual([]);
    state.hero.highestArena = ARENAS.length - 1;
    expect(tracker.collect(state)).toEqual([]);
    state.crownSeason.number += 1;
    expect(tracker.collect(state)).toMatchObject([{ kind: "crown" }]);
  });

  test("compares added, removed and unchanged crown rules without retaining mutable arrays", () => {
    const state = save();
    state.hero.highestArena = ARENAS.length - 1;
    state.crownSeason.ruleIds = ["open-floor", "dry-ring"];
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.crownSeason.number += 1;
    state.crownSeason.ruleIds.splice(1, 1, "iron-oath");

    const [notice] = tracker.collect(state);
    const byName = (id: string) => notice.changes.find((line) => line.label === TOURNAMENT_RULES.find((rule) => rule.id === id)!.name);

    expect(byName("open-floor")).toMatchObject({ before: "Действует", after: "Действует" });
    expect(byName("dry-ring")).toMatchObject({ before: "Действует", after: "Не действует" });
    expect(byName("iron-oath")).toMatchObject({ before: "Не действует", after: "Действует" });
    expect(notice.changes).toHaveLength(3);
  });

  test("emits independent world and crown notices when both seasons change on the same day", () => {
    const state = save();
    state.hero.highestArena = ARENAS.length - 1;
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.worldSeason!.number += 1;
    state.crownSeason.number += 1;
    expect(tracker.collect(state).map((notice) => notice.kind)).toEqual(["world", "crown"]);
  });

  test("announces the world season after a real training day, before unlocking crown content", () => {
    const game = WorldGame.restore(save());
    game.save.worldSeason!.endsDay = game.save.worldDay;
    const previousTitle = currentWorldSeasonNotice(game.save)!.title;
    const tracker = new SeasonNoticeTracker();
    tracker.reset(game.save);

    game.train();

    expect(tracker.collect(game.save)).toMatchObject([{
      kind: "world", cycle: game.save.legacy.cycle, number: 2, startsDay: game.save.worldDay,
    }]);
    expect(tracker.collect(game.save)).toEqual([]);
    const notice = currentWorldSeasonNotice(game.save)!;
    expect(notice.previousTitle).toBe(previousTitle);
  });

  test("announces a world season crossed by the offline simulation", () => {
    const game = WorldGame.restore(save());
    game.save.worldSeason!.endsDay = game.save.worldDay;
    const tracker = new SeasonNoticeTracker();
    tracker.reset(game.save);

    expect(game.simulateElapsed(game.save.lastSimulatedAt + 600_000)).toBe(1);

    expect(tracker.collect(game.save)).toMatchObject([{ kind: "world", number: 2 }]);
  });

  test("allows reopening current world conditions without consuming a pending announcement", () => {
    const state = save();
    state.legacy.cycle = 3;
    state.worldSeason!.ruleId = "scarce-coin";
    const tracker = new SeasonNoticeTracker();
    tracker.reset(state);
    state.worldSeason!.number += 1;
    const before = JSON.stringify(state);

    const notice = currentWorldSeasonNotice(state)!;

    expect(notice).toMatchObject({ kind: "world", cycle: 3, number: 2, previousTitle: "Обычные условия" });
    expect(notice.changes.find((line) => line.label === "Монетные выплаты"))
      .toEqual({ label: "Монетные выплаты", before: "Обычные условия", after: "-28%" });
    expect(JSON.stringify(state)).toBe(before);
    expect(tracker.collect(state)).toMatchObject([{ kind: "world", cycle: 3, number: 2 }]);
  });

  test("does not invent world conditions before a legacy save has been migrated", () => {
    const state = save();
    delete state.worldSeason;
    expect(currentWorldSeasonNotice(state)).toBeUndefined();
  });
});
