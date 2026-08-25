export function getRandomArrayElement<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) {
    return undefined;
  }
  const randomIndex: number = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}
