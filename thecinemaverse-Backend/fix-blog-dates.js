/**
 * fix-blog-dates.js
 * ─────────────────────────────────────────────────────────────────
 * Sets each blog post's createdAt (and updatedAt) to the release
 * date of the movie it was written about.
 *
 * LOGIC:
 *  1. Load every blog post that has a movieTitle.
 *  2. Find the matching Movie by title (case-insensitive).
 *  3. If the movie has a releaseDate → set blog.createdAt to that date.
 *     If the movie has NO releaseDate (TBA) → leave it alone.
 *  4. Print a summary of every change made.
 *
 * HOW TO RUN:
 *  1. Place this file in the same folder as your server.js  (or anywhere).
 *  2. Make sure your .env file is present (needs MONGO_URI).
 *  3. Run:
 *       node fix-blog-dates.js
 *
 * SAFE TO RE-RUN — already-correct dates are skipped without writing.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

// ── Minimal schemas (only the fields we need) ─────────────────────
const MovieSchema = new mongoose.Schema(
  { title: String, releaseDate: String },
  { timestamps: true, strict: false }
);

const BlogSchema = new mongoose.Schema(
  { title: String, movieTitle: String, movieId: mongoose.Schema.Types.ObjectId },
  { timestamps: true, strict: false }
);

const Movie = mongoose.models.Movie || mongoose.model("Movie", MovieSchema);
const Blog  = mongoose.models.Blog  || mongoose.model("Blog",  BlogSchema);

// ── Helpers ───────────────────────────────────────────────────────
function normalise(str) {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌  MONGO_URI not found in .env — cannot connect.");
    process.exit(1);
  }

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅  Connected.\n");

  // 1. Load all movies once → build a title→releaseDate lookup map
  const movies = await Movie.find({}, "title releaseDate").lean();
  const movieMap = new Map(); // normalised title → Date | null
  for (const m of movies) {
    const key  = normalise(m.title);
    const date = parseDate(m.releaseDate);
    movieMap.set(key, date);
  }
  console.log(`📽  Loaded ${movies.length} movies into lookup map.\n`);

  // 2. Load all blog posts
  const blogs = await Blog.find({}).lean();
  console.log(`📝  Found ${blogs.length} blog posts to process.\n`);

  let updated = 0;
  let skippedNoTitle   = 0;
  let skippedNoMovie   = 0;
  let skippedNoDate    = 0;
  let skippedSameDate  = 0;

  for (const blog of blogs) {
    const rawTitle = blog.movieTitle || "";

    // Skip posts with no linked movie title
    if (!rawTitle.trim()) {
      skippedNoTitle++;
      continue;
    }

    // Look up the movie (exact normalised match first)
    let releaseDate = movieMap.get(normalise(rawTitle)) ?? undefined;

    // Fallback: partial match (blog title sometimes has year appended)
    if (releaseDate === undefined) {
      for (const [key, val] of movieMap) {
        if (normalise(rawTitle).includes(key) || key.includes(normalise(rawTitle))) {
          releaseDate = val;
          break;
        }
      }
    }

    if (releaseDate === undefined) {
      console.log(`  ⚠️  No movie found for: "${rawTitle}"`);
      skippedNoMovie++;
      continue;
    }

    if (!releaseDate) {
      // Movie exists but has no release date (TBA)
      console.log(`  ⏭  "${rawTitle}" — release date is TBA, skipping.`);
      skippedNoDate++;
      continue;
    }

    // Compare only the date part (ignore time)
    const currentDate = fmtDate(new Date(blog.createdAt));
    const targetDate  = fmtDate(releaseDate);

    if (currentDate === targetDate) {
      skippedSameDate++;
      continue; // already correct, don't write
    }

    // Update createdAt and updatedAt using $set + timestamps bypass
    await Blog.collection.updateOne(
      { _id: blog._id },
      {
        $set: {
          createdAt: releaseDate,
          updatedAt: releaseDate,
        },
      }
    );

    console.log(
      `  ✅  "${blog.title.slice(0, 60)}"\n` +
      `       ${currentDate}  →  ${targetDate}  (${rawTitle})`
    );
    updated++;
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log(`  ✅  Updated       : ${updated}`);
  console.log(`  ⏭  Same date     : ${skippedSameDate}  (no change needed)`);
  console.log(`  ⚠️  No movie found: ${skippedNoMovie}`);
  console.log(`  🗓  TBA date      : ${skippedNoDate}`);
  console.log(`  ❌  No movieTitle : ${skippedNoTitle}`);
  console.log("─────────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("🔌  Disconnected. Done!");
}

main().catch(err => {
  console.error("❌  Fatal error:", err.message);
  process.exit(1);
});
