/**
 * ═══════════════════════════════════════════════════════════
 *  enrich_songs.js  —  Ollipedia Song Credit Enricher
 *
 *  For every song that ALREADY has a ytId but is missing
 *  singer / musicDirector / lyricist, this script:
 *   1. Fetches the YouTube video description using the stored ytId
 *   2. Parses singer, music director, lyricist from the description
 *   3. Matches those names to Cast ObjectIds from the movie's cast list
 *   4. PATCHes each song individually via PATCH /admin/movies/:id/songs/:idx
 *
 *  Usage:
 *    node enrich_songs.js                      # all movies
 *    node enrich_songs.js --movie "Daman"      # one specific movie
 *    node enrich_songs.js --limit 10           # newest 10 movies
 *    node enrich_songs.js --overwrite          # update even if credits already exist
 *    node enrich_songs.js --dry-run            # print only, don't save
 *    node enrich_songs.js --movie "Daman" --dry-run
 *
 *  Required env (.env):
 *    API_URL      — e.g. http://localhost:4000/api
 *    ADMIN_TOKEN  — JWT from /api/admin/login
 *
 *  Optional env:
 *    YOUTUBE_API_KEY  — YouTube Data API v3 key (better description fetch)
 * ═══════════════════════════════════════════════════════════
 */

import dotenv from "dotenv";
dotenv.config();

if (typeof fetch === "undefined") {
  console.error("❌  fetch is not available. Please upgrade to Node.js 18+.");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const BASE        = process.env.API_URL || process.env.VITE_API_URL || "http://localhost:4000/api";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const YT_KEY      = process.env.YOUTUBE_API_KEY || "";

const argv         = process.argv.slice(2);
const DRY_RUN      = argv.includes("--dry-run");
const OVERWRITE    = argv.includes("--overwrite");
const MOVIE_FILTER = argv.includes("--movie") ? argv[argv.indexOf("--movie") + 1] : null;
const LIMIT        = argv.includes("--limit")  ? parseInt(argv[argv.indexOf("--limit") + 1], 10) : 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Fetch with retry ──────────────────────────────────────────────────────────
async function fetchSafe(url, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
}

// ── API ───────────────────────────────────────────────────────────────────────
async function getAllMovies() {
  const res = await fetchSafe(`${BASE}/movies`);
  if (!res.ok) throw new Error(`GET /movies → ${res.status}`);
  return res.json();
}

async function patchSong(movieId, songIndex, data) {
  if (DRY_RUN) return;
  const res = await fetchSafe(`${BASE}/admin/movies/${movieId}/songs/${songIndex}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PATCH songs/${songIndex} → ${res.status}: ${txt}`);
  }
  return res.json();
}

