/**
 * ═══════════════════════════════════════════════════════════
 *  scrape_songs.js  —  Ollipedia Song Scraper
 *  
 *  For every movie in the DB this script:
 *   1. Searches Wikipedia for the film's soundtrack section
 *      → extracts: song title, singer(s), music director, lyricist
 *   2. Searches YouTube for each song
 *      → extracts: ytId, thumbnailUrl, video URL
 *   3. PATCHes the movie via the admin API with the full song list
 *
 *  OUTPUT per song:
 *    { title, singer, musicDirector, lyricist,
 *      ytId, url, thumbnailUrl,
 *      singerRef:[], musicDirectorRef:[], lyricistRef:[] }
 *
 *  Usage:
 *    node scrape_songs.js                        # all movies (skip if already has songs)
 *    node scrape_songs.js --movie "Daman"        # one specific movie (partial match)
 *    node scrape_songs.js --limit 5              # first 5 movies only
 *    node scrape_songs.js --overwrite            # replace existing songs too
 *    node scrape_songs.js --dry-run              # print results, don't save
 *    node scrape_songs.js --no-wiki              # skip Wikipedia, go straight to YouTube
 *    node scrape_songs.js --movie "Daman" --dry-run
 *
 *  Required env (.env or shell export):
 *    API_URL          — e.g. http://localhost:4000/api   (or VITE_API_URL)
 *    ADMIN_TOKEN      — JWT from /api/admin/login
 *
 *  Optional env:
 *    YOUTUBE_API_KEY  — YouTube Data API v3 key (better results, no scraping)
 *
 * ═══════════════════════════════════════════════════════════
 */

import dotenv from "dotenv";
dotenv.config();

