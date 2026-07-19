/**
 * bulk_articles.js — CinemaVerse Bulk AI Article Generator
 * ══════════════════════════════════════════════════════════
 *
 * Generates MULTIPLE high-quality, diverse SEO articles per movie
 * using Groq API (llama-3.3-70b-versatile — fast & free tier),
 * then saves them directly into your MongoDB Blog collection.
 *
 * FEATURES:
 *   ✔ Multiple articles per movie (different category each time)
 *   ✔ Every article has a different writing style & intro
 *   ✔ Targets newest/recent movies first
 *   ✔ Randomised publish dates (last 10 days)
 *   ✔ Proper HTML output (h2, h3, p, ul, li, blockquote)
 *   ✔ SEO title, meta description, excerpt, tags auto-generated
 *   ✔ Duplicate-safe (skips if slug already exists)
 *   ✔ Rate-limit aware (auto-backs off on 429)
 *
 * USAGE:
 *   node bulk_articles.js                          # all movies, 3 articles each
 *   node bulk_articles.js --count 5               # 5 articles per movie
 *   node bulk_articles.js --limit 20              # process only first 20 movies
 *   node bulk_articles.js --movie "Sikandar"      # one movie only
 *   node bulk_articles.js --language hindi        # filter by language
 *   node bulk_articles.js --publish               # auto-publish (default: draft)
 *   node bulk_articles.js --dry-run               # preview prompts, no DB writes
 *   node bulk_articles.js --count 10 --limit 50 --publish
 *
 * REQUIRED .env:
 *   MONGO_URI       — MongoDB Atlas connection string
 *   GROQ_API_KEY    — From console.groq.com (free tier available)
 * ══════════════════════════════════════════════════════════
 */

"use strict";
require("dotenv").config();
const mongoose = require("mongoose");

