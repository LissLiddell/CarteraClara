import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/domain.js": ["domain.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"]
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = files[pathname];
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
    return;
  }
  try {
    const body = await readFile(join(root, file[0]));
    response.writeHead(200, {
      "content-type": file[1],
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    response.end(body);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("No se pudo abrir la demo");
  }
});

server.listen(4173, "127.0.0.1", () => {
  process.stdout.write("Cartera Clara: http://localhost:4173\n");
});