// ── YouTube description ───────────────────────────────────────────────────────
async function ytDescription(ytId) {
  if (!ytId) return "";
  await sleep(400);

  // Data API v3 (best — full description, no scraping)
  if (YT_KEY) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id",   ytId);
    url.searchParams.set("key",  YT_KEY);
    try {
      const res = await fetchSafe(url.toString());
      if (res.ok) {
        const data = await res.json();
        const desc = data?.items?.[0]?.snippet?.description || "";
        if (desc) return desc;
      }
    } catch {}
  }

  // Fallback: scrape the YouTube watch page
  try {
    const res = await fetchSafe(`https://www.youtube.com/watch?v=${ytId}`, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();

    // attributedDescription (newer YouTube layout)
    const m1 = html.match(/"attributedDescription"\s*:\s*\{[^}]*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m1) return m1[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');

    // simpleText fallback
    const m2 = html.match(/"description"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m2) return m2[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  } catch {}
  return "";
}

// ── Credit parser ─────────────────────────────────────────────────────────────
/**
 * Parse credits from YouTube description lines like:
 *   Singer    : Aseema Panda
 *   Music By  : Debasis Pati
 *   Lyrics    : Asish Panda
 *   Sung By     Human Sagar
 */
function parseCredits(desc) {
  if (!desc) return { singer: "", musicDirector: "", lyricist: "" };

  const lines = desc.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
  let singer = "", musicDirector = "", lyricist = "";

  for (const line of lines) {
    if (!singer) {
      const m = line.match(
        /^(?:singer|vocals?|sung\s*by|voice|performed\s*by)\s*[:\-–]?\s*(.+)/i
      );
      if (m) { singer = cleanCredit(m[1]); continue; }
    }
    if (!musicDirector) {
      const m = line.match(
        /^(?:music(?:\s*director)?|composed?\s*by|composition|music\s*by|score\s*by)\s*[:\-–]?\s*(.+)/i
      );
      if (m) { musicDirector = cleanCredit(m[1]); continue; }
    }
    if (!lyricist) {
      const m = line.match(
        /^(?:lyric(?:ist|s)?|words?\s*by|written\s*by|poem\s*by|penned\s*by)\s*[:\-–]?\s*(.+)/i
      );
      if (m) { lyricist = cleanCredit(m[1]); continue; }
    }
  }
  return { singer, musicDirector, lyricist };
}

function cleanCredit(raw = "") {
  return raw
    .replace(/@\S+/g, "")             // strip @handles
    .replace(/https?:\/\/\S+/g, "")   // strip URLs
    .replace(/[|\[\]]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[,;:.]+$/, "")
    .trim();
}

// ── Cast linker ───────────────────────────────────────────────────────────────
/**
 * Given a comma-separated name string and the movie's cast array,
 * return matching Cast ObjectId strings.
 */
function matchCastIds(nameStr, castList) {
  if (!nameStr || !castList?.length) return [];
  const names = nameStr.split(/[,&+]/).map(n => n.trim()).filter(Boolean);
  const ids   = [];
  for (const name of names) {
    const nl = name.toLowerCase();
    const match = castList.find(c => {
      const cl = (c.name || "").toLowerCase();
      return cl.includes(nl) || nl.includes(cl.split(" ")[0]);
    });
    if (match) {
      const id = String(match.castId || match._id || "");
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   🎵  Ollipedia Song Credit Enricher         ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  API        : ${BASE}`);
  console.log(`  Dry run    : ${DRY_RUN}`);
  console.log(`  Overwrite  : ${OVERWRITE}  (update songs that already have credits)`);
  console.log(`  YouTube    : ${YT_KEY ? "✅ API key set" : "⚠️  no API key (scraping fallback)"}`);
  console.log("");

  if (!ADMIN_TOKEN && !DRY_RUN) {
    console.error("❌  ADMIN_TOKEN is not set. Add ADMIN_TOKEN=... to your .env file");
    process.exit(1);
  }

  // Load all movies
  let movies;
  try {
    movies = await getAllMovies();
  } catch (e) {
    console.error("❌  Could not reach API:", e.message);
    process.exit(1);
  }

  // Sort newest → oldest
  movies.sort((a, b) => {
    const da = a.createdAt || a._id;
    const db = b.createdAt || b._id;
    return db > da ? 1 : db < da ? -1 : 0;
  });

  // Apply filters
  if (MOVIE_FILTER) {
    movies = movies.filter(m => m.title.toLowerCase().includes(MOVIE_FILTER.toLowerCase()));
    if (!movies.length) {
      console.error(`❌  No movie matching "${MOVIE_FILTER}"`);
      process.exit(1);
    }
    console.log(`🎯  Filtered to ${movies.length} movie(s) matching "${MOVIE_FILTER}"\n`);
  }

  if (LIMIT > 0) {
    movies = movies.slice(0, LIMIT);
    console.log(`🎯  Limited to newest ${LIMIT} movie(s)\n`);
  }

  // Only keep movies that have songs with ytIds
  const moviesWithSongs = movies.filter(m =>
    (m.media?.songs || []).some(s => s.ytId)
  );
  console.log(`📋  ${movies.length} total movies, ${moviesWithSongs.length} have songs with YouTube IDs\n`);

  let totalSongs = 0, enriched = 0, skipped = 0, failed = 0;

  for (let mi = 0; mi < moviesWithSongs.length; mi++) {
    const m        = moviesWithSongs[mi];
    const songs    = m.media?.songs || [];
    const castList = m.cast || [];

    console.log(`\n[${mi + 1}/${moviesWithSongs.length}] 🎬  ${m.title}  (${m.releaseDate ? new Date(m.releaseDate).getFullYear() : "?"})  —  ${songs.length} song(s)`);

    for (let si = 0; si < songs.length; si++) {
      const s = songs[si];

      if (!s.ytId) {
        console.log(`  [${si + 1}] ⏭️  "${s.title}" — no ytId, skipping`);
        skipped++;
        continue;
      }

      // Skip if already has all three credits and not overwriting
      const hasCredits = s.singer || s.musicDirector || s.lyricist;
      if (hasCredits && !OVERWRITE) {
        console.log(`  [${si + 1}] ⏭️  "${s.title}" — already has credits (use --overwrite to re-fetch)`);
        skipped++;
        continue;
      }

      totalSongs++;
      console.log(`  [${si + 1}] 🔎  "${s.title}"  ▶️  https://youtu.be/${s.ytId}`);

      // Fetch description
      const desc = await ytDescription(s.ytId);
      if (!desc) {
        console.log(`       ⚠️  Could not fetch description`);
        skipped++;
        continue;
      }

      // Parse credits
      const credits = parseCredits(desc);

      // Decide what to update — don't wipe existing good data
      const singer        = (!s.singer        || OVERWRITE) && credits.singer        ? credits.singer        : s.singer        || "";
      const musicDirector = (!s.musicDirector || OVERWRITE) && credits.musicDirector ? credits.musicDirector : s.musicDirector || "";
      const lyricist      = (!s.lyricist      || OVERWRITE) && credits.lyricist      ? credits.lyricist      : s.lyricist      || "";

      if (!credits.singer && !credits.musicDirector && !credits.lyricist) {
        console.log(`       ⚠️  No credits found in description`);
        skipped++;
        continue;
      }

      // Match to Cast ObjectIds
      const singerRef        = matchCastIds(singer,        castList);
      const musicDirectorRef = matchCastIds(musicDirector, castList);
      const lyricistRef      = matchCastIds(lyricist,      castList);

      // Log what we found
      if (singer)        console.log(`       🎤 Singer:  ${singer}${singerRef.length        ? ` 🔗 (${singerRef.length} linked)` : ""}`);
      if (musicDirector) console.log(`       🎼 Music:   ${musicDirector}${musicDirectorRef.length ? ` 🔗 (${musicDirectorRef.length} linked)` : ""}`);
      if (lyricist)      console.log(`       ✍️  Lyrics: ${lyricist}${lyricistRef.length        ? ` 🔗 (${lyricistRef.length} linked)` : ""}`);

      const patch = {
        singer,        singerRef,
        musicDirector, musicDirectorRef,
        lyricist,      lyricistRef,
      };

      if (DRY_RUN) {
        console.log(`       [DRY RUN] Would PATCH song ${si} — not saved`);
        enriched++;
        continue;
      }

      // Save
      try {
        await patchSong(m._id, si, patch);
        console.log(`       ✅  Saved`);
        enriched++;
      } catch (e) {
        console.error(`       ❌  Save failed: ${e.message}`);
        failed++;
      }

      // Be polite to YouTube
      await sleep(600);
    }
  }

  // Final report
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   📊  Final Report                          ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Movies processed : ${moviesWithSongs.length}`);
  console.log(`  Songs attempted  : ${totalSongs}`);
  console.log(`  Credits enriched : ${enriched}`);
  console.log(`  Skipped          : ${skipped}  (no ytId, already had credits, or no desc found)`);
  console.log(`  Errors           : ${failed}`);
  if (!DRY_RUN && enriched > 0) {
    console.log("\n  ✅  Credits are now live on all enriched songs.");
    console.log("      You can manually assign Cast refs from the Admin Portal.");
  }
}

main().catch(e => {
  console.error("\n💥  Fatal error:", e.message);
  process.exit(1);
});