// ── Config ────────────────────────────────────────────────────────────────────
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const MONGO_URI = (process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
const GROQ_MODEL = "llama-3.1-8b-instant"; // Switched to 8b for much faster generation and higher rate limits
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

if (!GROQ_API_KEY) { console.error("❌  GROQ_API_KEY not set in .env"); process.exit(1); }
if (!MONGO_URI) { console.error("❌  MONGO_URI not set in .env"); process.exit(1); }

// ── CLI Flags ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.indexOf(`--${name}`);
const flagVal = (name) => flag(name) !== -1 ? argv[flag(name) + 1] : null;
const DRY_RUN = argv.includes("--dry-run");
const AUTO_PUBLISH = argv.includes("--publish");
const MOVIE_FILTER = flagVal("movie");
const LANG_FILTER = (flagVal("language") || "").toLowerCase() || null;
const ARTICLES_PER_MOVIE = parseInt(flagVal("count") || "3", 10);
const MOVIE_LIMIT = parseInt(flagVal("limit") || "9999", 10);

// ── Language / Industry Map ───────────────────────────────────────────────────
const LANG_MAP = {
  hindi: { industry: "Bollywood", adjective: "Bollywood", lang: "Hindi" },
  bengali: { industry: "Bengali Cinema", adjective: "Bengali", lang: "Bengali" },
  telugu: { industry: "Tollywood", adjective: "Telugu", lang: "Telugu" },
  malayalam: { industry: "Mollywood", adjective: "Malayalam", lang: "Malayalam" },
  tamil: { industry: "Kollywood", adjective: "Tamil", lang: "Tamil" },
  kannada: { industry: "Sandalwood", adjective: "Kannada", lang: "Kannada" },
  odia: { industry: "Ollywood", adjective: "Odia", lang: "odia" },
  english: { industry: "Hollywood", adjective: "Hollywood", lang: "English" },
  marathi: { industry: "Marathi Cinema", adjective: "Marathi", lang: "Marathi" },
  punjabi: { industry: "Pollywood", adjective: "Punjabi", lang: "Punjabi" },
};

// ── Blog Categories Pool ──────────────────────────────────────────────────────
const ALL_CATEGORIES = [
  "Movie Review",
  "Ending Explained",
  "Story Explained",
  "Story Analysis",
  "Hidden Details",
  "Things You Missed",
  "Cast Performance",
  "Character Analysis",
  "Technical Analysis",
  "Background Score Analysis",
  "Screenplay Breakdown",
  "Direction Analysis",
  "Emotional Moments",
  "Best Scenes Explained",
  "Symbolism",
  "Themes Explained",
  "Audience Reaction",
  "Dialogues Analysis",
  "Performance Review",
  "Cinematography Breakdown",
  "Editing Analysis",
  "What Worked",
  "What Didn't Work",
  "Movie Message Explained",
  "Action Breakdown",
  "Comedy Review",
  "Romantic Journey",
  "Supporting Cast Analysis",
  "Director's Vision",
];

// ── Writing Style Variations (injected into prompts) ─────────────────────────
const INTRO_STYLES = [
  "Begin with a thought-provoking question about the film's central theme.",
  "Open with a vivid description of a standout scene from the film.",
  "Start with audience reactions and social media buzz around this film.",
  "Begin with broader industry context — what this film means for its genre.",
  "Open with a surprising observation most viewers miss about this film.",
  "Start with a bold critical opinion about what makes this film stand out.",
  "Begin by comparing this film to one landmark film from the same genre.",
  "Open with the director's known vision and how it manifests in this film.",
];

const CONCLUSION_STYLES = [
  "End with a recommendation that feels personal and genuine.",
  "Conclude by placing the film in the broader context of its industry.",
  "End with a question that stays with the reader after they finish.",
  "Close with the film's lasting impact on the audience and the genre.",
  "Conclude with a verdict on who should watch and who might not enjoy it.",
];

const AUTHOR_POOL = [
  "The CinemaVerse Desk",
  "Riya Sinha, Film Critic",
  "Arjun Mehta, Entertainment Writer",
  "Priya Nair, Senior Journalist",
  "Vikram Rao, Culture Correspondent",
  "Sneha Kapoor, Film Analyst",
  "Dev Sharma, Entertainment Reporter",
  "Ananya Pillai, Cinema Writer",
];

// ── Utility ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random ISO date in the last 7 days, realistic publication hour */
function randomPublishDate() {
  const now = Date.now();
  const daysAgo = Math.floor(Math.random() * 7); // 0–6 days ago
  const hoursOffset = Math.floor(Math.random() * 12) + 7; // 7 AM – 7 PM IST
  const d = new Date(now - daysAgo * 86400000);
  d.setUTCHours(hoursOffset - 5, Math.floor(Math.random() * 60), 0, 0); // approx IST→UTC
  return d.toISOString();
}

/** Pick N unique categories from the pool, excluding already used ones */
function pickCategories(alreadyUsed = [], count = 3) {
  const pool = ALL_CATEGORIES.filter((c) => !alreadyUsed.includes(c));
  const picked = [];
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    picked.push(shuffled[i]);
  }
  return picked;
}

// ── Groq API Call ─────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout
    
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2800,
          temperature: 0.85,
        }),
      });
      clearTimeout(timeoutId);

      // Rate limit — back off and retry
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
        console.log(`   ⏳ Rate limited. Waiting ${retryAfter}s (attempt ${attempt}/${retries})…`);
        await sleep(retryAfter * 1000 + 2000);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 120)}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        console.log(`   ⏳ Request timed out (attempt ${attempt}/${retries}). Retrying...`);
      }
      if (attempt === retries) throw e;
      await sleep(3000 * attempt);
    }
  }
}

// ── Build System Prompt ───────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a senior entertainment journalist, film critic, and SEO content strategist writing for CinemaVerse, a premium movie and entertainment website.

