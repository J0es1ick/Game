export function pendingOpeningRound(
  seedIds: string[],
): Array<[string, string?]> {
  const targetSize = 2 ** Math.ceil(Math.log2(seedIds.length));
  const byeCount = targetSize - seedIds.length;
  if (byeCount <= 0) {
    const pairs: Array<[string, string?]> = [];
    for (let index = 0; index < seedIds.length; index += 2)
      pairs.push([seedIds[index], seedIds[index + 1]]);
    return pairs;
  }
  const byes = seedIds.slice(0, byeCount).map((id): [string, string?] => [id]);
  const playing = seedIds.slice(byeCount);
  const matches: Array<[string, string?]> = [];
  for (let index = 0; index < playing.length / 2; index += 1)
    matches.push([playing[index], playing[playing.length - 1 - index]]);
  return byes.length === 2
    ? [byes[0], ...matches, byes[1]]
    : [...byes, ...matches];
}
