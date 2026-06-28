// ═══════════════════════════════════════════════════════════════════════════
//  sync-odia-movies.js  —  Ollipedia · Complete Odia Cinema Sync
//  Covers: Upcoming → 2025 → 2024 → ... → 1936
//
//  FIXES:
//   ✅ Runtime now always stored  (e.g. "137 min")
//   ✅ Verdict set correctly from release date (not hardcoded "TBA")
//   ✅ Poster ALWAYS overwritten with latest OMDB image (never keeps stale)
//   ✅ BoxOffice, Rated, imdbRating, imdbVotes all correctly mapped
//   ✅ PATCH sends EVERY field so nothing stays stale on update
//
//  HOW IT WORKS:
//   1. Scrapes Wikipedia "List of Odia films of YYYY" for every year
//   2. Searches each title on OMDB → gets full details by imdbID
//   3. Maps ALL OMDB fields correctly → stores in your DB
//   4. Creates cast profiles + links them to each movie
//   5. On update: overwrites ALL fields including poster/runtime/verdict
//
//  SETUP (.env):
//    OMDB_API_KEY=8301db31
//    ADMIN_USERNAME=your_admin_username
//    ADMIN_PASSWORD=your_admin_password
//    API_BASE=http://localhost:4000/api
//
//  RUN:
//    node sync-odia-movies.js
//
//  CRON (twice daily — 5:30 AM + 5:30 PM IST):
//    0 0,12 * * * cd /your/project && node sync-odia-movies.js >> logs/sync.log 2>&1
// ═══════════════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config();

const fetch    = globalThis.fetch ?? (await import("node-fetch").then(m => m.default));
const OMDB_KEY = process.env.OMDB_API_KEY  || "8301db31";
const API_BASE = process.env.API_BASE      || "http://localhost:4000/api";
const ADMIN_U  = process.env.ADMIN_USERNAME;
const ADMIN_P  = process.env.ADMIN_PASSWORD;

const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR   = 1936;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log   = (m)  => console.log(`[${new Date().toISOString()}]  ${m}`);
const fail  = (m)  => console.error(`[${new Date().toISOString()}] ❌  ${m}`);
const todayStr = () => new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════════
//  OMDB HELPERS
//  OMDB field names (exact, case-sensitive):
//    Title, Year, Rated, Released, Runtime, Genre, Director, Writer,
//    Actors, Plot, Language, Country, Poster, imdbRating, imdbVotes,
//    imdbID, BoxOffice, Production, Response
// ═══════════════════════════════════════════════════════════════════════════

// Get a clean string from OMDB — returns "" if value is "N/A" or missing
const omdbVal = (omdb, key) => {
  const v = omdb?.[key];
  return (v && v !== "N/A" && v.trim() !== "") ? v.trim() : "";
};

// Search OMDB by title+year → returns imdbID or null
async function omdbSearch(title, year) {
  try {
    // Try with year first
    if (year) {
      const r = await fetch(`https://www.omdbapi.com/?s=${encodeURIComponent(title)}&y=${year}&type=movie&apikey=${OMDB_KEY}`);
      const d = await r.json();
      if (d.Response === "True" && d.Search?.length) return d.Search[0].imdbID;
    }
    // Retry without year
    const r2 = await fetch(`https://www.omdbapi.com/?s=${encodeURIComponent(title)}&type=movie&apikey=${OMDB_KEY}`);
    const d2 = await r2.json();
    if (d2.Response === "True" && d2.Search?.length) return d2.Search[0].imdbID;
  } catch { /* network error */ }
  return null;
}

