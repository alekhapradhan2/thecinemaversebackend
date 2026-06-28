const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const mongoose = require("mongoose");
const axios = require("axios");

/* ─────────────────────────────────────────────────────────────
   MOVIE SCHEMA
───────────────────────────────────────────────────────────── */
const MovieSchema = new mongoose.Schema({
  title:        String,
  genre:        [String],
  releaseDate:  String,
  director:     String,
  producer:     String,
  cast:         [String],
  synopsis:     String,
  posterUrl:    String,
  thumbnailUrl: String,
  bannerUrl:    String,
  language:     { type: String, default: "Odia" },
  category:     { type: String, default: "Feature Film" },
  verdict:      { type: String, default: "Upcoming" },
  media: {
    trailer: { ytId: String, url: String }
  },
  status: { type: String, default: "Upcoming" }
});
const Movie = mongoose.model("Movie", MovieSchema);

/* ─────────────────────────────────────────────────────────────
   YOUTUBE TRAILER
───────────────────────────────────────────────────────────── */
async function getTrailer(title) {
  try {
    const query = encodeURIComponent(`${title} Odia official trailer`);
    const { data } = await axios.get(
      `https://www.youtube.com/results?search_query=${query}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
    );
    const match = data.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    if (!match) return null;
    return { ytId: match[1], url: `https://youtube.com/watch?v=${match[1]}` };
  } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────
   SCRAPE DETAIL PAGE
   
   From screenshots, BMS movie page structure:
   ┌─────────────────────────────────────────────┐
   │  [WIDE BACKGROUND IMAGE = BANNER]            │
   │  ┌──────────┐  Title                         │
   │  │  POSTER  │  Genre: Action, Drama          │
   │  │ (tall    │  2D  Odia                      │
   │  │  card)   │                                │
   │  └──────────┘                                │
   └─────────────────────────────────────────────┘
   Cast tab → cards with placeholder "Actor" (loaded by JS)
───────────────────────────────────────────────────────────── */
async function scrapeDetail(browser, url, title) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 40000 });
    await delay(5000); // wait for JS to hydrate

    // Scroll down slowly to trigger all lazy loads
    for (let i = 1; i <= 8; i++) {
      await page.evaluate((n) => window.scrollTo(0, n * 350), i);
      await delay(500);
    }
    await delay(2000);

    // ── Extract JSON data from Next.js __NEXT_DATA__ script tag ──
    // BMS is built on Next.js — ALL movie data is in window.__NEXT_DATA__
    // This is far more reliable than DOM scraping
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent); } catch { return null; }
    });

    // Try to extract from Next.js page props first
    let fromNextData = {};
    if (nextData) {
      try {
        // BMS stores movie data deep in pageProps
        const props = nextData?.props?.pageProps || {};
        const movieData = props?.movieData || props?.data || props?.movie || {};

        // Cast and crew
        const castArr = movieData?.castAndCrew || movieData?.cast || [];
        const directors = [], producers = [], actors = [];
        castArr.forEach(person => {
          const name = person?.name || person?.fullName || "";
          const role = (person?.role || person?.designation || "").toLowerCase();
          if (!name) return;
          if (role.includes("direct")) directors.push(name);
          else if (role.includes("produc")) producers.push(name);
          else actors.push(name);
        });

        fromNextData = {
          director:    directors[0] || "",
          producer:    producers[0] || "",
          cast:        actors,
          synopsis:    movieData?.synopsis || movieData?.about || movieData?.description || "",
          releaseDate: movieData?.releaseDate || movieData?.releaseYear || "",
          genres:      movieData?.genres || movieData?.genre || [],
          posterUrl:   movieData?.posterUrl || movieData?.poster || "",
          bannerUrl:   movieData?.bannerUrl || movieData?.banner || movieData?.backdropUrl || "",
        };
        console.log(`  [Next.js] cast: ${actors.length}, director: ${directors[0] || "—"}`);
      } catch (e) {
        console.log("  [Next.js] parse error:", e.message);
      }
    }

    // ── DOM scraping as fallback / supplement ──
    const domData = await page.evaluate(() => {
      let posterUrl = "";
      let bannerUrl = "";

      // ── BANNER: BMS uses CSS background-image on the hero div ──
      // The wide background image behind the title is usually on a
      // div with style="background-image: url(...)"
      const allDivs = Array.from(document.querySelectorAll("div, section, header"));
      for (const el of allDivs) {
        const style = el.getAttribute("style") || "";
        // Inline style background-image (most reliable for BMS)
        if (style.includes("background-image")) {
          const m = style.match(/url\(["']?([^"')]+)["']?\)/);
          if (m && m[1].includes("http") && m[1].length > 20) {
            bannerUrl = m[1];
            break;
          }
        }
      }
      // Also check computed styles
      if (!bannerUrl) {
        for (const el of allDivs.slice(0, 30)) {
          const bg = window.getComputedStyle(el).backgroundImage;
          if (bg && bg !== "none" && bg.includes("http")) {
            const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (m && m[1].length > 20 && !m[1].includes("icon")) {
              bannerUrl = m[1];
              break;
            }
          }
        }
      }

      // ── POSTER: first portrait-ratio image ──
      const allImgs = Array.from(document.querySelectorAll("img"));
      for (const img of allImgs) {
        const src = img.src || img.getAttribute("data-src") || "";
        if (!src || src.includes("data:") || src.includes("svg")) continue;
        const w = img.naturalWidth  || img.clientWidth  || img.offsetWidth  || 0;
        const h = img.naturalHeight || img.clientHeight || img.offsetHeight || 0;
        // Portrait = taller than wide
        if (h > w * 1.1 && w > 50) {
          posterUrl = src;
          break;
        }
      }
      // Fallback: first CDN image
      if (!posterUrl) {
        for (const img of allImgs) {
          const src = img.src || "";
          if (src.includes("http") && !src.includes("data:") && !src.includes("icon")) {
            posterUrl = src;
            break;
          }
        }
      }

      // ── SYNOPSIS ──
      let synopsis = "";
      const h2s = Array.from(document.querySelectorAll("h2, h3"));
      for (const h of h2s) {
        if (/about/i.test(h.innerText || "")) {
          let sib = h.nextElementSibling;
          while (sib && !synopsis) {
            const t = sib.innerText?.trim() || "";
            if (t.length > 40) synopsis = t;
            sib = sib.nextElementSibling;
          }
          if (!synopsis) {
            const p = h.parentElement;
            const full = p?.innerText?.trim().replace(h.innerText, "").trim() || "";
            if (full.length > 40) synopsis = full;
          }
          if (synopsis) break;
        }
      }

      // ── GENRES: look for comma-separated text in hero area ──
      const GENRE_LIST = ["Action","Drama","Romance","Comedy","Thriller","Family","Historical","Horror","Musical","Biographical","Social","Fantasy","Crime"];
      const genres = new Set();
      document.querySelectorAll("span, p, li").forEach(el => {
        const txt = el.innerText?.trim() || "";
        // "Action, Drama" pattern
        txt.split(/,\s*/).forEach(part => {
          const g = part.trim();
          if (GENRE_LIST.includes(g)) genres.add(g);
        });
        if (GENRE_LIST.includes(txt)) genres.add(txt);
      });

      // ── RELEASE DATE ──
      let releaseDate = "";
      document.querySelectorAll("*").forEach(el => {
        if (releaseDate) return;
        const txt = el.childNodes.length === 1
          ? (el.innerText?.trim() || "")
          : "";
        if (!txt || txt.length > 80) return;
        const m1 = txt.match(/releasing\s+in\s+(\d{4})/i);
        const m2 = txt.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i);
        const m3 = txt.match(/(\d{4}-\d{2}-\d{2})/);
        if (m1) releaseDate = m1[1];
        else if (m2) releaseDate = m2[1];
        else if (m3) releaseDate = m3[1];
      });

      // ── CAST from DOM (fallback when Next.js data empty) ──
      const castList = [];
      let director = "", producer = "";

      // Person links
      document.querySelectorAll("a[href*='/person/']").forEach(link => {
        const card = link.closest("div, li, article");
        const allPs = card ? Array.from(card.querySelectorAll("p, span, h3, h4")) : [];
        // First meaningful text = name, second = role
        const texts = allPs.map(p => p.innerText?.trim()).filter(t => t && t.length > 1 && t.length < 60);
        const name  = texts[0] || link.innerText?.trim() || "";
        const role  = texts[1] || "";
        if (!name || name.toLowerCase() === "actor" || name.toLowerCase() === "actress") return;
        if (/direct/i.test(role)) director = director || name;
        else if (/produc/i.test(role)) producer = producer || name;
        else if (!castList.includes(name)) castList.push(name);
      });

      return { posterUrl, bannerUrl, synopsis, releaseDate, director, producer, cast: castList, genres: [...genres] };
    });

    // Merge: prefer Next.js data, fill gaps with DOM data
    const merged = {
      posterUrl:   fromNextData.posterUrl   || domData.posterUrl   || "",
      bannerUrl:   fromNextData.bannerUrl   || domData.bannerUrl   || "",
      synopsis:    fromNextData.synopsis    || domData.synopsis    || "",
      releaseDate: fromNextData.releaseDate || domData.releaseDate || "",
      director:    fromNextData.director    || domData.director    || "",
      producer:    fromNextData.producer    || domData.producer    || "",
      cast:        fromNextData.cast?.length ? fromNextData.cast : domData.cast,
      genres:      fromNextData.genres?.length ? fromNextData.genres : domData.genres,
    };

    await page.close();
    return merged;

  } catch (err) {
    console.error(`  ✗ Error scraping ${title}:`, err.message);
    try { await page.close(); } catch {}
    return { posterUrl:"", bannerUrl:"", synopsis:"", releaseDate:"", director:"", producer:"", cast:[], genres:[] };
  }
}

