/**
 * ═══════════════════════════════════════════════════════════════════
 *  scrape_imdb_ratings.js  —  Ollipedia IMDb Rating + Date Fixer  v3.0
 *
 *  WHY v3.0:
 *    IMDb's website now blocks direct scraping with heavy bot-detection
 *    and JS rendering. Instead, this script uses the FREE OMDb API
 *    (Open Movie Database) which returns clean JSON with:
 *      • imdbRating  (e.g. "7.2")
 *      • imdbVotes   (e.g. "1,234")
 *      • imdbID      (e.g. "tt1234567")
 *      • Released    (e.g. "18 Jan 2024")  ← fixes wrong dates in DB
 *      • Year        (e.g. "2024")
 *
 *  GET YOUR FREE API KEY:
 *    1. Go to https://www.omdbapi.com/apikey.aspx
 *    2. Select FREE (1,000 req/day) and enter your email
 *    3. You get an activation email — click the link
 *    4. Add to your .env:   OMDB_API_KEY=your_key_here
 *
 *  VERDICT LOGIC (from IMDb rating):
 *    ≥ 8.0  → Blockbuster
 *    ≥ 7.0  → Super Hit
 *    ≥ 6.0  → Hit
 *    ≥ 5.0  → Average
 *    ≥ 3.0  → Flop
 *    < 3.0  → Disaster
 *    N/A    → Released (keeps existing verdict if already set)
 *
 *  DATE FIX LOGIC:
 *    If OMDb returns a Released date AND it differs from what's in DB
 *    → update releaseDate to the correct ISO date
 *    → also update verdict/status based on whether date is past/future
 *
 *  USAGE:
 *    node scrape_imdb_ratings.js                   # update all unrated
 *    node scrape_imdb_ratings.js --dry-run          # print, don't save
 *    node scrape_imdb_ratings.js --limit 50         # first 50 only
 *    node scrape_imdb_ratings.js --movie "Dasama"   # one movie
 *    node scrape_imdb_ratings.js --year 2023        # one year
 *    node scrape_imdb_ratings.js --force            # re-fetch already rated
 *    node scrape_imdb_ratings.js --fix-dates-only   # only fix wrong dates
 *
 *  REQUIRED .env:
 *    MONGO_URI
 *    OMDB_API_KEY   ← get free at omdbapi.com/apikey.aspx
 * ═══════════════════════════════════════════════════════════════════
 */

import dotenv   from "dotenv";
import mongoose from "mongoose";
dotenv.config();

if (typeof fetch === "undefined") { console.error("Node 18+ required"); process.exit(1); }

// ── CLI ────────────────────────────────────────────────────────────
const argv           = process.argv.slice(2);
const DRY_RUN        = argv.includes("--dry-run");
const FORCE          = argv.includes("--force");
const FIX_DATES_ONLY = argv.includes("--fix-dates-only");
const MOVIE_FILTER   = argv.includes("--movie") ? argv[argv.indexOf("--movie")+1] : null;
const YEAR_FILTER    = argv.includes("--year")  ? argv[argv.indexOf("--year")+1]  : null;
const LIMIT          = argv.includes("--limit") ? parseInt(argv[argv.indexOf("--limit")+1]) : Infinity;

const DELAY = 1100; // ms between OMDb requests (free tier: 1000/day ≈ 1 req/sec safe)

// ── OMDb API key check ─────────────────────────────────────────────
const OMDB_KEY = process.env.OMDB_API_KEY || "";
if (!OMDB_KEY) {
  console.error(`
  ❌  OMDB_API_KEY not set in .env!

  Get your FREE key (1,000 requests/day):
    1. Visit: https://www.omdbapi.com/apikey.aspx
    2. Select FREE tier and enter your email
    3. Click the activation link in the email
    4. Add to .env:  OMDB_API_KEY=your_key_here

  Then re-run this script.
  `);
  process.exit(1);
}

// ── Mongoose Schema (matches server.js exactly) ────────────────────
const MovieSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  releaseDate: { type: String, default: "" },
  verdict:     { type: String, default: "Upcoming" },
  status:      { type: String, default: "Upcoming" },
  imdbId:      { type: String, default: "" },
  imdbRating:  { type: String, default: "" },   // String in your schema
  imdbVotes:   { type: String, default: "" },
}, { strict: false, timestamps: true });

const Movie = mongoose.models.Movie || mongoose.model("Movie", MovieSchema);

// ── Helpers ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Convert OMDb "Released" field "18 Jan 2024" → "2024-01-18"
const MONTH_MAP = {
  jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
  jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
};