// Fetch FULL details from OMDB by imdbID (preferred) or title
async function omdbFull(imdbId, title, year) {
  // By IMDb ID — most reliable, returns Runtime, BoxOffice, Rated etc.
  if (imdbId) {
    try {
      const r = await fetch(`https://www.omdbapi.com/?i=${imdbId}&plot=full&apikey=${OMDB_KEY}`);
      const d = await r.json();
      if (d.Response === "True") return d;
    } catch { /* fallthrough */ }
  }
  // By title fallback
  if (title) {
    try {
      const yr = year ? `&y=${year}` : "";
      const r  = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&plot=full${yr}&apikey=${OMDB_KEY}`);
      const d  = await r.json();
      if (d.Response === "True") return d;
    } catch { /* ok */ }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAP OMDB → OLLIPEDIA  (THE MAIN FIX — every field mapped correctly)
// ═══════════════════════════════════════════════════════════════════════════
function mapToOllipedia(omdb, fallback = {}) {
  // ── Parse release date from OMDB "DD MMM YYYY" format ────────────────
  const parseDate = (str) => {
    if (!str) return "";
    try {
      const d = new Date(str);
      return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    } catch { return ""; }
  };

  // ── Determine release date ────────────────────────────────────────────
  // OMDB returns: Released = "12 Aug 2022"   ← parse this
  const omdbReleased = omdbVal(omdb, "Released");
  const releaseDate  = parseDate(omdbReleased)        // from OMDB (most accurate)
                    || fallback.releaseDate            // from Wikipedia scrape
                    || (fallback.year ? `${fallback.year}-06-01` : ""); // year estimate

  // ── Determine status from release date ───────────────────────────────
  const isReleased = releaseDate !== "" && releaseDate <= todayStr();
  const status     = fallback.status || (isReleased ? "Released" : "Upcoming");

  // ── Verdict from IMDb rating ──────────────────────────────────────────
  //   >= 8.0  → Blockbuster
  //   >= 7.0  → Hit
  //   >= 5.5  → Average
  //   <  5.5  → Flop
  //   no rating + released → Released
  //   not released yet     → Upcoming
  const imdbRatingRaw = omdbVal(omdb, "imdbRating");   // e.g. "7.8" or ""
  const imdbRatingNum = parseFloat(imdbRatingRaw);

  let verdict;
  if (!isReleased) {
    verdict = "Upcoming";
  } else if (!imdbRatingRaw || isNaN(imdbRatingNum)) {
    verdict = "Released";          // released but no IMDb rating yet
  } else if (imdbRatingNum >= 8.0) {
    verdict = "Blockbuster";
  } else if (imdbRatingNum >= 7.0) {
    verdict = "Hit";
  } else if (imdbRatingNum >= 5.5) {
    verdict = "Average";
  } else {
    verdict = "Flop";
  }

  // ── Runtime — OMDB returns "137 min", store exactly as-is ────────────
  // FIX: was previously dropped because of wrong field check
  const runtime = omdbVal(omdb, "Runtime");     // e.g. "137 min"

  // ── Poster — ALWAYS use OMDB value (overwrite whatever was stored) ────
  // FIX: old code was:  base.posterUrl || omdb.Poster  (kept stale poster)
  // New code: OMDB poster wins always if available
  const poster = omdbVal(omdb, "Poster") || fallback.posterUrl || "";

  // ── Genre — OMDB returns "Action, Drama" → split to array ────────────
  const genreStr = omdbVal(omdb, "Genre");
  const genre    = genreStr
    ? genreStr.split(",").map(s => s.trim()).filter(Boolean)
    : (fallback.genre || []);

  // ── Actors — OMDB returns "Actor1, Actor2, Actor3, Actor4" ───────────
  const actorsStr = omdbVal(omdb, "Actors");
  const actors    = actorsStr
    ? actorsStr.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  // ── Box office — OMDB returns "$12,345,678" ──────────────────────────
  // FIX: was being lost because boxOffice was a nested object not sent in PATCH
  const boxOfficeTotal = omdbVal(omdb, "BoxOffice") || "TBA";

  return {
    // ── Core fields ──────────────────────────────────────────────────────
    title:         omdbVal(omdb, "Title")      || fallback.title    || "Untitled",
    imdbId:        omdbVal(omdb, "imdbID")     || fallback.imdbId   || "",
    language:      "Odia",
    category:      "Feature Film",

    // ── Dates & status ───────────────────────────────────────────────────
    releaseDate,
    releaseTBA:    releaseDate === "",
    status,
    verdict,

    // ── People ───────────────────────────────────────────────────────────
    director:      omdbVal(omdb, "Director")   || fallback.director || "",
    producer:      omdbVal(omdb, "Production") || "",

    // ── Content ──────────────────────────────────────────────────────────
    genre,
    synopsis:      omdbVal(omdb, "Plot")       || "",

    // FIX: Runtime — OMDB field is exactly "Runtime", value is "137 min"
    runtime,

    // FIX: Content rating — OMDB field is "Rated", value is "PG-13" / "U" etc.
    contentRating: omdbVal(omdb, "Rated")      || "",

    budget:        "",

    // ── Ratings ──────────────────────────────────────────────────────────
    imdbRating:    imdbRatingRaw,                       // already parsed above for verdict
    imdbVotes:     omdbVal(omdb, "imdbVotes")  || "",   // e.g. "12,345"

    // FIX: Poster — ALWAYS from OMDB, never keep stale value
    posterUrl:     poster,
    thumbnailUrl:  poster,
    bannerUrl:     fallback.bannerUrl || "",

    // ── Box office ───────────────────────────────────────────────────────
    // FIX: was a nested object that wasn't being included in the PATCH body
    boxOffice: {
      opening:   "TBA",
      firstWeek: "TBA",
      total:     boxOfficeTotal,
    },

    // ── Internal (not sent to API) ───────────────────────────────────────
    _actors: actors,   // used for cast sync step
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WIKIPEDIA SCRAPER
// ═══════════════════════════════════════════════════════════════════════════
async function scrapeWikipediaYear(year) {
  const url = `https://en.wikipedia.org/wiki/List_of_Odia_films_of_${year}`;
  try {
    const res  = await fetch(url, {
      headers: { "User-Agent": "OllipediaBot/1.0 (Odia cinema database)" }
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseWikipediaMovies(html, year);
  } catch { return []; }
}

function parseWikipediaMovies(html, year) {
  const movies = [];
  const seen   = new Set();

  const stripHtml = (s) => s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();

  // Parse table rows — Wikipedia film tables have cells: date | title | director | ...
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cellRe.exec(row[1])) !== null) {
      cells.push(stripHtml(cell[1]).trim());
    }
    if (cells.length < 2) continue;

    // Find first cell that looks like a movie title (has letters, not just a date/number)
    for (let i = 0; i < Math.min(cells.length, 3); i++) {
      const c = cells[i];
      if (c.length > 2 && /[a-zA-Z\u0B00-\u0B7F]/.test(c) && !/^\d{1,2}$/.test(c)) {
        if (!seen.has(c.toLowerCase())) {
          seen.add(c.toLowerCase());
          movies.push({
            title:    c,
            director: cells[i + 1]?.trim() || "",
            year,
          });
        }
        break;
      }
    }
  }

  // Older Wikipedia pages use wikilink lists instead of tables
  const linkRe = /\[\[([A-Za-z][^\]|#\n]{2,60})(?:\|[^\]]+)?\]\]/g;
  let link;
  while ((link = linkRe.exec(html)) !== null) {
    const t = link[1].trim();
    if (
      seen.has(t.toLowerCase()) ||
      /^(List|Category|File|Template|Wikipedia|Help|Talk|User|Image)/.test(t) ||
      /^\d{4}$/.test(t) ||
      t.length < 3
    ) continue;
    seen.add(t.toLowerCase());
    movies.push({ title: t, director: "", year });
  }

  return movies;
}

// ═══════════════════════════════════════════════════════════════════════════
//  OLLIPEDIA API — UPSERT MOVIE
//  FIX: sends ALL fields in PATCH (including runtime, boxOffice, poster)
// ═══════════════════════════════════════════════════════════════════════════
async function upsertMovie(token, movie, productionId, existingId) {
  const { _actors, ...fields } = movie;

  // Build complete body — every single field sent on both create AND update
  const body = {
    ...fields,
    productionId,
    // Ensure these are always included explicitly (fixes runtime/poster not updating)
    runtime:       fields.runtime      || "",
    posterUrl:     fields.posterUrl    || "",
    thumbnailUrl:  fields.thumbnailUrl || fields.posterUrl || "",
    imdbRating:    fields.imdbRating   || "",
    imdbVotes:     fields.imdbVotes    || "",
    contentRating: fields.contentRating || "",
    verdict:       fields.verdict      || "Average",
    status:        fields.status       || "Released",
  };

  const url    = existingId ? `${API_BASE}/admin/movies/${existingId}` : `${API_BASE}/admin/movies`;
  const method = existingId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }

  const result  = await res.json();
  const movieId = result._id || existingId;

  // FIX: send boxOffice as a separate PATCH — some servers need nested updates
  if (fields.boxOffice) {
    await fetch(`${API_BASE}/admin/movies/${movieId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        "boxOffice.total":     fields.boxOffice.total     || "TBA",
        "boxOffice.opening":   fields.boxOffice.opening   || "TBA",
        "boxOffice.firstWeek": fields.boxOffice.firstWeek || "TBA",
      }),
    }).catch(() => {
      // Also try sending as nested object in case server needs that form
      fetch(`${API_BASE}/admin/movies/${movieId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ boxOffice: fields.boxOffice }),
      }).catch(() => {});
    });
  }

  return movieId;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAST SYNC