/* ─────────────────────────────────────────────────────────────
   SCRAPE LISTING PAGE
───────────────────────────────────────────────────────────── */
async function scrapeMovies() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1400,900",
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
  );

  console.log("→ Opening BMS listing…");
  await page.goto(
    "https://in.bookmyshow.com/explore/upcoming-movies-bhubaneswar?languages=oriya",
    { waitUntil: "networkidle2", timeout: 40000 }
  );
  await delay(5000);

  for (let i = 0; i < 6; i++) {
    await page.evaluate((n) => window.scrollBy(0, n * 500), i + 1);
    await delay(700);
  }
  await delay(2000);

  const movies = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    document.querySelectorAll("a").forEach(el => {
      const link = el.href || "";
      if (!link.includes("/movies/")) return;
      if (seen.has(link)) return;
      const img   = el.querySelector("img");
      const title = img?.alt?.trim() || el.getAttribute("aria-label")?.trim()
        || el.querySelector("h3,h4,p,span")?.innerText?.trim() || "";
      if (!title || title.length < 2) return;
      seen.add(link);
      results.push({ title, url: link, listingPoster: img?.src || "" });
    });
    return results;
  });

  console.log(`→ Found ${movies.length} movies\n`);
  movies.forEach((m, i) => console.log(`  ${i+1}. ${m.title} — ${m.url}`));

  const detailed = [];
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    console.log(`\n[${i+1}/${movies.length}] → ${movie.title}`);

    const data    = await scrapeDetail(browser, movie.url, movie.title);
    const trailer = await getTrailer(movie.title);

    // Fallback poster from listing page thumbnail
    const posterUrl = data.posterUrl || movie.listingPoster || "";

    console.log(`  poster:   ${posterUrl    ? "✓" : "✗ MISSING"}`);
    console.log(`  banner:   ${data.bannerUrl ? "✓ " + data.bannerUrl.slice(0,70) : "✗ MISSING"}`);
    console.log(`  director: ${data.director  || "—"}`);
    console.log(`  cast:     [${data.cast.slice(0,5).join(", ")}]`);
    console.log(`  genres:   ${data.genres.join(", ") || "—"}`);
    console.log(`  release:  ${data.releaseDate || "—"}`);
    console.log(`  trailer:  ${trailer?.ytId || "—"}`);

    detailed.push({
      title:        movie.title,
      posterUrl,
      thumbnailUrl: data.bannerUrl,  // wide hero image → Ollipedia banner
      bannerUrl:    data.bannerUrl,
      synopsis:     data.synopsis,
      cast:         data.cast,
      genre:        data.genres,
      director:     data.director,
      producer:     data.producer,
      releaseDate:  data.releaseDate,
      verdict:      "Upcoming",
      media:        { trailer },
    });

    await delay(2000);
  }

  await browser.close();
  return detailed;
}

