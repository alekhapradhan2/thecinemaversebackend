/**
 * ══════════════════════════════════════════════════════════
 *  Ollipedia — Wikipedia Odia Films Scraper
 *  Place this file in your Ollypedia-Backend folder and run:
 *    node scrape.js
 *  or scrape a specific year:
 *    node scrape.js 2022
 *    node scrape.js 2021 2022 2023
 * ══════════════════════════════════════════════════════════
 *  Requires (already in Ollypedia-Backend):
 *    npm install axios cheerio
 *  Then run once. Safe to re-run — skips already-existing movies.
 * ══════════════════════════════════════════════════════════
 */

require("dotenv").config();
const axios    = require("axios");
const cheerio  = require("cheerio");
const mongoose = require("mongoose");

// ── Schemas (mirrors server.js exactly) ──────────────────

const CastSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  type:   { type: String, default: "Actor" },
  bio:    String,
  photo:  String,
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  category:    { type: String, default: "Feature Film" },
  genre:       [String],
  releaseDate: String,
  releaseTBA:  Boolean,
  director:    String,
  producer:    String,
  budget:      String,
  language:    { type: String, default: "Odia" },
  synopsis:    String,
  posterUrl:   String,
  productionId:  { type: mongoose.Schema.Types.ObjectId, ref: "Production" },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "Production" }],
  cast: [new mongoose.Schema({
    castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast", required: true },
    name:   { type: String, default: "" },
    photo:  { type: String, default: "" },
    type:   { type: String, default: "Actor" },
    role:   { type: String, default: "" },
  }, { _id: false })],
  media: {
    trailer: { ytId: String, url: String },
    songs:   [{ title: String, singer: String, ytId: String, url: String }],
  },
  boxOffice: {
    opening:   { type: String, default: "TBA" },
    firstWeek: { type: String, default: "TBA" },
    total:     { type: String, default: "TBA" },
  },
  verdict: { type: String, default: "Upcoming" },
  status:  { type: String, default: "Upcoming" },
  reviews: [],
  news:    [],
}, { timestamps: true });

const Cast  = mongoose.model("Cast",  CastSchema);
const Movie = mongoose.model("Movie", MovieSchema);

// ── Helpers ──────────────────────────────────────────────

function cleanText(str) {
  return (str || "")
    .replace(/\[.*?\]/g, "")   // remove [1], [2] citation refs
    .replace(/\(.*?\)/g, "")   // remove parenthetical notes
    .replace(/\s+/g, " ")
    .trim();
}

function splitNames(str) {
  return str
    .split(/[,\/\n•·]/)
    .map(s => cleanText(s))
    .filter(s => s.length > 1 && s.length < 60);
}

// Month name → number
const MONTHS = {
  january:"01", february:"02", march:"03", april:"04",
  may:"05", june:"06", july:"07", august:"08",
  september:"09", october:"10", november:"11", december:"12",
};

function parseDate(dayStr, monthStr, year) {
  const day   = String(parseInt(dayStr) || 1).padStart(2, "0");
  const month = MONTHS[monthStr.toLowerCase()] || "01";
  return `${year}-${month}-${day}`;
}

// ── Scrape one Wikipedia year page ───────────────────────

async function scrapePage(year) {
  const url = `https://en.wikipedia.org/wiki/List_of_Odia_films_of_${year}`;
  console.log(`\n🌐 Fetching: ${url}`);

  const { data: html } = await axios.get(url, {
    headers: { "User-Agent": "OllipediaScraper/1.0 (educational project)" },
    timeout: 15000,
  });

  const $       = cheerio.load(html);
  const films   = [];
  let   curMonth = "January";
  let   curDay   = "1";

  // Wikipedia Odia film pages use wikitable sortable
  $("table.wikitable").each((_, table) => {
    $(table).find("tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (!cells.length) return;

      // Detect month header rows (colspan rows or th-only rows)
      const firstCell = cells.first();
      const text      = firstCell.text().trim();
      const monthMatch = Object.keys(MONTHS).find(m =>
        text.toLowerCase().includes(m)
      );
      if (monthMatch) {
        curMonth = monthMatch.charAt(0).toUpperCase() + monthMatch.slice(1);
        return;
      }

      // Try to detect day column (first td that's just a number)
      const allTds = $(row).find("td");
      if (!allTds.length) return;

      const tds     = allTds.toArray().map(td => cleanText($(td).text()));
      const tdLinks = allTds.toArray().map(td => $(td).find("a").first().attr("href") || "");

      // Heuristic: find which column is the title (has an internal wiki link)
      // Wikipedia format: Opening | Title | Director | Cast | Ref
      // Sometimes: Day | Title | Director | Cast | Ref

      let dayCol    = -1;
      let titleCol  = -1;
      let dirCol    = -1;
      let castCol   = -1;

      // If first cell looks like a day number
      if (/^\d{1,2}$/.test(tds[0])) {
        dayCol   = 0;
        titleCol = 1;
        dirCol   = 2;
        castCol  = 3;
        curDay   = tds[0];
      } else {
        titleCol = 0;
        dirCol   = 1;
        castCol  = 2;
      }

      const title = tds[titleCol];
      if (!title || title.length < 2) return;

      // Skip rows that are clearly headers or empty
      if (title.toLowerCase().includes("title")) return;

      const director  = tds[dirCol]   || "";
      const castRaw   = tds[castCol]  || "";
      const castNames = splitNames(castRaw);

      films.push({
        title:       cleanText(title),
        director:    cleanText(director),
        castNames,
        releaseDate: parseDate(curDay, curMonth, year),
        year,
      });
    });
  });

  // Fallback: if wikitable parsing got nothing, try all rows
  if (films.length === 0) {
    console.log("  ⚠ wikitable empty — trying all tables...");
    $("table").each((_, table) => {
      $(table).find("tr").each((_, row) => {
        const tds = $(row).find("td").toArray().map(td => cleanText($(td).text()));
        if (tds.length < 2) return;
        const title = tds.find(t => t.length > 2 && t.length < 80 && !/^\d+$/.test(t));
        if (title) {
          films.push({
            title,
            director:    tds[2] || "",
            castNames:   splitNames(tds[3] || ""),
            releaseDate: `${year}-01-01`,
            year,
          });
        }
      });
    });
  }

  console.log(`  ✅ Found ${films.length} films on page`);
  return films;
}

