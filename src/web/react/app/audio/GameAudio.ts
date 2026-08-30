import { BattleTurn, HeroClass } from "../../../../gameplay/core/WorldTypes";

const STORAGE_KEY = "dust-and-crown-sound-muted";
const MAX_VOICES = 48;
const MAX_NOISE_BUFFERS = 12;
const NOISE_VARIANTS = 2;

export type InterfaceSound =
  "choice" | "forge" | "loot" | "reputation" | "training";

function storedMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = storedMuted();
  private resuming: AudioContext | null = null;
  private voices = new Map<AudioScheduledSourceNode, () => void>();
  private noiseBuffers = new Map<
    string,
    { buffers: AudioBuffer[]; next: number }
  >();

  public get isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(STORAGE_KEY, String(muted));
    } catch {}
    if (this.master && this.context && this.context.state !== "closed") {
      try {
        this.master.gain.setTargetAtTime(
          muted ? 0 : 0.32,
          this.context.currentTime,
          0.015,
        );
      } catch {}
    }
    if (muted) this.stopVoices();
    if (!muted) {
      this.ensureContext();
      this.tone(520, 0.06, "sine", 0.08);
      this.tone(700, 0.08, "sine", 0.06, 0.045);
    }
  }

  public toggle(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public battleStart(monster = false): void {
    if (!this.ready()) return;
    this.noise(0.15, 240, 0.1);
    this.tone(96, 0.22, "sawtooth", 0.08);
    if (monster) this.monsterGrowl();
  }

  public battleTurn(
    turn: Pick<BattleTurn, "damage" | "healing" | "critical">,
    actorClass?: HeroClass,
  ): void {
    if (!this.ready()) return;
    if (turn.healing > 0) {
      this.tone(440, 0.16, "sine", 0.08);
      this.tone(660, 0.2, "sine", 0.06, 0.07);
    }
    if (turn.damage <= 0) {
      if (turn.healing <= 0) this.parry();
      return;
    }
    switch (actorClass) {
      case "Gunsmith":
        this.gunshot();
        break;
      case "Archer":
        this.arrow();
        break;
      case "Wizard":
        this.magicImpact();
        break;
      case "Monk":
        this.bodyImpact();
        break;
      default:
        this.bladeImpact();
        break;
    }
    if (turn.critical) {
      this.tone(980, 0.12, "square", 0.045, 0.025);
      this.noise(0.09, 1900, 0.07, 0.015);
    }
  }

  public basicTurn(
    damage: number,
    skipped: boolean,
    actorClass?: string,
  ): void {
    if (skipped) return;
    this.battleTurn(
      { damage, healing: 0, critical: damage >= 30 },
      actorClass as HeroClass | undefined,
    );
  }

  public battleResult(won: boolean): void {
    if (!this.ready()) return;
    const notes = won ? [262, 330, 392, 523] : [220, 196, 165];
    notes.forEach((frequency, index) =>
      this.tone(
        frequency,
        won ? 0.34 : 0.42,
        won ? "triangle" : "sawtooth",
        0.065,
        index * 0.11,
      ),
    );
    if (won) this.noise(0.28, 1100, 0.035, 0.2);
  }

  public event(kind: InterfaceSound): void {
    if (!this.ready()) return;
    if (kind === "forge") {
      this.tone(165, 0.08, "square", 0.07);
      this.tone(520, 0.12, "triangle", 0.05, 0.08);
    } else if (kind === "loot") {
      [440, 554, 659].forEach((note, index) =>
        this.tone(note, 0.2, "sine", 0.055, index * 0.07),
      );
    } else if (kind === "training") {
      this.bodyImpact();
      this.tone(330, 0.1, "triangle", 0.035, 0.08);
    } else if (kind === "reputation") {
      this.tone(294, 0.13, "triangle", 0.05);
      this.tone(440, 0.18, "triangle", 0.045, 0.09);
    } else {
      this.tone(360, 0.07, "sine", 0.045);
    }
  }

  private ready(): boolean {
    if (this.muted || typeof window === "undefined") return false;
    return Boolean(this.ensureContext());
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    try {
      if (this.context?.state === "closed") {
        this.stopVoices();
        try {
          this.master?.disconnect();
        } catch {}
        this.master = null;
        this.context = null;
        this.resuming = null;
        this.noiseBuffers.clear();
      }
      if (!this.context) {
        const AudioContextCtor =
          window.AudioContext ??
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextCtor) return null;
        this.context = new AudioContextCtor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.context.destination);
      }
      if (this.context.state !== "running" && this.resuming !== this.context) {
        const context = this.context;
        this.resuming = context;
        const settled = () => {
          if (this.resuming === context) this.resuming = null;
        };
        try {
          void context.resume().then(settled, settled);
        } catch {
          settled();
        }
      }
      return this.context.state === "running" ? this.context : null;
    } catch {
      return null;
    }
  }

  private stopVoices(): void {
    for (const [source, release] of this.voices) {
      try {
        source.stop();
      } catch {}
      release();
    }
  }

  private trackVoice(
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
    afterRelease?: () => void,
  ): () => void {
    if (this.voices.size >= MAX_VOICES) {
      const [oldest, release] = this.voices.entries().next().value!;
      try {
        oldest.stop();
      } catch {}
      release();
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      source.onended = null;
      this.voices.delete(source);
      for (const node of [source, ...nodes]) {
        try {
          node.disconnect();
        } catch {}
      }
      try {
        afterRelease?.();
      } catch {}
    };
    this.voices.set(source, release);
    source.onended = release;
    return release;
  }

  private noiseBuffer(context: AudioContext, duration: number): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const key = `${context.sampleRate}:${length}`;
    const entry = this.noiseBuffers.get(key) ?? { buffers: [], next: 0 };
    this.noiseBuffers.delete(key);
    this.noiseBuffers.set(key, entry);
    if (this.noiseBuffers.size > MAX_NOISE_BUFFERS)
      this.noiseBuffers.delete(this.noiseBuffers.keys().next().value!);
    const variant = entry.next;
    entry.next = (entry.next + 1) % NOISE_VARIANTS;
    if (!entry.buffers[variant]) {
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1)
        channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
      entry.buffers[variant] = buffer;
    }
    return entry.buffers[variant];
  }

  private tone(
    frequency: number,
    duration: number,
    wave: OscillatorType,
    volume: number,
    delay = 0,
    endFrequency?: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || context.state !== "running" || !master || this.muted)
      return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const release = this.trackVoice(oscillator, [gain]);
    try {
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency)
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(1, endFrequency),
          start + duration,
        );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      try {
        oscillator.stop();
      } catch {}
      release();
    }
  }

  private noise(
    duration: number,
    highPass: number,
    volume: number,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || context.state !== "running" || !master || this.muted)
      return;
    const buffer = this.noiseBuffer(context, duration);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const release = this.trackVoice(source, [filter, gain], () => {
      source.buffer = null;
    });
    try {
      const start = context.currentTime + delay;
      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.value = highPass;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start(start);
    } catch {
      try {
        source.stop();
      } catch {}
      release();
    }
  }

  private parry(): void {
    this.tone(1240, 0.08, "square", 0.055);
    this.tone(790, 0.12, "triangle", 0.045, 0.025);
    this.noise(0.08, 2100, 0.045);
  }

  private bladeImpact(): void {
    this.noise(0.1, 900, 0.08);
    this.tone(210, 0.11, "triangle", 0.065, 0, 105);
    this.tone(1180, 0.06, "square", 0.035, 0.015);
  }

  private bodyImpact(): void {
    this.noise(0.08, 160, 0.07);
    this.tone(110, 0.12, "sine", 0.075, 0, 62);
  }

  private gunshot(): void {
    this.noise(0.14, 520, 0.12);
    this.tone(95, 0.16, "sawtooth", 0.07, 0, 42);
  }

  private arrow(): void {
    this.tone(740, 0.11, "triangle", 0.045, 0, 290);
    this.noise(0.07, 1300, 0.045, 0.055);
  }

  private magicImpact(): void {
    this.tone(190, 0.2, "sine", 0.055, 0, 520);
    this.tone(760, 0.16, "triangle", 0.04, 0.045, 280);
    this.noise(0.12, 1000, 0.04);
  }

  private monsterGrowl(): void {
    this.tone(74, 0.6, "sawtooth", 0.07, 0.05, 44);
    this.tone(91, 0.48, "triangle", 0.05, 0.08, 57);
    this.noise(0.38, 80, 0.035, 0.06);
  }
}

export const gameAudio = new GameAudio();
