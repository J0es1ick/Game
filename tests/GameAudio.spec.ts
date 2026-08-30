import type { HeroClass } from "../src/gameplay/core/WorldTypes";
import { FakeAudioContext, FakeAudioNode } from "./helpers/FakeAudioContext";

type AudioController = typeof import("../src/web/react/app/audio/GameAudio").gameAudio;

describe("Game audio lifetime", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let browser: Record<string, unknown>;
  let storage: { getItem: jest.Mock; setItem: jest.Mock };

  beforeEach(() => {
    FakeAudioContext.reset();
    storage = { getItem: jest.fn(() => null), setItem: jest.fn() };
    browser = { AudioContext: FakeAudioContext, localStorage: storage };
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  });

  afterEach(() => {
    FakeAudioContext.instances.forEach((context) => context.advance(2));
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    jest.restoreAllMocks();
  });

  const load = (): AudioController => {
    let audio: AudioController;
    jest.isolateModules(() => { audio = require("../src/web/react/app/audio/GameAudio").gameAudio; });
    return audio!;
  };
  const context = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
  const connected = (value: FakeAudioContext): FakeAudioNode[] => value.nodes.filter((node) => node.connections.size > 0);
  const playCycle = (audio: AudioController) => {
    const actions: Array<() => void> = [
      () => audio.battleStart(true),
      ...(["Knight", "Archer", "Wizard", "Monk", "Gunsmith", "Swordsman"] as HeroClass[]).map((classId) => () => audio.battleTurn({ damage: 60, healing: 0, critical: true }, classId)),
      () => audio.battleTurn({ damage: 0, healing: 25, critical: false }),
      () => audio.battleTurn({ damage: 0, healing: 0, critical: false }),
      () => audio.battleResult(true), () => audio.battleResult(false),
      ...(["choice", "forge", "loot", "reputation", "training"] as const).map((kind) => () => audio.event(kind)),
    ];
    actions.forEach((action) => { action(); context().advance(2); });
  };

  it("does not fail to load when access to localStorage is denied", () => {
    Object.defineProperty(browser, "localStorage", { get: () => { throw new Error("Storage denied"); } });
    const audio = load();
    expect(audio.isMuted).toBe(false);
    expect(() => audio.event("choice")).not.toThrow();
    expect(() => audio.toggle()).not.toThrow();
    expect(audio.isMuted).toBe(true);
    expect(context().activeSources.size).toBe(0);
  });

  it("keeps the mute control usable if reading or writing its preference fails", () => {
    storage.getItem.mockImplementation(() => { throw new Error("Privacy mode"); });
    storage.setItem.mockImplementation(() => { throw new Error("Storage full"); });
    const audio = load();
    expect(audio.toggle()).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(audio.toggle()).toBe(false);
    expect(context().activeSources.size).toBe(2);
    expect(audio.isMuted).toBe(false);
  });

  it("creates neither a context nor sources while muted", () => {
    storage.getItem.mockReturnValue("true");
    const audio = load();
    for (let index = 0; index < 100; index += 1) {
      audio.event("training"); audio.battleStart(true); audio.battleResult(true);
    }
    expect(audio.isMuted).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("disconnects completed oscillators, buffers, filters and envelope gains", () => {
    const audio = load();
    playCycle(audio);
    const value = context();
    expect(value.sources.length).toBeGreaterThan(30);
    expect(value.activeSources.size).toBe(0);
    expect(connected(value)).toEqual([value.nodes[0]]);
    expect(value.nodes.slice(1).every((node) => node.disconnectCount === 1)).toBe(true);
    expect(value.sources.every((source) => source.onended === null)).toBe(true);
    expect(value.sources.filter((source) => source.kind === "buffer").every((source) => source.buffer === null)).toBe(true);
  });

  it("reuses a bounded noise cache over thousands of sounds without retaining ended graphs", () => {
    const audio = load();
    playCycle(audio); playCycle(audio);
    const value = context();
    const warmedBuffers = value.buffers.length;
    expect(warmedBuffers).toBeGreaterThan(1);
    expect(warmedBuffers).toBeLessThanOrEqual(24);
    for (let index = 0; index < 200; index += 1) {
      playCycle(audio);
      expect(value.activeSources.size).toBe(0);
    }
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(value.buffers).toHaveLength(warmedBuffers);
    expect(connected(value)).toEqual([value.nodes[0]]);
    expect(value.sources.every((source) => source.onended === null)).toBe(true);
    const impacts = value.sources.filter((source) => source.startedBuffer?.length === Math.floor(value.sampleRate * .1));
    expect(new Set(impacts.map((source) => source.startedBuffer)).size).toBe(2);
  });

  it("bounds simultaneous sounds during a burst and releases every voice after it", () => {
    const audio = load();
    for (let index = 0; index < 500; index += 1) {
      audio.battleTurn({ damage: 100, healing: 0, critical: true }, "Knight");
      expect(context().activeSources.size).toBeLessThanOrEqual(48);
    }
    expect(context().activeSources.size).toBe(48);
    context().advance(2);
    expect(context().activeSources.size).toBe(0);
    expect(connected(context())).toEqual([context().nodes[0]]);
  });

  it("stops scheduled sounds immediately when the player mutes audio", () => {
    const audio = load(); audio.battleResult(true);
    expect(context().activeSources.size).toBe(5);
    audio.setMuted(true);
    expect(context().activeSources.size).toBe(0);
    expect(connected(context())).toEqual([context().nodes[0]]);
    expect(context().sources.every((source) => source.onended === null)).toBe(true);
  });

  it("does not queue inaudible sounds while a single resume request is pending", async () => {
    FakeAudioContext.initialState = "suspended";
    let resolveResume: () => void;
    FakeAudioContext.resumeBehavior = (value) => new Promise<void>((resolve) => { resolveResume = () => { value.state = "running"; resolve(); }; });
    const audio = load();
    for (let index = 0; index < 500; index += 1) audio.battleStart(true);
    expect(context().resumeCalls).toBe(1);
    expect(context().sources).toHaveLength(0);
    expect(context().buffers).toHaveLength(0);
    resolveResume!(); await Promise.resolve();
    expect(context().sources).toHaveLength(0);
    audio.event("choice");
    expect(context().sources).toHaveLength(1);
  });

  it("handles rejected and thrown resume requests and permits later recovery", async () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.resumeBehavior = () => Promise.reject(new Error("Autoplay blocked"));
    const audio = load();
    expect(() => audio.event("loot")).not.toThrow();
    await Promise.resolve();
    expect(context().sources).toHaveLength(0);
    FakeAudioContext.resumeBehavior = () => { throw new Error("Interrupted context"); };
    expect(() => audio.event("loot")).not.toThrow();
    expect(context().resumeCalls).toBe(2);
    FakeAudioContext.resumeBehavior = (value) => Promise.resolve().then(() => { value.state = "running"; });
    audio.event("loot"); await Promise.resolve(); await Promise.resolve();
    audio.event("loot");
    expect(context().sources).toHaveLength(3);
    expect(context().resumeCalls).toBe(3);
  });

  it("rebuilds a closed context without retaining its nodes or old-rate noise", () => {
    const audio = load(); audio.battleStart(true);
    const first = context(); first.state = "closed";
    FakeAudioContext.initialSampleRate = 96000;
    audio.battleStart(true);
    const second = context();
    expect(second).not.toBe(first);
    expect(first.activeSources.size).toBe(0);
    expect(connected(first)).toHaveLength(0);
    expect(second.buffers.every((buffer) => buffer.sampleRate === 96000 && !first.buffers.includes(buffer))).toBe(true);
    expect(second.buffers).toHaveLength(2);
  });

  it("releases a voice even when starting it fails", () => {
    const audio = load(); audio.event("choice"); context().advance(2);
    context().failStarts = true;
    expect(() => audio.battleStart(true)).not.toThrow();
    expect(context().activeSources.size).toBe(0);
    expect(connected(context())).toEqual([context().nodes[0]]);
    expect(context().sources.every((source) => source.onended === null)).toBe(true);
  });

  it("works without browser audio support and accepts the WebKit constructor", () => {
    Reflect.deleteProperty(browser, "AudioContext");
    const audio = load();
    expect(() => audio.battleResult(true)).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(0);
    browser.webkitAudioContext = FakeAudioContext;
    audio.event("choice");
    expect(context().activeSources.size).toBe(1);
  });
});
