import { nativeRandom, RandomSource } from "../../gameplay/RandomSource";

export function pickRandom<T>(items: readonly T[], random: RandomSource = nativeRandom): T {
  return random.pick(items);
}

export function shuffleArray<T>(items: readonly T[], random: RandomSource = nativeRandom): T[] {
  return random.shuffle(items);
}

export function createRandomId(prefix: string, randomLength = 7, random: RandomSource = nativeRandom, now = Date.now()): string {
  return `${prefix}-${now.toString(36)}-${random.next().toString(36).slice(2, 2 + randomLength)}`;
}
