/**
 * ═══════════════════════════════════════════════════════════════════
 *  scrape_odiamoviedb.js  —  Ollipedia Full Scraper  v2.0
 *
 *  PRIMARY SOURCE:
 *    https://odiamoviedb.blogspot.com/p/yearwise-odia-movies.html
 *    → One page listing ALL Odia movies from 1936 to present
 *
 *  SUPPORTED MOVIE PAGE FORMATS:
 *    A) odiamoviedb.blogspot.com/YYYY/MM/slug.html  (older entries)
 *    B) odiamoviedb.com/movie/slug/                 (newer, 2024+)
 *
 *  SCRAPES PER MOVIE:
 *    • Poster URL (first large portrait blogger image or og:image)
 *    • Title, year, release date, runtime, CBFC rating, genres
 *    • Synopsis / overview paragraph
 *    • Director, producer, full crew with clean role labels
 *    • Cast names (comma-separated) — no label text leaking into names
 *    • Songs (title, singer, lyricist, music director)
 *    • Trailer YouTube ID
 *
 *  CAST PHOTOS:
 *    • First pass: collect all cast/crew names from all movie pages
 *    • Second pass: fetch blogspot label pages for each name
 *      e.g. /search/label/Sidhant+Mohapatra → grab thumbnail photo
 *    • Photo stored on both Cast doc and castEntry in Movie
 *
 *  USAGE:
 *    node scrape_odiamoviedb.js                  # scrape all
 *    node scrape_odiamoviedb.js --dry-run         # print, don't save
 *    node scrape_odiamoviedb.js --limit 20        # first 20 movies only
 *    node scrape_odiamoviedb.js --movie "Dasama"  # one movie only
 *    node scrape_odiamoviedb.js --year 2024       # only one year
 *    node scrape_odiamoviedb.js --skip-photos     # skip cast photo lookup
 *
 *  REQUIRED .env:
 *    MONGO_URI — MongoDB connection string
 * ═══════════════════════════════════════════════════════════════════
 */

import dotenv   from "dotenv";
import mongoose from "mongoose";
dotenv.config();

if (typeof fetch === "undefined") { console.error("Node 18+ required"); process.exit(1); }

// ── CLI ────────────────────────────────────────────────────────────
const argv         = process.argv.slice(2);
const DRY_RUN      = argv.includes("--dry-run");
const SKIP_PHOTOS  = argv.includes("--skip-photos");
const MOVIE_FILTER = argv.includes("--movie") ? argv[argv.indexOf("--movie")+1] : null;
const YEAR_FILTER  = argv.includes("--year")  ? argv[argv.indexOf("--year")+1]  : null;
const LIMIT        = argv.includes("--limit") ? parseInt(argv[argv.indexOf("--limit")+1]) : Infinity;

const BLOGSPOT_BASE = "https://odiamoviedb.blogspot.com";
const YEARWISE_URL  = `${BLOGSPOT_BASE}/p/yearwise-odia-movies.html`;
const DELAY         = 1200; // ms between requests — polite crawling

// ── Mongoose Schemas ───────────────────────────────────────────────
const CastEntrySchema = new mongoose.Schema({
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast", required: true },
  name:   { type: String, default: "" },
  type:   { type: String, default: "Actor" },
  role:   { type: String, default: "" },
}, { _id: false });

const SongSchema = new mongoose.Schema({
  title:        { type: String, default: "" },
  singer:       { type: String, default: "" },
  musicDirector:{ type: String, default: "" },
  lyricist:     { type: String, default: "" },
  ytId:         { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
});

const MovieSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  category:     { type: String, default: "Feature Film" },
  genre:        [String],
  releaseDate:  { type: String, default: "" },
  director:     { type: String, default: "" },
  producer:     { type: String, default: "" },
  language:     { type: String, default: "Odia" },
  synopsis:     { type: String, default: "" },
  posterUrl:    { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
  bannerUrl:    { type: String, default: "" },
  runtime:      { type: String, default: "" },
  contentRating:{ type: String, default: "" },
  verdict:      { type: String, default: "Upcoming" },
  status:       { type: String, default: "Upcoming" },
  cast:         [CastEntrySchema],
  media: {
    trailer: { ytId: String, url: String, thumbnailUrl: String },
    songs:   [SongSchema],
  },
  productionId: { type: mongoose.Schema.Types.ObjectId, ref: "Production", required: true },
  news:         [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
  reviews:      [],
  slug:         { type: String, default: "" },
}, { strict: false, timestamps: true });

const CastSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  type:     { type: String, default: "Actor" },
  roles:    [String],
  bio:      { type: String, default: "" },
  photo:    { type: String, default: "" },
  dob:      { type: String, default: "" },
  gender:   { type: String, default: "" },
  location: { type: String, default: "" },
  website:  { type: String, default: "" },
  instagram:{ type: String, default: "" },
  movies:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const ProductionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  logo:     { type: String, default: "" },
  bio:      { type: String, default: "" },
}, { timestamps: true });

