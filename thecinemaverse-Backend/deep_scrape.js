/**
 * ═══════════════════════════════════════════════════════════════════
 *  deep_scrape.js  —  Ollipedia Comprehensive Odia Film Scraper
 *
 *  What this does:
 *   ① Scrapes Wikipedia year-list pages (1936 → today) for every Odia film
 *   ② Deep-scrapes each film's own Wikipedia article for full infobox
 *   ③ Searches & scrapes IMDB for: rating, vote count, content rating,
 *      full cast with roles + photos, plot, trailer thumbnail, keywords
 *   ④ For each cast/crew member: creates if missing, fills photo/bio/dob
 *      from Wikipedia if not already present
 *   ⑤ Smart update: NEVER overwrites existing data — only fills gaps
 *
 *  Sources (ALL FREE — no API key needed):
 *    • Wikipedia year-list pages  → movie list + basic cast + release dates
 *    • Wikipedia film articles    → infobox (director, producer, runtime,
 *                                   budget, box office, IMDB link), plot,
 *                                   cast section, poster image
 *    • Wikipedia REST API         → cast member bio + profile photo + DOB
 *    • IMDB suggest API           → search for tt ID by title + year
 *    • IMDB title page (JSON-LD)  → rating, votes, content rating, genres,
 *                                   plot, director, cast list
 *    • IMDB fullcredits page      → complete cast table with roles + photos
 *
 *  Usage:
 *    node deep_scrape.js                  ← all years 1936 → now
 *    node deep_scrape.js 2023             ← one year
 *    node deep_scrape.js 2021 2022 2023   ← multiple years
 *    node deep_scrape.js --limit 5        ← first 5 movies per year (test)
 *    node deep_scrape.js --dry-run        ← print what would change, save nothing
 *    node deep_scrape.js --cast-only      ← only enrich cast photos/bios
 *    node deep_scrape.js --movies-only    ← skip cast Wikipedia enrichment
 *    node deep_scrape.js --imdb-only      ← only fill IMDB data for existing movies
 *
 *  Install:
 *    npm install axios cheerio mongoose dotenv
 *
 *  .env:
 *    MONGO_URI=mongodb+srv://...
 * ═══════════════════════════════════════════════════════════════════
 */

require("dotenv").config();
const axios    = require("axios");
const cheerio  = require("cheerio");
const mongoose = require("mongoose");

// ── CLI flags ─────────────────────────────────────────────────────────────────
const argv        = process.argv.slice(2);
const DRY_RUN     = argv.includes("--dry-run");
const CAST_ONLY   = argv.includes("--cast-only");
const MOVIES_ONLY = argv.includes("--movies-only");
const IMDB_ONLY   = argv.includes("--imdb-only");
const LIMIT       = argv.includes("--limit") ? parseInt(argv[argv.indexOf("--limit") + 1]) || 0 : 0;
const YEAR_ARGS   = argv.filter(a => /^\d{4}$/.test(a)).map(Number);
const THIS_YEAR   = new Date().getFullYear();
const YEARS       = YEAR_ARGS.length > 0
  ? YEAR_ARGS
  : Array.from({ length: THIS_YEAR - 1935 }, (_, i) => 1936 + i);

// ── Schemas ───────────────────────────────────────────────────────────────────
const ProductionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  logo:     { type: String, default: "" },
  bio:      { type: String, default: "" },
}, { timestamps: true });

const CastSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  type:      { type: String, default: "Actor" },
  bio:       { type: String, default: "" },
  photo:     { type: String, default: "" },
  dob:       { type: String, default: "" },
  gender:    { type: String, default: "" },
  location:  { type: String, default: "" },
  website:   { type: String, default: "" },
  instagram: { type: String, default: "" },
  movies:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const ReviewSchema = new mongoose.Schema({
  user:   { type: String, default: "Anonymous" },
  rating: Number,
  text:   String,
  date:   String,
});