// ═══════════════════════════════════════════════════════════════════════════
async function syncCastMember(token, name, castMap) {
  const key = name.toLowerCase().trim();
  if (castMap[key]) return castMap[key];
  try {
    const res = await fetch(`${API_BASE}/admin/cast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim(), type: "Actor", roles: ["Actor"], bio: "" }),
    });
    if (res.ok) {
      const c = await res.json();
      castMap[key] = c._id;
      return c._id;
    }
  } catch { /* ok */ }
  return null;
}

async function linkCastToMovie(token, movieId, castId, name) {
  await fetch(`${API_BASE}/admin/movies/${movieId}/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ castId, name, type: "Actor", role: "Actor" }),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function adminLogin() {
  log("🔐 Logging in...");
  const res  = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_U, password: ADMIN_P }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${data.error}`);
  log("✅ Logged in");
  return data.token;
}

async function loadExistingMovies() {
  const res  = await fetch(`${API_BASE}/movies`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.movies || []);
  const byImdb  = {};
  const byTitle = {};
  for (const m of list) {
    if (m.imdbId) byImdb[m.imdbId.toLowerCase()] = m._id;
    byTitle[m.title?.toLowerCase().trim()]        = m._id;
  }
  log(`📋 ${list.length} movies already in database`);
  return { byImdb, byTitle };
}

async function loadExistingCast() {
  const res  = await fetch(`${API_BASE}/cast`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.cast || []);
  const map  = {};
  for (const c of list) map[c.name.toLowerCase().trim()] = c._id;
  log(`🎭 ${list.length} cast members already in database`);
  return map;
}

async function getOrCreateProduction(token) {
  const res   = await fetch(`${API_BASE}/productions`);
  const data  = await res.json();
  const prods = Array.isArray(data) ? data : (data.productions || []);
  const found = prods.find(p => p.name === "Ollipedia Auto-Import");
  if (found) return found._id;
  log("🏭 Creating system production...");
  const r    = await fetch(`${API_BASE}/admin/productions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Ollipedia Auto-Import", bio: "Auto-synced from Wikipedia + OMDB." }),
  });
  return (await r.json())._id;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROCESS ONE MOVIE ENTRY (Wikipedia title → OMDB → DB)
