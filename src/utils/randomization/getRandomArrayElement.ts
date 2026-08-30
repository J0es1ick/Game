import { nativeRandom, RandomSource } from "../../gameplay/core/RandomSource";

export function getRandomArrayElement<T>(
  arr: readonly T[],
  random: RandomSource = nativeRandom,
): T | undefined {
  if (arr.length === 0) {
    return undefined;
  }
  const randomIndex: number = Math.floor(random.next() * arr.length);
  return arr[randomIndex];
}
