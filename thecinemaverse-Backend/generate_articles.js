/**
 * generate_articles.js — Ollipedia AI Article Generator
 * ═══════════════════════════════════════════════════════════════════
 *
 * Generates SEO-optimized blog articles for every movie in your DB
 * using Claude AI (Anthropic API), then saves them as Blog posts.
 *
 * WHAT IT CREATES:
 *   • One 1000–1500 word article per movie
 *   • Proper headings, SEO title, excerpt, tags
 *   • Covers: intro, story, cast, music, why watch, fun facts
 *   • Published=false by default (you review before publishing)
 *
 * USAGE:
 *   node generate_articles.js                    # all movies
 *   node generate_articles.js --movie "Ladhei"   # one movie
 *   node generate_articles.js --limit 20          # first 20
 *   node generate_articles.js --publish           # auto-publish
 *   node generate_articles.js --dry-run           # print prompt only
 *
 * REQUIRED .env:
 *   MONGO_URI          — MongoDB connection
 *   ANTHROPIC_API_KEY  — Get from console.anthropic.com
 *
 * ALSO GENERATES:
 *   • "Top 10 Odia Movies of [year]" for each year with 10+ films
 *   • "Best Odia Actors" spotlight article
 *   • "Upcoming Ollywood Movies" article
 * ═══════════════════════════════════════════════════════════════════
 */

import dotenv    from "dotenv";
import mongoose  from "mongoose";
dotenv.config();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const MONGO_URI     = process.env.MONGO_URI || process.env.MONGODB_URI || "";

if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY not set in .env"); process.exit(1); }
if (!MONGO_URI)     { console.error("❌ MONGO_URI not set in .env");          process.exit(1); }

// ── CLI ───────────────────────────────────────────────────────────
const argv        = process.argv.slice(2);
const DRY_RUN     = argv.includes("--dry-run");
const AUTO_PUBLISH= argv.includes("--publish");
const MOVIE_FILTER= argv.includes("--movie") ? argv[argv.indexOf("--movie")+1] : null;
const LIMIT       = argv.includes("--limit")  ? parseInt(argv[argv.indexOf("--limit")+1],10) : Infinity;

// ── Schemas ───────────────────────────────────────────────────────
const BlogSchema = new mongoose.Schema({
  title:String,slug:String,excerpt:String,content:String,
  category:String,tags:[String],coverImage:String,
  movieId:{type:mongoose.Schema.Types.ObjectId,ref:"Movie"},
  movieTitle:String,author:String,published:Boolean,
  featured:Boolean,views:{type:Number,default:0},readTime:Number,
  seoTitle:String,seoDesc:String,
},{timestamps:true});

const MovieSchema = new mongoose.Schema({
  title:String, releaseDate:String, genre:[String], director:String,
  producer:String, synopsis:String, posterUrl:String,
  cast:[{name:String,type:String,role:String}],
  media:{ trailer:{ytId:String}, songs:[{title:String,singer:String}] },
  reviews:[{rating:Number}],
  verdict:String,runtime:String,language:String,
},{strict:false});

const Blog  = mongoose.models.Blog  || mongoose.model("Blog",  BlogSchema);
const Movie = mongoose.models.Movie || mongoose.model("Movie", MovieSchema);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Build prompt for movie article ───────────────────────────────
function buildMoviePrompt(movie) {
  const year     = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "recent";
  const genres   = (movie.genre||[]).join(", ") || "Odia";
  const cast     = (movie.cast||[]).slice(0,8).map(c=>`${c.name}${c.role?" ("+c.role+")":""}`).join(", ") || "notable cast";
  const director = movie.director || "an Odia director";
  const songs    = (movie.media?.songs||[]).slice(0,3).map(s=>s.title).filter(Boolean).join(", ");
  const synopsis = movie.synopsis ? `Known synopsis: ${movie.synopsis.slice(0,300)}` : "";
  const rating   = movie.reviews?.length
    ? `User rating: ${(movie.reviews.reduce((s,r)=>s+(r.rating||0),0)/movie.reviews.length).toFixed(1)}/5`
    : "";
  const verdict  = movie.verdict && movie.verdict!=="Upcoming" ? `Box office verdict: ${movie.verdict}` : "";
  const runtime  = movie.runtime ? `Runtime: ${movie.runtime}` : "";

  return `Write a high-quality, unique, SEO-optimized article about the Odia movie "${movie.title}".

Movie details (use only what's accurate, skip what's missing):
- Title: ${movie.title}
- Year: ${year}
- Genre: ${genres}
- Director: ${director}
- Cast: ${cast}
- Language: ${movie.language||"Odia"}
${runtime}
${songs ? "- Songs: "+songs : ""}
${synopsis}
${rating}
${verdict}

Requirements:
- Length: 1000–1500 words minimum
- Language: Simple, engaging English
- Do NOT copy from any source — write original content
- Do NOT make up facts not in the data above — write generally if info is missing
- SEO-friendly: naturally include keywords like "Odia movie", "Ollywood", "${movie.title}", "${year}"

Structure (write as flowing paragraphs, not labeled sections):
1. Introduction — release year, genre, why this movie matters in Odia cinema
2. Story overview — engaging summary without spoilers
3. Cast & performances — mention main actors, their roles, screen presence
4. Direction & technical aspects — direction style, cinematography, music if applicable
5. Why you should watch — audience appeal, emotional highlights
6. A unique insight or interesting angle about the movie

Tone: Informative, warm, engaging — like a knowledgeable film enthusiast writing for fans.
Do NOT include section headers or numbered labels.
Output: Return ONLY the article text with paragraphs separated by blank lines.`;
}

