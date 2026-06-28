/**
 * ═══════════════════════════════════════════════════════════════════
 *  scrape_news.js  —  Ollipedia News Scraper v4
 *
 *  SOURCES:
 *    1. Google News RSS  — movie-specific, max 10 per movie
 *    2. YouTube Data API — movie-specific news/interview/trailer videos
 *    3. Wikipedia        — per-movie article sections
 *    4. General RSS feeds — Odia entertainment sites
 *
 *  KEY IMPROVEMENTS over v3:
 *    • MAX 10 news articles per movie (across all sources combined)
 *    • YouTube video news: searches "<Title> Odia movie" on YT
 *      and saves matching videos as news items with ytId + thumbnail
 *    • Strict relevance gate on every article/video
 *    • Per-movie count tracking — once a movie has 10 items, it's skipped
 *
 *  Required .env:
 *    MONGO_URI         — MongoDB connection string
 *    YOUTUBE_API_KEY   — Google/YouTube Data API v3 key (free, 10k/day)
 *                        Get one at: console.cloud.google.com → YouTube Data API v3
 *
 *  Usage:
 *    node scrape_news.js                       # all sources, all movies
 *    node scrape_news.js --movie "Daman"       # one movie only
 *    node scrape_news.js --source google       # Google News only
 *    node scrape_news.js --source youtube      # YouTube only
 *    node scrape_news.js --source wikipedia    # Wikipedia only
 *    node scrape_news.js --source rss          # RSS feeds only
 *    node scrape_news.js --limit 30            # process max 30 movies
 *    node scrape_news.js --max 5               # max 5 articles per movie
 *    node scrape_news.js --dry-run             # print without saving
 *    node scrape_news.js --overwrite           # re-save duplicates
 * ═══════════════════════════════════════════════════════════════════
 */

import dotenv   from "dotenv";
import mongoose from "mongoose";
dotenv.config();

if (typeof fetch === "undefined") {
  console.error("Node 18+ required (built-in fetch)"); process.exit(1);
}

// ── CLI ───────────────────────────────────────────────────────────
const argv          = process.argv.slice(2);
const DRY_RUN       = argv.includes("--dry-run");
const OVERWRITE     = argv.includes("--overwrite");
const MOVIE_FILTER  = argv.includes("--movie")   ? argv[argv.indexOf("--movie")  + 1] : null;
const SOURCE_FILTER = argv.includes("--source")  ? argv[argv.indexOf("--source") + 1].toLowerCase() : "all";
const LIMIT         = argv.includes("--limit")   ? parseInt(argv[argv.indexOf("--limit")  + 1], 10) : 100;
const MAX_PER_MOVIE = argv.includes("--max")     ? parseInt(argv[argv.indexOf("--max")    + 1], 10) : 10;

const YT_KEY = process.env.YOUTUBE_API_KEY || "";

