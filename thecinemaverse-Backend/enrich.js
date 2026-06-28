/**
 * ══════════════════════════════════════════════════════════
 *  Ollipedia — Enrichment Script
 *  Fills in missing data for movies & cast already in MongoDB:
 *    • Movie poster (thumbnailUrl / posterUrl)
 *    • Movie banner (wide image)
 *    • Movie synopsis
 *    • Movie genre (from Wikipedia categories)
 *    • Cast profile photo
 *    • Cast bio (first paragraph from Wikipedia)
 *
 *  Source: Wikipedia REST API + Wikimedia Commons (FREE, no key needed)
 *
 *  Usage:
 *    node enrich.js            ← enriches everything missing
 *    node enrich.js movies     ← only movies
 *    node enrich.js cast       ← only cast
 *    node enrich.js movies 50  ← only first 50 movies (for testing)
 * ══════════════════════════════════════════════════════════
 *  Install (already in your backend):
 *    npm install axios mongoose dotenv
 * ══════════════════════════════════════════════════════════
 */

require("dotenv").config();
const axios    = require("axios");
const mongoose = require("mongoose");

// ── Schemas ───────────────────────────────────────────────

const CastSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  type:   { type: String, default: "Actor" },
  bio:    String,
  photo:  String,
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  category:     { type: String, default: "Feature Film" },
  genre:        [String],
  releaseDate:  String,
  director:     String,
  producer:     String,
  language:     { type: String, default: "Odia" },
  synopsis:     String,
  posterUrl:    String,
  thumbnailUrl: String,
  bannerUrl:    String,
  productionId: { type: mongoose.Schema.Types.ObjectId, ref: "Production" },
  cast: [new mongoose.Schema({
    castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast", required: true },
    name:   { type: String, default: "" },
    photo:  { type: String, default: "" },
    type:   { type: String, default: "Actor" },
    role:   { type: String, default: "" },
  }, { _id: false })],
  media:     { trailer: { ytId: String, url: String }, songs: [] },
  boxOffice: { opening: String, firstWeek: String, total: String },
  verdict:   String,
  status:    String,
  reviews:   [],
  news:      [],
}, { timestamps: true });

const Cast  = mongoose.model("Cast",  CastSchema);
const Movie = mongoose.model("Movie", MovieSchema);

// ── Wikipedia API helpers ─────────────────────────────────

const WIKI_HEADERS = {
  "User-Agent": "OllipediaEnricher/1.0 (educational project; contact@ollipedia.com)",
  "Accept": "application/json",
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Search Wikipedia for a page title matching the query.
 * Returns the best matching page title or null.
 */
async function wikiSearch(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php`;
    const { data } = await axios.get(url, {
      params: {
        action:   "opensearch",
        search:   query,
        limit:    3,
        format:   "json",
        namespace: 0,
      },
      headers: WIKI_HEADERS,
      timeout: 10000,
    });
    // data[1] is array of titles
    const titles = data[1] || [];
    return titles[0] || null;
  } catch {
    return null;
  }
}

/**
 * Fetch the Wikipedia summary (intro text + thumbnail) for a page title.
 * Uses the REST summary API — fast and clean.
 */
async function wikiSummary(pageTitle) {
  try {
    const encoded = encodeURIComponent(pageTitle.replace(/ /g, "_"));
    const url     = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const { data } = await axios.get(url, {
      headers: WIKI_HEADERS,
      timeout: 10000,
    });
    return {
      extract:      data.extract        || "",        // full intro paragraph
      thumbnail:    data.thumbnail?.source || null,   // small thumbnail (~320px)
      originalImage: data.originalimage?.source || null, // full-size image
      description:  data.description   || "",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the main image URL for a Wikipedia page (higher resolution than summary thumbnail).
 * Uses the parse API to get the infobox image.
 */
async function wikiMainImage(pageTitle) {
  try {
    const { data } = await axios.get("https://en.wikipedia.org/w/api.php", {
      params: {
        action:      "query",
        titles:      pageTitle,
        prop:        "pageimages",
        pithumbsize: 500,
        format:      "json",
      },
      headers: WIKI_HEADERS,
      timeout: 10000,
    });
    const pages = data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

/**
 * Get genre/categories for a movie from Wikipedia categories.
 */
async function wikiCategories(pageTitle) {
  try {
    const { data } = await axios.get("https://en.wikipedia.org/w/api.php", {
      params: {
        action:  "query",
        titles:  pageTitle,
        prop:    "categories",
        cllimit: 30,
        format:  "json",
      },
      headers: WIKI_HEADERS,
      timeout: 10000,
    });
    const pages = data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    const cats  = (page?.categories || []).map(c => c.title.replace("Category:", ""));

    // Map Wikipedia categories → film genres
    const GENRE_MAP = {
      "action":       "Action",
      "comedy":       "Comedy",
      "drama":        "Drama",
      "thriller":     "Thriller",
      "romance":      "Romance",
      "horror":       "Horror",
      "crime":        "Crime",
      "adventure":    "Adventure",
      "fantasy":      "Fantasy",
      "biographical": "Biographical",
      "historical":   "Historical",
      "musical":      "Musical",
      "family":       "Family",
      "social":       "Social",
      "mythological": "Mythological",
    };

    const genres = [];
    for (const cat of cats) {
      const lower = cat.toLowerCase();
      for (const [key, genre] of Object.entries(GENRE_MAP)) {
        if (lower.includes(key) && !genres.includes(genre)) {
          genres.push(genre);
        }
      }
    }
    return genres.slice(0, 3); // max 3 genres
  } catch {
    return [];
  }
}

// ── Progress counter ──────────────────────────────────────

function progress(current, total, label) {
  const pct  = Math.round((current / total) * 100);
  const bar  = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r  [${bar}] ${pct}% — ${current}/${total} ${label}   `);
}