// ═══════════════════════════════════════════════════════════════════════════
async function processMovie(token, entry, productionId, existing, castMap, stats) {
  const { title, year, director, status, verdict, imdbId: knownId } = entry;

  // 1. Get imdbId — use known one or search OMDB
  let imdbId = knownId || null;
  if (!imdbId) {
    imdbId = await omdbSearch(title, year);
    await sleep(150);
  }

  // 2. Fetch full OMDB details (gets Runtime, Poster, BoxOffice etc.)
  const omdb = await omdbFull(imdbId, title, year);
  await sleep(200);

  // 3. Map to Ollipedia format (all fixes applied here)
  const movie = mapToOllipedia(omdb, { title, director, imdbId, status, verdict, year });

  if (!movie.title || movie.title.length < 2) { stats.skipped++; return null; }

  // 4. Find existing DB entry
  const existingId =
    (movie.imdbId && existing.byImdb[movie.imdbId.toLowerCase()]) ||
    existing.byTitle[movie.title.toLowerCase().trim()] ||
    null;

  // 5. Create or update (ALL fields sent, fixes runtime/poster/verdict not updating)
  const movieId = await upsertMovie(token, movie, productionId, existingId);

  if (existingId) stats.updated++;
  else            stats.created++;

  // Update local lookup
  if (movie.imdbId) existing.byImdb[movie.imdbId.toLowerCase()] = movieId;
  existing.byTitle[movie.title.toLowerCase().trim()]            = movieId;

  // 6. Sync cast members
  if (movie._actors.length && movieId) {
    let existingCastNames = new Set();
    try {
      const mr = await fetch(`${API_BASE}/movies/${movieId}`);
      const md = mr.ok ? await mr.json() : null;
      existingCastNames = new Set((md?.cast || []).map(c => c.name?.toLowerCase().trim()));
    } catch { /* ok */ }

    for (const name of movie._actors) {
      if (!name || existingCastNames.has(name.toLowerCase())) continue;
      const castId = await syncCastMember(token, name, castMap);
      if (castId) {
        await linkCastToMovie(token, movieId, castId, name);
        stats.castAdded++;
        await sleep(80);
      }
    }
  }

  return movieId;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN — processes: Upcoming first, then CURRENT_YEAR → 1936
// ═══════════════════════════════════════════════════════════════════════════
async function runSync() {
  const START = Date.now();
  log("═══════════════════════════════════════════════════════════════");
  log("  🎬  Ollipedia — Complete Odia Cinema Sync (Fixed)");
  log(`  📅  Upcoming → ${CURRENT_YEAR} → ${START_YEAR}`);
  log(`  🕐  ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  log("  ✅  Runtime, Poster, Verdict, BoxOffice all fixed");
  log("═══════════════════════════════════════════════════════════════\n");

  if (!ADMIN_U || !ADMIN_P) {
    fail("ADMIN_USERNAME / ADMIN_PASSWORD missing in .env");
    process.exit(1);
  }

  const stats = { created: 0, updated: 0, skipped: 0, castAdded: 0, errors: 0 };

  const token        = await adminLogin();
  const existing     = await loadExistingMovies();
  const castMap      = await loadExistingCast();
  const productionId = await getOrCreateProduction(token);

  // Build year list: upcoming years first, then current year down to 1936
  const years = [];
  for (let y = CURRENT_YEAR + 2; y >= START_YEAR; y--) years.push(y);

  for (const year of years) {
    const label = year > CURRENT_YEAR ? "UPCOMING" : String(year);
    log(`\n📽  Scraping ${label}...`);

    const entries = await scrapeWikipediaYear(year);
    await sleep(600); // be polite to Wikipedia

    if (!entries.length) {
      log(`   No data found for ${year}`);
      continue;
    }

    log(`   ${entries.length} movies found — processing...`);

    for (let i = 0; i < entries.length; i++) {
      const entry = {
        ...entries[i],
        status:  year > CURRENT_YEAR ? "Upcoming" : undefined,
        verdict: year > CURRENT_YEAR ? "Upcoming" : undefined,
      };

      process.stdout.write(
        `  [${label}][${String(i+1).padStart(2,"0")}/${entries.length}] ${entry.title} ... `
      );

      try {
        await processMovie(token, entry, productionId, existing, castMap, stats);
        const existingId = existing.byTitle[entry.title.toLowerCase().trim()];
        console.log(existingId ? "✅ updated" : "🆕 created");
      } catch (e) {
        console.log(`❌ ${e.message}`);
        stats.errors++;
      }

      await sleep(400);
    }
  }

  const elapsed = ((Date.now() - START) / 1000).toFixed(1);
  log("\n═══════════════════════════════════════════════════════════════");
  log("  ✅  Sync Complete!");
  log(`  🆕  Movies created    : ${stats.created}`);
  log(`  ✏️   Movies updated    : ${stats.updated}`);
  log(`  ⏭️   Skipped           : ${stats.skipped}`);
  log(`  🎭  Cast added        : ${stats.castAdded}`);
  log(`  ❌  Errors            : ${stats.errors}`);
  log(`  ⏱️   Time taken        : ${elapsed}s`);
  log("═══════════════════════════════════════════════════════════════\n");
}

runSync();