// ── Build prompt for Top 10 article ──────────────────────────────
function buildTop10Prompt(year, movies) {
  const list = movies.slice(0,10).map((m,i)=>`${i+1}. ${m.title} (${m.verdict||"Released"}) — Dir. ${m.director||"?"}`).join("\n");
  return `Write a high-quality, engaging SEO article: "Top 10 Odia Movies of ${year}".

The movies to include (in order):
${list}

Requirements:
- Length: 800–1200 words
- For each movie: 2–3 sentences about what made it special that year
- Include an intro paragraph about Odia cinema in ${year}
- End with a conclusion about what ${year} meant for Ollywood
- Natural, engaging tone — like a film critic's year-end roundup
- Include keywords: "Odia movies ${year}", "Ollywood ${year}", "best odia films ${year}"

Output: Return ONLY the article text with paragraphs separated by blank lines.`;
}

// ── Call Claude API ───────────────────────────────────────────────
async function callLocalAI(prompt) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3",
      prompt: prompt,
      stream: false
    })
  });

  const data = await res.json();
  return data.response;
}

// ── Generate SEO title and excerpt from article ───────────────────
async function generateMeta(title, articleText) {
  const prompt = `Given this article about "${title}", generate:
1. SEO Title (60 chars max, include movie name + "Odia Movie" + year if known)
2. Meta Description (155 chars max, compelling, includes main keywords)
3. Tags (5-8 comma-separated tags like: "${title}, Odia Movie, Ollywood, ...")
4. Excerpt (2 sentences teaser for the article)

Article preview: ${articleText.slice(0,500)}

Return ONLY valid JSON like:
{"seoTitle":"...","seoDesc":"...","tags":["..."],"excerpt":"..."}`;

  try {
    const raw = await callLocalAI(prompt);
    const json = raw.replace(/```json|```/g,"").trim();
    return JSON.parse(json);
  } catch {
    // Fallback
    const words = articleText.split(/\s+/).length;
    return {
      seoTitle: `${title} — Odia Movie Review & Details | Ollypedia`,
      seoDesc:  articleText.slice(0,155),
      tags:     [title, "Odia Movie", "Ollywood", "Odia Cinema"],
      excerpt:  articleText.split(/\n\n/)[0]?.slice(0,200)||"",
    };
  }
}

// ── Slugify ───────────────────────────────────────────────────────
function slugify(text) {
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").trim();
}