// ── Enrich Movies ─────────────────────────────────────────

async function enrichMovies(limit = 0) {
  // Only fetch movies that are missing poster OR synopsis
  const query = {
    $or: [
      { posterUrl:  { $in: [null, "", undefined] } },
      { synopsis:   { $in: [null, "", undefined] } },
    ]
  };

  const total  = await Movie.countDocuments(query);
  const movies = await Movie.find(query).limit(limit || 0).lean();

  console.log(`\n🎬 Enriching ${movies.length} movies (of ${total} needing data)...\n`);

  let enriched = 0, notFound = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    progress(i + 1, movies.length, m.title.slice(0, 30));

    // Search Wikipedia: try "Title Odia film" first, then just "Title film"
    let pageTitle = await wikiSearch(`${m.title} Odia film`);
    if (!pageTitle) pageTitle = await wikiSearch(`${m.title} film`);
    if (!pageTitle) pageTitle = await wikiSearch(m.title);

    if (!pageTitle) {
      notFound++;
      await sleep(300);
      continue;
    }

    // Fetch summary + image in parallel
    const [summary, mainImage, genres] = await Promise.all([
      wikiSummary(pageTitle),
      wikiMainImage(pageTitle),
      wikiCategories(pageTitle),
    ]);

    if (!summary) {
      notFound++;
      await sleep(300);
      continue;
    }

    // Build update object — only set fields that are currently empty
    const update = {};

    // Synopsis — first 2 sentences, max 300 chars
    if (!m.synopsis && summary.extract) {
      const sentences = summary.extract.match(/[^.!?]+[.!?]+/g) || [];
      const short     = sentences.slice(0, 2).join(" ").trim();
      update.synopsis = short.slice(0, 400) || summary.extract.slice(0, 400);
    }

    // Poster — prefer original full-size, fallback to thumbnail
    if (!m.posterUrl) {
      const img = summary.originalImage || mainImage || summary.thumbnail;
      if (img) update.posterUrl = img;
    }

    // Thumbnail (smaller version for cards/rows)
    if (!m.thumbnailUrl) {
      const thumb = summary.thumbnail || mainImage;
      if (thumb) update.thumbnailUrl = thumb;
    }

    // Banner — use original large image
    if (!m.bannerUrl) {
      const banner = summary.originalImage || mainImage;
      if (banner) update.bannerUrl = banner;
    }

    // Genre — only if currently empty
    if ((!m.genre || m.genre.length === 0) && genres.length > 0) {
      update.genre = genres;
    }

    if (Object.keys(update).length > 0) {
      await Movie.findByIdAndUpdate(m._id, { $set: update });
      enriched++;
    }

    // Polite delay — 400ms between Wikipedia requests
    await sleep(400);
  }

  console.log(`\n\n  ✅ Enriched : ${enriched} movies`);
  console.log(`  ❌ Not found: ${notFound} movies`);
  return { enriched, notFound };
}