// ── Schemas ───────────────────────────────────────────────────────
const NewsSchema = new mongoose.Schema({
  movieId:    { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
  movieTitle: { type: String, default: "" },
  title:      { type: String, required: true },
  content:    { type: String, required: true },
  category:   { type: String, default: "Update" },
  imageUrl:   { type: String, default: "" },
  published:  { type: Boolean, default: true },
  sourceUrl:  { type: String, default: "" },
  ytId:       { type: String, default: "" },
  newsType:   { type: String, default: "article" }, // "article" | "video"
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title: String, language: String, releaseDate: String,
  posterUrl: String, news: [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
}, { strict: false });

const News  = mongoose.models.News  || mongoose.model("News",  NewsSchema);
const Movie = mongoose.models.Movie || mongoose.model("Movie", MovieSchema);

// ── Per-movie counter (tracks how many we've added THIS run) ──────
const movieNewsCount = {}; // movieId → count added this session

function canAddMore(movieId) {
  const id = String(movieId);
  return (movieNewsCount[id] || 0) < MAX_PER_MOVIE;
}
function markAdded(movieId) {
  const id = String(movieId);
  movieNewsCount[id] = (movieNewsCount[id] || 0) + 1;
}

// ── Utilities ─────────────────────────────────────────────────────
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const truncate = (s, n=1800) => s?.length > n ? s.slice(0, n) + "…" : (s || "");

function cleanHtml(raw) {
  return (raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
    .replace(/&#\d+;/g,"").replace(/&[a-z]+;/g," ")
    .replace(/\s+/g," ").trim();
}

async function fetchSafe(url, opts={}, retries=3) {
  for (let i=0; i<=retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        ...opts, signal: ctrl.signal,
        headers: { "User-Agent":"OllipediaNewsScraper/4.0", ...(opts.headers||{}) },
      });
      clearTimeout(t);
      return res;
    } catch(e) {
      if (i===retries) throw e;
      await sleep(1500*(i+1));
    }
  }
}

function detectCategory(title, content) {
  const t = ((title||"")+" "+(content||"")).toLowerCase();
  if (/\btrailer\b|\bteaser\b|first look/i.test(t))                 return "Trailer";
  if (/\bsong\b|\bsongs\b|\bmusic\b|\baudio\b|\balbum\b/i.test(t)) return "Song";
  if (/\baward\b|\bwins\b|box.?office|crore|collection/i.test(t))   return "Award";
  if (/\binterview\b|\bexclusive\b|\bopens up\b|\btalks\b/i.test(t))return "Interview";
  if (/release date|\bin cinemas\b|\bhit screen|\bopening\b/i.test(t))return "Release";
  return "Update";
}

function isRelevant(article, movie) {
  const needle = (movie.title||"").trim().toLowerCase();
  if (!needle || needle.length < 3) return false;
  const hay = ((article.title||"")+" "+(article.content||"")).toLowerCase();
  if (hay.includes(needle)) return true;
  if (needle.length >= 5) {
    const words = needle.split(/\s+/).filter(w=>w.length>=6);
    const hasWord = words.some(w=>hay.includes(w));
    const hasCtx  = /odia|ollywood|odisha/i.test(hay);
    if (hasWord && hasCtx) return true;
  }
  return false;
}

function parseRss(xml) {
  const items=[], re=/<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m=re.exec(xml))!==null) {
    const block=m[1];
    const get=tag=>{
      const r=block.match(new RegExp("<"+tag+"(?:[^>]*)>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</"+tag+">","i"));
      return r?cleanHtml(r[1]).trim():"";
    };
    const title=get("title"), link=get("link")||(block.match(/href="([^"]+)"/)??[])[1]||"";
    const desc=get("description")||get("summary")||get("content");
    const imgM=block.match(/url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)
             ||block.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    if (!title||title.length<5) continue;
    items.push({ title:truncate(title,200), content:truncate(desc||title,1800), imageUrl:imgM?imgM[1]:"", link });
  }
  return items;
}

// Session dedup
const seenTitles = new Set();
function isDupe(title) {
  const k=(title||"").toLowerCase().replace(/\s+/g," ").trim();
  if (seenTitles.has(k)) return true;
  seenTitles.add(k); return false;
}

// ════════════════════════════════════════════════════════════════
// SOURCE 1 — GOOGLE NEWS RSS (max MAX_PER_MOVIE per movie)
// ════════════════════════════════════════════════════════════════
async function scrapeGoogleNews(movies) {
  console.log("\n[Source 1] Google News RSS — max " + MAX_PER_MOVIE + " per movie");
  const articles = [];

  for (let i=0; i<movies.length; i++) {
    const movie = movies[i];
    const movieId = String(movie._id);

    // Skip if already at limit
    if (!canAddMore(movieId)) {
      console.log("  [" + String(i+1).padStart(3) + "/" + movies.length + "] " + movie.title.slice(0,36).padEnd(36) + " SKIP (limit reached)");
      continue;
    }

    const year  = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
    const query = `"${movie.title}" Odia movie${year?" "+year:""} news`;
    const url   = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-IN&gl=IN&ceid=IN:en";

    process.stdout.write("  [" + String(i+1).padStart(3) + "/" + movies.length + "] " + movie.title.slice(0,36).padEnd(36) + " ");

    try {
      const res = await fetchSafe(url, { headers:{ Accept:"application/rss+xml,*/*" } });
      if (!res.ok) { console.log("! " + res.status); await sleep(600); continue; }

      const xml   = await res.text();
      const items = parseRss(xml);
      let added=0, dropped=0;

      for (const item of items) {
        if (!canAddMore(movieId)) break; // stop once limit hit
        if (!isRelevant(item, movie)) { dropped++; continue; }
        if (isDupe(item.title)) { dropped++; continue; }

        articles.push({
          title:      item.title,
          content:    item.content || item.title,
          category:   detectCategory(item.title, item.content),
          imageUrl:   item.imageUrl || movie.posterUrl || "",
          movieId:    movie._id,
          movieTitle: movie.title,
          sourceUrl:  item.link,
          newsType:   "article",
          source:     "Google News",
        });
        markAdded(movieId);
        added++;
      }
      console.log("OK  " + added + " added / " + dropped + " dropped (total this movie: " + (movieNewsCount[movieId]||0) + "/" + MAX_PER_MOVIE + ")");
    } catch(e) { console.log("ERR " + e.message.slice(0,50)); }

    await sleep(1200);
  }

  return articles;
}

