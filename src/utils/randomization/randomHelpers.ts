import { nativeRandom, RandomSource } from "../../gameplay/RandomSource";

/**
 * Возвращает элемент случайной коллекции.
 *
 * В отличие от getRandomArrayElement эта функция предназначена для мест,
 * где непустая коллекция уже гарантирована доменной логикой.
 */
export function pickRandom<T>(items: readonly T[], random: RandomSource = nativeRandom): T {
  return random.pick(items);
}

/** Перемешивает копию коллекции алгоритмом Фишера — Йетса. */
export function shuffleArray<T>(items: readonly T[], random: RandomSource = nativeRandom): T[] {
  return random.shuffle(items);
}

/** Создаёт локальный идентификатор с прежним форматом игровых сущностей. */
export function createRandomId(prefix: string, randomLength = 7, random: RandomSource = nativeRandom, now = Date.now()): string {
  return `${prefix}-${now.toString(36)}-${random.next().toString(36).slice(2, 2 + randomLength)}`;
}
