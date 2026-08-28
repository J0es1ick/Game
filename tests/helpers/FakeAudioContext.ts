class FakeAudioParam {
  value = 0;
  events: Array<{ value: number; time: number }> = [];

  setValueAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
  exponentialRampToValueAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
  setTargetAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
}

export class FakeAudioNode {
  readonly connections = new Set<FakeAudioNode>();
  disconnectCount = 0;

  constructor(readonly kind: string) {}
  connect(node: FakeAudioNode): FakeAudioNode { this.connections.add(node); return node; }
  disconnect(): void { this.disconnectCount += 1; this.connections.clear(); }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
  constructor() { super("gain"); }
}

class FakeFilterNode extends FakeAudioNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  constructor() { super("filter"); }
}

export class FakeAudioBuffer {
  private data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(): Float32Array { return this.data; }
}

export class FakeAudioSource extends FakeAudioNode {
  type = "sine";
  frequency = new FakeAudioParam();
  buffer: FakeAudioBuffer | null = null;
  startedBuffer: FakeAudioBuffer | null = null;
  onended: (() => void) | null = null;
  startedAt?: number;
  stoppedAt?: number;
  ended = false;

  constructor(readonly context: FakeAudioContext, kind: string) { super(kind); }
  start(when = this.context.currentTime): void {
    if (this.context.failStarts) throw new Error("Audio source unavailable");
    this.startedAt = when;
    this.startedBuffer = this.buffer;
    if (this.buffer) this.stoppedAt = when + this.buffer.duration;
    this.context.activeSources.add(this);
  }
  stop(when = this.context.currentTime): void {
    if (this.startedAt === undefined) throw new Error("Source not started");
    this.stoppedAt = when;
    if (when <= this.context.currentTime) this.finish();
  }
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.context.activeSources.delete(this);
    this.onended?.();
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: AudioContextState = "running";
  static initialSampleRate = 48000;
  static resumeBehavior: (context: FakeAudioContext) => Promise<void> = (context) => Promise.resolve().then(() => { context.state = "running"; });

  currentTime = 0;
  sampleRate = FakeAudioContext.initialSampleRate;
  state = FakeAudioContext.initialState;
  failStarts = false;
  destination = new FakeAudioNode("destination");
  nodes: FakeAudioNode[] = [];
  sources: FakeAudioSource[] = [];
  buffers: FakeAudioBuffer[] = [];
  activeSources = new Set<FakeAudioSource>();
  resumeCalls = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createGain(): FakeGainNode { const node = new FakeGainNode(); this.nodes.push(node); return node; }
  createBiquadFilter(): FakeFilterNode { const node = new FakeFilterNode(); this.nodes.push(node); return node; }
  createOscillator(): FakeAudioSource { return this.createSource("oscillator"); }
  createBufferSource(): FakeAudioSource { return this.createSource("buffer"); }
  createBuffer(channels: number, length: number, rate: number): FakeAudioBuffer {
    if (channels !== 1) throw new Error("Expected mono buffer");
    const buffer = new FakeAudioBuffer(length, rate); this.buffers.push(buffer); return buffer;
  }
  resume(): Promise<void> { this.resumeCalls += 1; return FakeAudioContext.resumeBehavior(this); }
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const source of this.activeSources) if ((source.stoppedAt ?? Infinity) <= this.currentTime) source.finish();
  }
  private createSource(kind: string): FakeAudioSource {
    const source = new FakeAudioSource(this, kind);
    this.nodes.push(source); this.sources.push(source); return source;
  }
  static reset(): void {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = "running";
    FakeAudioContext.initialSampleRate = 48000;
    FakeAudioContext.resumeBehavior = (context) => Promise.resolve().then(() => { context.state = "running"; });
  }
}