// Node 18+ has fetch built-in — no extra package needed.
// You're on Node 23 so this will work fine.
if (typeof fetch === "undefined") {
  console.error("❌  fetch is not available. Please upgrade to Node.js 18+.");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const BASE        = process.env.API_URL || process.env.VITE_API_URL || "http://localhost:4000/api";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const YT_KEY      = process.env.YOUTUBE_API_KEY || "";

const argv        = process.argv.slice(2);
const DRY_RUN     = argv.includes("--dry-run");
const OVERWRITE   = argv.includes("--overwrite");
const NO_WIKI     = argv.includes("--no-wiki");
const MOVIE_FILTER= argv.includes("--movie") ? argv[argv.indexOf("--movie") + 1] : null;
const LIMIT       = argv.includes("--limit")  ? parseInt(argv[argv.indexOf("--limit") + 1], 10) : 0;

// Delays to stay polite to Wikipedia and YouTube
const DELAY_WIKI  = 700;
const DELAY_YT    = 900;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Utilities ─────────────────────────────────────────────────────────────────

function extractYtId(input) {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
}

function cleanText(raw = "") {
  return raw
    .replace(/<[^>]+>/g, " ")         // strip HTML tags
    .replace(/\[\d+\]/g, "")          // remove [1] citations
    .replace(/\(.*?\)/g, "")          // remove (parenthetical notes)
    .replace(/&amp;/g,  "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
      await sleep(1200 * (attempt + 1));
    }
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function getAllMovies() {
  const res = await fetchSafe(`${BASE}/movies`);
  if (!res.ok) throw new Error(`GET /movies → ${res.status}`);
  return res.json();
}

async function patchMovieSongs(movieId, songs) {
  if (DRY_RUN) return;
  const res = await fetchSafe(`${BASE}/admin/movies/${movieId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ media: { songs } }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PATCH /admin/movies/${movieId} → ${res.status}: ${txt}`);
  }
  return res.json();
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────

/**
 * Search Wikipedia and return the best-matching article title.
 * Tries several query variants from specific → broad.
 */
async function wikiSearch(movieTitle, year, language) {
  const queries = [
    `${movieTitle} ${year} ${language} film`,
    `${movieTitle} ${language} film`,
    `${movieTitle} Odia film`,
    `${movieTitle} film`,
    movieTitle,
  ];

  for (const q of queries) {
    await sleep(300);
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list",   "search");
    url.searchParams.set("srsearch", q);
    url.searchParams.set("srlimit", "5");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    try {
      const res = await fetchSafe(url.toString());
      if (!res.ok) continue;
      const data = await res.json();
      const results = data?.query?.search || [];

      // Prefer results whose title contains the movie name
      const match = results.find(r =>
        r.title.toLowerCase().includes(movieTitle.toLowerCase()) &&
        (r.title.toLowerCase().includes("film") ||
         r.snippet.toLowerCase().includes("odia") ||
         r.snippet.toLowerCase().includes("film"))
      ) || results[0];

      if (match) return match.title;
    } catch { /* try next query */ }
  }
  return null;
}

/**
 * Fetch full Wikipedia article HTML for a page title.
 */
async function wikiHtml(title) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page",   title);
  url.searchParams.set("prop",   "text");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetchSafe(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return data?.parse?.text?.["*"] || null;
  } catch { return null; }
}

/**
 * Parse the soundtrack / songs table from Wikipedia HTML.
 *
 * Wikipedia Odia film articles typically have a section like:
 *   == Soundtrack ==
 *   {| class="wikitable"
 *   ! No. !! Title !! Singer(s) !! Lyrics !! Music !! Length
 *   |-
 *   | 1 || "Song Name" || Singer A, Singer B || Poet X || MD Y || 3:45
 *
 * Returns: [{ title, singer, musicDirector, lyricist }]
 */
function parseWikiSongs(html) {
  if (!html) return [];
  const songs = [];

  // ── Strategy 1: find <table> tags that look like a tracklist ──────────────
  // Extract every table
  const tableParts = [];
  let depth = 0, start = -1;
  // Simple extraction: find all <table>...</table> blocks
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    tableParts.push(tableMatch[0]);
  }

  for (const table of tableParts) {
    // Check header row for song/singer columns
    const headerCells = [];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let th;
    while ((th = thRe.exec(table)) !== null) {
      headerCells.push(cleanText(th[1]).toLowerCase());
    }

    // Must have a title column and at least one of singer/lyrics/music
    const hasTitleCol  = headerCells.some(h => /title|song|name/i.test(h));
    const hasMusicInfo = headerCells.some(h => /singer|vocal|artist|lyric|music|composer/i.test(h));
    if (!hasTitleCol && !hasMusicInfo) continue;

    // Build column index map
    const col = {};
    headerCells.forEach((h, i) => {
      if      (/^no\.?$|^#$|^s\.?no/i.test(h)           && col.no    === undefined) col.no    = i;
      else if (/title|song|name/i.test(h)                && col.title === undefined) col.title = i;
      else if (/singer|vocal|artist|performed/i.test(h)  && col.singer=== undefined) col.singer= i;
      else if (/lyric|word|poet|written/i.test(h)        && col.lyric === undefined) col.lyric = i;
      else if (/music|composer|director|score/i.test(h)  && col.music === undefined) col.music = i;
      else if (/length|duration|time/i.test(h)           && col.len   === undefined) col.len   = i;
    });

    if (col.title === undefined) continue;

    // Parse data rows
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let row;
    let rowNum = 0;
    while ((row = rowRe.exec(table)) !== null) {
      rowNum++;
      if (rowNum === 1) continue; // skip header

      const cells = [];
      const tdRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdRe.exec(row[1])) !== null) {
        cells.push(cleanText(td[1]));
      }
      if (cells.length < 2) continue;

      const title = col.title !== undefined ? (cells[col.title] || "") : "";
      if (!title || /^(title|song|name|—|–|-|\s*)$/i.test(title)) continue;

      const entry = {
        title:         title,
        singer:        col.singer !== undefined ? (cells[col.singer] || "") : "",
        musicDirector: col.music  !== undefined ? (cells[col.music]  || "") : "",
        lyricist:      col.lyric  !== undefined ? (cells[col.lyric]  || "") : "",
      };
      songs.push(entry);
    }

    if (songs.length > 0) break; // found what we need
  }

  // ── Strategy 2: ordered/unordered list near "Songs"/"Soundtrack" heading ──
  if (songs.length === 0) {
    // Find all list items
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRe.exec(html)) !== null) {
      const text = cleanText(li[1]);
      // Valid song titles: 3–60 chars, no obvious nav text
      if (
        text.length >= 3 && text.length <= 80 &&
        !text.match(/wikipedia|http|edit|view|talk|category|portal/i) &&
        !text.match(/^\d+$/)
      ) {
        songs.push({ title: text, singer: "", musicDirector: "", lyricist: "" });
      }
    }
    // Cap at 20 to avoid navigation noise
    return songs.slice(0, 20);
  }

  return songs;
}

