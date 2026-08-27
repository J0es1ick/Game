import {
  decodeWorldSaveStorage,
  encodeWorldSaveStorage,
  isCompressedWorldSave,
} from "../src/gameplay/WorldSaveCodec";

describe("world save compression", () => {
  const payload = JSON.stringify({
    name: "Летописец ⚔️",
    history: Array.from({ length: 400 }, (_, day) => ({
      day,
      message: "Снаряжение запомнило победу. Кириллица, 世界, emoji 🐉 и \u0000.",
    })),
  });

  test("compresses deterministically and restores the exact Unicode payload", () => {
    const stored = encodeWorldSaveStorage(payload);
    expect(isCompressedWorldSave(stored)).toBe(true);
    expect(stored.length).toBeLessThan(payload.length / 4);
    expect(encodeWorldSaveStorage(payload)).toBe(stored);
    expect(decodeWorldSaveStorage(stored)).toBe(payload);
  });

  test("reads legacy JSON unchanged and keeps tiny values uncompressed", () => {
    expect(decodeWorldSaveStorage(payload)).toBe(payload);
    expect(encodeWorldSaveStorage("{}")).toBe("{}");
  });

  test("rejects a damaged checksum, header, base64 or truncated stream", () => {
    const stored = encodeWorldSaveStorage(payload);
    const parts = stored.split(":");
    const checksumIndex = parts.length - 2;
    const wrongChecksum = [...parts];
    wrongChecksum[checksumIndex] = parts[checksumIndex] === "00000000" ? "ffffffff" : "00000000";
    const badHeader = [...parts];
    badHeader[checksumIndex] = "invalid";
    const badData = [...parts];
    badData[badData.length - 1] = "not base64!";

    for (const invalid of [wrongChecksum.join(":"), badHeader.join(":"), badData.join(":"), stored.slice(0, -16)]) {
      expect(() => decodeWorldSaveStorage(invalid)).toThrow(/Сжатая копия/);
    }
  });

  test("rejects excessive unpacked sizes before allocating the output buffer", () => {
    const parts = encodeWorldSaveStorage(payload).split(":");
    const dataIndex = parts.length - 1;
    const compressed = Uint8Array.from(atob(parts[dataIndex]), (value) => value.charCodeAt(0));
    new DataView(compressed.buffer).setUint32(compressed.length - 4, 0xffffffff, true);
    parts[dataIndex] = btoa(String.fromCharCode(...compressed));
    expect(() => decodeWorldSaveStorage(parts.join(":"))).toThrow(/недопустимый размер/);
  });
});
