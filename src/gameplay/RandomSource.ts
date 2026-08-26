export interface RandomSnapshot {
  seed: number;
  state: number;
  calls: number;
}

export interface RandomSource {
  next(): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

function hashSeed(seed: number | string): number {
  const value = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export class SeededRandom implements RandomSource {
  private readonly initialSeed: number;
  private state: number;
  private callCount: number;

  public constructor(seed: number | string, snapshot?: Partial<RandomSnapshot>) {
    this.initialSeed = snapshot?.seed ?? hashSeed(seed);
    this.state = snapshot?.state ?? this.initialSeed;
    this.callCount = snapshot?.calls ?? 0;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.callCount += 1;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  public int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`Invalid integer range: ${min}..${max}`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public chance(probability: number): boolean {
    if (!Number.isFinite(probability)) return false;
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot pick from an empty collection.");
    return items[this.int(0, items.length - 1)];
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  public snapshot(): RandomSnapshot {
    return { seed: this.initialSeed, state: this.state, calls: this.callCount };
  }

  public fork(label: string): SeededRandom {
    return new SeededRandom(`${this.initialSeed}:${label}`);
  }
}

export class PersistentSeededRandom implements RandomSource {
  private readonly source: SeededRandom;

  public constructor(
    seed: number | string,
    snapshot: Partial<RandomSnapshot> | undefined,
    private readonly persist: (snapshot: RandomSnapshot) => void,
  ) {
    this.source = new SeededRandom(seed, snapshot);
    this.persist(this.source.snapshot());
  }

  public next(): number {
    const value = this.source.next();
    this.persist(this.source.snapshot());
    return value;
  }

  public int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`Invalid integer range: ${min}..${max}`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability <= 0) return false;
    if (probability >= 1) return true;
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot pick from an empty collection.");
    return items[this.int(0, items.length - 1)];
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }
}

export const nativeRandom: RandomSource = {
  next: () => Math.random(),
  int: (min, max) => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`Invalid integer range: ${min}..${max}`);
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  chance: (probability) => probability > 0 && (probability >= 1 || Math.random() < probability),
  pick: <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("Cannot pick from an empty collection.");
    return items[Math.floor(Math.random() * items.length)];
  },
  shuffle: <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  },
};
