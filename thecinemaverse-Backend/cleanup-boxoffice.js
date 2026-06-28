// ─────────────────────────────────────────────────────────────────────────────
//  cleanup-boxoffice.js
//  Cleans and normalizes all boxOffice and budget fields in MongoDB
//
//  Handles all these formats:
//    ₹3,203.27–3,280.44 crore (combined)[4]
//    ₹1,852.44 crore[3]
//    $230,851(US domestic video sales)[1]
//    ₹199.20 Cr
//    ₹45.5 L
//    TBA / N/A / empty
//
//  Output format: "₹X.XX Cr"  (crore, 2 decimal places)
//
//  Run: node cleanup-boxoffice.js
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

// ── 1 USD ≈ 83 INR (approximate)
const USD_TO_INR = 83;

/**
 * Parse ANY box office / budget string into INR (paise-free integer rupees).
 * Returns null if unparseable or clearly invalid.
 */
function parseToINR(raw) {
  if (!raw) return null;

  let s = String(raw).trim();

  // Strip citation numbers like [1], [3], [14]
  s = s.replace(/\[\d+\]/g, "").trim();

  // Strip parenthetical notes like (combined), (US domestic video sales), (estimated)
  s = s.replace(/\([^)]*\)/g, "").trim();

  // If range like "3,203.27–3,280.44 crore" → take the average
  const rangeMatch = s.match(/([\d,]+\.?\d*)\s*[–\-]\s*([\d,]+\.?\d*)/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const hi = parseFloat(rangeMatch[2].replace(/,/g, ""));
    if (!isNaN(lo) && !isNaN(hi)) {
      s = String((lo + hi) / 2);
      // Keep the unit from the original string for scale detection below
      s = s + " " + raw.replace(/\[\d+\]/g, "").replace(/\([^)]*\)/g, "").replace(/[\d,.\s–\-]+/, "").trim();
    }
  }

  // Detect currency
  const isUSD = raw.includes("$") || raw.toLowerCase().includes("usd");
  const isGBP = raw.includes("£");
  const currencyRate = isUSD ? USD_TO_INR : isGBP ? 105 : 1;

  // Extract numeric value
  const numMatch = s.match(/([\d,]+\.?\d*)/);
  if (!numMatch) return null;
  let num = parseFloat(numMatch[1].replace(/,/g, ""));
  if (isNaN(num) || num <= 0) return null;

  // Detect scale
  const lower = s.toLowerCase();
  if (lower.includes("billion")) {
    num = num * 1_00_00_00_000;
  } else if (lower.includes("million")) {
    num = num * 10_00_000;
  } else if (lower.includes("crore") || lower.includes(" cr")) {
    num = num * 1_00_00_000;
  } else if (lower.includes("lakh") || lower.includes("lac") || lower.includes(" l")) {
    num = num * 1_00_000;
  } else if (lower.includes("thousand") || lower.includes(" k")) {
    num = num * 1_000;
  } else {
    // Bare number — if USD/GBP it's likely in dollars, if INR symbol small number = crore notation
    if (!isUSD && !isGBP) {
      // Could be "199.20" meaning crore (common in Indian data)
      if (num < 10_000) {
        num = num * 1_00_00_000; // treat as crore
      }
    }
  }

  return Math.round(num * currencyRate);
}

/**
 * Format INR integer → "₹X.XX Cr"
 */
function formatINR(n) {
  if (!n || n <= 0) return "TBA";
  if (n >= 1_00_00_000) {
    return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (n >= 1_00_000) {
    return `₹${(n / 1_00_000).toFixed(2)} L`;
  }
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Clean a single value — returns normalized string or "TBA"
 */
function cleanValue(raw) {
  if (!raw || ["tba", "n/a", "na", "-", ""].includes(String(raw).trim().toLowerCase())) {
    return "TBA";
  }

  // Already clean format like "₹45.23 Cr" — check if it needs stripping of citations only
  const stripped = String(raw).replace(/\[\d+\]/g, "").replace(/\([^)]*\)/g, "").trim();

  // If already in our target format and no junk, return stripped version
  if (/^₹[\d,]+\.?\d*\s*(Cr|L)$/.test(stripped)) {
    return stripped;
  }

  const inr = parseToINR(raw);
  if (!inr) return "TBA";
  return formatINR(inr);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected\n");

  const db = mongoose.connection.db;
  const col = db.collection("movies");

  // Fetch all Hindi movies with any boxOffice or budget data
  const movies = await col.find(
    { language: "Hindi" },
    { projection: { title: 1, budget: 1, boxOffice: 1 } }
  ).toArray();

  console.log(`Found ${movies.length} Hindi movies to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const movie of movies) {
    const $set = {};

    // ── Budget
    const rawBudget = movie.budget;
    const cleanBudget = cleanValue(rawBudget);
    if (cleanBudget !== rawBudget) {
      $set.budget = cleanBudget;
    }

    // ── boxOffice.opening
    const rawOpening = movie.boxOffice?.opening;
    const cleanOpening = cleanValue(rawOpening);
    if (cleanOpening !== rawOpening) {
      $set["boxOffice.opening"] = cleanOpening;
    }

    // ── boxOffice.firstWeek
    const rawFirstWeek = movie.boxOffice?.firstWeek;
    const cleanFirstWeek = cleanValue(rawFirstWeek);
    if (cleanFirstWeek !== rawFirstWeek) {
      $set["boxOffice.firstWeek"] = cleanFirstWeek;
    }

    // ── boxOffice.total
    const rawTotal = movie.boxOffice?.total;
    const cleanTotal = cleanValue(rawTotal);
    if (cleanTotal !== rawTotal) {
      $set["boxOffice.total"] = cleanTotal;
    }

    // Only update if something changed
    if (Object.keys($set).length === 0) {
      skipped++;
      continue;
    }

    // Log what we're changing
    console.log(`📽  "${movie.title}"`);
    if ($set.budget)               console.log(`    budget:    "${rawBudget}" → "${$set.budget}"`);
    if ($set["boxOffice.opening"]) console.log(`    opening:   "${rawOpening}" → "${$set["boxOffice.opening"]}"`);
    if ($set["boxOffice.firstWeek"]) console.log(`    firstWeek: "${rawFirstWeek}" → "${$set["boxOffice.firstWeek"]}"`);
    if ($set["boxOffice.total"])   console.log(`    total:     "${rawTotal}" → "${$set["boxOffice.total"]}"`);

    try {
      await col.updateOne({ _id: movie._id }, { $set });
      updated++;
    } catch (err) {
      console.error(`    ❌ Update failed: ${err.message}`);
      errors++;
    }
  }

  console.log("\n═══════════════════════════════════");
  console.log(`✅ Updated:  ${updated}`);
  console.log(`⏭  Skipped:  ${skipped} (already clean)`);
  console.log(`❌ Errors:   ${errors}`);
  console.log("═══════════════════════════════════\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
