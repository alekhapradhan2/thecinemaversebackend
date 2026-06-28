#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 *  migrate_tarang_to_production.js
 *  Moves "Tarang Cine Productions" from the Cast collection
 *  into the Productions collection and wires up all movies.
 * ═══════════════════════════════════════════════════════════════
 *
 *  USAGE:
 *    node migrate_tarang_to_production.js            ← dry-run (safe)
 *    node migrate_tarang_to_production.js --apply    ← actually writes
 *
 *  WHAT IT DOES:
 *    1. Finds the Cast doc named "Tarang Cine Productions"
 *    2. Creates (or finds) a Production doc with the same name
 *    3. For every movie that had this cast entry:
 *         • Removes the entry from movie.cast[]
 *         • Adds the new Production as a collaborator
 *           (or sets productionId if the movie has none yet)
 *    4. Removes "Tarang Cine Productions" from Cast.movies back-refs
 *    5. Deletes the Cast doc
 *
 *  ENV:
 *    MONGO_URI=mongodb+srv://...
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config();

const DRY = !process.argv.includes("--apply");

// ── Minimal schemas (must match server.js exactly) ────────────────

const ProductionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  logo:     { type: String, default: "" },
  banner:   { type: String, default: "" },
  bio:      { type: String, default: "" },
  founded:  { type: String, default: "" },
  website:  { type: String, default: "" },
  location: { type: String, default: "" },
}, { timestamps: true });

const CastSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },
  type:   { type: String, default: "Actor" },
  bio:    { type: String, default: "" },
  photo:  { type: String, default: "" },
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const CastEntrySchema = new mongoose.Schema({
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast" },
  name:   { type: String, default: "" },
  photo:  { type: String, default: "" },
  type:   { type: String, default: "Actor" },
  role:   { type: String, default: "" },
}, { _id: false });

const MovieSchema = new mongoose.Schema({
  title:        String,
  productionId:  { type: mongoose.Schema.Types.ObjectId, ref: "Production" },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "Production" }],
  cast:          [CastEntrySchema],
}, { strict: false, timestamps: true });

const Production = mongoose.model("Production", ProductionSchema);
const Cast       = mongoose.model("Cast",        CastSchema);
const Movie      = mongoose.model("Movie",       MovieSchema);

// ── Colour helpers ────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", gold: "\x1b[33m",
};
const log  = (...a) => console.log(...a);
const ok   = (s)   => log(`${C.green}  ✔ ${s}${C.reset}`);
const warn = (s)   => log(`${C.yellow}  ⚠ ${s}${C.reset}`);
const info = (s)   => log(`${C.cyan}  ℹ ${s}${C.reset}`);
const head = (s)   => log(`\n${C.bold}${C.gold}══ ${s} ══${C.reset}`);
const err  = (s)   => log(`${C.red}  ✕ ${s}${C.reset}`);