// ── YouTube search ────────────────────────────────────────────────────────────

/**
 * Search YouTube for a video matching the query.
 * Uses Data API v3 if YOUTUBE_API_KEY is set, otherwise scrapes HTML.
 * Returns ytId string or "".
 */
/**
 * Search YouTube for one video.
 * Returns { id, title } or null.
 */
async function ytSearch(query) {
  await sleep(DELAY_YT);

  // ── YouTube Data API v3 (clean, accurate) ─────────────────────
  if (YT_KEY) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part",       "snippet");
    url.searchParams.set("type",       "video");
    url.searchParams.set("maxResults", "3");
    url.searchParams.set("q",          query);
    url.searchParams.set("key",        YT_KEY);
    try {
      const res = await fetchSafe(url.toString());
      if (res.ok) {
        const data = await res.json();
        for (const item of (data?.items || [])) {
          const id    = item?.id?.videoId;
          const title = item?.snippet?.title || "";
          if (id && title) return { id, title };
        }
      }
    } catch { /* fall through */ }
  }

  // ── Fallback: scrape YouTube search HTML ──────────────────────
  // Extract all {videoId, title} pairs — pick the best match
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  try {
    const res = await fetchSafe(searchUrl, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept":          "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractYtCandidates(html, query, 1)[0] || null;
  } catch { return null; }
}

/**
 * Extract up to `limit` {id, title} candidates from YouTube HTML.
 * Skips jukeboxes / full albums unless allowJukebox is true.
 */