// ════════════════════════════════════════════════════════════════
// SOURCE 2 — YOUTUBE VIDEO NEWS (requires YOUTUBE_API_KEY)
// ════════════════════════════════════════════════════════════════
function extractYtId(url="") {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function scrapeYouTube(movies) {
  if (!YT_KEY) {
    console.log("\n[Source 2] YouTube — SKIPPED (no YOUTUBE_API_KEY in .env)");
    console.log("           Add YOUTUBE_API_KEY=YOUR_KEY to .env to enable YouTube news");
    return [];
  }

  console.log("\n[Source 2] YouTube Video News — max " + MAX_PER_MOVIE + " per movie");
  const articles = [];

  for (let i=0; i<movies.length; i++) {
    const movie   = movies[i];
    const movieId = String(movie._id);

    if (!canAddMore(movieId)) {
      process.stdout.write("  [" + String(i+1).padStart(3) + "/" + movies.length + "] " + movie.title.slice(0,36).padEnd(36) + " SKIP\n");
      continue;
    }

    const query = `${movie.title} Odia movie`;
    const url   = "https://www.googleapis.com/youtube/v3/search"
      + "?part=snippet&type=video&maxResults=8&order=relevance"
      + "&q=" + encodeURIComponent(query)
      + "&key=" + YT_KEY;

    process.stdout.write("  [" + String(i+1).padStart(3) + "/" + movies.length + "] " + movie.title.slice(0,36).padEnd(36) + " ");

    try {
      const res = await fetchSafe(url);
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        console.log("! " + res.status + " " + (err?.error?.message||"").slice(0,50));
        await sleep(1000); continue;
      }

      const data  = await res.json();
      const items = data.items || [];
      let added=0, dropped=0;

      for (const item of items) {
        if (!canAddMore(movieId)) break;
        const snippet = item.snippet || {};
        const ytId    = item.id?.videoId;
        if (!ytId) continue;

        // Relevance check on video title + description
        const fakeArticle = { title: snippet.title||"", content: snippet.description||"" };
        if (!isRelevant(fakeArticle, movie)) { dropped++; continue; }
        if (isDupe(snippet.title)) { dropped++; continue; }

        const thumb = snippet.thumbnails?.high?.url
                   || snippet.thumbnails?.medium?.url
                   || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

        articles.push({
          title:      snippet.title,
          content:    snippet.description || snippet.title,
          category:   detectCategory(snippet.title, snippet.description),
          imageUrl:   thumb,
          movieId:    movie._id,
          movieTitle: movie.title,
          sourceUrl:  `https://www.youtube.com/watch?v=${ytId}`,
          ytId,
          newsType:   "video",
          source:     "YouTube",
        });
        markAdded(movieId);
        added++;
      }
      console.log("OK  " + added + " videos added / " + dropped + " dropped (total: " + (movieNewsCount[movieId]||0) + "/" + MAX_PER_MOVIE + ")");
    } catch(e) { console.log("ERR " + e.message.slice(0,60)); }

    await sleep(300); // YouTube API is more lenient
  }

  return articles;
}

