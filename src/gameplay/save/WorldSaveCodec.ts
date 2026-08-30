import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

const STORAGE_PREFIX = "dust-and-crown:gzip:v1:";
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;

export function worldSaveChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function isCompressedWorldSave(value: string): boolean {
  return value.startsWith(STORAGE_PREFIX);
}

export function encodeWorldSaveStorage(serialized: string): string {
  const bytes = strToU8(serialized);
  if (bytes.length > MAX_UNPACKED_BYTES) {
    throw new Error(
      "Сохранение слишком велико для хранилища браузера. Скачайте его через меню «Летопись».",
    );
  }
  const compressed = gzipSync(bytes, { level: 6, mtime: 0 });
  const packed = `${STORAGE_PREFIX}${worldSaveChecksum(serialized)}:${btoa(strFromU8(compressed, true))}`;
  return packed.length < serialized.length ? packed : serialized;
}

export function decodeWorldSaveStorage(stored: string): string {
  if (!isCompressedWorldSave(stored)) return stored;
  try {
    const header = stored.slice(
      STORAGE_PREFIX.length,
      STORAGE_PREFIX.length + 9,
    );
    if (!/^[a-f0-9]{8}:$/.test(header)) throw new Error();
    const encoded = stored.slice(STORAGE_PREFIX.length + 9);
    if (encoded.length > MAX_UNPACKED_BYTES * 1.4) throw new Error();
    const compressed = strToU8(atob(encoded), true);
    if (compressed.length < 18) throw new Error();
    const size = new DataView(
      compressed.buffer,
      compressed.byteOffset,
      compressed.byteLength,
    ).getUint32(compressed.length - 4, true);
    if (size === 0 || size > MAX_UNPACKED_BYTES) throw new Error();
    const serialized = strFromU8(
      gunzipSync(compressed, { out: new Uint8Array(size) }),
    );
    if (worldSaveChecksum(serialized) !== header.slice(0, 8)) throw new Error();
    return serialized;
  } catch {
    throw new Error(
      "Сжатая копия сохранения повреждена или имеет недопустимый размер.",
    );
  }
}
