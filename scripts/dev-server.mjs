// Local dev server: serves the static site and mounts api/*.js the way Vercel
// does (default export handler(req, res)). Run with: npm run dev
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch { return raw; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      const name = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, "");
      const mod = await import(pathToFileURL(path.join(ROOT, "api", `${name}.js`)).href);
      req.body = req.method === "POST" ? await readBody(req) : undefined;
      req.query = Object.fromEntries(url.searchParams);
      await mod.default(req, wrapRes(res));
    } catch (err) {
      console.error(err);
      wrapRes(res).status(500).json({ ok: false, error: String(err.message || err) });
    }
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch { file = path.join(ROOT, "index.html"); }
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}`));