const SongSchema = new mongoose.Schema({
  title:           { type: String, default: "" },
  singer:          { type: String, default: "" },
  singerRef:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  musicDirector:   { type: String, default: "" },
  musicDirectorRef:[{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  lyricist:        { type: String, default: "" },
  lyricistRef:     [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  ytId:            { type: String, default: "" },
  url:             { type: String, default: "" },
  thumbnailUrl:    { type: String, default: "" },
});

const CastEntrySchema = new mongoose.Schema({
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast", required: true },
  name:   { type: String, default: "" },
  photo:  { type: String, default: "" },
  type:   { type: String, default: "Actor" },
  role:   { type: String, default: "" },
}, { _id: false });

const MovieSchema = new mongoose.Schema({
  title:         { type: String, required: true, trim: true },
  category:      { type: String, default: "Feature Film" },
  genre:         [{ type: String }],
  releaseDate:   { type: String, default: "" },
  releaseTBA:    { type: Boolean, default: false },
  director:      { type: String, default: "" },
  producer:      { type: String, default: "" },
  budget:        { type: String, default: "" },
  language:      { type: String, default: "Odia" },
  synopsis:      { type: String, default: "" },
  posterUrl:     { type: String, default: "" },
  thumbnailUrl:  { type: String, default: "" },
  bannerUrl:     { type: String, default: "" },
  imdbId:        { type: String, default: "" },
  imdbRating:    { type: String, default: "" },
  imdbVotes:     { type: String, default: "" },
  contentRating: { type: String, default: "" },
  runtime:       { type: String, default: "" },
  productionId:  { type: mongoose.Schema.Types.ObjectId, ref: "Production", required: true },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "Production" }],
  cast:          [CastEntrySchema],
  media: {
    trailer: {
      ytId:         { type: String, default: "" },
      url:          { type: String, default: "" },
      thumbnailUrl: { type: String, default: "" },
    },
    songs: [SongSchema],
  },
  boxOffice: {
    opening:   { type: String, default: "TBA" },
    firstWeek: { type: String, default: "TBA" },
    total:     { type: String, default: "TBA" },
  },
  verdict:  { type: String, default: "Released" },
  status:   { type: String, default: "Released" },
  reviews:  [ReviewSchema],
  news:     [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
}, { timestamps: true });

const Production = mongoose.model("Production", ProductionSchema);
const Movie      = mongoose.model("Movie",      MovieSchema);
const Cast       = mongoose.model("Cast",       CastSchema);

// ── Counters ──────────────────────────────────────────────────────────────────
const stats = {
  moviesCreated: 0, moviesUpdated: 0, moviesSkipped: 0,
  castCreated:   0, castUpdated:   0, imdbFound: 0, errors: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { process.stdout.write("\n" + msg); }

function cleanText(str = "") {
  return str
    .replace(/\[[\d\w\s,]+\]/g, "")  // [1] citation refs
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNames(raw = "") {
  return cleanText(raw)
    .split(/[,\/\n\r•·|&]+/)
    .map(s => cleanText(s))
    .filter(s => s.length > 1 && s.length < 80 && !/^\d+$/.test(s));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MONTHS = {
  january:"01", february:"02", march:"03", april:"04", may:"05",
  june:"06", july:"07", august:"08", september:"09",
  october:"10", november:"11", december:"12",
};
function parseDate(day, month, year) {
  const d = String(parseInt(day) || 1).padStart(2, "0");
  const m = MONTHS[(month || "").toLowerCase().slice(0, 9)] || "01";
  return `${year}-${m}-${d}`;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
const WIKI_UA = "OllipediaDeepScraper/3.0 (ollipedia educational project)";
const IMDB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getHtml(url, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.get(url, {
        headers: { "User-Agent": WIKI_UA, ...headers },
        timeout: 20000,
      });
      return data;
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

async function getJson(url, params = {}, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.get(url, {
        params,
        headers: { "User-Agent": WIKI_UA, Accept: "application/json", ...headers },
        timeout: 12000,
      });
      return data;
    } catch (e) {
      if (i === 2) return null;
      await sleep(1200 * (i + 1));
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  IMDB SCRAPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Search IMDB suggest API by title + year → returns ttXXXXXXX id or null.
 * Free, no API key, fast (~200ms).
 */
async function imdbSearch(title, year) {
  try {
    const q    = encodeURIComponent(title);
    const data = await getJson(
      `https://v2.sg.media-imdb.com/suggestion/x/${q}.json`,
      {},
      { "User-Agent": IMDB_UA }
    );
    const results = data?.d || [];

    // Best match: same title word + year within 1
    const match =
      results.find(r =>
        r.id?.startsWith("tt") &&
        Math.abs((r.y || 0) - year) <= 1 &&
        r.l?.toLowerCase().replace(/[^a-z]/g, "").includes(
          title.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "")
        )
      ) ||
      results.find(r => r.id?.startsWith("tt") && Math.abs((r.y || 0) - year) <= 2) ||
      null;

    return match?.id || null;
  } catch {
    return null;
  }
}

/**
 * Scrape IMDB title page — extracts everything useful via JSON-LD + HTML.
 *
 * Returns:
 *  { imdbRating, imdbVotes, contentRating, plot, genres[], keywords[],
 *    directors[], writers[], cast[{name,role,photo}], trailerThumb }
 */
async function scrapeImdbPage(imdbId) {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null;

  let html;
  try {
    html = await getHtml(`https://www.imdb.com/title/${imdbId}/`, {
      "User-Agent":      IMDB_UA,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    });
  } catch (e) {
    log(`    ⚠️  IMDB page fetch failed: ${e.message}`);
    return null;
  }

  const $  = cheerio.load(html);
  const out = {
    imdbRating:    "",
    imdbVotes:     "",
    contentRating: "",
    plot:          "",
    genres:        [],
    keywords:      [],
    directors:     [],
    writers:       [],
    cast:          [],   // [{name, role, photo}]
    trailerThumb:  "",
  };

  // ── 1. JSON-LD structured data embedded in every IMDB page ───────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const obj = JSON.parse($(el).html() || "{}");
      if (!["Movie", "TVMovie"].includes(obj["@type"])) return;

      // Rating & votes
      if (obj.aggregateRating?.ratingValue)
        out.imdbRating = String(parseFloat(obj.aggregateRating.ratingValue).toFixed(1));
      if (obj.aggregateRating?.ratingCount)
        out.imdbVotes  = String(obj.aggregateRating.ratingCount);

      // Content rating (U, UA, A, PG-13, R, etc.)
      if (obj.contentRating) out.contentRating = obj.contentRating;

      // Plot
      if (obj.description) out.plot = obj.description.trim().slice(0, 800);

      // Genres
      if (Array.isArray(obj.genre))     out.genres = obj.genre.slice(0, 5);
      else if (typeof obj.genre === "string") out.genres = [obj.genre];

      // Keywords
      if (obj.keywords)
        out.keywords = obj.keywords.split(",").map(k => k.trim()).filter(Boolean).slice(0, 12);

      // Directors
      const dirs = [].concat(obj.director || []);
      dirs.forEach(d => { if (d?.name) out.directors.push(d.name); });

      // Writers
      const crs = [].concat(obj.creator || []);
      crs.forEach(cr => { if (cr?.["@type"] === "Person" && cr.name) out.writers.push(cr.name); });

      // Cast from JSON-LD (names only — roles + photos come from HTML)
      const actors = [].concat(obj.actor || []);
      actors.forEach(a => { if (a?.name) out.cast.push({ name: a.name, role: "", photo: "" }); });

      // Trailer thumbnail
      if (obj.trailer?.thumbnailUrl) out.trailerThumb = obj.trailer.thumbnailUrl;

    } catch { /* ignore malformed */ }
  });

  // ── 2. Next.js __NEXT_DATA__ JSON (modern IMDB uses this) ────────────────
  // IMDB now renders via React/Next — the full data is in a <script id="__NEXT_DATA__">
  try {
    const nextRaw = $("script#__NEXT_DATA__").html() || "";
    if (nextRaw) {
      const nextData = JSON.parse(nextRaw);
      const titleData = nextData?.props?.pageProps?.aboveTheFoldData ||
                        nextData?.props?.pageProps?.mainColumnData    || {};

      // Rating from Next data
      const ratingObj = titleData?.ratingsSummary || titleData?.aggregateRating;
      if (ratingObj?.aggregateRating && !out.imdbRating)
        out.imdbRating = String(parseFloat(ratingObj.aggregateRating).toFixed(1));
      if (ratingObj?.voteCount && !out.imdbVotes)
        out.imdbVotes  = String(ratingObj.voteCount);

      // Content rating
      if (titleData?.certificate?.rating && !out.contentRating)
        out.contentRating = titleData.certificate.rating;

      // Plot
      if (!out.plot) {
        const plotObj = titleData?.plot?.plotText?.plainText ||
                        titleData?.plot?.plotText?.text || "";
        if (plotObj) out.plot = plotObj.trim().slice(0, 800);
      }

      // Genres
      if (out.genres.length === 0) {
        const genreEdges = titleData?.genres?.genres || [];
        out.genres = genreEdges.map(g => g.text || g.id).filter(Boolean).slice(0, 5);
      }

      // Cast from Next data (has roles!)
      const castEdges =
        titleData?.cast?.edges ||
        nextData?.props?.pageProps?.mainColumnData?.cast?.edges || [];
      castEdges.forEach(edge => {
        const node = edge?.node;
        const name = node?.name?.nameText?.text;
        if (!name) return;
        const role = (node?.characters || []).map(c => c.name).join(", ");
        const photo = node?.name?.primaryImage?.url || "";
        const exists = out.cast.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (exists) {
          if (!exists.role  && role)  exists.role  = role;
          if (!exists.photo && photo) exists.photo = photo;
        } else {
          out.cast.push({ name, role, photo });
        }
      });
    }
  } catch { /* Next data optional */ }

  // ── 3. Classic HTML cast table (fallback / supplement) ───────────────────
  // table#cast_list — present on older IMDB responses and some cached pages
  $("table#cast_list tr").each((_, tr) => {
    const nameEl  = $(tr).find("td:nth-child(2) a").first();
    const name    = cleanText(nameEl.text());
    if (!name || name.length < 2 || name.length > 60) return;

    const role    = cleanText($(tr).find(".character").first().text()).slice(0, 80);
    const imgEl   = $(tr).find(".primary_photo img");
    const photo   = imgEl.attr("loadlate") || imgEl.attr("src") || "";

    const exists = out.cast.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      if (!exists.role  && role)                    exists.role  = role;
      if (!exists.photo && photo.startsWith("http")) exists.photo = photo;
    } else {
      out.cast.push({ name, role, photo: photo.startsWith("http") ? photo : "" });
    }
  });

  // Cap at 30 cast members
  out.cast = out.cast.filter(c => c.name?.length > 1).slice(0, 30);

  return out;
}

/**
 * Scrape IMDB /fullcredits for complete cast + crew.
 * Called when the main page only yields < 5 cast members.
 */
async function scrapeImdbFullCredits(imdbId) {
  try {
    const html = await getHtml(`https://www.imdb.com/title/${imdbId}/fullcredits`, {
      "User-Agent":      IMDB_UA,
      "Accept-Language": "en-US,en;q=0.9",
    });
    const $    = cheerio.load(html);
    const cast = [];

    $("table.cast_list tr").each((_, tr) => {
      const nameEl = $(tr).find("td:nth-child(2) a").first();
      const name   = cleanText(nameEl.text());
      if (!name || name.length < 2 || name.length > 60) return;

      const role   = cleanText($(tr).find(".character").first().text()).slice(0, 80);
      const imgEl  = $(tr).find(".primary_photo img");
      const photo  = imgEl.attr("loadlate") || imgEl.attr("src") || "";

      cast.push({ name, role, photo: photo.startsWith("http") ? photo : "" });
    });

    return cast;
  } catch {
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  WIKIPEDIA SCRAPERS
// ═════════════════════════════════════════════════════════════════════════════

async function wikiSummary(pageTitle) {
  try {
    const enc  = encodeURIComponent(pageTitle.replace(/ /g, "_"));
    const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`);
    if (!data) return null;
    return {
      extract:       data.extract        || "",
      thumbnail:     data.thumbnail?.source     || null,
      originalImage: data.originalimage?.source || null,
    };
  } catch { return null; }
}

async function wikiMainImage(pageTitle, size = 800) {
  const data = await getJson("https://en.wikipedia.org/w/api.php", {
    action: "query", titles: pageTitle,
    prop: "pageimages", pithumbsize: size, format: "json",
  });
  const page = Object.values(data?.query?.pages || {})[0];
  return page?.thumbnail?.source || null;
}

async function wikiSearch(query, limit = 5) {
  const data = await getJson("https://en.wikipedia.org/w/api.php", {
    action: "query", list: "search",
    srsearch: query, srlimit: limit, format: "json", srprop: "snippet",
  });
  return data?.query?.search || [];
}

async function wikiCategories(pageTitle) {
  const data = await getJson("https://en.wikipedia.org/w/api.php", {
    action: "query", titles: pageTitle,
    prop: "categories", cllimit: 50, format: "json",
  });
  const page = Object.values(data?.query?.pages || {})[0];
  return (page?.categories || []).map(c => c.title.replace("Category:", ""));
}

/** Deep-scrape a Wikipedia film article: infobox + plot + cast + poster + IMDB id */
async function scrapeWikiFilmArticle(wikiTitle) {
  try {
    const html = await getHtml(
      `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`
    );
    const $ = cheerio.load(html);

    // Infobox
    const infobox = {};
    $(".infobox, table.infobox").first().find("tr").each((_, tr) => {
      const label = cleanText($(tr).find("th").text()).toLowerCase();
      const val   = cleanText($(tr).find("td").text());
      if (!label || !val) return;
      if (/directed/.test(label))                        infobox.director   = val;
      if (/produced|producer/.test(label))               infobox.producer   = val;
      if (/starring/.test(label))                        infobox.starring   = val;
      if (/music/.test(label))                           infobox.music      = val;
      if (/release/.test(label))                         infobox.releaseRaw = val;
      if (/running|runtime/.test(label))                 infobox.runtime    = val;
      if (/budget/.test(label))                          infobox.budget     = val;
      if (/box.office|gross/.test(label))                infobox.gross      = val;
      if (/distribut/.test(label))                       infobox.distributor= val;
    });
    if (infobox.runtime) {
      const m = infobox.runtime.match(/(\d+)\s*min/i);
      if (m) infobox.runtime = m[1] + " min";
    }

    // Plot / synopsis
    let synopsis = "";
    $("h2, h3").each((_, el) => {
      if (synopsis) return;
      if (/plot|story|synopsis/i.test($(el).text())) {
        const parts = [];
        let   node  = $(el).next();
        while (node.length && !node.is("h2,h3")) {
          if (node.is("p")) parts.push(cleanText(node.text()));
          node = node.next();
        }
        synopsis = parts.join(" ").trim().slice(0, 800);
      }
    });
    if (!synopsis)
      synopsis = cleanText($(".mw-parser-output > p").first().text()).slice(0, 600);

    // Poster from infobox
    let posterUrl = "";
    const infoImg = $(".infobox img, table.infobox img").first();
    if (infoImg.length) {
      const src = infoImg.attr("src") || "";
      posterUrl = (src.startsWith("//") ? "https:" + src : src)
        .replace(/\/\d+px-/, "/800px-");
    }

    // IMDB link
    let imdbId = "";
    $("a[href*='imdb.com/title/']").each((_, a) => {
      if (imdbId) return;
      const m = ($(a).attr("href") || "").match(/title\/(tt\d+)/);
      if (m) imdbId = m[1];
    });

    // Cast section
    const castEntries = [];
    $("h2, h3").each((_, el) => {
      if (/cast|starring|actor/i.test($(el).text())) {
        let node = $(el).next();
        while (node.length && !node.is("h2,h3")) {
          if (node.is("ul")) {
            node.find("li").each((_, li) => {
              const text = cleanText($(li).text());
              const m    = text.match(/^([^–\-—:]+?)(?:\s+as\s+|\s*[–—-]\s*|:\s*)(.*)$/i);
              if (m) castEntries.push({ name: m[1].trim(), role: m[2].trim() });
              else if (text.length > 1 && text.length < 80) castEntries.push({ name: text, role: "" });
            });
          }
          if (node.is("table")) {
            node.find("tr").each((_, tr) => {
              const tds = $(tr).find("td").toArray().map(td => cleanText($(td).text()));
              if (tds.length >= 2 && tds[0].length > 1 && tds[0].length < 80)
                castEntries.push({ name: tds[0], role: tds[1] || "" });
            });
          }
          node = node.next();
        }
      }
    });

    return { infobox, synopsis, posterUrl, imdbId, castEntries };
  } catch { return null; }
}

function extractGenres(cats) {
  const MAP = {
    action:"Action", comedy:"Comedy", drama:"Drama", thriller:"Thriller",
    romance:"Romance", horror:"Horror", crime:"Crime", adventure:"Adventure",
    fantasy:"Fantasy", biographical:"Biographical", historical:"Historical",
    musical:"Musical", family:"Family", social:"Social",
    mythological:"Mythological", devotional:"Devotional",
    sports:"Sports", political:"Political",
  };
  const genres = [];
  for (const cat of cats)
    for (const [k, v] of Object.entries(MAP))
      if (cat.toLowerCase().includes(k) && !genres.includes(v)) genres.push(v);
  return genres.slice(0, 4);
}

// ── Scraper production account (auto-created) ─────────────────────────────────
let _scraperProd = null;
async function getScraperProd() {
  if (_scraperProd) return _scraperProd;
  _scraperProd = await Production.findOne({ email: "scraper@ollipedia.local" });
  if (!_scraperProd)
    _scraperProd = await Production.create({
      name: "Ollipedia Scraper", email: "scraper@ollipedia.local", password: "nologin",
    });
  return _scraperProd;
}

// ── Cast helpers ──────────────────────────────────────────────────────────────
async function findOrCreateCast(name, type = "Actor") {
  if (!name?.trim() || name.trim().length < 2) return null;
  const n   = name.trim();
  let   doc = await Cast.findOne({ name: { $regex: `^${escapeRegex(n)}$`, $options: "i" } });
  if (!doc) {
    if (!DRY_RUN) doc = await Cast.create({ name: n, type });
    else doc = { _id: new mongoose.Types.ObjectId(), name: n, type, photo: "", bio: "" };
    stats.castCreated++;
    log(`      ✦ New cast: ${n} [${type}]`);
  }
  return doc;
}

async function enrichCastFromWiki(castDoc) {
  if (!castDoc || (castDoc.photo && castDoc.bio)) return; // already complete

  const typeHint = { Director:"director", Producer:"producer", Singer:"singer" }[castDoc.type] || "actor";
  const queries  = [
    `${castDoc.name} Odia ${typeHint}`,
    `${castDoc.name} Indian ${typeHint}`,
    castDoc.name,
  ];

  let wikiTitle = null;
  for (const q of queries) {
    const hits = await wikiSearch(q, 3);
    const hit  = hits.find(r => r.title.toLowerCase().includes(
      castDoc.name.toLowerCase().split(" ")[0]
    )) || hits[0];
    if (hit) { wikiTitle = hit.title; break; }
    await sleep(200);
  }
  if (!wikiTitle) return;

  const [summary, mainImage] = await Promise.all([
    wikiSummary(wikiTitle),
    wikiMainImage(wikiTitle, 500),
  ]);
  if (!summary) return;

  const update = {};
  if (!castDoc.bio && summary.extract) {
    const sents = summary.extract.match(/[^.!?]+[.!?]+/g) || [];
    update.bio  = sents.slice(0, 3).join(" ").trim().slice(0, 600)
               || summary.extract.slice(0, 600);
  }
  if (!castDoc.photo) {
    const img = summary.originalImage || mainImage || summary.thumbnail;
    if (img) update.photo = img;
  }
  if (!castDoc.dob && summary.extract) {
    const m = summary.extract.match(/born\s+(?:on\s+)?(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i);
    if (m) update.dob = m[1];
  }

  if (Object.keys(update).length > 0) {
    log(`      📸 Wiki-enriched: ${castDoc.name} (${Object.keys(update).join(", ")})`);
    if (!DRY_RUN) await Cast.findByIdAndUpdate(castDoc._id, { $set: update });
    stats.castUpdated++;
  }
}

// ── Year-list scraper ─────────────────────────────────────────────────────────
async function scrapeYearPage(year) {
  let html;
  const urls = [
    `https://en.wikipedia.org/wiki/List_of_Odia_films_of_${year}`,
    `https://en.wikipedia.org/wiki/${year}_in_Odia_cinema`,
  ];
  for (const url of urls) {
    try { html = await getHtml(url); break; } catch { /* try next */ }
  }
  if (!html) { log(`  ⚠️  No Wikipedia page for ${year}`); return []; }

  const $      = cheerio.load(html);
  const films  = [];
  let curMonth = "January";
  let curDay   = "1";

  $("table.wikitable").each((_, table) => {
    const headers = [];
    $(table).find("th").each((_, th) => headers.push(cleanText($(th).text()).toLowerCase()));

    let colTitle = -1, colDir = -1, colCast = -1, colProd = -1, colNo = -1;
    headers.forEach((h, i) => {
      if (/^no|^s\.no|^#/.test(h)    && colNo    < 0) colNo    = i;
      if (/title|film/.test(h)        && colTitle < 0) colTitle = i;
      if (/direct/.test(h)            && colDir   < 0) colDir   = i;
      if (/cast|star|actor/.test(h)   && colCast  < 0) colCast  = i;
      if (/produc/.test(h)            && colProd  < 0) colProd  = i;
    });
    if (colTitle < 0) colTitle = (colNo >= 0) ? 1 : 0;
    if (colDir   < 0) colDir   = colTitle + 1;
    if (colCast  < 0) colCast  = colTitle + 2;

    $(table).find("tr").each((_, row) => {
      // Month header
      if ($(row).find("th[colspan], td[colspan]").length) {
        const txt = cleanText($(row).text()).toLowerCase();
        const m   = Object.keys(MONTHS).find(mo => txt.includes(mo));
        if (m) { curMonth = m[0].toUpperCase() + m.slice(1); curDay = "1"; }
        return;
      }

      const tds   = $(row).find("td").toArray();
      if (!tds.length) return;

      const cell  = tds[colTitle] || tds[0];
      const link  = $(cell).find("a[href^='/wiki/']").first();
      const wPath = link.attr("href") || "";
      if (wPath.includes(":")) return;

      const ct      = i => tds[i] ? cleanText($(tds[i]).text()) : "";
      const first   = ct(0);
      if (/^\d{1,2}$/.test(first) && +first <= 31) curDay = first;

      const title = cleanText(link.text()) || ct(colTitle);
      if (!title || title.length < 2 || /^(title|film|s\.no|no\.)/i.test(title)) return;

      films.push({
        title,
        wikiTitle:   wPath ? decodeURIComponent(wPath.slice(6).replace(/_/g, " ")) : title,
        director:    ct(colDir),
        producer:    ct(colProd),
        castNames:   splitNames(ct(colCast)),
        releaseDate: parseDate(curDay, curMonth, year),
        year,
      });
    });
  });

  log(`  📄 ${year}: ${films.length} films found`);
  return films;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN FILM PROCESSOR
// ═════════════════════════════════════════════════════════════════════════════

async function processFilm(filmData) {
  const { title, wikiTitle, director, producer, castNames, releaseDate, year } = filmData;
  if (!title || title.length < 2) return;

  log(`\n  🎬 "${title}" (${year})`);

  // Check DB
  const existing = await Movie.findOne({
    title: { $regex: `^${escapeRegex(title)}$`, $options: "i" }
  }).lean();

  // ── Step 1: Wikipedia film article ────────────────────────────────────────
  let article = null;
  if (wikiTitle && wikiTitle !== title) {
    await sleep(400);
    article = await scrapeWikiFilmArticle(wikiTitle);
    if (article) log(`    📖 Wiki article: "${wikiTitle}"`);
  }
  if (!article) {
    const hits = await wikiSearch(`${title} ${year} Odia film`, 3);
    await sleep(300);
    for (const r of hits) {
      if (r.title.toLowerCase().includes(title.toLowerCase()) ||
          r.snippet.toLowerCase().includes("odia")) {
        article = await scrapeWikiFilmArticle(r.title);
        if (article) { log(`    📖 Wiki found: "${r.title}"`); break; }
        await sleep(300);
      }
    }
  }

  // ── Step 2: Resolve IMDB ID ────────────────────────────────────────────────
  let imdbId = existing?.imdbId || article?.imdbId || "";
  if (!imdbId) {
    log(`    🔍 Searching IMDB: "${title}" (${year})`);
    imdbId = await imdbSearch(title, year) || "";
    if (imdbId) log(`    🎯 IMDB found: ${imdbId}`);
    else        log(`    ⚠️  IMDB: not found`);
    await sleep(500);
  }

  // ── Step 3: Scrape IMDB page ───────────────────────────────────────────────
  let imdb = null;
  if (imdbId && (!existing?.imdbRating || !existing?.imdbVotes)) {
    log(`    ⭐ Scraping IMDB: ${imdbId}`);
    imdb = await scrapeImdbPage(imdbId);

    // If cast list is very thin, also hit /fullcredits
    if (imdb && imdb.cast.length < 5) {
      await sleep(600);
      log(`    👥 Fetching full credits…`);
      const fc = await scrapeImdbFullCredits(imdbId);
      fc.forEach(entry => {
        if (!imdb.cast.find(c => c.name.toLowerCase() === entry.name.toLowerCase()))
          imdb.cast.push(entry);
      });
    }

    if (imdb) {
      stats.imdbFound++;
      log(`    ✅ IMDB: ${imdb.imdbRating || "?"}/10 (${imdb.imdbVotes || "?"} votes) | ${imdb.contentRating || "?"} | ${imdb.cast.length} cast`);
    }
    await sleep(700);
  } else if (imdbId && existing?.imdbRating) {
    log(`    ✅ IMDB rating already in DB (${existing.imdbRating}/10) — skipping re-scrape`);
  }

  // ── Step 4: Merge all data sources ────────────────────────────────────────
  const finalDirector    = (article?.infobox?.director  || director  || imdb?.directors?.[0] || "").slice(0, 100);
  const finalProducer    = (article?.infobox?.producer  || producer  || "").slice(0, 100);
  const finalRuntime     = article?.infobox?.runtime    || "";
  const finalBudget      = (article?.infobox?.budget    || "").slice(0, 80);
  const finalGross       = (article?.infobox?.gross     || "").slice(0, 60);
  const finalPoster      = article?.posterUrl           || "";
  const finalImdbRating  = imdb?.imdbRating             || existing?.imdbRating || "";
  const finalImdbVotes   = imdb?.imdbVotes              || existing?.imdbVotes  || "";
  const finalContentRating = imdb?.contentRating        || existing?.contentRating || "";
  const finalTrailerThumb  = imdb?.trailerThumb         || "";

  // Synopsis: prefer IMDB plot if it's longer/richer, else Wikipedia
  const wikiSynopsis = (article?.synopsis || "").slice(0, 800);
  const imdbPlot     = (imdb?.plot        || "").slice(0, 800);
  const finalSynopsis = wikiSynopsis.length >= imdbPlot.length ? wikiSynopsis : imdbPlot;

  // Genres: merge Wikipedia categories + IMDB genres
  let genres = [];
  if (article && wikiTitle) {
    const cats = await wikiCategories(wikiTitle);
    genres = extractGenres(cats);
    await sleep(200);
  }
  if (imdb?.genres?.length) {
    imdb.genres.forEach(g => { if (!genres.includes(g)) genres.push(g); });
    genres = genres.slice(0, 5);
  }

  // ── Step 5: Build cast list ────────────────────────────────────────────────
  // Priority: IMDB (roles + photos) > Wiki article > List page
  const castTypeMap  = {};  // name.lower → {type, role}
  const castPhotoMap = {};  // name.lower → photo URL
  const orderedNames = [];  // deduped list to process in order

  const addCastEntry = (name, type, role, photo) => {
    const key = name.toLowerCase();
    if (!orderedNames.includes(name)) orderedNames.push(name);
    if (!castTypeMap[key]) castTypeMap[key] = { type, role };
    if (photo && !castPhotoMap[key]) castPhotoMap[key] = photo;
  };

  // IMDB cast (best source)
  (imdb?.cast || []).forEach(e => {
    if (e.name?.trim()) addCastEntry(e.name.trim(), "Actor", e.role || "", e.photo || "");
  });
  // Wikipedia cast (if IMDB was empty)
  if (!imdb?.cast?.length) {
    (article?.castEntries || []).forEach(e => {
      if (e.name?.trim()) addCastEntry(e.name.trim(), "Actor", e.role || "", "");
    });
  }
  // List-page names (last resort)
  if (!orderedNames.length) {
    castNames.forEach(n => { if (n?.trim()) addCastEntry(n.trim(), "Actor", "", ""); });
  }

  // Director & producer as crew entries
  splitNames(finalDirector).forEach(n => addCastEntry(n, "Director", "Director", ""));
  splitNames(finalProducer).forEach(n => addCastEntry(n, "Producer", "Producer", ""));

  // Resolve cast → DB documents
  const scraperProd  = await getScraperProd();
  const resolvedCast = [];

  for (const name of orderedNames) {
    if (!name?.trim() || name.trim().length < 2) continue;
    const key       = name.toLowerCase();
    const meta      = castTypeMap[key] || { type: "Actor", role: "" };
    const imdbPhoto = castPhotoMap[key] || "";
    const cDoc      = await findOrCreateCast(name.trim(), meta.type);
    if (!cDoc) continue;

    // Save IMDB photo immediately if cast member has none
    if (imdbPhoto && !cDoc.photo && !DRY_RUN) {
      await Cast.findByIdAndUpdate(cDoc._id, { $set: { photo: imdbPhoto } });
      cDoc.photo = imdbPhoto;
      stats.castUpdated++;
      log(`      🖼️  IMDB photo → ${name}`);
    }

    if (!resolvedCast.find(rc => rc.castId.toString() === cDoc._id.toString())) {
      resolvedCast.push({
        castId: cDoc._id,
        name:   cDoc.name,
        photo:  cDoc.photo || imdbPhoto,
        type:   meta.type,
        role:   meta.role || "",
      });
    }
  }

  // ── Step 6: Save to DB ────────────────────────────────────────────────────
  if (existing) {
    // Build $set with only missing fields
    const set = {};
    if (!existing.synopsis      && finalSynopsis)       set.synopsis      = finalSynopsis;
    if (!existing.posterUrl     && finalPoster)         set.posterUrl     = finalPoster;
    if (!existing.thumbnailUrl  && finalPoster)         set.thumbnailUrl  = finalPoster;
    if (!existing.director      && finalDirector)       set.director      = finalDirector;
    if (!existing.producer      && finalProducer)       set.producer      = finalProducer;
    if (!existing.runtime       && finalRuntime)        set.runtime       = finalRuntime;
    if (!existing.budget        && finalBudget)         set.budget        = finalBudget;
    if (!existing.imdbId        && imdbId)              set.imdbId        = imdbId;
    if (!existing.imdbRating    && finalImdbRating)     set.imdbRating    = finalImdbRating;
    if (!existing.imdbVotes     && finalImdbVotes)      set.imdbVotes     = finalImdbVotes;
    if (!existing.contentRating && finalContentRating)  set.contentRating = finalContentRating;
    if (!existing.releaseDate   && releaseDate)         set.releaseDate   = releaseDate;
    if (!existing.genre?.length && genres.length)       set.genre         = genres;
    if (!existing.boxOffice?.total || existing.boxOffice.total === "TBA")
      if (finalGross) set["boxOffice.total"] = finalGross;
    // Update trailer thumbnail if we got one from IMDB
    if (finalTrailerThumb && !existing.media?.trailer?.thumbnailUrl)
      set["media.trailer.thumbnailUrl"] = finalTrailerThumb;

    // Missing cast
    const existingIds  = (existing.cast || []).map(c => c.castId.toString());
    const newCastItems = resolvedCast.filter(c => !existingIds.includes(c.castId.toString()));

    const hasChanges = Object.keys(set).length > 0 || newCastItems.length > 0;
    if (hasChanges) {
      const changedFields = [
        ...Object.keys(set),
        newCastItems.length ? `+${newCastItems.length} cast` : ""
      ].filter(Boolean).join(", ");
      log(`    ✏️  Update: ${changedFields}`);

      if (!DRY_RUN) {
        if (Object.keys(set).length)  await Movie.findByIdAndUpdate(existing._id, { $set: set });
        if (newCastItems.length)      await Movie.findByIdAndUpdate(existing._id, { $push: { cast: { $each: newCastItems } } });
        for (const e of newCastItems) await Cast.findByIdAndUpdate(e.castId, { $addToSet: { movies: existing._id } });
      }
      stats.moviesUpdated++;
    } else {
      log(`    ✓  Already complete`);
      stats.moviesSkipped++;
    }

  } else {
    // Create new movie
    log(`    ✦ Creating new movie`);
    const verdict = (year < THIS_YEAR || (releaseDate && new Date(releaseDate) <= new Date()))
      ? "Released" : "Upcoming";

    if (!DRY_RUN) {
      const movie = await Movie.create({
        title,
        category:      "Feature Film",
        language:      "Odia",
        releaseDate,
        director:      finalDirector,
        producer:      finalProducer,
        synopsis:      finalSynopsis,
        posterUrl:     finalPoster,
        thumbnailUrl:  finalPoster,
        runtime:       finalRuntime,
        budget:        finalBudget,
        imdbId,
        imdbRating:    finalImdbRating,
        imdbVotes:     finalImdbVotes,
        contentRating: finalContentRating,
        genre:         genres,
        verdict,
        status:        verdict,
        cast:          resolvedCast,
        productionId:  scraperProd._id,
        boxOffice:     { opening: "TBA", firstWeek: "TBA", total: finalGross || "TBA" },
        media: {
          trailer: { thumbnailUrl: finalTrailerThumb },
          songs:   [],
        },
      });
      for (const e of resolvedCast)
        await Cast.findByIdAndUpdate(e.castId, { $addToSet: { movies: movie._id } });
    }
    stats.moviesCreated++;
  }

  // ── Step 7: Enrich cast with Wikipedia (photos / bios / DOB) ─────────────
  if (!MOVIES_ONLY) {
    for (const entry of resolvedCast.slice(0, 10)) {
      const cDoc = await Cast.findById(entry.castId).lean();
      if (cDoc && (!cDoc.photo || !cDoc.bio)) {
        await enrichCastFromWiki(cDoc);
        await sleep(500);
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  IMDB-ONLY MODE  (fill IMDB data for existing movies that have imdbId)
// ═════════════════════════════════════════════════════════════════════════════

async function imdbOnlyMode() {
  // Movies with an imdbId but missing rating
  const movies = await Movie.find({
    $or: [
      { imdbId: { $exists: true, $ne: "" }, imdbRating: { $in: ["", null, undefined] } },
      { imdbId: { $exists: false } },
    ]
  }).lean();

  log(`\n⭐ IMDB-only mode: ${movies.length} movies to process\n`);

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    process.stdout.write(`\r  [${i+1}/${movies.length}] ${m.title.slice(0,35).padEnd(35," ")}   `);

    let imdbId = m.imdbId;
    if (!imdbId) {
      imdbId = await imdbSearch(m.title, m.releaseDate ? parseInt(m.releaseDate) : 2000) || "";
      await sleep(400);
    }
    if (!imdbId) continue;

    const imdb = await scrapeImdbPage(imdbId);
    await sleep(700);
    if (!imdb) continue;

    const set = {};
    if (!m.imdbId)        set.imdbId        = imdbId;
    if (!m.imdbRating)    set.imdbRating    = imdb.imdbRating;
    if (!m.imdbVotes)     set.imdbVotes     = imdb.imdbVotes;
    if (!m.contentRating) set.contentRating = imdb.contentRating;
    if (!m.synopsis && imdb.plot) set.synopsis = imdb.plot;
    if (!m.genre?.length && imdb.genres.length) set.genre = imdb.genres;
    if (imdb.trailerThumb && !m.media?.trailer?.thumbnailUrl)
      set["media.trailer.thumbnailUrl"] = imdb.trailerThumb;

    if (!DRY_RUN && Object.keys(set).length) {
      await Movie.findByIdAndUpdate(m._id, { $set: set });
      stats.moviesUpdated++;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CAST-ONLY MODE
// ═════════════════════════════════════════════════════════════════════════════

async function castOnlyMode() {
  const castList = await Cast.find({
    $or: [
      { photo: { $in: [null, "", undefined] } },
      { bio:   { $in: [null, "", undefined] } },
    ]
  }).lean();

  log(`\n👤 Cast-only mode: enriching ${castList.length} members\n`);
  for (let i = 0; i < castList.length; i++) {
    process.stdout.write(`\r  [${i+1}/${castList.length}] ${castList[i].name.slice(0,30).padEnd(30," ")}   `);
    const doc = await Cast.findById(castList[i]._id);
    if (doc) await enrichCastFromWiki(doc);
    await sleep(600);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  if (!process.env.MONGO_URI) { console.error("❌ MONGO_URI missing in .env"); process.exit(1); }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  🎬  Ollipedia Deep Scraper v3  —  Odia Cinema 1936→Now  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Mode      : ${CAST_ONLY?"cast-only":IMDB_ONLY?"imdb-only":MOVIES_ONLY?"movies-only":"full"}`);
  console.log(`  Dry run   : ${DRY_RUN}`);
  if (!CAST_ONLY && !IMDB_ONLY)
    console.log(`  Years     : ${YEARS[0]} → ${YEARS[YEARS.length-1]} (${YEARS.length} yrs)`);
  if (LIMIT) console.log(`  Limit     : ${LIMIT}/year`);
  console.log("");

  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected\n");

  if (CAST_ONLY)  { await castOnlyMode();  }
  else if (IMDB_ONLY) { await imdbOnlyMode(); }
  else {
    for (const year of YEARS) {
      log(`\n${"═".repeat(60)}\n  📅  ${year}\n${"═".repeat(60)}`);
      let films;
      try { films = await scrapeYearPage(year); }
      catch (e) { log(`  ❌ Scrape failed for ${year}: ${e.message}`); stats.errors++; continue; }

      if (LIMIT > 0) films = films.slice(0, LIMIT);
      for (let i = 0; i < films.length; i++) {
        try { await processFilm(films[i]); }
        catch (e) { log(`\n  ❌ Error: "${films[i]?.title}": ${e.message}`); stats.errors++; }
        await sleep(300);
      }
      await sleep(1000);
    }
  }

  await mongoose.disconnect();

  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊  Summary                                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  🎬 Movies created   : ${stats.moviesCreated}`);
  console.log(`  ✏️  Movies updated   : ${stats.moviesUpdated}`);
  console.log(`  ✓  Movies skipped   : ${stats.moviesSkipped}`);
  console.log(`  ⭐ IMDB matched      : ${stats.imdbFound}`);
  console.log(`  👤 Cast created      : ${stats.castCreated}`);
  console.log(`  📸 Cast enriched     : ${stats.castUpdated}`);
  console.log(`  ❌ Errors            : ${stats.errors}`);
  if (DRY_RUN) console.log("\n  ⚠️  DRY RUN — nothing was saved.");
  console.log("");
}

main().catch(e => { console.error("\n💥 Fatal:", e.message); process.exit(1); });