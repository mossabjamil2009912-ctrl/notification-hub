// مشغّل Node.js للاستضافة الذاتية: يشغّل نفس حزمة الخادم الناتجة عن البناء
// على أي VPS دون الحاجة لمنصة سحابية، ويقدّم الملفات الثابتة من dist/client.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const handler = (await import("../dist/server/index.mjs")).default;
const clientDir = new URL("../dist/client", import.meta.url).pathname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// بديل عن موصّل الملفات الثابتة في المنصات السحابية
const env = {
  ASSETS: {
    async fetch(request) {
      const path = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(
        /^(\.\.[/\\])+/,
        "",
      );
      try {
        const file = await readFile(join(clientDir, path));
        return new Response(file, {
          headers: { "content-type": MIME[extname(path).toLowerCase()] || "application/octet-stream" },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    },
  },
};

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host || "localhost"}${req.url || "/"}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? "half" : undefined,
    });
    const response = await handler.fetch(request, env, {
      waitUntil: (p) => Promise.resolve(p).catch(() => {}),
    });
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body) return res.end();
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`ACTES app listening on http://${host}:${port}`);
});
