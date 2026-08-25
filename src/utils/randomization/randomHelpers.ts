/**
 * Возвращает элемент случайной коллекции.
 *
 * В отличие от getRandomArrayElement эта функция предназначена для мест,
 * где непустая коллекция уже гарантирована доменной логикой.
 */
export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Перемешивает копию коллекции алгоритмом Фишера — Йетса. */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Создаёт локальный идентификатор с прежним форматом игровых сущностей. */
export function createRandomId(prefix: string, randomLength = 7): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 2 + randomLength)}`;
}