// ════════════════════════════════════════════════════════════════
// SOURCE 3 — WIKIPEDIA
// ════════════════════════════════════════════════════════════════
async function wikiFindPage(title) {
  for (const q of [title+" Odia film", title+" Ollywood film", title+" film", title]) {
    await sleep(200);
    const url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="
      + encodeURIComponent(q) + "&srlimit=3&format=json&origin=*";
    try {
      const res  = await fetchSafe(url); if (!res.ok) continue;
      const data = await res.json();
      const hits = data?.query?.search || [];
      const match = hits.find(r =>
        r.title.toLowerCase().includes(title.toLowerCase()) &&
        (r.title.toLowerCase().includes("film") || /odia|ollywood/i.test(r.snippet))
      ) || hits[0];
      if (match) return match.title;
    } catch { continue; }
  }
  return null;
}

async function wikiGetSections(pageTitle) {
  const url = "https://en.wikipedia.org/w/api.php?action=parse&page="
    + encodeURIComponent(pageTitle) + "&prop=text&format=json&origin=*";
  try {
    const res  = await fetchSafe(url); if (!res.ok) return [];
    const data = await res.json();
    const html = data?.parse?.text?.["*"] || "";
    if (!html) return [];

    const targets = [
      { name:"Plot",               cat:"Update"  },
      { name:"Production",         cat:"Update"  },
      { name:"Release",            cat:"Release" },
      { name:"Reception",          cat:"Award"   },
      { name:"Box office",         cat:"Award"   },
      { name:"Soundtrack",         cat:"Song"    },
      { name:"Accolades",          cat:"Award"   },
    ];

    const sections = [];
    for (const t of targets) {
      const re = new RegExp("<h[23][^>]*>\\s*(?:<[^>]+>)*\\s*"+t.name+"\\s*(?:<\\/[^>]+>)*\\s*<\\/h[23]>([\\s\\S]*?)(?=<h[23]|$)","i");
      const m  = html.match(re);
      if (m) {
        const text = cleanHtml(m[1]);
        if (text.length > 80) sections.push({ name:t.name, cat:t.cat, text:truncate(text,1600) });
      }
    }
    return sections;
  } catch { return []; }
}

async function scrapeWikipedia(movies) {
  console.log("\n[Source 3] Wikipedia — per-movie sections");
  const articles = [];

  for (const movie of movies) {
    const movieId = String(movie._id);
    if (!canAddMore(movieId)) {
      console.log("  " + movie.title.slice(0,45).padEnd(45) + " SKIP (limit reached)");
      continue;
    }

    process.stdout.write("  " + movie.title.slice(0,45).padEnd(45) + " ");
    await sleep(500);

    const wikiTitle = await wikiFindPage(movie.title);
    if (!wikiTitle) { console.log("(no page)"); continue; }

    await sleep(500);
    const sections = await wikiGetSections(wikiTitle);
    if (!sections.length) { console.log('"'+wikiTitle+'" — no sections'); continue; }

    console.log('"'+wikiTitle+'" -> '+sections.length+" sections");

    for (const s of sections) {
      if (!canAddMore(movieId)) break;
      const title = `${movie.title} — ${s.name} (Wikipedia)`;
      if (isDupe(title)) continue;

      articles.push({
        title,
        content:    s.text,
        category:   s.cat,
        imageUrl:   movie.posterUrl || "",
        movieId:    movie._id,
        movieTitle: movie.title,
        sourceUrl:  "https://en.wikipedia.org/wiki/" + encodeURIComponent(wikiTitle),
        newsType:   "article",
        source:     "Wikipedia",
      });
      markAdded(movieId);
    }
    await sleep(400);
  }

  return articles;
}

// ════════════════════════════════════════════════════════════════
// SOURCE 4 — GENERAL ODIA RSS FEEDS (movie-linked only)
// ════════════════════════════════════════════════════════════════
const FEEDS = [
  { name:"Odisha Post",       url:"https://odishapost.com/category/entertainment/feed/" },
  { name:"OTV",               url:"https://www.odishatv.in/entertainment/feed" },
  { name:"Kalinga TV",        url:"https://kalingatv.com/entertainment/feed/" },
  { name:"Pragativadi",       url:"https://pragativadi.com/category/entertainment/feed/" },
  { name:"Sambad English",    url:"https://sambadenglish.com/category/entertainment/feed/" },
  { name:"Google Ollywood",   url:"https://news.google.com/rss/search?q=Ollywood+Odia+film+news&hl=en-IN&gl=IN&ceid=IN:en" },
  { name:"Google OD Trailer", url:"https://news.google.com/rss/search?q=Odia+film+trailer+teaser+2025&hl=en-IN&gl=IN&ceid=IN:en" },
  { name:"Google OD Song",    url:"https://news.google.com/rss/search?q=Odia+movie+song+album+2025&hl=en-IN&gl=IN&ceid=IN:en" },
];

