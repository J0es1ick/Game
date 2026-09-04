import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entry) throw new Error("Build manifest has no entry point");
const visited = new Set();
const files = [];
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Unknown chunk: ${key}`);
  files.push(chunk.file);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
visit(entry);
let raw = 0;
let gzip = 0;
for (const file of files) {
  const contents = await readFile(`dist/${file}`);
  raw += contents.length;
  gzip += gzipSync(contents).length;
}
console.log(
  `Initial JavaScript: ${(raw / 1024).toFixed(1)} KiB raw / ${(gzip / 1024).toFixed(1)} KiB gzip (${files.length} chunks)`,
);
if (raw > 260 * 1024 || gzip > 85 * 1024)
  throw new Error(
    "Initial bundle exceeds the 260 KiB raw / 85 KiB gzip budget",
  );
if (
  files.some((file) => /GameApplication|WorldGame|WorldSaveWorker/.test(file))
)
  throw new Error("World runtime must not load before mode selection");