/* ─────────────────────────────────────────────────────────────
   SAVE — smart upsert
───────────────────────────────────────────────────────────── */
async function saveMovies(movies) {
  let saved = 0, updated = 0, skipped = 0;
  for (const m of movies) {
    const exists = await Movie.findOne({ title: m.title });
    if (!exists) {
      await Movie.create(m);
      console.log(`  ✓ Saved:   ${m.title}`);
      saved++; continue;
    }
    const patch = {};
    if (!exists.posterUrl    && m.posterUrl)    patch.posterUrl    = m.posterUrl;
    if (!exists.bannerUrl    && m.bannerUrl)    patch.bannerUrl    = m.bannerUrl;
    if (!exists.thumbnailUrl && m.thumbnailUrl) patch.thumbnailUrl = m.thumbnailUrl;
    if (!exists.synopsis     && m.synopsis)     patch.synopsis     = m.synopsis;
    if (!exists.director     && m.director)     patch.director     = m.director;
    if (!exists.producer     && m.producer)     patch.producer     = m.producer;
    if (!exists.releaseDate  && m.releaseDate)  patch.releaseDate  = m.releaseDate;
    if (!exists.genre?.length && m.genre?.length) patch.genre      = m.genre;
    if (!exists.media?.trailer?.ytId && m.media?.trailer?.ytId)
      patch["media.trailer"] = m.media.trailer;

    if (Object.keys(patch).length) {
      await Movie.updateOne({ _id: exists._id }, { $set: patch });
      console.log(`  ↻ Updated: ${m.title}`); updated++;
    } else {
      console.log(`  ⊘ Skipped: ${m.title}`); skipped++;
    }
  }
  console.log(`\n════ ${saved} saved · ${updated} updated · ${skipped} skipped ════`);
}

/* ─────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────── */
async function main() {
  if (!process.env.MONGO_URI) { console.error("✗ Add MONGO_URI to .env"); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ MongoDB connected\n");
  const movies = await scrapeMovies();
  console.log(`\n→ Scraped ${movies.length} movies — saving…\n`);
  await saveMovies(movies);
  await mongoose.disconnect();
  console.log("✓ Done.");
}

main();