function strictMatch(title, content, movies) {
  const hay = ((title||"")+" "+(content||"")).toLowerCase();
  let best=null, bestLen=0;
  for (const m of movies) {
    const t = (m.title||"").trim();
    if (t.length<5) continue;
    if (hay.includes(t.toLowerCase()) && t.length>bestLen) { bestLen=t.length; best=m; }
  }
  return best;
}

async function scrapeRssFeeds(movies) {
  console.log("\n[Source 4] General RSS Feeds — movie-linked only (respects per-movie limit)");
  const articles = [];

  for (const feed of FEEDS) {
    console.log("  Feed: " + feed.name);
    try {
      const res = await fetchSafe(feed.url, { headers:{ Accept:"application/rss+xml,*/*" } });
      if (!res.ok) { console.log("    ! "+res.status); continue; }

      const xml   = await res.text();
      const items = parseRss(xml);
      let linked=0, skipped=0;

      for (const item of items) {
        if (!item.title) continue;
        const movie = strictMatch(item.title, item.content, movies);
        if (!movie) continue; // only link to specific movies from RSS

        const movieId = String(movie._id);
        if (!canAddMore(movieId)) { skipped++; continue; }
        if (isDupe(item.title)) { skipped++; continue; }

        articles.push({
          title:      item.title,
          content:    item.content || item.title,
          category:   detectCategory(item.title, item.content),
          imageUrl:   item.imageUrl || movie.posterUrl || "",
          movieId:    movie._id,
          movieTitle: movie.title,
          sourceUrl:  item.link,
          newsType:   "article",
          source:     feed.name,
        });
        markAdded(movieId);
        linked++;
      }
      console.log("    -> " + linked + " linked | " + skipped + " skipped (limit/dupe)");
    } catch(e) { console.log("    ERR " + e.message.slice(0,60)); }

    await sleep(900);
  }

  return articles;
}