function parseOMDbDate(raw) {
  if (!raw || raw === "N/A") return null;
  raw = raw.trim();
  // Already ISO: "2024-01-18"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // "18 Jan 2024" → "2024-01-18"
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,"0")}`;
  }
  // "2024" only
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  return null;
}

// Verdict from IMDb rating number
function ratingToVerdict(rating) {
  if (rating >= 8.0) return "Blockbuster";
  if (rating >= 7.0) return "Super Hit";
  if (rating >= 6.0) return "Hit";
  if (rating >= 5.0) return "Average";
  if (rating >= 3.0) return "Flop";
  return "Disaster";
}

// Verdict from release date (past/future)
function dateToVerdict(isoDate) {
  if (!isoDate) return null;
  const rd = new Date(isoDate);
  if (isNaN(rd.getTime())) return null;
  return rd <= new Date() ? "Released" : "Upcoming";
}

// ── OMDb API call ──────────────────────────────────────────────────
// Tries by title+year first, then title only if no match
// Returns the raw OMDb response object or null
async function queryOMDb(title, year) {
  const baseUrl = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&type=movie&`;

  // Strategy 1: exact title + year
  const queries = [];
  if (year) queries.push(`t=${encodeURIComponent(title)}&y=${year}`);
  // Strategy 2: title only (±1 year will match)
  queries.push(`t=${encodeURIComponent(title)}`);
  // Strategy 3: search (returns list, pick best match)
  queries.push(`s=${encodeURIComponent(title)}&y=${year || ""}`);

  for (const q of queries) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 12000);
      const res  = await fetch(baseUrl + q, {
        signal: ctrl.signal,
        headers: { "Accept": "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) { await sleep(800); continue; }

      const data = await res.json();

      // Single result (t= query)
      if (data.Response === "True" && data.imdbID) {
        // If year was provided, verify the year matches (±1)
        if (year && data.Year) {
          const diff = Math.abs(parseInt(data.Year) - parseInt(year));
          if (diff > 1) { await sleep(400); continue; }
        }
        return data;
      }

      // Search result (s= query) — pick best title match
      if (data.Response === "True" && data.Search) {
        const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g,"");
        const best = data.Search.find(r => {
          const rt = (r.Title||"").toLowerCase().replace(/[^a-z0-9]/g,"");
          return rt === normTitle && (!year || Math.abs((parseInt(r.Year)||0) - parseInt(year)) <= 1);
        }) || data.Search[0];

        if (best && best.imdbID) {
          // Fetch full details for the matched ID
          await sleep(400);
          const det = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${best.imdbID}`, {
            headers: { "Accept": "application/json" },
          });
          if (det.ok) {
            const detData = await det.json();
            if (detData.Response === "True") return detData;
          }
        }
      }
    } catch {
      // Network error — try next query
    }
    await sleep(400);
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Ollipedia — OMDb Rating + Date Fixer  v3.0");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Dry run        : ${DRY_RUN}`);
  console.log(`Force re-fetch : ${FORCE}`);
  console.log(`Fix dates only : ${FIX_DATES_ONLY}`);
  console.log(`Movie filter   : ${MOVIE_FILTER || "all"}`);
  console.log(`Year filter    : ${YEAR_FILTER  || "all"}`);
  console.log(`Limit          : ${isFinite(LIMIT) ? LIMIT : "none"}`);
  console.log(`OMDb key       : ${OMDB_KEY.slice(0,4)}****`);
  console.log("");

  if (!process.env.MONGO_URI) { console.error("MONGO_URI not set in .env"); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  // ── Build DB query ──────────────────────────────────────────────
  const query = {};
  if (MOVIE_FILTER) {
    query.title = { $regex: new RegExp(MOVIE_FILTER.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "i") };
  }
  if (YEAR_FILTER) {
    // Match movies whose releaseDate starts with this year OR year appears anywhere
    query.$or = [
      { releaseDate: { $regex: `^${YEAR_FILTER}` } },
      { releaseDate: { $regex: `-01-01$`, $options: "" } }, // year-only dates we want to fix
    ];
    // Override if specific year given
    if (YEAR_FILTER) query.$or = [{ releaseDate: { $regex: `^${YEAR_FILTER}` } }];
  }
  if (!FORCE && !FIX_DATES_ONLY) {
    // Only unrated movies
    query.$or = [
      ...(query.$or || []),
      { imdbRating: "" },
      { imdbRating: { $exists: false } },
      { imdbRating: null },
      { imdbId: "" },
      { imdbId: { $exists: false } },
    ];
  }

  const movies = await Movie.find(query).lean().limit(isFinite(LIMIT) ? LIMIT : 100000);
  console.log(`Found ${movies.length} movies to process\n`);

  if (movies.length === 0) {
    console.log("Nothing to do.");
    console.log("  • Use --force to re-fetch already-rated movies");
    console.log("  • Use --fix-dates-only to only correct release dates");
    await mongoose.disconnect();
    return;
  }

  console.log("Rating  => Verdict:  ≥8 Blockbuster | ≥7 SuperHit | ≥6 Hit | ≥5 Average | ≥3 Flop | <3 Disaster\n");

  let updated=0, datesFixed=0, notFound=0, errors=0;
  const verdictCounts = {};

  for (let i=0; i<movies.length; i++) {
    const movie   = movies[i];
    const dbYear  = (movie.releaseDate || "").slice(0, 4);
    const lbl     = `[${String(i+1).padStart(4)}/${movies.length}]`;

    process.stdout.write(`${lbl} "${movie.title}" (${dbYear||"?"}) ... `);

    try {
      // ── Query OMDb ──────────────────────────────────────────────
      const omdb = await queryOMDb(movie.title, dbYear);
      await sleep(DELAY);

      if (!omdb) {
        console.log("not found on OMDb");
        notFound++;
        continue;
      }

      // ── Extract fields ──────────────────────────────────────────
      const imdbId     = omdb.imdbID  || "";
      const ratingStr  = (omdb.imdbRating && omdb.imdbRating !== "N/A") ? omdb.imdbRating : "";
      const votesStr   = (omdb.imdbVotes  && omdb.imdbVotes  !== "N/A") ? omdb.imdbVotes  : "";
      const rating     = ratingStr ? parseFloat(ratingStr) : null;

      // ── Release date correction ─────────────────────────────────
      const omdbDate   = parseOMDbDate(omdb.Released || omdb.Year || "");
      const oldDate    = movie.releaseDate || "";
      // A date needs fixing if:
      //   (a) DB has no date, OR
      //   (b) DB has only year-01-01 (placeholder) and OMDb has a real date, OR
      //   (c) Dates differ and OMDb date looks more specific
      const dbIsPlaceholder = /^\d{4}-01-01$/.test(oldDate);
      const omdbIsSpecific  = omdbDate && !/^\d{4}-01-01$/.test(omdbDate);
      const dateChanged     = omdbDate && (
        !oldDate ||
        (dbIsPlaceholder && omdbIsSpecific) ||
        (omdbDate !== oldDate && omdbIsSpecific)
      );

      // ── Verdict ─────────────────────────────────────────────────
      let newVerdict = movie.verdict || "Upcoming";
      if (rating && !isNaN(rating) && !FIX_DATES_ONLY) {
        newVerdict = ratingToVerdict(rating);
      } else if (!rating && dateChanged) {
        // No rating but we got a correct date — update verdict by date
        newVerdict = dateToVerdict(omdbDate) || newVerdict;
      }

      // ── Build log line ──────────────────────────────────────────
      const ratingPart  = ratingStr ? `★ ${ratingStr}` : "no rating";
      const verdictPart = newVerdict !== (movie.verdict||"Upcoming")
        ? `${movie.verdict||"?"} → ${newVerdict}`
        : newVerdict;
      const datePart    = dateChanged
        ? `  📅 ${oldDate||"none"} → ${omdbDate}`
        : "";
      const votesPart   = votesStr ? ` (${votesStr} votes)` : "";

      console.log(`${ratingPart}${votesPart}  [${imdbId}]  ${verdictPart}${datePart}`);

      // ── Track verdict stats ─────────────────────────────────────
      if (newVerdict !== (movie.verdict||"Upcoming")) {
        const key = `${movie.verdict||"?"} → ${newVerdict}`;
        verdictCounts[key] = (verdictCounts[key]||0) + 1;
      }

      // ── Save to DB ──────────────────────────────────────────────
      if (!DRY_RUN) {
        const update = {
          imdbId,
          ...(ratingStr && !FIX_DATES_ONLY ? { imdbRating: ratingStr, imdbVotes: votesStr } : {}),
          ...(newVerdict ? { verdict: newVerdict } : {}),
          ...(newVerdict && newVerdict !== "Upcoming" ? { status: "Released" } : {}),
          ...(dateChanged ? { releaseDate: omdbDate } : {}),
        };
        await Movie.findByIdAndUpdate(movie._id, update);
      }

      if (ratingStr) updated++;
      if (dateChanged) datesFixed++;

    } catch(e) {
      console.log(`ERROR: ${String(e.message).slice(0,80)}`);
      errors++;
    }

    // Pause every 20 movies to stay well under the 1000/day free limit
    if ((i+1) % 20 === 0) {
      process.stdout.write(`  ── pause 4s (${i+1}/${movies.length}) ──\n`);
      await sleep(4000);
    }
  }

  // ── Final report ────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Final Report");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Total processed  : ${movies.length}`);
  console.log(`Ratings saved    : ${updated}`);
  console.log(`Dates corrected  : ${datesFixed}`);
  console.log(`Not found        : ${notFound}`);
  console.log(`Errors           : ${errors}`);
  if (DRY_RUN) console.log("\n  ⚠  DRY RUN — nothing written to DB");

  if (Object.keys(verdictCounts).length > 0) {
    console.log("\nVerdict changes:");
    for (const [k,v] of Object.entries(verdictCounts)) {
      console.log(`  ${k.padEnd(35)} ×${v}`);
    }
  }

  console.log(`\n💡 OMDb free tier: 1,000 requests/day`);
  console.log(`   This run used: ~${movies.length * 2} requests (search + fetch)`);
  console.log("\nDone! ✓");
  await mongoose.disconnect();
}

main().catch(e => {
  console.error("Fatal:", e.message);
  console.error(e.stack);
  process.exit(1);
});