function extractYtCandidates(html, query = "", limit = 10, allowJukebox = false) {
  const JUKEBOX = /jukebox|full album|all songs|audio jukebox|songs playlist|lyrical.*collection/i;
  const seen    = new Set();
  const results = [];

  // YouTube embeds initial data as ytInitialData JSON — parse videoRenderer blocks
  // Pattern: "videoId":"ID" ... nearby "text":"TITLE"
  const re = /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"[\s\S]{0,600}?"text"\s*:\s*"([^"]{3,120})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id    = m[1];
    const title = m[2];
    if (seen.has(id)) continue;
    seen.add(id);

    if (!allowJukebox && JUKEBOX.test(title)) continue;

    results.push({ id, title });
    if (results.length >= limit) break;
  }
  return results;
}

// ── Song enrichment ───────────────────────────────────────────────────────────

/**
 * Given one movie, produce the full enriched song list:
 *   1. Wikipedia → [{ title, singer, musicDirector, lyricist }]
 *   2. YouTube   → add ytId, url, thumbnailUrl to each
 *
 * Returns array ready to PATCH into movie.media.songs
 */
async function buildSongList(movie) {
  const title  = movie.title;
  const year   = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const lang   = movie.language || "Odia";

  let wikiSongs = [];

  // ── Wikipedia ────────────────────────────────────────────────────
  if (!NO_WIKI) {
    const wikiTitle = await wikiSearch(title, year, lang);
    await sleep(DELAY_WIKI);

    if (wikiTitle) {
      console.log(`     📖  Wikipedia: "${wikiTitle}"`);
      const html = await wikiHtml(wikiTitle);
      await sleep(DELAY_WIKI);

      if (html) {
        wikiSongs = parseWikiSongs(html);
        console.log(`     🎵  Found ${wikiSongs.length} song(s) from Wikipedia`);
      }
    } else {
      console.log(`     ⚠️  No Wikipedia page found`);
    }
  }

  // ── Build final list ─────────────────────────────────────────────
  const results = [];

  if (wikiSongs.length === 0) {
    // No tracklist from Wikipedia — scrape YouTube search for individual songs
    console.log(`     🔎  No tracklist — scraping YouTube for individual songs…`);
    await sleep(DELAY_YT);

    const query      = `${title} ${year} Odia movie song`.trim();
    const searchUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    let   candidates = [];

    try {
      const res = await fetchSafe(searchUrl, {
        headers: {
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept":          "text/html,application/xhtml+xml",
        },
      });
      if (res.ok) {
        const html = await res.text();
        // Get up to 15 candidates, allow jukeboxes too as fallback
        candidates = extractYtCandidates(html, query, 15, false);
        if (candidates.length === 0) {
          candidates = extractYtCandidates(html, query, 15, true);
        }
      }
    } catch (e) {
      console.log(`     ⚠️  YouTube fetch error: ${e.message}`);
    }

    if (candidates.length === 0) {
      console.log(`     ⚠️  Nothing found on YouTube`);
      return results;
    }

    // Filter to videos that look like songs from THIS movie
    // Keep: title contains movie name OR contains "odia"/"song"
    const movieWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const isSongVideo = (t) => {
      const tl = t.toLowerCase();
      return movieWords.some(w => tl.includes(w)) ||
             /odia|song|\bost\b/i.test(tl);
    };

    const songVideos = candidates.filter(c => isSongVideo(c.title));
    const finalList  = songVideos.length > 0 ? songVideos : candidates.slice(0, 5);

    console.log(`     🎵  Found ${finalList.length} song video(s) from YouTube`);

    for (const v of finalList) {
      // Clean up the YouTube title to use as song title:
      // Remove the movie name, year, "Odia", "official", "video", "song" suffixes
      let songTitle = v.title
        .replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
        .replace(/\b(official|audio|video|full|hd|4k|odia|song|music|lyrical?|ft\.?|feat\.?)\b/gi, "")
        .replace(/[|\-–—]+/g, " ")
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(new RegExp(String(year), "g"), "")
        .replace(/\s{2,}/g, " ")
        .trim();

      // If cleaning removed everything, fall back to raw title
      if (songTitle.length < 2) songTitle = v.title;

      console.log(`     ▶️  "${songTitle}"  →  https://youtu.be/${v.id}`);

      results.push({
        title:           songTitle,
        singer:          "",
        singerRef:       [],
        musicDirector:   "",
        musicDirectorRef:[],
        lyricist:        "",
        lyricistRef:     [],
        ytId:            v.id,
        url:             `https://www.youtube.com/watch?v=${v.id}`,
        thumbnailUrl:    `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`,
      });
    }

    return results;
  }

  // We have song names from Wikipedia — find each on YouTube
  for (const s of wikiSongs) {
    // Build a targeted query: song title + movie name + singer (if known) + language
    // Anchor every search: "Song" MovieTitle Singer YEAR Odia movie song
    const suffix  = [String(year||""), lang === "Odia" ? "Odia" : lang, "movie", "song"].filter(Boolean).join(" ");
    const ytQuery = [`"${s.title}"`, title, s.singer||"", suffix].filter(Boolean).join(" ");

    console.log(`     🔎  "${s.title}"${s.singer ? "  🎤 " + s.singer : ""}${s.musicDirector ? "  🎼 " + s.musicDirector : ""}`);

    const ytResult = await ytSearch(ytQuery);
    const id       = ytResult?.id    || "";
    // Use Wikipedia title (authoritative) — YouTube title is just for logging
    const ytTitle  = ytResult?.title || "";

    if (id) {
      console.log(`          ▶️  https://youtu.be/${id}  "${ytTitle}"`);
    } else {
      console.log(`          ⚠️  No YouTube match`);
    }

    results.push({
      title:           s.title,          // ← always use Wikipedia song title
      singer:          s.singer,
      singerRef:       [],
      musicDirector:   s.musicDirector,
      musicDirectorRef:[],
      lyricist:        s.lyricist,
      lyricistRef:     [],
      ytId:            id,
      url:             id ? `https://www.youtube.com/watch?v=${id}` : "",
      thumbnailUrl:    id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "",
    });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   🎬  Ollipedia Song Scraper                 ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  API       : ${BASE}`);
  console.log(`  Dry run   : ${DRY_RUN}`);
  console.log(`  Overwrite : ${OVERWRITE}`);
  console.log(`  Skip Wiki : ${NO_WIKI}`);
  console.log(`  YouTube   : ${YT_KEY ? "✅ API key set" : "⚠️  no API key (scraping fallback)"}`);
  console.log("");

  if (!ADMIN_TOKEN && !DRY_RUN) {
    console.error("❌  ADMIN_TOKEN is not set.");
    console.error("    Run:  export ADMIN_TOKEN=<token from /api/admin/login>");
    console.error("    Or add ADMIN_TOKEN=... to your .env file");
    process.exit(1);
  }

  // ── Load movies ──────────────────────────────────────────────────
  let movies;
  try {
    movies = await getAllMovies();
  } catch (e) {
    console.error("❌  Could not reach API:", e.message);
    process.exit(1);
  }
  console.log(`📋  ${movies.length} movies in DB\n`);

  // ── Apply filters ────────────────────────────────────────────────
  if (MOVIE_FILTER) {
    movies = movies.filter(m =>
      m.title.toLowerCase().includes(MOVIE_FILTER.toLowerCase())
    );
    if (!movies.length) {
      console.error(`❌  No movie matching "${MOVIE_FILTER}"`);
      process.exit(1);
    }
    console.log(`🎯  Filtered to ${movies.length} movie(s) matching "${MOVIE_FILTER}"\n`);
  }

  if (LIMIT > 0) {
    movies = movies.slice(0, LIMIT);
    console.log(`🎯  Limited to first ${LIMIT} movie(s)\n`);
  }

  // ── Process ──────────────────────────────────────────────────────
  let processed = 0, skipped = 0, saved = 0, failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    const existingCount = m.media?.songs?.length || 0;

    console.log(`\n[${i + 1}/${movies.length}] 🎬  ${m.title}  (${m.releaseDate ? new Date(m.releaseDate).getFullYear() : "?"})  |  ${m.language || "Odia"}`);

    if (existingCount > 0 && !OVERWRITE) {
      console.log(`  ⏭️  Already has ${existingCount} song(s) — skipping (use --overwrite to replace)`);
      skipped++;
      continue;
    }

    try {
      const songs = await buildSongList(m);
      processed++;

      if (!songs.length) {
        console.log(`  ⚠️  No songs found — nothing saved`);
        continue;
      }

      // ── Print summary ──────────────────────────────────────────
      console.log(`\n  📋  Result: ${songs.length} song(s)`);
      songs.forEach((s, idx) => {
        const yt = s.ytId ? `▶️  https://youtu.be/${s.ytId}` : "⚠️  no video";
        console.log(`  ${String(idx + 1).padStart(2, " ")}. ${s.title}`);
        if (s.singer)        console.log(`      🎤 Singer:        ${s.singer}`);
        if (s.musicDirector) console.log(`      🎼 Music Director: ${s.musicDirector}`);
        if (s.lyricist)      console.log(`      ✍️  Lyricist:      ${s.lyricist}`);
        console.log(`      ${yt}`);
      });

      // ── Save ───────────────────────────────────────────────────
      if (DRY_RUN) {
        console.log(`\n  [DRY RUN] Would PATCH ${songs.length} songs → not saved`);
      } else {
        process.stdout.write(`\n  💾  Saving to DB…`);
        await patchMovieSongs(m._id, songs);
        saved++;
        console.log(` ✅  Done`);
      }

    } catch (e) {
      console.error(`\n  ❌  Error: ${e.message}`);
      failed++;
    }

    // Be polite between movies
    if (i < movies.length - 1) await sleep(1000);
  }

  // ── Final report ──────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   📊  Final Report                          ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Total movies  : ${movies.length}`);
  console.log(`  Processed     : ${processed}`);
  console.log(`  Skipped       : ${skipped}  (already had songs)`);
  if (!DRY_RUN) {
    console.log(`  Saved to DB   : ${saved}`);
  } else {
    console.log(`  Dry run       : nothing was saved`);
  }
  console.log(`  Errors        : ${failed}`);
  console.log("");
  if (!DRY_RUN && saved > 0) {
    console.log("  ✅  Songs are now live. You can assign Cast refs (singerRef,");
    console.log("      musicDirectorRef, lyricistRef) from the Admin Portal.");
  }
}

main().catch(e => {
  console.error("\n💥  Fatal error:", e.message);
  process.exit(1);
});