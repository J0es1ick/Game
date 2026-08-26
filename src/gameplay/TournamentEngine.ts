import type { RandomSource } from "./RandomSource";

export interface TournamentEntrant {
  id: string;
  name: string;
}

export interface TournamentEngineMatch<T extends TournamentEntrant, D = unknown> {
  round: number;
  match: number;
  first: T;
  second?: T;
  winner: T;
  detail?: D;
  bye: boolean;
}

export interface TournamentEngineReport<T extends TournamentEntrant, D = unknown> {
  champion: T;
  matches: Array<TournamentEngineMatch<T, D>>;
  rounds: number;
  initialSeeds: T[];
}

export interface TournamentEngineOptions {
  random?: RandomSource;
  seeded?: boolean;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function openingRound<T extends TournamentEntrant>(entrants: T[]): Array<[T, T?]> {
  const byeCount = nextPowerOfTwo(entrants.length) - entrants.length;
  if (byeCount <= 0) {
    const pairs: Array<[T, T?]> = [];
    for (let index = 0; index < entrants.length; index += 2) pairs.push([entrants[index], entrants[index + 1]]);
    return pairs;
  }
  const byes = entrants.slice(0, byeCount).map((entrant): [T, T?] => [entrant]);
  const playing = entrants.slice(byeCount);
  const matches: Array<[T, T?]> = [];
  for (let index = 0; index < playing.length / 2; index += 1) {
    matches.push([playing[index], playing[playing.length - 1 - index]]);
  }
  if (byes.length === 2) return [byes[0], ...matches, byes[1]];
  return [...byes, ...matches];
}

export class TournamentEngine {
  public static run<T extends TournamentEntrant, D = unknown>(
    participants: readonly T[],
    resolve: (first: T, second: T, round: number, match: number) => { winner: T; detail?: D },
    options: TournamentEngineOptions = {},
  ): TournamentEngineReport<T, D> {
    if (participants.length < 2) throw new RangeError("A tournament requires at least two participants.");
    const unique = new Set(participants.map((participant) => participant.id));
    if (unique.size !== participants.length) throw new Error("Tournament participant ids must be unique.");
    const initialSeeds = options.seeded || !options.random
      ? [...participants]
      : options.random.shuffle(participants);
    let currentPairs = openingRound(initialSeeds);
    const matches: Array<TournamentEngineMatch<T, D>> = [];
    let round = 1;

    while (currentPairs.length > 0) {
      const winners: T[] = [];
      currentPairs.forEach(([first, second], index) => {
        if (!second) {
          winners.push(first);
          matches.push({ round, match: index + 1, first, winner: first, bye: true });
          return;
        }
        const result = resolve(first, second, round, index + 1);
        if (result.winner.id !== first.id && result.winner.id !== second.id) {
          throw new Error("Match resolver returned a fighter who did not participate in the match.");
        }
        winners.push(result.winner);
        matches.push({ round, match: index + 1, first, second, winner: result.winner, detail: result.detail, bye: false });
      });
      if (winners.length === 1) return { champion: winners[0], matches, rounds: round, initialSeeds };
      currentPairs = [];
      for (let index = 0; index < winners.length; index += 2) currentPairs.push([winners[index], winners[index + 1]]);
      round += 1;
    }
    throw new Error("Tournament bracket did not produce a champion.");
  }
}