const Movie      = mongoose.models.Movie      || mongoose.model("Movie",      MovieSchema);
const Cast       = mongoose.models.Cast       || mongoose.model("Cast",       CastSchema);
const Production = mongoose.models.Production || mongoose.model("Production", ProductionSchema);

// ── Utilities ──────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OllipediaScraper/2.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
        },
      });
      clearTimeout(t);
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
      await sleep(2000 * (i+1));
    } catch(e) {
      if (i === 2) throw e;
      await sleep(2000 * (i+1));
    }
  }
  return null;
}

function allMatches(html, re) {
  const results = [];
  let m;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(html)) !== null) results.push(m);
  return results;
}

function cleanText(s) {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
    .replace(/&#\d+;/g,"").replace(/\s+/g," ").trim();
}

function slugify(text) {
  return String(text).toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-").trim();
}

function isBlogspot(url) {
  return url.includes("blogspot.com");
}

// Split a "Name1, Name2 & Name3" string into clean individual names
function splitNames(raw) {
  return (raw || "").split(/[,，;&\/]|(?:\s+and\s+)/i)
    .map(n => cleanText(n).replace(/^["']+|["']+$/g,"").replace(/\s*\(.*?\)\s*/g,"").trim())
    .filter(n => n.length > 1 && n.length < 70 && !/^\d+$/.test(n));
}

function pushCrew(movie, name, type, role) {
  if (!name || name.length < 2) return;
  if (!movie.crew.find(c => c.name === name && c.role === role)) {
    movie.crew.push({ name, type, role });
  }
}

// ── Date / runtime helpers ─────────────────────────────────────────
const MONTHS = {
  january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};

function parseISODate(text) {
  if (!text) return "";
  const dmyM = text.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(20\d{2}|19\d{2})/);
  if (dmyM) { const mon=MONTHS[dmyM[2].toLowerCase()]; if(mon) return `${dmyM[3]}-${String(mon).padStart(2,"0")}-${String(dmyM[1]).padStart(2,"0")}`; }
  const mdyM = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})/);
  if (mdyM) { const mon=MONTHS[mdyM[1].toLowerCase()]; if(mon) return `${mdyM[3]}-${String(mon).padStart(2,"0")}-${String(mdyM[2]).padStart(2,"0")}`; }
  const myM = text.match(/([A-Za-z]+)\s+(20\d{2}|19\d{2})/);
  if (myM)  { const mon=MONTHS[myM[1].toLowerCase()]; if(mon) return `${myM[2]}-${String(mon).padStart(2,"0")}-01`; }
  return "";
}

function parseRuntime(text) {
  if (!text) return "";
  const longM = text.match(/(\d+)\s*h(?:ours?|rs?)?\s*(?:and\s*)?(\d+)\s*m(?:inutes?|ins?)?/i);
  if (longM) return `${longM[1]}h ${longM[2]}m`;
  const hrOnly = text.match(/(\d+)\s*h(?:ours?|rs?)/i);
  if (hrOnly) return `${hrOnly[1]}h`;
  const minOnly = text.match(/(\d+)\s*min(?:utes?)?/i);
  if (minOnly) { const t=parseInt(minOnly[1]); return t>=60?`${Math.floor(t/60)}h ${t%60}m`:`${t}m`; }
  const compact = text.match(/(\d+)h\s*(\d+)m/i);
  if (compact) return `${compact[1]}h ${compact[2]}m`;
  return "";
}

