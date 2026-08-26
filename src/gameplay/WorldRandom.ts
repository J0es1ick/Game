import { PersistentSeededRandom, RandomSnapshot, SeededRandom } from "./RandomSource";
import type { GameSave, WorldRandomSnapshots } from "./WorldTypes";

function normalizedSnapshot(value: Partial<RandomSnapshot> | undefined, fallback: RandomSnapshot): RandomSnapshot {
  const seed = Number.isFinite(value?.seed) ? Math.floor(value!.seed!) >>> 0 : fallback.seed;
  const state = Number.isFinite(value?.state) ? Math.floor(value!.state!) >>> 0 : fallback.state;
  const calls = Number.isFinite(value?.calls) ? Math.max(0, Math.floor(value!.calls!)) : fallback.calls;
  return { seed: seed || fallback.seed, state, calls };
}

export function createWorldRandomSnapshots(seed: number | string): WorldRandomSnapshots {
  return {
    world: new SeededRandom(`${seed}:world`).snapshot(),
    combat: new SeededRandom(`${seed}:combat`).snapshot(),
    loot: new SeededRandom(`${seed}:loot`).snapshot(),
  };
}

export function normalizeWorldRandomSnapshots(
  value: Partial<WorldRandomSnapshots> | undefined,
  seed: number | string,
): WorldRandomSnapshots {
  const fallback = createWorldRandomSnapshots(seed);
  return {
    world: normalizedSnapshot(value?.world, fallback.world),
    combat: normalizedSnapshot(value?.combat, fallback.combat),
    loot: normalizedSnapshot(value?.loot, fallback.loot),
  };
}

export class WorldRandomStreams {
  public readonly world: PersistentSeededRandom;
  public readonly combat: PersistentSeededRandom;
  public readonly loot: PersistentSeededRandom;

  public constructor(save: GameSave) {
    const seed = save.tournamentRuleSeed || save.hero.createdAt;
    save.randomSnapshots = normalizeWorldRandomSnapshots(save.randomSnapshots, seed);
    this.world = new PersistentSeededRandom(`${seed}:world`, save.randomSnapshots.world, (snapshot) => {
      save.randomSnapshots.world = snapshot;
    });
    this.combat = new PersistentSeededRandom(`${seed}:combat`, save.randomSnapshots.combat, (snapshot) => {
      save.randomSnapshots.combat = snapshot;
    });
    this.loot = new PersistentSeededRandom(`${seed}:loot`, save.randomSnapshots.loot, (snapshot) => {
      save.randomSnapshots.loot = snapshot;
    });
  }
}