RULES:
- Write ONLY valid HTML using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>.
- Do NOT use markdown, triple backticks, or code fences.
- Do NOT wrap output in a div.
- Length: 1,200–1,800 words of real content. Never thin. Never filler.
- Write like a real journalist — varied sentence lengths, authentic opinions, no AI clichés.
- Every paragraph must add real value.
- Never keyword-stuff. Weave in SEO terms naturally.
- Never start two consecutive paragraphs the same way.
- Return ONLY the HTML article body. No JSON wrapper, no explanation.`;
}

// ── Build Article Prompt ──────────────────────────────────────────────────────
function buildArticlePrompt(movie, category, introStyle, conclusionStyle, industryLabel) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "recent";
  const genre = (movie.genre || []).join(", ") || "Drama";
  const cast = (movie.cast || []).slice(0, 10)
    .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
    .join(", ") || "a talented cast";
  const director = movie.director || "the director";
  const songs = (movie.media?.songs || []).slice(0, 4).map((s) => s.title).filter(Boolean).join(", ");
  const synopsis = movie.synopsis ? `Synopsis reference: ${movie.synopsis.slice(0, 400)}` : "";
  const verdict = movie.verdict && movie.verdict !== "Upcoming" ? `Box office: ${movie.verdict}` : "";
  const runtime = movie.runtime ? `Runtime: ${movie.runtime}` : "";
  const ott = movie.streamingOn ? `Currently streaming on: ${movie.streamingOn}` : "";

  return `Write a high-quality, completely original ${category} article for the movie "${movie.title}" (${year}).