// ════════════════════════════════════════════════════════════════
// STEP 1 — Collect all movie URLs from yearwise index
// ════════════════════════════════════════════════════════════════
async function collectMovieUrls() {
  console.log(`\n[Step 1] Fetching yearwise index…`);
  const html = await fetchPage(YEARWISE_URL);
  if (!html) { console.error("Failed to fetch yearwise page"); process.exit(1); }

  // Match both odiamoviedb.blogspot.com and odiamoviedb.com movie URLs
  const urlRe = /href="(https?:\/\/(?:odiamoviedb\.blogspot\.com\/\d{4}\/\d{2}\/[^"]+\.html|odiamoviedb\.com\/movie\/[^"\/]+\/))"/gi;
  let allUrls = [...new Set(allMatches(html, urlRe).map(m => m[1]))];

  // Apply year filter: find section for that year and only keep URLs inside it
  if (YEAR_FILTER) {
    // Find heading for this year e.g. <h2><strong>2024</strong></h2> or <h2>2024</h2>
    const yearPattern = new RegExp(`<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*${YEAR_FILTER}\\s*(?:<\\/[^>]+>\\s*)*<\\/h[1-6]>`, "i");
    const yearMatch   = html.search(yearPattern);
    if (yearMatch === -1) {
      console.warn(`   Year ${YEAR_FILTER} section not found — returning all URLs`);
    } else {
      // Find the next year heading after this one
      const afterYear  = html.slice(yearMatch + 1);
      const nextYearM  = afterYear.search(/<h[1-6][^>]*>\s*(?:<[^>]+>\s*)*\d{4}\s*(?:<\/[^>]+>\s*)*<\/h[1-6]>/i);
      const sectionEnd = nextYearM > -1 ? yearMatch + 1 + nextYearM : html.length;
      const yearSlice  = html.slice(yearMatch, sectionEnd);
      allUrls = [...new Set(allMatches(yearSlice, urlRe).map(m => m[1]))];
      console.log(`   Year ${YEAR_FILTER}: found ${allUrls.length} movies`);
    }
  }

  // Apply movie title filter
  if (MOVIE_FILTER) {
    const slug = MOVIE_FILTER.toLowerCase().replace(/\s+/g, "-");
    allUrls = allUrls.filter(u => u.toLowerCase().includes(slug));
    console.log(`   Filtered to ${allUrls.length} URL(s) matching "${MOVIE_FILTER}"`);
  }

  const bs = allUrls.filter(isBlogspot).length;
  console.log(`   Total: ${allUrls.length} URLs (blogspot: ${bs}, odiamoviedb.com: ${allUrls.length-bs})`);
  return allUrls.slice(0, LIMIT);
}

// ════════════════════════════════════════════════════════════════
// STEP 2 — Fetch cast photos from blogspot label pages
// ════════════════════════════════════════════════════════════════
async function buildCastPhotoMap(_castNames) {
  // Cast photos skipped — store names only for speed
  return {};
}