// ── Save to MongoDB ───────────────────────────────────────

async function saveFilms(films) {
  let created = 0, skipped = 0, castCreated = 0;

  for (const f of films) {
    if (!f.title || f.title.length < 2) { skipped++; continue; }

    // Skip if already exists (case-insensitive)
    const existing = await Movie.findOne({
      title: { $regex: `^${f.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
    });
    if (existing) {
      console.log(`  ⏭  Skip (exists): ${f.title}`);
      skipped++;
      continue;
    }

    // Process cast — find or create each person
    const castIds = [];

    // Director as crew entry
    if (f.director) {
      let dirDoc = await Cast.findOne({ name: { $regex: `^${f.director}$`, $options: "i" } });
      if (!dirDoc) {
        dirDoc = await Cast.create({ name: f.director, type: "Director" });
        castCreated++;
      }
      castIds.push({ castId: dirDoc._id.toString(), name: dirDoc.name, photo: "", type: "Director", role: "Director" });
    }

    // Actors
    for (const name of f.castNames) {
      if (!name || name === f.director) continue;
      let castDoc = await Cast.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
      if (!castDoc) {
        castDoc = await Cast.create({ name, type: "Actor" });
        castCreated++;
      }
      castIds.push({ castId: castDoc._id.toString(), name: castDoc.name, photo: "", type: "Actor", role: "" });
    }

    // Create the movie
    const movie = await Movie.create({
      title:       f.title,
      category:    "Feature Film",
      language:    "Odia",
      releaseDate: f.releaseDate,
      director:    f.director,
      verdict:     "Released",
      status:      "Released",
      cast:        castIds,
      genre:       [],
      media:       { trailer: {}, songs: [] },
      boxOffice:   { opening: "TBA", firstWeek: "TBA", total: "TBA" },
    });

    // Back-link cast → movie
    for (const c of castIds) {
      await Cast.findByIdAndUpdate(c.castId.toString(), { $addToSet: { movies: movie._id } });
    }

    console.log(`  ✅ Created: ${f.title} (${f.releaseDate}) — ${castIds.length} cast`);
    created++;
  }

  return { created, skipped, castCreated };
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI not found. Make sure .env is in the same folder.");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected");

  // Years to scrape — default 2020–2024, or pass as CLI args
  const args  = process.argv.slice(2);
  const years = args.length > 0
    ? args.map(Number)
    : [2019,2020,2021,2022,2023,2024,2025,2026];

  let totalCreated = 0, totalSkipped = 0, totalCast = 0;

  for (const year of years) {
    try {
      const films = await scrapePage(year);
      const stats = await saveFilms(films);
      totalCreated += stats.created;
      totalSkipped += stats.skipped;
      totalCast    += stats.castCreated;
    } catch (err) {
      console.error(`❌ Error scraping ${year}:`, err.message);
    }
    // Be polite to Wikipedia — wait 1s between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n══════════════════════════════");
  console.log(`🎬 Movies created : ${totalCreated}`);
  console.log(`⏭  Movies skipped : ${totalSkipped} (already existed)`);
  console.log(`👤 Cast created   : ${totalCast}`);
  console.log("══════════════════════════════\n");

  await mongoose.disconnect();
  console.log("👋 Done!");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});