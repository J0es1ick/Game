import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// A single process avoids Vite/npm child-process teardown hanging on Windows.
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/Game/")) {
      response.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(6)) || "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(Number(process.env.BROWSER_TEST_PORT ?? 4173), "127.0.0.1", () =>
  process.stdout.write("ready\n"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
