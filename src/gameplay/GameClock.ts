export interface GameClock {
  now(): number;
}

export class SystemGameClock implements GameClock {
  public now(): number {
    return Date.now();
  }
}

export class FixedGameClock implements GameClock {
  public constructor(private timestamp: number) {}

  public now(): number {
    return this.timestamp;
  }

  public advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) throw new RangeError("Clock advance must be finite.");
    this.timestamp += milliseconds;
  }
}