// ════════════════════════════════════════════════════════════════
// STEP 3A — Parse a blogspot movie page
// ════════════════════════════════════════════════════════════════
function parseBlogspotPage(html, url) {
  const movie = {
    title:"", synopsis:"", genre:[], year:"", releaseDate:"",
    runtime:"", contentRating:"", posterUrl:"", thumbnailUrl:"",
    director:"", producer:"", cast:[], crew:[],
    musicDirectors:[], lyricists:[], singers:[], songs:[],
    trailerYtId:"", sourceUrl: url,
  };

  // ── Title ──
  const titleM = html.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>\s*([^<]+)\s*<\/h1>/i)
              || html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
  if (titleM) movie.title = cleanText(titleM[1]);

  // ── Year from URL slug: blogspot.com/2024/01/... ──
  const urlYearM = url.match(/\/(\d{4})\//);
  if (urlYearM) movie.year = urlYearM[1];

  // ── Poster: first large blogger image that isn't a news clipping ──
  // Blogger images: https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvX.../sNNN/filename.jpg
  const imgRe = /https?:\/\/blogger\.googleusercontent\.com\/img\/b\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\/[^"'\s]+\.(?:jpe?g|png|webp)/gi;
  const allImgs = allMatches(html, imgRe).map(m => m[0]);

  for (const imgUrl of allImgs) {
    // Skip obvious non-poster images
    if (/Hall[_\s]List|Dharitri|Sakala|Sambad|newspaper|news_clip|Profile-Pic|logo|avatar|icon/i.test(imgUrl)) continue;
    // Normalise: use high-res s1600 for poster, s400 for thumbnail
    movie.posterUrl    = imgUrl.replace(/\/s\d{1,5}\//, "/s1600/").replace(/=s\d+/, "=s1600");
    movie.thumbnailUrl = imgUrl.replace(/\/s\d{1,5}\//, "/s400/").replace(/=s\d+/, "=s400");
    break;
  }

  // ── Extract a field by its bold label: <b>Released on:</b> ... ──
  function extractField(label) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re  = new RegExp(`<(?:b|strong)[^>]*>\\s*${esc}\\s*:?\\s*<\\/(?:b|strong)>\\s*([^<\\n]{1,250})`, "i");
    const m   = html.match(re);
    if (!m) return "";
    return cleanText(m[1]).replace(/^\s*:\s*/, "").trim();
  }

  // ── Crew fields ──
  const relRaw  = extractField("Released on") || extractField("Release Date") || extractField("Releasing on");
  if (relRaw) {
    movie.releaseDate = parseISODate(relRaw);
    if (!movie.year && movie.releaseDate) movie.year = movie.releaseDate.slice(0,4);
  }

  const dirRaw  = extractField("Directed by") || extractField("Director");
  if (dirRaw) {
    movie.director = splitNames(dirRaw)[0] || "";
    for (const n of splitNames(dirRaw)) pushCrew(movie, n, "Director", "Director");
  }

  const prodRaw = extractField("Produced by") || extractField("Producer");
  if (prodRaw) {
    movie.producer = splitNames(prodRaw)[0] || "";
    for (const n of splitNames(prodRaw)) pushCrew(movie, n, "Producer", "Producer");
  }

  // All other crew labels
  const crewDefs = [
    ["Co. Producer",               "Producer",        "Co-Producer"            ],
    ["Co-Producer",                "Producer",        "Co-Producer"            ],
    ["Executive Producer",         "Producer",        "Executive Producer"     ],
    ["Screenplay & Dialogues",     "Screenplay",      "Screenplay & Dialogues" ],
    ["Screenplay",                 "Screenplay",      "Screenplay"             ],
    ["Dialogues",                  "Screenplay",      "Dialogue"               ],
    ["Editing",                    "Editor",          "Editor"                 ],
    ["Editor",                     "Editor",          "Editor"                 ],
    ["Cinematography",             "Cinematographer", "Cinematography"         ],
    ["D.O.P",                      "Cinematographer", "Cinematography"         ],
    ["Background Score",           "Music Director",  "Background Score"       ],
    ["Background Music",           "Music Director",  "Background Music"       ],
    ["Original Score",             "Music Director",  "Original Score"         ],
    ["Music",                      "Music Director",  "Music Director"         ],
    ["Lyrics",                     "Lyricist",        "Lyricist"               ],
    ["Lyricist",                   "Lyricist",        "Lyricist"               ],
    ["Singer",                     "Singer",          "Singer"                 ],
    ["Choreography",               "Choreographer",   "Choreography"           ],
    ["Choreographer",              "Choreographer",   "Choreography"           ],
    ["Art Direction",              "Art Director",    "Art Direction"          ],
    ["Art Director",               "Art Director",    "Art Direction"          ],
    ["Action",                     "Stunt Director",  "Action Director"        ],
    ["Story",                      "Story",           "Story"                  ],
    ["VFX",                        "VFX",             "VFX"                    ],
    ["Costume",                    "Costume Designer","Costume Design"         ],
  ];

  for (const [label, type, role] of crewDefs) {
    const raw = extractField(label);
    if (!raw) continue;
    for (const n of splitNames(raw)) {
      if (type === "Lyricist")      movie.lyricists.push(n);
      if (type === "Singer")        movie.singers.push(n);
      if (type === "Music Director") movie.musicDirectors.push(n);
      pushCrew(movie, n, type, role);
    }
  }

  // ── Cast ──
  // Blogspot format: **Cast:** Name1, Name2, Name3, ...
  const castRaw = extractField("Cast");
  if (castRaw) {
    for (const n of splitNames(castRaw)) {
      if (n.length > 1) movie.cast.push({ name: n, role: "" });
    }
  }

  // ── Genre from blogspot label links ──
  const genreRe = /search\/label\/(Action|Comedy|Crime|Drama|Family|Fantasy|Horror|Romance|Suspense|Thriller|Woman[_ ]Centric|Romantic|Devotional|Mythological)/gi;
  movie.genre = [...new Set(allMatches(html, genreRe).map(m => cleanText(m[1]).replace(/_/g," ")))];

  // ── Runtime ──
  const rtRaw = extractField("Running Time") || extractField("Runtime");
  if (rtRaw) movie.runtime = parseRuntime(rtRaw) || rtRaw.trim();

  // ── CBFC / content rating ──
  const certRaw = extractField("CBFC Certification") || extractField("CBFC") || extractField("Certification");
  if (certRaw) movie.contentRating = certRaw.replace(/\s+/g,"").toUpperCase().split(/[,\s]/)[0];

  // ── Synopsis / Overview ──
  const overviewRaw = extractField("Overview") || extractField("Synopsis") || extractField("About");
  if (overviewRaw) movie.synopsis = overviewRaw.slice(0, 3000).trim();

  // ── Songs ──
  // Format: • Song Title (Singer(s): X | Lyrics: Y | Music: Z)
  const songBlocks = allMatches(html, /[•·*\-]\s*([^\n(]{3,80}?)\s*\(Singer[^)]{0,300}\)/gi);
  for (const sb of songBlocks) {
    const full     = sb[0];
    const titlePart = cleanText(sb[1]);
    const singerM  = full.match(/Singer[s]?\s*(?:\([s]?\))?\s*:\s*([^|)]{1,100})/i);
    const lyricsM  = full.match(/Lyrics\s*:\s*([^|)]{1,100})/i);
    const musicM   = full.match(/Music\s*:\s*([^|)]{1,100})/i);
    movie.songs.push({
      title:         titlePart,
      singer:        singerM  ? cleanText(singerM[1])  : "",
      lyricist:      lyricsM  ? cleanText(lyricsM[1])  : "",
      musicDirector: musicM   ? cleanText(musicM[1])   : "",
    });
  }

  // ── Trailer YouTube ID ──
  const ytMs = allMatches(html, /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g);
  if (ytMs.length) movie.trailerYtId = ytMs[0][1];

  return movie;
}

