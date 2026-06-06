// Tiny static server for the exported site with clean-URL resolution.
// Mirrors how Netlify / GitHub Pages serve Markline's export: a request for
// /start/quick-start serves start/quick-start.html.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = Number(process.env.PORT) || 4599;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const candidates = [p, `${p}.html`, path.join(p, "index.html")];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

http
  .createServer((req, res) => {
    let file = resolveFile(req.url);
    if (!file) {
      const fallback = path.join(ROOT, "404.html");
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.existsSync(fallback) ? fs.readFileSync(fallback) : "Not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
