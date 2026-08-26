import { nativeRandom, RandomSource } from "../../gameplay/RandomSource";

export function getRandomNumber(min: number, max: number, random: RandomSource = nativeRandom): number {
  if (min > max) {
    return -1;
  }
  if (min === max) {
    return min;
  }

  const range: number = max - min + 1;
  const randomNumber: number = Math.floor(random.next() * range) + min;

  return randomNumber;
}