// ─────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${C.bold}${C.gold}`);
  log("╔════════════════════════════════════════════════════╗");
  log("║  🎬  Tarang → Production Migration                 ║");
  log("╚════════════════════════════════════════════════════╝");
  log(C.reset);

  if (DRY) {
    log(`${C.yellow}${C.bold}  ⚠  DRY RUN — no changes will be saved.`);
    log(`     Re-run with --apply to execute.${C.reset}\n`);
  } else {
    log(`${C.red}${C.bold}  ⚡ APPLY MODE — writing to DB!${C.reset}\n`);
  }

  if (!process.env.MONGO_URI) {
    log(`${C.red}❌ MONGO_URI not set in .env${C.reset}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  ok("Connected to MongoDB");

  // ── STEP 1: Find the Cast doc ──────────────────────────────────
  head("STEP 1 — Find Cast doc");

  // Search case-insensitively for any variant of the name
  const castDoc = await Cast.findOne({
    name: { $regex: /tarang\s*cine\s*productions?/i }
  }).lean();

  if (!castDoc) {
    err("Could not find a Cast member matching 'Tarang Cine Productions'.");
    err("Names in DB (first 30 cast):");
    const sample = await Cast.find({}, "name type").limit(30).lean();
    sample.forEach(c => info(`  • ${c.name}  [${c.type}]`));
    await mongoose.disconnect();
    process.exit(1);
  }

  ok(`Found Cast doc: "${castDoc.name}"  _id: ${castDoc._id}  type: ${castDoc.type}`);
  info(`  photo: ${castDoc.photo || "(none)"}`);
  info(`  bio:   ${castDoc.bio   || "(none)"}`);
  info(`  movies back-refs: ${castDoc.movies?.length || 0}`);

  // ── STEP 2: Find all movies that reference this cast entry ──────
  head("STEP 2 — Find affected movies");

  const affectedMovies = await Movie.find({
    "cast.castId": castDoc._id
  }).lean();

  if (affectedMovies.length === 0) {
    warn("No movies have this cast entry. Will still create Production and delete Cast doc.");
  } else {
    info(`Found ${affectedMovies.length} movie(s) referencing this cast entry:`);
    affectedMovies.forEach(m => info(`  • "${m.title}"  (${m._id})`));
  }

  // ── STEP 3: Create / find the Production doc ───────────────────
  head("STEP 3 — Create Production doc");

  // Use a placeholder email derived from the name (production houses don't
  // have real emails in this migration — admin can update it later)
  const placeholderEmail = "tarangcineproductions@ollipedia.internal";
  const placeholderPass  = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  let prodDoc = await Production.findOne({
    $or: [
      { name:  { $regex: /tarang\s*cine\s*productions?/i } },
      { email: placeholderEmail },
    ]
  }).lean();

  if (prodDoc) {
    warn(`Production already exists: "${prodDoc.name}"  _id: ${prodDoc._id}`);
    warn("Will use the existing Production doc.");
  } else {
    info(`Will create Production:`);
    info(`  name:  ${castDoc.name}`);
    info(`  email: ${placeholderEmail}  (placeholder — update via Admin Portal)`);
    info(`  logo:  ${castDoc.photo || "(none)"}`);
    info(`  bio:   ${castDoc.bio   || "(none)"}`);

    if (!DRY) {
      const bcrypt = require("bcrypt");
      const hashed = await bcrypt.hash(placeholderPass, 10);
      prodDoc = await Production.create({
        name:     castDoc.name,
        email:    placeholderEmail,
        password: hashed,
        logo:     castDoc.photo || "",
        bio:      castDoc.bio   || "",
        founded:  "",
        website:  "",
        location: "",
        banner:   "",
      });
      ok(`Created Production: "${prodDoc.name}"  _id: ${prodDoc._id}`);
      log(`\n  ${C.yellow}${C.bold}⚠  Production login credentials (update immediately):${C.reset}`);
      log(`     Email   : ${placeholderEmail}`);
      log(`     Password: ${placeholderPass}  ← change this in the Admin Portal!\n`);
    } else {
      ok(`[DRY] Would create Production: "${castDoc.name}"`);
    }
  }

  // ── STEP 4: Update each affected movie ─────────────────────────
  head("STEP 4 — Update movies");

  for (const movie of affectedMovies) {
    const castEntry = movie.cast.find(e => String(e.castId) === String(castDoc._id));
    const role      = castEntry?.role || "";

    info(`\n  Movie: "${movie.title}"  (${movie._id})`);
    info(`    cast entry role: "${role || "(none)"}"`);

    // Decide: set productionId if empty, otherwise add as collaborator
    const hasMainProd  = !!movie.productionId;
    const alreadyCollab = (movie.collaborators || []).some(
      c => String(c) === String(prodDoc?._id)
    );
    const isAlreadyMain = String(movie.productionId) === String(prodDoc?._id);

    if (!hasMainProd) {
      info(`    → will SET as productionId (movie had none)`);
    } else if (!isAlreadyMain && !alreadyCollab) {
      info(`    → will ADD to collaborators`);
    } else {
      info(`    → already linked as production/collaborator, skipping link step`);
    }

    info(`    → will REMOVE from cast[]`);

    if (!DRY && prodDoc) {
      // Remove from cast
      const newCast = movie.cast.filter(e => String(e.castId) !== String(castDoc._id));

      // Build production update
      const update = { cast: newCast };
      if (!hasMainProd) {
        update.productionId = prodDoc._id;
      } else if (!isAlreadyMain && !alreadyCollab) {
        update.$addToSet = { collaborators: prodDoc._id };
      }

      await Movie.findByIdAndUpdate(movie._id, update);
      ok(`    Updated: "${movie.title}"`);
    } else {
      ok(`    [DRY] Would update: "${movie.title}"`);
    }
  }

  // ── STEP 5: Delete Cast doc ────────────────────────────────────
  head("STEP 5 — Remove Cast doc");

  info(`Will delete Cast doc: "${castDoc.name}"  _id: ${castDoc._id}`);

  if (!DRY) {
    await Cast.findByIdAndDelete(castDoc._id);
    ok(`Deleted Cast doc: "${castDoc.name}"`);
  } else {
    ok(`[DRY] Would delete Cast doc: "${castDoc.name}"`);
  }

  // ── SUMMARY ───────────────────────────────────────────────────
  head("SUMMARY");

  if (DRY) {
    warn("DRY RUN complete — nothing was changed.");
    warn("Re-run with --apply to execute the migration.");
  } else {
    ok(`Cast doc "${castDoc.name}" removed from Cast collection`);
    ok(`Production "${castDoc.name}" created/found in Productions collection`);
    ok(`${affectedMovies.length} movie(s) updated`);
    log(`\n${C.yellow}  Next steps:${C.reset}`);
    log(`  1. Log into Admin Portal → Productions → find "Tarang Cine Productions"`);
    log(`  2. Update the email and password to real credentials`);
    log(`  3. Add logo, banner, website, location as needed`);
    log(`  4. Verify the affiliated movies look correct`);
  }

  await mongoose.disconnect();
  log(`\n${C.green}${C.bold}Done.${C.reset}\n`);
}

main().catch(e => {
  console.error(`\n${C.red}❌ Fatal:${C.reset}`, e.message, e);
  mongoose.disconnect();
  process.exit(1);
});