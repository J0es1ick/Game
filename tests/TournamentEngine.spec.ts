import { SeededRandom } from "../src/gameplay/RandomSource";
import { TournamentEngine } from "../src/gameplay/TournamentEngine";

describe("TournamentEngine", () => {
  const fighters = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `f-${index + 1}`, name: `F ${index + 1}`, power: count - index }));

  test("runs power-of-two brackets", () => {
    const report = TournamentEngine.run(fighters(16), (first, second) => ({ winner: first.power > second.power ? first : second }), { seeded: true });
    expect(report.champion.id).toBe("f-1");
    expect(report.matches.filter((match) => !match.bye)).toHaveLength(15);
    expect(report.rounds).toBe(4);
  });

  test("gives exactly two opening byes in a seeded 30-player league", () => {
    const report = TournamentEngine.run(fighters(30), (first, second) => ({ winner: first.power > second.power ? first : second }), { seeded: true });
    const byes = report.matches.filter((match) => match.bye);
    expect(byes.map((match) => match.first.id)).toEqual(["f-1", "f-2"]);
    expect(report.matches.filter((match) => !match.bye)).toHaveLength(29);
    const topSeedMeeting = report.matches.find((match) =>
      new Set([match.first.id, match.second?.id]).has("f-1")
      && new Set([match.first.id, match.second?.id]).has("f-2"));
    expect(topSeedMeeting?.round).toBe(report.rounds);
    expect(report.champion.id).toBe("f-1");
  });

  test("can reproducibly shuffle an unseeded tournament", () => {
    const run = () => TournamentEngine.run(fighters(8), (first) => ({ winner: first }), { random: new SeededRandom("bracket") });
    expect(run().initialSeeds.map((fighter) => fighter.id)).toEqual(run().initialSeeds.map((fighter) => fighter.id));
  });

  test("rejects invalid winners and duplicate entrants", () => {
    expect(() => TournamentEngine.run([{ id: "same", name: "A" }, { id: "same", name: "B" }], (first) => ({ winner: first }))).toThrow("unique");
    expect(() => TournamentEngine.run(fighters(2), () => ({ winner: { id: "outside", name: "Outside", power: 99 } }))).toThrow("did not participate");
  });
});
