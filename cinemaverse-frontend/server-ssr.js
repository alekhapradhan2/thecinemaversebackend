import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import compression from "compression";
import sirv from "sirv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = parseInt(process.env.PORT || "3000", 10);
const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

// Paths
const CLIENT_DIST = path.join(__dirname, "dist/client");
const SERVER_DIST = path.join(__dirname, "dist/server");
const INDEX_HTML = path.join(CLIENT_DIST, "index.html");


// Page request filter
const isPageRequest = (req) => {
  const p = req.path;
  if (p.startsWith("/api")) return false;
  if (p.startsWith("/_")) return false;
  if (/\.\w{2,5}$/.test(p)) return false;
  return true;
};

// Simple SSR cache
const ssrCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const getCache = (key) => {
  const data = ssrCache.get(key);
  if (!data) return null;
  if (Date.now() - data.time > CACHE_TTL) {
    ssrCache.delete(key);
    return null;
  }
  return data.html;
};

const setCache = (key, html) => {
  ssrCache.set(key, { html, time: Date.now() });
  if (ssrCache.size > 500) {
    const firstKey = ssrCache.keys().next().value;
    ssrCache.delete(firstKey);
  }
};

async function createServer() {
  const app = express();
  app.use(compression());

  // ───────────────── API PROXY ─────────────────
  app.use("/api", async (req, res) => {
    try {
      const target = `${BACKEND}/api${req.url}`;

      const opts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          ...(req.headers.authorization
            ? { Authorization: req.headers.authorization }
            : {}),
        },
      };

      if (!["GET", "HEAD"].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        opts.body = Buffer.concat(chunks).toString();
      }

      const proxyRes = await fetch(target, opts);
      const text = await proxyRes.text();

      res
        .status(proxyRes.status)
        .set(
          "Content-Type",
          proxyRes.headers.get("content-type") || "application/json"
        )
        .send(text);
    } catch (err) {
      console.error("[API ERROR]", err.message);
      res.status(502).json({ error: "Backend unavailable" });
    }
  });

  // ───────────────── STATIC FILES (FIXED) ─────────────────

  // ✅ Serve JS/CSS assets FIRST (VERY IMPORTANT)
  app.use(
    "/assets",
    sirv(path.join(CLIENT_DIST, "assets"), {
      maxAge: 31536000,
      immutable: true,
    })
  );

  // ✅ Serve other static files (favicon, etc.)
  app.use(
    sirv(CLIENT_DIST, {
      extensions: [],
    })
  );

  // ───────────────── SSR HANDLER ─────────────────
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (!isPageRequest(req)) return next();

    try {
      let indexHtml = fs.readFileSync(INDEX_HTML, "utf-8");

      // Check SSR cache first
      const cached = getCache(url);
      if (cached) {
        console.log(`[CACHE HIT] ${url}`);
        return res.status(200).set("Content-Type", "text/html").send(cached);
      }

      console.log(`[SSR] Rendering ${url}`);

      let render;

      if (isProd) {
        const mod = await import(
          path.join(SERVER_DIST, "entry-server.js")
        );
        render = mod.render;
      } else {
        const { createServer } = await import("vite");
        const vite = await createServer({
          server: { middlewareMode: true },
          appType: "custom",
        });
        const mod = await vite.ssrLoadModule(
          "/src/entry-server.jsx"
        );
        render = mod.render;
      }

      const helmetContext = {};
      const appHtml = await render(url, helmetContext);

      let html = indexHtml;

      const helmet = helmetContext.helmet;

      if (helmet) {
        html = html
          .replace(
            /<title>.*<\/title>/,
            helmet.title?.toString() || "<title>Ollypedia</title>"
          )
          .replace(
            "</head>",
            `
              ${helmet.meta?.toString() || ""}
              ${helmet.link?.toString() || ""}
              ${helmet.script?.toString() || ""}
            </head>`
          );
      }

      html = html.replace(
        '<div id="root"></div>',
        `<div id="root">${appHtml}</div>`
      );

      setCache(url, html);

      res.status(200).set("Content-Type", "text/html").send(html);
    } catch (err) {
      console.error("[SSR ERROR]", err);

      try {
        const fallback = fs.readFileSync(INDEX_HTML, "utf-8");
        res.status(200).send(fallback);
      } catch {
        res.status(500).send("Server error");
      }
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 SSR running at http://localhost:${PORT}`);
    console.log(`Backend: ${BACKEND}`);
  });
}

createServer();