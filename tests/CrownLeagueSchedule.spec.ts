import { ARENAS } from "../src/catalogs/WorldCatalog";
import type { RandomSource } from "../src/gameplay/RandomSource";
import { WorldGame } from "../src/gameplay/WorldGame";
import type { EraLawId } from "../src/gameplay/WorldTypes";

const scheduleMigration = "crown-league-ten-day-schedule-v1";

interface CalendarSimulation {
  random: { world: RandomSource };
  simulateEliteDay(): void;
  simulateDailyWorld(): void;
  completeDay(): void;
}

function qualifiedGame(day = 1): WorldGame {
  const game = WorldGame.create("Календарь короны", "Knight", 1_800_000_000_000);
  game.save.worldDay = day;
  game.save.hero.level = 60;
  game.save.hero.highestArena = ARENAS.length - 1;
  game.save.hero.arenaWins[ARENAS.length - 1] = 1;
  game.save.eliteLeagueMemberIds = [...game.save.eliteLeagueMemberIds.slice(0, 29), "hero"];
  game.save.eliteRatings.hero = 4_000;
  return game;
}

function oldRegistration(day: number, registration: number, laws: EraLawId[] = []): WorldGame {
  const game = qualifiedGame(day);
  game.save.legacy.activeLawIds = laws;
  game.save.migrations = game.save.migrations!.filter((migration) => migration !== scheduleMigration);
  game.save.tournamentRegistrations["crown-league"] = registration;
  return game;
}

function restore(game: WorldGame): WorldGame {
  return WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
}

function crownTournaments(game: WorldGame) {
  return game.save.events.filter((event) => event.payload?.kind === "tournament"
    && event.payload.tournamentId === "crown-league");
}

afterEach(() => jest.restoreAllMocks());

