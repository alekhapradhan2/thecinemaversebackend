/**
 * generate-sitemap.js — UPDATED SEO VERSION
 */

import fs from "fs";
import path from "path";

const API_URL    = process.env.API_URL    || "http://localhost:4000/api";
const SITE_URL   = process.env.SITE_URL   || "https://ollypedia.in";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "../ollipedia-frontend/public";

// =====================
// 🧠 HELPERS
// =====================
function toSlug(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
}

function movieSlug(m) {
  if (m.slug) return m.slug;
  const year = m.releaseDate ? new Date(m.releaseDate).getFullYear() : "";
  const base = toSlug(m.title || "movie");
  return year ? `${base}-${year}` : base;
}

function castSlug(c) {
  return toSlug(c.name || "artist");
}

function buildSongUrl(movie, songIndex, song) {
  const ms = movieSlug(movie);
  const idx = songIndex || 0;
  const slug = song.title ? `/${toSlug(song.title)}-odia-song` : "";
  return `/song/${ms}/${idx}${slug}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function xmlEscape(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urlEntry({ loc, lastmod, priority = "0.7", changefreq = "weekly" }) {
  const date = lastmod
    ? new Date(lastmod).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  return `
  <url>
    <loc>${SITE_URL}${xmlEscape(loc)}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// =====================
// 🚀 GENERATE
// =====================
async function generate() {
  console.log("🚀 Generating sitemap...\n");

  const [movies, castList, newsList] = await Promise.all([
    fetchJSON(`${API_URL}/movies`).catch(() => []),
    fetchJSON(`${API_URL}/cast`).catch(() => []),
    fetchJSON(`${API_URL}/news`).catch(() => []),
  ]);

  const urls = new Set();

  // =====================
  // STATIC PAGES
  // =====================
  [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/movies", priority: "0.9" },
    { loc: "/cast", priority: "0.8" },
    { loc: "/songs", priority: "0.8" },
    { loc: "/news", priority: "0.8" },
    { loc: "/about", priority: "0.5" },
    { loc: "/contact", priority: "0.5" },
    { loc: "/privacy", priority: "0.4" },
  ].forEach(p => urls.add(urlEntry(p)));

  // =====================
  // MOVIES
  // =====================
  movies.forEach(m => {
    urls.add(urlEntry({
      loc: `/movie/${movieSlug(m)}`,
      lastmod: m.updatedAt || m.releaseDate,
      priority: "0.9",
      changefreq: "weekly"
    }));
  });

  // =====================
  // SONGS
  // =====================
  movies.forEach(m => {
    (m.media?.songs || []).forEach((s, i) => {
      if (!s.title) return;
      urls.add(urlEntry({
        loc: buildSongUrl(m, i, s),
        lastmod: m.updatedAt,
        priority: "0.7",
      }));
    });
  });

  // =====================
  // CAST
  // =====================
  castList.forEach(c => {
    urls.add(urlEntry({
      loc: `/cast/${c._id}`,
      lastmod: c.updatedAt,
      priority: "0.8",
    }));
  });

  // =====================
  // NEWS (NEW ADDITION 🔥)
  // =====================
  newsList.forEach(n => {
    urls.add(urlEntry({
      loc: `/news/${n._id}`,
      lastmod: n.updatedAt || n.createdAt,
      priority: "0.7",
      changefreq: "daily"
    }));
  });

  // =====================
  // WRITE SITEMAP
  // =====================
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].join("\n")}
</urlset>`;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), xml);

  // =====================
  // ROBOTS.TXT (IMPROVED)
  // =====================
  const robots = `
User-agent: *
Allow: /

Disallow: /admin
Disallow: /dashboard
Disallow: /cast-portal

Sitemap: ${SITE_URL}/sitemap.xml
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "robots.txt"), robots);

  console.log("✅ Sitemap Generated Successfully");
  console.log(`Total URLs: ${urls.size}`);
}

// =====================
generate().catch(console.error);