// ════════════════════════════════════════════════════════════════
// STEP 3B — Parse an odiamoviedb.com (WordPress) movie page
// ════════════════════════════════════════════════════════════════
function parseOmdbPage(html, url) {
  const movie = {
    title:"", synopsis:"", genre:[], year:"", releaseDate:"",
    runtime:"", contentRating:"", posterUrl:"", thumbnailUrl:"",
    director:"", producer:"", cast:[], crew:[],
    musicDirectors:[], lyricists:[], singers:[], songs:[],
    trailerYtId:"", sourceUrl: url,
  };

  // ── Title ──
  const titleM = html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
  if (titleM) movie.title = cleanText(titleM[1]);

  // ── Poster: og:image > wp-post-image > wp CDN > wp-content ──
  const ogM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const wpPostM = html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i)
               || html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i);
  const wpCdnM  = html.match(/src="(https?:\/\/i\d+\.wp\.com\/[^"]+\.(jpe?g|png|webp)[^"]*)"/i);
  const wpContM = html.match(/src="(https?:\/\/[^"]*wp-content\/uploads[^"]*\.(jpe?g|png|webp)[^"]*)"/i);

  const rawPoster = (ogM&&ogM[1]) || (wpPostM&&wpPostM[1]) || (wpCdnM&&wpCdnM[1]) || (wpContM&&wpContM[1]) || "";
  if (rawPoster) {
    movie.posterUrl    = rawPoster.replace(/[?&]resize=[^&"'#\s]*/g,"").replace(/[?&]fit=[^&"'#\s]*/g,"").replace(/[?&][wh]=\d+[^&"'#\s]*/g,"").replace(/\?$/,"").replace(/&$/,"");
    movie.thumbnailUrl = movie.posterUrl + "?resize=300%2C400";
  }

  // ── Year ──
  const introYearM = html.match(/is an? (20\d{2}|19\d{2})\b/i) || html.match(/>(20\d{2}|19\d{2})</);
  if (introYearM) movie.year = introYearM[1];

  // ── Genres ──
  const genreMs = allMatches(html, /href="[^"]*\/movie-genre\/([^"\/]+)\/"[^>]*>([^<]+)</i);
  movie.genre = [...new Set(genreMs.map(m => cleanText(m[2])).filter(Boolean))];

  // ── Runtime ──
  const rtIntroM = html.match(/runtime\s+of\s+([^<.]{3,40})/i) || html.match(/running\s+time\s+of\s+([^<.]{3,40})/i);
  if (rtIntroM) movie.runtime = parseRuntime(rtIntroM[1]) || "";
  if (!movie.runtime) {
    const rtC = html.match(/(\d+h\s*\d+m)/i) || html.match(/(\d+\s*min(?:utes?)?)/i);
    if (rtC) movie.runtime = parseRuntime(rtC[1]) || "";
  }

  // ── Content rating ──
  const ratingM = html.match(/\b(UA\s*\d+\+?|U\/A\s*\d+\+?|U\/A|UA|U|A)\b/i);
  if (ratingM) movie.contentRating = ratingM[1].replace(/\s+/g,"").toUpperCase();

  // ── Release date ──
  const relDateM = html.match(/released\s+(?:theatrically\s+)?on\s+([^<.]{5,40})/i)
                || html.match(/releases?\s+on\s+([^<.]{5,30})/i)
                || html.match(/releasing\s+on\s+([^<.]{5,30})/i);
  if (relDateM) movie.releaseDate = parseISODate(relDateM[1]);

  // ── Synopsis ──
  const JUNK = ["Watch Now","Playlist","Sign in","Subscribe","Click here","You May Also Like","Share this","Follow us","Advertisement","Related Posts","jQuery","window.","function(","var ","document."];
  const isJunk = t => t.length < 40 || JUNK.some(j => t.includes(j));
  const extractParas = slice => (slice.match(/<p[^>]*>([\s\S]*?)<\/p>/gi)||[]).map(p=>cleanText(p)).filter(t=>!isJunk(t));

  const detailsIdx = html.indexOf("Movie Details");
  const plotIdx    = html.search(/<h[1-6][^>]*>\s*Plot\s*<\/h[1-6]>/i);
  const castHIdx   = html.search(/<h[1-6][^>]*>\s*Cast\s*<\/h[1-6]>/i);
  const synParts   = [];

  if (detailsIdx > 0) {
    const endIntro = plotIdx>detailsIdx ? plotIdx : (castHIdx>detailsIdx ? castHIdx : detailsIdx+3000);
    const introParas = extractParas(html.slice(detailsIdx, endIntro));
    const titleWord  = (movie.title||"").split(/\s+/)[0];
    const introPara  = introParas.find(p=>titleWord&&p.includes(titleWord)) || introParas.find(p=>/\bis an?\b/i.test(p)) || introParas[0];
    if (introPara) synParts.push(introPara);
  }
  if (plotIdx > 0) {
    const afterPlot = html.slice(plotIdx+10);
    const nextHead  = afterPlot.search(/<h[1-6][^>]*>/i);
    const plotEnd   = nextHead>-1 ? plotIdx+10+nextHead : plotIdx+4000;
    const plotParas = extractParas(html.slice(plotIdx, plotEnd));
    if (plotParas.length) synParts.push(...plotParas);
  }
  movie.synopsis = [...new Set(synParts)].join("\n\n").slice(0,3000).trim();

  // ── Crew via <strong> labels ──
  const detailSection = html.slice(detailsIdx>0 ? detailsIdx : 0);
  const crewDefs = [
    ["Director",          "Director",       "Director"          ],
    ["Producer",          "Producer",       "Producer"          ],
    ["Co-Producer",       "Producer",       "Co-Producer"       ],
    ["Executive Producer","Producer",       "Executive Producer"],
    ["Cinematography",    "Cinematographer","Cinematography"    ],
    ["Cinematographer",   "Cinematographer","Cinematography"    ],
    ["Editor",            "Editor",         "Editor"            ],
    ["Editing",           "Editor",         "Editor"            ],
    ["Music Director",    "Music Director", "Music Director"    ],
    ["Music Directors",   "Music Director", "Music Director"    ],
    ["Music Composed by", "Music Director", "Music Director"    ],
    ["Original Score",    "Music Director", "Original Score"    ],
    ["Background Score",  "Music Director", "Background Score"  ],
    ["Background Music",  "Music Director", "Background Music"  ],
    ["Lyricist",          "Lyricist",       "Lyricist"          ],
    ["Lyricists",         "Lyricist",       "Lyricist"          ],
    ["Singer",            "Singer",         "Singer"            ],
    ["Singers",           "Singer",         "Singer"            ],
    ["Playback Singer",   "Singer",         "Singer"            ],
    ["Choreography",      "Choreographer",  "Choreography"      ],
    ["Action Director",   "Stunt Director", "Action Director"   ],
    ["Art Director",      "Art Director",   "Art Direction"     ],
    ["Story",             "Story",          "Story"             ],
    ["Screenplay",        "Screenplay",     "Screenplay"        ],
    ["Dialogue",          "Screenplay",     "Dialogue"          ],
    ["VFX",               "VFX",            "VFX"               ],
  ];

  for (const [label, type, role] of crewDefs) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re  = new RegExp(`<strong[^>]*>\\s*${esc}[^<]*<\\/strong>\\s*:?\\s*([^\\n<]{2,200})`,"i");
    const m   = detailSection.match(re);
    if (!m) continue;
    // Strip any leaked "Label: " prefix from the captured value
    const rawVal = cleanText(m[1])
      .replace(new RegExp(`^${esc}\\s*:?\\s*`,"i"),"")
      .replace(/^\s*:\s*/,"");
    for (const n of splitNames(rawVal)) {
      if (/^[A-Za-z\s]+:\s/.test(n)) continue; // leaked label — skip
      if (label === "Director")  { if (!movie.director) movie.director = n; }
      if (label === "Producer")  { if (!movie.producer) movie.producer = n; }
      if (type === "Music Director") movie.musicDirectors.push(n);
      if (type === "Lyricist")       movie.lyricists.push(n);
      if (type === "Singer")         movie.singers.push(n);
      pushCrew(movie, n, type, role);
    }
  }

  // ── Cast from <h*>Cast</h*> section ──
  const castIdx = detailSection.search(/<h[1-6][^>]*>\s*Cast\s*<\/h[1-6]>/i);
  if (castIdx > -1) {
    const castSection = detailSection.slice(castIdx, castIdx+3000);
    const liMs = allMatches(castSection, /<li[^>]*>\s*(?:<strong>)?([^<\n]{2,60})(?:<\/strong>)?\s*<\/li>/gi);
    for (const item of liMs) {
      const name = cleanText(item[1]).replace(/^\*+|\*+$/g,"").trim();
      if (name.length>1 && name.length<60) movie.cast.push({ name, role:"" });
    }
    if (movie.cast.length === 0) {
      for (const item of allMatches(castSection, /\*\*([^*\n]{2,50})\*\*/g)) {
        const name = item[1].trim();
        if (name.length>1) movie.cast.push({ name, role:"" });
      }
    }
  }

  // ── Trailer ──
  const ytMs = allMatches(html, /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g);
  if (ytMs.length) movie.trailerYtId = ytMs[0][1];

  return movie;
}

// ════════════════════════════════════════════════════════════════
// STEP 4 — Get or create Cast doc, return _id
// ════════════════════════════════════════════════════════════════
async function getOrCreateCast(name, type, photo) {
  if (!name || name.length < 2) return null;
  let doc = await Cast.findOne({ name: { $regex: new RegExp("^"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i") } }).lean();
  if (doc) {
    if (photo && !doc.photo) await Cast.findByIdAndUpdate(doc._id, { photo });
    return doc._id;
  }
  if (DRY_RUN) return new mongoose.Types.ObjectId();
  doc = await Cast.create({ name: name.trim(), type: type||"Actor", roles:[type||"Actor"], photo: photo||"" });
  return doc._id;
}

// ════════════════════════════════════════════════════════════════
// STEP 5 — Save movie to DB
// ════════════════════════════════════════════════════════════════
async function saveMovie(data, adminProd, photoMap) {
  const existing = await Movie.findOne({ title: { $regex: new RegExp("^"+data.title.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i") } }).lean();
  if (existing) {
    console.log(`   ⏭  SKIP  "${data.title}" (already in DB)`);
    return null;
  }

  const releaseDate = data.releaseDate || (data.year ? `${data.year}-01-01` : "");

  // Cast entries
  const castEntries = [];
  for (let i=0; i<data.cast.length && i<40; i++) {
    const c = data.cast[i];
    const castId = await getOrCreateCast(c.name, "Actor", "");
    if (castId) castEntries.push({ castId, name:c.name, type:"Actor", role:c.role||"" });
  }

  // Crew entries
  const crewEntries = [];
  for (const cr of data.crew) {
    const castId = await getOrCreateCast(cr.name, cr.type, "");
    if (castId) crewEntries.push({ castId, name:cr.name, type:cr.type, role:cr.role||cr.type });
  }

  const allCast = [...crewEntries, ...castEntries];

  // Songs
  const songs = (data.songs||[]).map(s => ({
    title:         s.title         || "",
    singer:        s.singer        || data.singers.join(", "),
    musicDirector: s.musicDirector || data.musicDirectors.join(", "),
    lyricist:      s.lyricist      || data.lyricists.join(", "),
    ytId:          "",
    thumbnailUrl:  "",
  }));

  const trailerYtId = data.trailerYtId || "";
  const media = {
    trailer: {
      ytId:         trailerYtId,
      url:          trailerYtId ? `https://www.youtube.com/watch?v=${trailerYtId}` : "",
      thumbnailUrl: trailerYtId ? `https://img.youtube.com/vi/${trailerYtId}/hqdefault.jpg` : "",
    },
    songs,
  };

  // Verdict
  const now = new Date();
  let verdict = "Upcoming";
  if (releaseDate) {
    const rd = new Date(releaseDate);
    verdict = (!isNaN(rd.getTime()) && rd<=now) ? "Released" : "Upcoming";
  } else if (data.year) {
    const yr=parseInt(data.year), cy=now.getFullYear();
    verdict = yr<cy ? "Released" : yr>cy ? "Upcoming" : "Released";
  }

  const slug = slugify(data.title) + (data.year ? "-"+data.year : "");

  if (DRY_RUN) {
    console.log(`   📽  DRY  "${data.title}" (${data.year}) — cast:${data.cast.length} crew:${data.crew.length} poster:${data.posterUrl?"✓":"✗"} trailer:${trailerYtId?"✓":"✗"}`);
    return { _id: null, title: data.title };
  }

  const movie = await Movie.create({
    title: data.title, category:"Feature Film", genre:data.genre,
    releaseDate, director:data.director, producer:data.producer,
    language:"Odia", synopsis:data.synopsis,
    posterUrl:data.posterUrl, thumbnailUrl:data.thumbnailUrl||data.posterUrl,
    runtime:data.runtime, contentRating:data.contentRating,
    verdict, status: verdict==="Upcoming"?"Upcoming":"Released",
    cast:allCast, media, productionId:adminProd._id, slug,
  });

  for (const entry of allCast) {
    await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
  }
  return movie;
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Ollipedia — Blogspot Yearwise Scraper  v2.0");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Source      : " + YEARWISE_URL);
  console.log("Dry run     : " + DRY_RUN);
  console.log("Skip photos : " + SKIP_PHOTOS);
  console.log("Movie filter: " + (MOVIE_FILTER || "all"));
  console.log("Year filter : " + (YEAR_FILTER  || "all"));
  console.log("Limit       : " + (isFinite(LIMIT) ? LIMIT : "none"));
  console.log("");

  if (!process.env.MONGO_URI) { console.error("MONGO_URI not set in .env"); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  // Get/create scraper production account
  let adminProd = await Production.findOne({ name: "Ollipedia Scraper" }).lean();
  if (!adminProd && !DRY_RUN) {
    const bcrypt = await import("bcryptjs").catch(()=>import("bcrypt"));
    const hashed = await bcrypt.default.hash("scraper_password_"+Date.now(), 8);
    adminProd = await Production.create({
      name:"Ollipedia Scraper",
      email:`scraper_${Date.now()}@ollipedia.internal`,
      password:hashed,
      bio:"Auto-imported by blogspot yearwise scraper",
    });
    console.log("✓ Created scraper production account\n");
  }
  if (DRY_RUN) adminProd = { _id: new mongoose.Types.ObjectId() };

  // ── Step 1: Collect all URLs ──
  const movieUrls = await collectMovieUrls();
  if (movieUrls.length === 0) { console.log("No URLs found."); await mongoose.disconnect(); process.exit(0); }
  await sleep(800);

  // ── Step 2A: Pre-scan all movie pages (collect cast names + cache parsed data) ──
  console.log(`\n[Step 2A] Pre-scanning ${movieUrls.length} movie pages for cast names…`);
  const allCastNames = new Set();
  const pageCache    = new Map(); // url → parsed movie data

  for (let i=0; i<movieUrls.length; i++) {
    const url = movieUrls[i];
    try {
      const html = await fetchPage(url);
      if (!html) { pageCache.set(url, null); await sleep(DELAY); continue; }
      const data = isBlogspot(url) ? parseBlogspotPage(html, url) : parseOmdbPage(html, url);
      pageCache.set(url, data);
      for (const c of data.cast) if (c.name) allCastNames.add(c.name);
      for (const c of data.crew) if (c.name) allCastNames.add(c.name);
      process.stdout.write(".");
      if ((i+1) % 50 === 0) process.stdout.write(` ${i+1}\n`);
    } catch(e) {
      pageCache.set(url, null);
      process.stdout.write("E");
    }
    await sleep(DELAY);
  }
  console.log(`\n   Pre-scan done. Unique cast/crew names: ${allCastNames.size}`);

  // ── Step 2B: Fetch cast photos ──
  const photoMap = await buildCastPhotoMap([...allCastNames]);
  await sleep(500);

  // ── Step 3: Save all movies to DB ──
  console.log(`\n[Step 3] Saving ${movieUrls.length} movies to DB…\n`);
  let saved=0, skipped=0, errors=0;

  for (let i=0; i<movieUrls.length; i++) {
    const url   = movieUrls[i];
    const label = `[${String(i+1).padStart(4)}/${movieUrls.length}]`;
    const site  = isBlogspot(url) ? "BS" : "WP";
    process.stdout.write(`${label} [${site}] ${url.replace(/https?:\/\/[^\/]+/,"").slice(0,48).padEnd(50)} `);

    const data = pageCache.get(url);
    if (!data)       { console.log("skip (fetch failed)"); skipped++; continue; }
    if (!data.title) { console.log("no title");            skipped++; continue; }

    try {
      const result = await saveMovie(data, adminProd, photoMap);
      if (result === null) {
        skipped++;
      } else {
        saved++;
        console.log(`✓  cast:${data.cast.length} crew:${data.crew.length} poster:${data.posterUrl?"✓":"✗"} trailer:${data.trailerYtId?"✓":"✗"}`);
      }
    } catch(e) {
      console.log(`ERR ${e.message.slice(0,60)}`);
      errors++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Final Report");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Movies saved    : ${saved}`);
  console.log(`Skipped (exist) : ${skipped}`);
  console.log(`Errors          : ${errors}`);
  console.log(`\nDone! ✓`);

  await mongoose.disconnect();
}

main().catch(e => { console.error("Fatal:", e.message); console.error(e.stack); process.exit(1); });