// ── Enrich Cast ───────────────────────────────────────────

async function enrichCast(limit = 0) {
  // Only fetch cast missing photo OR bio
  const query = {
    $or: [
      { photo: { $in: [null, "", undefined] } },
      { bio:   { $in: [null, "", undefined] } },
    ]
  };

  const total     = await Cast.countDocuments(query);
  const castList  = await Cast.find(query).limit(limit || 0).lean();

  console.log(`\n👤 Enriching ${castList.length} cast members (of ${total} needing data)...\n`);

  let enriched = 0, notFound = 0;

  for (let i = 0; i < castList.length; i++) {
    const c = castList[i];
    progress(i + 1, castList.length, c.name.slice(0, 30));

    // Search: try "Name Indian actor/director/singer" etc.
    const typeHint = c.type === "Director" ? "director"
                   : c.type === "Singer"   ? "singer"
                   : "actor";

    let pageTitle = await wikiSearch(`${c.name} Indian ${typeHint}`);
    if (!pageTitle) pageTitle = await wikiSearch(`${c.name} Odia ${typeHint}`);
    if (!pageTitle) pageTitle = await wikiSearch(`${c.name} ${typeHint}`);
    if (!pageTitle) pageTitle = await wikiSearch(c.name);

    if (!pageTitle) {
      notFound++;
      await sleep(300);
      continue;
    }

    const [summary, mainImage] = await Promise.all([
      wikiSummary(pageTitle),
      wikiMainImage(pageTitle),
    ]);

    if (!summary) {
      notFound++;
      await sleep(300);
      continue;
    }

    const update = {};

    // Bio — first 2 sentences
    if (!c.bio && summary.extract) {
      const sentences = summary.extract.match(/[^.!?]+[.!?]+/g) || [];
      update.bio = sentences.slice(0, 2).join(" ").trim().slice(0, 500)
                || summary.extract.slice(0, 500);
    }

    // Photo — prefer original, fallback thumbnail
    if (!c.photo) {
      const img = summary.originalImage || mainImage || summary.thumbnail;
      if (img) update.photo = img;
    }

    if (Object.keys(update).length > 0) {
      await Cast.findByIdAndUpdate(c._id, { $set: update });
      enriched++;
    }

    await sleep(400);
  }

  console.log(`\n\n  ✅ Enriched : ${enriched} cast`);
  console.log(`  ❌ Not found: ${notFound} cast`);
  return { enriched, notFound };
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI not found in .env");
    process.exit(1);
  }

  const args  = process.argv.slice(2);
  const mode  = args[0] || "all";       // "all" | "movies" | "cast"
  const limit = parseInt(args[1]) || 0; // optional limit for testing

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected\n");
  console.log("══════════════════════════════════════════════");
  console.log("  Ollipedia Enrichment Script");
  console.log(`  Mode  : ${mode}${limit ? ` (limit: ${limit})` : ""}`);
  console.log("  Source: Wikipedia REST API (no key needed)");
  console.log("══════════════════════════════════════════════");

  let movieStats = { enriched: 0, notFound: 0 };
  let castStats  = { enriched: 0, notFound: 0 };

  if (mode === "all" || mode === "movies") {
    movieStats = await enrichMovies(limit);
  }

  if (mode === "all" || mode === "cast") {
    castStats = await enrichCast(limit);
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("══════════════════════════════════════════════");
  if (mode === "all" || mode === "movies") {
    console.log(`  🎬 Movies enriched : ${movieStats.enriched}`);
    console.log(`  🎬 Movies not found: ${movieStats.notFound}`);
  }
  if (mode === "all" || mode === "cast") {
    console.log(`  👤 Cast enriched   : ${castStats.enriched}`);
    console.log(`  👤 Cast not found  : ${castStats.notFound}`);
  }
  console.log("══════════════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("👋 Done!");
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});