// ── Save blog post ────────────────────────────────────────────────
async function saveBlogPost({ title, content, meta, movie, category }) {
  const slug = slugify(title) + "-" + Date.now().toString(36);
  const readTime = Math.max(1, Math.ceil(content.split(/\s+/).length/200));

  const existing = await Blog.findOne({ $or:[{title},{slug}] }).lean();
  if (existing) { console.log(`   ⏭  SKIP (already exists): ${title.slice(0,50)}`); return null; }

  const doc = {
    title,
    slug,
    excerpt:    meta.excerpt || content.split(/\n\n/)[0]?.slice(0,200)||"",
    content,
    category:   category || "Movie Review",
    tags:       meta.tags || [],
    coverImage: movie?.posterUrl || "",
    movieId:    movie?._id || undefined,
    movieTitle: movie?.title || "",
    author:     "Ollypedia Team",
    published:  AUTO_PUBLISH,
    featured:   false,
    readTime,
    seoTitle:   meta.seoTitle || title,
    seoDesc:    meta.seoDesc  || meta.excerpt || "",
  };

  const post = await Blog.create(doc);
  return post;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Ollipedia Article Generator");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Claude model : claude-sonnet-4-20250514");
  console.log("Auto-publish : " + AUTO_PUBLISH);
  console.log("Dry run      : " + DRY_RUN);
  console.log("Movie filter : " + (MOVIE_FILTER||"all"));
  console.log("Limit        : " + (isFinite(LIMIT)?LIMIT:"none"));
  console.log("");

  await mongoose.connect(MONGO_URI);
  console.log("✓ MongoDB connected\n");

  let movies = await Movie.find({}, "title releaseDate genre director producer synopsis posterUrl cast media reviews verdict runtime language").lean();

  // Sort: newest first
  movies.sort((a,b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return db - da;
  });

  if (MOVIE_FILTER) {
    movies = movies.filter(m => m.title?.toLowerCase().includes(MOVIE_FILTER.toLowerCase()));
    if (!movies.length) { console.error("No movies matching: "+MOVIE_FILTER); process.exit(1); }
  }

  movies = movies.slice(0, LIMIT);
  console.log(`Processing ${movies.length} movies…\n`);

  let saved=0, skipped=0, errors=0;

  // ── Step 1: Movie articles ────────────────────────────────────
  for (let i=0; i<movies.length; i++) {
    const movie = movies[i];
    const label = `[${String(i+1).padStart(3)}/${movies.length}]`;
    process.stdout.write(`${label} "${movie.title}"… `);

    // Check if article already exists
    const existing = await Blog.findOne({ movieId: movie._id }).lean();
    if (existing) { console.log("⏭  skip (exists)"); skipped++; continue; }

    if (DRY_RUN) {
      console.log("DRY — prompt built");
      console.log("\n--- PROMPT ---\n" + buildMoviePrompt(movie).slice(0,400) + "…\n");
      continue;
    }

    try {
      const prompt  = buildMoviePrompt(movie);
      const article = await callLocalAI(prompt);

      if (!article || article.length < 200) throw new Error("Article too short");

      const meta  = await generateMeta(movie.title, article);
      const year  = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
      const title = `${movie.title}${year?" ("+year+")":""} — Complete Guide, Cast & Review`;

      const post = await saveBlogPost({ title, content:article, meta, movie, category:"Movie Review" });
      if (post) { console.log(`✓ Saved (${article.split(/\s+/).length} words)`); saved++; }
      else skipped++;

      await sleep(1500); // rate limit
    } catch(e) {
      console.log(`❌ ERR: ${e.message.slice(0,60)}`);
      errors++;
      await sleep(3000);
    }
  }

  // ── Step 2: Top 10 per year articles ─────────────────────────
  if (!MOVIE_FILTER) {
    console.log("\n[Special Articles] Generating Top 10 per year…\n");
    const allMovies = await Movie.find({verdict:{$ne:"Upcoming"}}, "title releaseDate verdict director").lean();
    const byYear = {};
    for (const m of allMovies) {
      const yr = m.releaseDate ? new Date(m.releaseDate).getFullYear() : null;
      if (!yr || yr < 2000) continue;
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(m);
    }

    for (const [year, yMovies] of Object.entries(byYear).sort((a,b)=>b[0]-a[0]).slice(0,5)) {
      if (yMovies.length < 5) continue;
      const title = `Top 10 Odia Movies of ${year} — Best Ollywood Films`;
      const exists = await Blog.findOne({ title }).lean();
      if (exists) { console.log(`⏭  skip Top 10 ${year}`); continue; }

      process.stdout.write(`  Top 10 ${year}… `);
      try {
        const sorted  = yMovies.sort((a,b)=>{const order={"Blockbuster":5,"Super Hit":4,"Hit":3,"Average":2,"Flop":1};return (order[b.verdict]||0)-(order[a.verdict]||0);});
        const article = await callClaude(buildTop10Prompt(year, sorted));
        const meta    = await generateMeta(title, article);
        const post    = await saveBlogPost({ title, content:article, meta, category:"Top 10" });
        if (post) { console.log(`✓ Saved`); saved++; } else skipped++;
        await sleep(2000);
      } catch(e) { console.log(`❌ ${e.message.slice(0,50)}`); errors++; }
    }

    // ── Step 3: Upcoming movies article ──────────────────────────
    const upcoming = await Movie.find({verdict:"Upcoming"}, "title releaseDate genre director").lean();
    if (upcoming.length >= 3 && !DRY_RUN) {
      const title   = "Upcoming Odia Movies — Most Anticipated Ollywood Films";
      const exists  = await Blog.findOne({ title }).lean();
      if (!exists) {
        process.stdout.write("\n  Upcoming movies article… ");
        const list = upcoming.slice(0,15).map(m=>`- ${m.title} (${m.releaseDate?.slice(0,4)||"TBA"}) — ${(m.genre||[]).join("/")}`).join("\n");
        const prompt = `Write an exciting preview article titled "${title}".

Movies coming soon:
${list}

Requirements:
- 700–1000 words
- Build excitement for each film briefly (2-3 sentences each)
- Intro about the state of Odia cinema and what fans can look forward to
- End with an encouraging note for Odia film lovers
- SEO keywords: "upcoming odia movies", "new odia film 2025 2026", "Ollywood upcoming"
- Do NOT make up release dates or plot details not provided

Output: Return ONLY the article text.`;
        try {
          const article = await callLocalAI(prompt);
          const meta    = await generateMeta(title, article);
          const post    = await saveBlogPost({ title, content:article, meta, category:"Upcoming" });
          if (post) { console.log("✓ Saved"); saved++; }
          await sleep(2000);
        } catch(e) { console.log(`❌ ${e.message.slice(0,50)}`); errors++; }
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Final Report");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Articles saved   : ${saved}`);
  console.log(`Skipped (exists) : ${skipped}`);
  console.log(`Errors           : ${errors}`);
  console.log(`Published        : ${AUTO_PUBLISH ? "YES (all)" : "NO (review in admin first)"}`);
  if (!AUTO_PUBLISH && saved > 0) {
    console.log("\n💡 Go to Admin Portal → Blog to review and publish articles");
  }

  await mongoose.disconnect();
  console.log("\nDone! ✓");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