// ════════════════════════════════════════════════════════════════
// SAVE TO MONGODB
// ════════════════════════════════════════════════════════════════
async function saveArticles(articles) {
  let saved=0, dupes=0, errors=0;

  for (const a of articles) {
    if (!a.title?.trim() || !a.content?.trim()) continue;

    if (!OVERWRITE) {
      try {
        const exists = await News.findOne({ title:a.title.trim() }).lean();
        if (exists) { dupes++; continue; }
      } catch {}
    }

    try {
      const doc = {
        title:     a.title.trim(),
        content:   a.content.trim(),
        category:  a.category  || "Update",
        imageUrl:  a.imageUrl  || "",
        published: true,
        sourceUrl: a.sourceUrl || "",
        ytId:      a.ytId      || "",
        newsType:  a.newsType  || "article",
      };
      if (a.movieId)    doc.movieId    = a.movieId;
      if (a.movieTitle) doc.movieTitle = a.movieTitle;

      const news = await News.create(doc);

      if (a.movieId) {
        await Movie.findByIdAndUpdate(a.movieId, { $addToSet:{ news:news._id } });
      }

      const type  = a.newsType==="video" ? "📹 VIDEO" : "📰 ARTICLE";
      const label = (a.movieTitle||"General").slice(0,22).padEnd(22);
      console.log("  OK "+type+" ["+((a.category||"Update").padEnd(9))+"] " + label + " | " + truncate(a.title,55));
      saved++;
    } catch(e) {
      console.log("  ERR " + e.message.slice(0,80));
      errors++;
    }
  }

  return { saved, dupes, errors };
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Ollipedia News Scraper v4");
  console.log("═══════════════════════════════════════");
  console.log("Source    : " + SOURCE_FILTER);
  console.log("Max/movie : " + MAX_PER_MOVIE);
  console.log("Movie     : " + (MOVIE_FILTER||"all"));
  console.log("Limit     : " + LIMIT + " movies");
  console.log("Dry run   : " + DRY_RUN);
  console.log("YouTube   : " + (YT_KEY ? "✓ enabled" : "✗ no key (set YOUTUBE_API_KEY in .env)"));
  console.log("");

  if (!process.env.MONGO_URI) { console.error("MONGO_URI not set in .env"); process.exit(1); }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected\n");

  let movies = await Movie.find({}, "title language releaseDate posterUrl _id news").lean();
  if (!movies.length) { console.error("No movies in DB."); await mongoose.disconnect(); process.exit(1); }

  // Sort: newest release date first → oldest
  // Movies with no releaseDate go to the end
  movies.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return db - da; // descending — 2025 before 2024 before 2023...
  });

  // Pre-fill counter with existing DB news counts so we don't exceed MAX overall
  for (const m of movies) {
    const existingCount = (m.news||[]).length;
    if (existingCount >= MAX_PER_MOVIE) {
      movieNewsCount[String(m._id)] = MAX_PER_MOVIE; // already full
    } else {
      movieNewsCount[String(m._id)] = existingCount; // room left
    }
  }

  if (MOVIE_FILTER) {
    movies = movies.filter(m=>(m.title||"").toLowerCase().includes(MOVIE_FILTER.toLowerCase()));
    if (!movies.length) { console.error("No movies matching: "+MOVIE_FILTER); await mongoose.disconnect(); process.exit(1); }
    console.log("Filtered to "+movies.length+" movie(s)\n");
  }

  // Show pre-run status
  const full    = movies.filter(m=>movieNewsCount[String(m._id)]>=MAX_PER_MOVIE).length;
  const partial = movies.filter(m=>movieNewsCount[String(m._id)]>0 && movieNewsCount[String(m._id)]<MAX_PER_MOVIE).length;
  const empty   = movies.filter(m=>movieNewsCount[String(m._id)]===0).length;
  console.log(movies.length+" movies loaded:");
  console.log("  ✅ Already full ("+MAX_PER_MOVIE+" news): "+full);
  console.log("  🔄 Partial: "+partial);
  console.log("  ⬜ Empty (0 news): "+empty+"\n");

  let allArticles = [];
  const run = s => SOURCE_FILTER==="all" || SOURCE_FILTER===s;
  const movieSlice = MOVIE_FILTER ? movies : movies.slice(0,LIMIT);

  if (run("google"))    allArticles = allArticles.concat(await scrapeGoogleNews(movieSlice));
  if (run("youtube"))   allArticles = allArticles.concat(await scrapeYouTube(movieSlice));
  if (run("wikipedia")) allArticles = allArticles.concat(await scrapeWikipedia(movieSlice.slice(0,Math.min(LIMIT,60))));
  if (run("rss"))       allArticles = allArticles.concat(await scrapeRssFeeds(movies));

  // Final dedup
  const seenX=new Set();
  const unique = allArticles.filter(a => {
    const k=(a.title||"").toLowerCase().trim();
    if (seenX.has(k)) return false; seenX.add(k); return true;
  });

  const articles = unique.filter(a=>a.movieId);
  const videos   = unique.filter(a=>a.newsType==="video");
  console.log("\nTotal unique: "+unique.length+" ("+articles.length+" articles, "+videos.length+" videos)");

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Sample (first 30):");
    unique.slice(0,30).forEach((a,i)=>{
      const type = a.newsType==="video"?"📹":"📰";
      console.log("  "+String(i+1).padStart(3)+". "+type+" ["+(a.category||"").padEnd(9)+"] "+(a.movieTitle||"General").slice(0,20).padEnd(20)+" — "+truncate(a.title,55));
    });
  } else {
    console.log("\nSaving to MongoDB…\n");
    const stats = await saveArticles(unique);
    console.log("\n═══════════════════════════════════════");
    console.log("  Final Report");
    console.log("═══════════════════════════════════════");
    console.log("Found    : "+unique.length);
    console.log("Saved    : "+stats.saved);
    console.log("Dupes    : "+stats.dupes);
    console.log("Errors   : "+stats.errors);
    console.log("Videos   : "+videos.length);
    console.log("Articles : "+(unique.length-videos.length));
  }

  await mongoose.disconnect();
  console.log("\nDone!");
}

main().catch(e=>{ console.error("Fatal: "+e.message); process.exit(1); });