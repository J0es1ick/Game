export function getRandomNumber(min: number, max: number): number {
  if (min > max) {
    return -1;
  }
  if (min === max) {
    return min;
  }

  const range = max - min + 1;
  const randomNumber = Math.floor(Math.random() * range) + min;

  return randomNumber;
}