describe("Crown League calendar", () => {
  test.each([
    { name: "regular", laws: [] as EraLawId[], interval: 10 },
    { name: "crown discord", laws: ["crown-discord"] as EraLawId[], interval: 8 },
  ])("uses the $name interval independently of the final arena", ({ laws, interval }) => {
    const game = qualifiedGame();
    game.save.legacy.activeLawIds = laws;
    expect(game.crownLeagueInterval()).toBe(interval);

    for (const day of [1, interval - 1, interval, interval + 1, interval * 2, 101]) {
      game.save.worldDay = day;
      const nextDay = game.nextCrownLeagueDay();
      expect(nextDay).toBe((Math.floor(day / interval) + 1) * interval);
      expect(nextDay - day).toBeGreaterThan(0);
      expect(nextDay - day).toBeLessThanOrEqual(interval);
      const finalArena = ARENAS[ARENAS.length - 1];
      expect(game.nextTournamentDay(finalArena.id)).toBe((Math.floor(day / finalArena.tournamentInterval) + 1) * finalArena.tournamentInterval);
    }
  });

  test("still requires qualification and advance registration", () => {
    const unqualified = WorldGame.create("Новичок", "Knight", 1_001);
    expect(unqualified.crownLeagueRegistrationAvailability().unlocked).toBe(false);
    expect(() => unqualified.registerCrownLeague()).toThrow("Сначала станьте чемпионом");

    const game = qualifiedGame(15);
    expect(game.crownLeagueAvailability()).toMatchObject({ unlocked: false });
    expect(game.crownLeagueRegistrationAvailability().reason).toContain("день 20");
    expect(game.registerCrownLeague()).toBe(20);
    const eventCount = game.save.events.length;
    expect(game.registerCrownLeague()).toBe(20);
    expect(game.save.events).toHaveLength(eventCount);

    game.save.worldDay = 19;
    expect(game.crownLeagueAvailability().reason).toContain("до события 1 дн.");
    game.save.worldDay = 20;
    expect(game.registeredCrownLeagueDay()).toBe(game.save.worldDay);
    expect(game.crownLeagueAvailability()).toMatchObject({ unlocked: true });
    expect(game.crownLeagueRegistrationAvailability().unlocked).toBe(false);
  });

  test.each([
    { day: 1, oldDay: 30, newDay: 10, laws: [] as EraLawId[] },
    { day: 15, oldDay: 30, newDay: 20, laws: [] as EraLawId[] },
    { day: 30, oldDay: 60, newDay: 40, laws: [] as EraLawId[] },
    { day: 1, oldDay: 23, newDay: 8, laws: ["crown-discord"] as EraLawId[] },
    { day: 25, oldDay: 46, newDay: 32, laws: ["crown-discord"] as EraLawId[] },
  ])("moves an old day-$oldDay booking to day $newDay when loading day $day", ({ day, oldDay, newDay, laws }) => {
    const source = oldRegistration(day, oldDay, laws);
    source.save.tournamentRegistrations[ARENAS[0].id] = 60;
    const game = restore(source);

    expect(game.registeredCrownLeagueDay()).toBe(newDay);
    expect(game.registerCrownLeague()).toBe(newDay);
    expect(game.save.tournamentRegistrations[ARENAS[0].id]).toBe(60);
    expect(game.crownLeagueAvailability().reason).toContain(`записаны на день ${newDay}`);
    expect(source.registeredCrownLeagueDay()).toBe(oldDay);

    const loadedAgain = restore(game);
    expect(loadedAgain.registeredCrownLeagueDay()).toBe(newDay);
    expect(loadedAgain.save.migrations!.filter((migration) => migration === scheduleMigration)).toHaveLength(1);
    expect(loadedAgain.save.events.filter((event) => event.message.includes("Запись в Лигу короны перенесена"))).toHaveLength(1);

    loadedAgain.save.worldDay = newDay;
    expect(loadedAgain.registeredCrownLeagueDay()).toBe(loadedAgain.save.worldDay);
    expect(loadedAgain.crownLeagueAvailability().unlocked).toBe(true);
  });

  test("preserves today's and sooner legacy bookings instead of delaying them", () => {
    const today = restore(oldRegistration(23, 23, ["crown-discord"]));
    expect(today.registeredCrownLeagueDay()).toBe(23);
    expect(today.crownLeagueAvailability().unlocked).toBe(true);

    const sooner = restore(oldRegistration(20, 23, ["crown-discord"]));
    expect(sooner.nextCrownLeagueDay()).toBe(24);
    expect(sooner.registeredCrownLeagueDay()).toBe(23);
    expect(sooner.registerCrownLeague()).toBe(23);
  });

  test("does not create bookings or revive missed ones during migration", () => {
    const noBooking = oldRegistration(15, 30);
    delete noBooking.save.tournamentRegistrations["crown-league"];
    expect(restore(noBooking).registeredCrownLeagueDay()).toBeUndefined();

    const missed = restore(oldRegistration(24, 23, ["crown-discord"]));
    expect(missed.crownLeagueAvailability().unlocked).toBe(false);
    expect(missed.crownLeagueRegistrationAvailability().unlocked).toBe(true);
    expect(missed.registerCrownLeague()).toBe(32);
  });

  test("keeps an unfinished legacy tournament and its opponent intact", () => {
    const game = oldRegistration(23, 23, ["crown-discord"]);
    game.beginCrownLeague();
    game.stepPendingBattle({ type: "basic" });
    const before = JSON.parse(JSON.stringify(game.currentPendingBattle()));
    const loaded = restore(game);

    expect(loaded.registeredCrownLeagueDay()).toBe(23);
    expect(loaded.currentPendingBattle()).toEqual(before);
    const result = loaded.runPendingBattleAutomatically();
    expect(result && "matches" in result).toBe(true);
    expect(loaded.save.worldDay).toBe(24);
    expect(loaded.save.lastCrownLeagueDay).toBe(23);
    expect(loaded.registeredCrownLeagueDay()).toBeUndefined();
  });

  test("uses the calendar after a completed off-cycle legacy tournament", () => {
    const game = qualifiedGame(23);
    game.save.legacy.activeLawIds = ["crown-discord"];
    game.save.lastCrownLeagueDay = 23;
    expect(game.crownLeagueAvailability()).toEqual({
      unlocked: false,
      reason: "Сегодняшняя Лига уже завершена. Следующая — в день 24.",
    });
  });

  test("retains the due-day booking for reminders and expires it on the following day", () => {
    const game = restore(oldRegistration(9, 30));
    const simulation = game as unknown as CalendarSimulation;
    jest.spyOn(simulation, "simulateDailyWorld").mockImplementation(() => undefined);

    simulation.completeDay();
    expect(game.save.worldDay).toBe(10);
    expect(game.registeredCrownLeagueDay()).toBe(game.save.worldDay);
    expect(game.crownLeagueAvailability().unlocked).toBe(true);

    simulation.completeDay();
    expect(game.save.worldDay).toBe(11);
    expect(game.registeredCrownLeagueDay()).toBeUndefined();
    expect(game.crownLeagueAvailability().unlocked).toBe(false);
    expect(game.save.events.some((event) => event.message.includes("пропустил запись на «Лига короны» в день 10"))).toBe(true);
  });

  test.each([
    { name: "regular", laws: [] as EraLawId[], interval: 10 },
    { name: "crown discord", laws: ["crown-discord"] as EraLawId[], interval: 8 },
  ])("runs NPC leagues once per $name calendar window", ({ laws, interval }) => {
    const game = qualifiedGame();
    game.save.legacy.activeLawIds = laws;
    const simulation = game as unknown as CalendarSimulation;
    jest.spyOn(simulation.random.world, "chance").mockReturnValue(false);

    game.save.worldDay = interval - 1;
    simulation.simulateEliteDay();
    expect(crownTournaments(game)).toHaveLength(0);

    game.save.worldDay = interval;
    simulation.simulateEliteDay();
    expect(game.save.lastCrownLeagueDay).toBe(interval);
    expect(crownTournaments(game)).toHaveLength(1);
    simulation.simulateEliteDay();
    expect(crownTournaments(game)).toHaveLength(1);

    game.save.worldDay = interval * 2 - 1;
    simulation.simulateEliteDay();
    expect(crownTournaments(game)).toHaveLength(1);
    game.save.worldDay = interval * 2;
    simulation.simulateEliteDay();
    expect(game.save.lastCrownLeagueDay).toBe(interval * 2);
    expect(crownTournaments(game)).toHaveLength(2);
  });

  test("reserves the migrated player's tournament day instead of running an NPC league", () => {
    const game = restore(oldRegistration(9, 30));
    game.save.worldDay = 10;
    const simulation = game as unknown as CalendarSimulation;
    simulation.simulateEliteDay();

    expect(crownTournaments(game)).toHaveLength(0);
    expect(game.save.lastCrownLeagueDay).toBeUndefined();
    expect(game.registeredCrownLeagueDay()).toBe(10);
    expect(game.crownLeagueAvailability().unlocked).toBe(true);
  });
});