MOVIE DATA (use only what's accurate, write generally where data is missing):
- Title: ${movie.title}
- Year: ${year}
- Industry: ${industryLabel}
- Genre: ${genre}
- Director: ${director}
- Cast: ${cast}
${runtime ? `- Runtime: ${runtime}` : ""}
${songs ? `- Notable songs: ${songs}` : ""}
${verdict ? `- ${verdict}` : ""}
${ott ? `- ${ott}` : ""}
${synopsis}

CATEGORY: ${category}

INTRO STYLE: ${introStyle}
CONCLUSION STYLE: ${conclusionStyle}

SEO REQUIREMENTS:
- Title-like SEO flow: naturally include "${movie.title}", "${industryLabel}", "${year}", and the category theme as keywords.
- Never keyword-stuff. Every sentence must read naturally.
- Include at least one <blockquote> with a compelling insight or key takeaway.

CONTENT REQUIREMENT FOR "${category}":
Write a thorough, intelligent ${category} piece. Go deeper than a plot summary. Offer genuine analysis, real opinions, and useful insight that viewers cannot get from a simple synopsis.

OUTPUT: Return ONLY the HTML article body. No markdown. No backticks. Start directly with <p> or <h2>.`;
}

// ── Build Meta Prompt ─────────────────────────────────────────────────────────
function buildMetaPrompt(movieTitle, category, articleSnippet, year, industryLabel) {
  return `Given this ${category} article about the ${industryLabel} movie "${movieTitle}" (${year}), generate:

1. title: A long SEO-friendly headline (70-90 characters). Must be a catchy title related to the article content, e.g. "Why This New ${industryLabel} Thriller Has Become One of the Most Discussed Films". Include movie name. No clickbait.
2. seoDesc: 140–160 characters. Compelling summary with natural keywords.
3. excerpt: 2 punchy sentences (max 200 chars total) as a teaser.
4. tags: 10–14 relevant tags as a JSON array of strings.

Article snippet:
${articleSnippet}

Return ONLY valid JSON in this exact format, with NO markdown formatting:
{"title":"...","seoDesc":"...","excerpt":"...","tags":["..."]}`;
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const BlogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  excerpt: { type: String, default: "" },
  content: { type: String, required: true },
  category: { type: String, default: "General" },
  tags: [{ type: String }],
  coverImage: { type: String, default: "" },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
  movieTitle: { type: String, default: "" },
  author: { type: String, default: "The CinemaVerse Desk" },
  published: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  indexed: { type: Boolean, default: true },
  views: { type: Number, default: 0 },
  readTime: { type: Number, default: 5 },
  seoTitle: { type: String, default: "" },
  seoDesc: { type: String, default: "" },
  youtubeVideoId: { type: String, default: "" },
  createdAt: { type: Date },
  updatedAt: { type: Date },
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title: String,
  releaseDate: String,
  genre: [String],
  director: String,
  synopsis: String,
  posterUrl: String,
  language: String,
  runtime: String,
  verdict: String,
  streamingOn: String,
  streamingUrl: String,
  ottReleaseDate: String,
  cast: [{ name: String, type: String, role: String }],
  media: {
    trailer: { ytId: String },
    songs: [{ title: String, singer: String }],
  },
}, { strict: false });

let Blog, Movie;

function initModels() {
  Blog = mongoose.models.Blog || mongoose.model("Blog", BlogSchema);
  Movie = mongoose.models.Movie || mongoose.model("Movie", MovieSchema);
}

// ── Save Blog Post ────────────────────────────────────────────────────────────
async function saveBlog({ title, slug, content, meta, movie, category, author, publishDate }) {
  // Ensure unique slug
  let finalSlug = slug;
  let counter = 0;
  while (await Blog.exists({ slug: finalSlug })) {
    finalSlug = `${slug}-${++counter}`;
  }

  const readTime = Math.max(1, Math.ceil(content.split(/\s+/).length / 200));

  const doc = {
    title,
    slug: finalSlug,
    excerpt: meta.excerpt || "",
    content,
    category,
    tags: meta.tags || [],
    coverImage: movie?.posterUrl || "",
    movieId: movie?._id || undefined,
    movieTitle: movie?.title || "",
    author,
    published: AUTO_PUBLISH,
    featured: false,
    indexed: true,
    readTime,
    seoTitle: meta.seoTitle || title,
    seoDesc: meta.seoDesc || meta.excerpt || "",
    createdAt: new Date(publishDate),
    updatedAt: new Date(publishDate),
  };

  const post = await Blog.create(doc);
  return post;
}

// ── Generate One Article ──────────────────────────────────────────────────────
async function generateOneArticle(movie, category, langInfo) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "recent";
  const introStyle = randomItem(INTRO_STYLES);
  const concStyle = randomItem(CONCLUSION_STYLES);
  const author = randomItem(AUTHOR_POOL);

  // Build & call article
  const sysPrompt = buildSystemPrompt();
  const artPrompt = buildArticlePrompt(movie, category, introStyle, concStyle, langInfo.industry);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Category: ${category}`);
    console.log("Prompt preview:", artPrompt.slice(0, 300) + "…\n");
    return null;
  }

  const content = await callGroq(sysPrompt, artPrompt);
  if (!content || content.length < 400) throw new Error("Article too short — likely incomplete response");

  // Build meta
  let meta = {};
  try {
    const metaRaw = await callGroq(
      "You are an SEO expert. Return ONLY valid JSON, no markdown, no explanation.",
      buildMetaPrompt(movie.title, category, content.slice(0, 800), year, langInfo.industry)
    );
    let cleaned = metaRaw.trim();
    if (cleaned.includes("{")) {
      cleaned = cleaned.substring(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1);
    }
    meta = JSON.parse(cleaned);
  } catch (e) {
    meta = {
      title: `The Ultimate ${category} of ${movie.title} (${year}): A Deep Dive`,
      seoDesc: `${category} of ${movie.title} (${year}). In-depth analysis, performances, and more on CinemaVerse.`,
      excerpt: `${movie.title} ${category}: A detailed look at the ${year} ${langInfo.industry} film.`,
      tags: [movie.title, category, langInfo.industry, `${langInfo.industry} ${year}`, movie.director || ""].filter(Boolean),
    };
  }

  // Derive blog title from generated title (fallback: movie + category)
  const title = meta.title && meta.title.length > 20
    ? meta.title.replace(/\| CinemaVerse/gi, "").trim()
    : `${movie.title} — ${category} | ${langInfo.industry} ${year}`;


  const slug = slugify(title) + "-" + Date.now().toString(36);
  const publishDate = randomPublishDate();

  const post = await saveBlog({ title, slug, content, meta, movie, category, author, publishDate });
  return { post, wordCount: content.split(/\s+/).length };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   CinemaVerse Bulk Article Generator  (Groq / llama-3.3-70b)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Articles per movie : ${ARTICLES_PER_MOVIE}`);
  console.log(`Movie limit        : ${MOVIE_LIMIT === 9999 ? "all" : MOVIE_LIMIT}`);
  console.log(`Language filter    : ${LANG_FILTER || "all"}`);
  console.log(`Movie filter       : ${MOVIE_FILTER || "none"}`);
  console.log(`Auto-publish       : ${AUTO_PUBLISH}`);
  console.log(`Dry run            : ${DRY_RUN}`);
  console.log("");

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("✓ MongoDB connected\n");
  initModels();

  // Build movie query
  const query = {};
  if (LANG_FILTER && LANG_MAP[LANG_FILTER]) {
    query.language = { $regex: new RegExp(`^${LANG_MAP[LANG_FILTER].lang}$`, "i") };
  }
  if (MOVIE_FILTER) {
    query.title = { $regex: new RegExp(MOVIE_FILTER, "i") };
  }

  let movies = await Movie.find(
    query,
    "title releaseDate genre director synopsis posterUrl cast media verdict runtime language streamingOn ottReleaseDate"
  ).lean();

  // Sort: newest first (prioritise recent releases)
  movies.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return db - da;
  });

  movies = movies.slice(0, MOVIE_LIMIT);
  console.log(`Found ${movies.length} movie(s) to process.\n`);

  if (!movies.length) {
    console.log("No movies found for the given filter. Exiting.");
    await mongoose.disconnect();
    return;
  }

  let totalSaved = 0, totalSkipped = 0, totalErrors = 0;

  for (let mi = 0; mi < movies.length; mi++) {
    const movie = movies[mi];
    const label = `[Movie ${String(mi + 1).padStart(3)}/${movies.length}]`;
    const langKey = (movie.language || "hindi").toLowerCase();
    const langInfo = LANG_MAP[langKey] || LANG_MAP.hindi;

    console.log(`\n${label} "${movie.title}" (${langInfo.industry})`);
    console.log(`${"─".repeat(60)}`);

    // Find categories already written for this movie (to ensure diversity)
    const existingBlogs = await Blog.find(
      { movieId: movie._id },
      "category"
    ).lean();
    const usedCategories = existingBlogs.map((b) => b.category);

    const categoriesToWrite = pickCategories(usedCategories, ARTICLES_PER_MOVIE);

    if (!categoriesToWrite.length) {
      console.log(`   ⏭  All ${ARTICLES_PER_MOVIE} article slots already filled. Skipping.`);
      totalSkipped += ARTICLES_PER_MOVIE;
      continue;
    }

    for (let ci = 0; ci < categoriesToWrite.length; ci++) {
      const category = categoriesToWrite[ci];
      process.stdout.write(`   [${ci + 1}/${categoriesToWrite.length}] ${category.padEnd(30)}`);

      try {
        const result = await generateOneArticle(movie, category, langInfo);
        if (result === null) {
          // dry run
          console.log("(dry run)");
        } else {
          console.log(`✓  ${result.wordCount} words  published=${AUTO_PUBLISH}`);
          totalSaved++;
        }
      } catch (e) {
        console.log(`❌ ${e.message.slice(0, 80)}`);
        totalErrors++;
      }

      // Respectful delay between calls to avoid rate limiting
      if (!DRY_RUN && ci < categoriesToWrite.length - 1) {
        await sleep(2500);
      }
    }

    // Slightly longer gap between movies
    if (!DRY_RUN && mi < movies.length - 1) {
      await sleep(1500);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  FINAL REPORT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Articles saved    : ${totalSaved}`);
  console.log(`Skipped           : ${totalSkipped}`);
  console.log(`Errors            : ${totalErrors}`);
  console.log(`Published         : ${AUTO_PUBLISH ? "YES" : "NO — review in Admin → Blog"}`);
  if (!AUTO_PUBLISH && totalSaved > 0) {
    console.log("\n💡 Go to Admin Portal → Blog to review and publish articles.");
  }
  console.log("");

  await mongoose.disconnect();
  console.log("Done ✓");
}

main().catch((e) => {
  console.error("\nFatal error:", e.message);
  process.exit(1);
});
